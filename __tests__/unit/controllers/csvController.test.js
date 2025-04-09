// Es importante realizar el mock de Prisma antes de importar el controlador
jest.mock("@prisma/client", () => {
  const department = {
    findUnique: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
  };
  const municipio = {
    findUnique: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
  };
  const PrismaClient = jest.fn(() => ({
    department,
    municipio,
  }));
  return { PrismaClient };
});

// Mock para csv-parser antes de importar el controlador
jest.mock("csv-parser", () => {
  return jest.fn();
});

const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");

// Importamos el controlador ya que los mocks se han definido
const {
  uploadCsv,
  getAllMunicipios,
  getAllDepartamentos,
} = require("../../../src/controllers/csvController");

// Obtenemos la instancia mockeada de Prisma
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Obtenemos el mock de csv-parser
const csvParser = require("csv-parser");

describe("CSV Controller Tests", () => {
  let req;
  let res;

  // Creamos un stream mockeable para simular el archivo CSV
  let mockStream;
  let mockParser;

  beforeEach(() => {
    // Reiniciamos el objeto request y response en cada test
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    // Limpiar los mocks de Prisma para evitar contaminación entre tests
    prisma.department.findUnique.mockClear();
    prisma.department.create.mockClear();
    prisma.department.findMany.mockClear();
    prisma.municipio.findUnique.mockClear();
    prisma.municipio.create.mockClear();
    prisma.municipio.findMany.mockClear();

    // Crear un mock stream para cada test
    mockStream = new Readable();
    mockStream._read = () => {}; // Implementación requerida

    // Crear un mock parser para cada test
    mockParser = {
      emit: jest.fn(),
      on: jest.fn((event, callback) => {
        if (event === "end") {
          mockParser.endCallback = callback;
        } else if (event === "data") {
          mockParser.dataCallback = callback;
        } else if (event === "error") {
          mockParser.errorCallback = callback;
        }
        return mockParser;
      }),
    };

    // Configurar el mock de csv-parser para retornar nuestro mockParser
    csvParser.mockReturnValue(mockParser);

    // Mock para fs.createReadStream
    jest.spyOn(fs, "createReadStream").mockReturnValue(mockStream);

    // Mock para fs.unlink
    jest.spyOn(fs, "unlink").mockImplementation((path, callback) => {
      callback(null);
    });

    // Mock para pipe, para conectar el stream al parser
    mockStream.pipe = jest.fn().mockReturnValue(mockParser);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("uploadCsv", () => {
    // Definimos la ruta del archivo temporal para la prueba
    const tempFilePath = path.join(__dirname, "temp_test.csv");

    test("Debe responder con error 400 si no se envía archivo", async () => {
      req.file = undefined;
      await uploadCsv(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Falta archivo" });
    });

    test("Debe procesar el CSV y crear el Departamento y Municipio cuando los registros son válidos", async () => {
      // Configurar el mock request
      req.file = { path: tempFilePath };

      // Configuramos los mocks de Prisma
      prisma.department.findUnique.mockResolvedValue(null);
      prisma.department.create.mockResolvedValue({
        id: 1,
        nombre: "Antioquia",
        codigoDaneDepto: "001",
        region: "Andina",
      });
      prisma.municipio.findUnique.mockResolvedValue(null);
      prisma.municipio.create.mockResolvedValue({
        id: 10,
        nombre: "Medellin",
        codigoDane: "001001",
      });

      // Iniciar el proceso de carga del CSV
      const responsePromise = new Promise((resolve) => {
        res.json = jest.fn((response) => {
          resolve(response);
          return res;
        });
        uploadCsv(req, res);
      });

      // Verificar que se haya creado el stream correctamente
      expect(fs.createReadStream).toHaveBeenCalledWith(tempFilePath);
      expect(mockStream.pipe).toHaveBeenCalledWith(mockParser);

      // Simular el procesamiento de una fila del CSV
      const mockRow = {
        "CÓDIGO DANE DEL DEPARTAMENTO": "001",
        "CÓDIGO DANE DEL MUNICIPIO": "001001",
        DEPARTAMENTO: "Antioquia",
        MUNICIPIO: "Medellin",
        REGION: "Andina",
      };

      // Llamar el callback de data con nuestra fila de prueba
      if (mockParser.dataCallback) {
        mockParser.dataCallback(mockRow);
      }

      // Simular que el parsing ha terminado
      if (mockParser.endCallback) {
        mockParser.endCallback();
      }

      // Esperar y verificar la respuesta
      const result = await responsePromise;

      expect(result).toEqual(
        expect.objectContaining({
          totalFilas: 1,
          logs: expect.arrayContaining([
            expect.stringContaining(
              "Departamento 'Antioquia' subido exitosamente."
            ),
            expect.stringContaining(
              "Municipio 'Medellin' subido exitosamente."
            ),
          ]),
        })
      );
    });

    test("Debe omitir filas con datos incompletos", async () => {
      // Configurar el mock request
      req.file = { path: tempFilePath };

      // Iniciar el proceso de carga del CSV
      const responsePromise = new Promise((resolve) => {
        res.json = jest.fn((response) => {
          resolve(response);
          return res;
        });
        uploadCsv(req, res);
      });

      // Verificar que se haya creado el stream correctamente
      expect(fs.createReadStream).toHaveBeenCalledWith(tempFilePath);
      expect(mockStream.pipe).toHaveBeenCalledWith(mockParser);

      // Simular el procesamiento de una fila incompleta del CSV
      const mockRow = {
        "CÓDIGO DANE DEL DEPARTAMENTO": "002",
        "CÓDIGO DANE DEL MUNICIPIO": "002002",
        DEPARTAMENTO: "Valle",
        MUNICIPIO: "", // Municipio vacío, debería omitirse
        REGION: "Andina",
      };

      // Llamar el callback de data con nuestra fila de prueba
      if (mockParser.dataCallback) {
        mockParser.dataCallback(mockRow);
      }

      // Simular que el parsing ha terminado
      if (mockParser.endCallback) {
        mockParser.endCallback();
      }

      // Esperar y verificar la respuesta
      const result = await responsePromise;

      expect(result).toEqual(
        expect.objectContaining({
          totalFilas: 1,
          logs: expect.arrayContaining([
            expect.stringContaining("Datos incompletos. Se omite esta fila."),
          ]),
        })
      );
    });

    test("Debe capturar errores al procesar una fila individual", async () => {
      // Configurar el mock request
      req.file = { path: tempFilePath };

      // Simular que el departamento no existe pero falla al crearlo
      prisma.department.findUnique.mockResolvedValue(null);
      prisma.department.create.mockRejectedValue(new Error("DB Error"));

      // Iniciar el proceso de carga del CSV
      const responsePromise = new Promise((resolve) => {
        res.json = jest.fn((response) => {
          resolve(response);
          return res;
        });
        uploadCsv(req, res);
      });

      // Verificar que se haya creado el stream correctamente
      expect(fs.createReadStream).toHaveBeenCalledWith(tempFilePath);
      expect(mockStream.pipe).toHaveBeenCalledWith(mockParser);

      // Simular el procesamiento de una fila del CSV que generará error
      const mockRow = {
        "CÓDIGO DANE DEL DEPARTAMENTO": "003",
        "CÓDIGO DANE DEL MUNICIPIO": "003003",
        DEPARTAMENTO: "Cundinamarca",
        MUNICIPIO: "Bogota",
        REGION: "Andina",
      };

      // Llamar el callback de data con nuestra fila de prueba
      if (mockParser.dataCallback) {
        mockParser.dataCallback(mockRow);
      }

      // Simular que el parsing ha terminado
      if (mockParser.endCallback) {
        mockParser.endCallback();
      }

      // Esperar y verificar la respuesta
      const result = await responsePromise;

      expect(result).toEqual(
        expect.objectContaining({
          totalFilas: 1,
          logs: expect.arrayContaining([
            expect.stringContaining("Error procesando datos - DB Error"),
          ]),
        })
      );
    });
  });

  describe("getAllMunicipios", () => {
    test("Debe retornar todos los municipios", async () => {
      const mockMunicipios = [
        { id: 1, nombre: "Medellin", departamento: { nombre: "Antioquia" } },
      ];
      prisma.municipio.findMany.mockResolvedValue(mockMunicipios);
      await getAllMunicipios(req, res);
      expect(res.json).toHaveBeenCalledWith(mockMunicipios);
    });

    test("Debe manejar errores al obtener municipios", async () => {
      prisma.municipio.findMany.mockRejectedValue(new Error("DB Error"));
      await getAllMunicipios(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Error al leer datos" });
    });
  });

  describe("getAllDepartamentos", () => {
    test("Debe retornar todos los departamentos", async () => {
      const mockDepartments = [{ id: 1, nombre: "Antioquia", municipios: [] }];
      prisma.department.findMany.mockResolvedValue(mockDepartments);
      await getAllDepartamentos(req, res);
      expect(res.json).toHaveBeenCalledWith(mockDepartments);
    });

    test("Debe manejar errores al obtener departamentos", async () => {
      prisma.department.findMany.mockRejectedValue(new Error("DB Error"));
      await getAllDepartamentos(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Error al leer datos" });
    });
  });
});
