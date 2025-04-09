const { PrismaClient } = require("@prisma/client");
const csvParser = require("csv-parser");
const fs = require("fs");
const prisma = new PrismaClient();

async function uploadCsv(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: "Falta archivo" });
  }

  const filePath = req.file.path;
  const logs = []; // Acumulamos los logs en un array.
  const rows = [];

  fs.createReadStream(filePath)
    .pipe(csvParser())
    .on("data", (row) => rows.push(row))
    .on("end", async () => {
      // Iteramos cada fila del archivo CSV.
      for (const [index, r] of rows.entries()) {
        try {
          // Validar que en la fila existan los campos necesarios. Esto puede adecuarse a tus requerimientos.
          if (
            !r["CÓDIGO DANE DEL DEPARTAMENTO"] ||
            !r["CÓDIGO DANE DEL MUNICIPIO"] ||
            !r.DEPARTAMENTO ||
            !r.MUNICIPIO ||
            !r.REGION
          ) {
            logs.push(
              `Fila ${index + 1}: Datos incompletos. Se omite esta fila.`
            );
            continue;
          }

          // Procesar el Departamento:
          let dept = await prisma.department.findUnique({
            where: { codigoDaneDepto: r["CÓDIGO DANE DEL DEPARTAMENTO"] },
          });

          if (!dept) {
            dept = await prisma.department.create({
              data: {
                region: r.REGION,
                codigoDaneDepto: r["CÓDIGO DANE DEL DEPARTAMENTO"],
                nombre: r.DEPARTAMENTO,
              },
            });
            logs.push(
              `Fila ${index + 1}: Departamento '${
                r.DEPARTAMENTO
              }' subido exitosamente.`
            );
          } else {
            logs.push(
              `Fila ${index + 1}: Departamento '${
                r.DEPARTAMENTO
              }' ya existe, se omite su subida.`
            );
          }

          // Procesar el Municipio:
          let municipio = await prisma.municipio.findUnique({
            where: { codigoDane: r["CÓDIGO DANE DEL MUNICIPIO"] },
          });

          if (!municipio) {
            municipio = await prisma.municipio.create({
              data: {
                codigoDane: r["CÓDIGO DANE DEL MUNICIPIO"],
                nombre: r.MUNICIPIO,
                departamento: { connect: { id: dept.id } },
              },
            });
            logs.push(
              `Fila ${index + 1}: Municipio '${
                r.MUNICIPIO
              }' subido exitosamente.`
            );
          } else {
            logs.push(
              `Fila ${index + 1}: Municipio '${
                r.MUNICIPIO
              }' ya existe, se omite su subida.`
            );
          }
        } catch (err) {
          // Capturamos cualquier error específico de la fila y lo agregamos al log.
          logs.push(
            `Fila ${index + 1}: Error procesando datos - ${err.message}`
          );
        }
      }

      // Borramos el archivo CSV temporal.
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error(`Error al borrar el archivo temporal: ${err.message}`);
        }
      });

      // Se envía la respuesta con un resumen de la operación.
      res.json({ totalFilas: rows.length, logs });
    })
    .on("error", (err) => {
      console.error(err);
      res.status(500).json({ error: err.message });
    });
}

async function getAllMunicipios(req, res) {
  try {
    const municipios = await prisma.municipio.findMany({
      include: { departamento: true },
    });
    res.json(municipios);
  } catch (err) {
    res.status(500).json({ error: "Error al leer datos" });
  }
}

async function getAllDepartamentos(req, res) {
  try {
    const departamentos = await prisma.department.findMany();
    res.json(departamentos);
  } catch (err) {
    res.status(500).json({ error: "Error al leer datos" });
  }
}

module.exports = {
  uploadCsv,
  getAllMunicipios,
  getAllDepartamentos,
};
