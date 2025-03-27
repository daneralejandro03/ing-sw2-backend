jest.mock("dotenv", () => ({
  config: jest.fn(),
}));

// Creamos mocks para las funciones de Prisma
const mockFindUnique = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn(); // Para futuros tests que requieran actualización

// Mock de PrismaClient
jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    users: {
      findUnique: mockFindUnique,
      create: mockCreate,
      update: mockUpdate,
    },
  })),
}));

// Mock de bcryptjs
jest.mock("bcryptjs", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

// Mock para generar el token en el momento de autenticación
jest.mock("jsonwebtoken", () => ({
  sign: jest.fn().mockReturnValue("test_token"),
  compare: jest.fn(),
}));

// Mock de nodemailer para evitar conexiones reales a SMTP
jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ response: "OK" }),
  })),
}));

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
  signUp,
  signIn,
  verifyCode,
  resendVerificationCode,
} = require("../../../src/controllers/AuthController");

// Omite algunos console.log del controlador
jest.spyOn(console, "log").mockImplementation(() => {});
jest.spyOn(console, "error").mockImplementation(() => {});

describe("SignUp Controller Method", () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  test("Return message all required fields", async () => {
    req.body = {
      fullname: "User Test",
      // email y current_password no se enviaron
    };
    await signUp(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "All required fields: fullname, email and password",
    });
  });

  test("Should return error for invalid email format", async () => {
    req.body = {
      fullname: "User Test",
      email: "test.com",
      current_password: "test123",
    };
    await signUp(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "Invalid email format" });
  });

  test("Should return error for length password", async () => {
    req.body = {
      fullname: "User Test",
      email: "test@test.com",
      current_password: "test1",
    };
    await signUp(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Password must be at least 6 characters long",
    });
  });

  test("Should return error if email already exists", async () => {
    req.body = {
      fullname: "User Test",
      email: "test1@test.com",
      current_password: "test123",
    };

    // Simulamos que ya existe el usuario
    mockFindUnique.mockResolvedValue({
      id: 1,
      email: "test1@test.com",
    });

    await signUp(req, res);

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: "test1@test.com" },
    });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Email already registered",
    });
  });

  test("Should create a user successfully", async () => {
    req.body = {
      fullname: "User Test",
      email: "test@test.com",
      current_password: "test123",
    };

    // Simulamos que el usuario no existe
    mockFindUnique.mockResolvedValue(null);

    // Configuramos el mock para el hash de la contraseña
    const hashedPassword = "hashed_password";
    bcrypt.hash.mockResolvedValue(hashedPassword);

    // Configuramos el mock para la creación del usuario
    const createdUser = {
      id: 1,
      fullname: "User Test",
      email: "test@test.com",
    };
    mockCreate.mockResolvedValue(createdUser);

    await signUp(req, res);

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: "test@test.com" },
    });
    expect(bcrypt.hash).toHaveBeenCalledWith("test123", 10);
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fullname: "User Test",
        email: "test@test.com",
        current_password: hashedPassword,
        // Se asume que el controlador agrega estos campos:
        status: "PENDING",
        verificationCode: expect.any(String),
        verificationCodeExpires: expect.any(Date),
      }),
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: "User created successfully",
      userId: createdUser.id,
      email: createdUser.email,
    });
  });
});

describe("SignIn Controller Method", () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  test("Should return error when email and password are not provided", async () => {
    req.body = {};
    await signIn(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Both fields are required",
    });
  });

  test("Should return error when email is invalid", async () => {
    req.body = {
      email: "invalidEmail",
      current_password: "password123",
    };
    await signIn(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Invalid email format",
    });
  });

  test("Should return error when user is not found", async () => {
    req.body = {
      email: "notfound@test.com",
      current_password: "password123",
    };

    // Simulamos que no se encuentra el usuario
    mockFindUnique.mockResolvedValue(null);

    await signIn(req, res);

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: "notfound@test.com" },
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      message: "User not found",
    });
  });

  test("Should return error when password doesn't match", async () => {
    req.body = {
      email: "test@test.com",
      current_password: "wrongpassword",
    };

    // Simulamos que se encuentra el usuario
    mockFindUnique.mockResolvedValue({
      id: 1,
      email: "test@test.com",
      current_password: "hashedCorrectPassword",
    });

    // Simulamos que la contraseña no coincide
    bcrypt.compare.mockResolvedValue(false);

    await signIn(req, res);

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: "test@test.com" },
    });
    expect(bcrypt.compare).toHaveBeenCalledWith(
      "wrongpassword",
      "hashedCorrectPassword"
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Password doesn't match",
    });
  });

  test("Should sign in user successfully and return token", async () => {
    const mockUserId = 1;
    req.body = {
      email: "test@test.com",
      current_password: "correctpassword",
    };

    // Simulamos que se encuentra el usuario
    mockFindUnique.mockResolvedValue({
      id: mockUserId,
      email: "test@test.com",
      current_password: "hashedCorrectPassword",
    });

    // Simulamos que la contraseña coincide
    jest.spyOn(bcrypt, "compare").mockResolvedValue(true);

    // Configuramos el entorno para JWT
    process.env.JWT_SECRET = "test_secret";

    await signIn(req, res);

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: "test@test.com" },
    });
    expect(bcrypt.compare).toHaveBeenCalledWith(
      "correctpassword",
      "hashedCorrectPassword"
    );
    expect(jwt.sign).toHaveBeenCalledWith(
      { id: mockUserId, email: "test@test.com" },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Login successful",
      token: "test_token",
    });
  });

  test("Should handle server error during sign in", async () => {
    req.body = {
      email: "test@test.com",
      current_password: "password123",
    };

    // Simulamos un error en la base de datos
    mockFindUnique.mockRejectedValue(new Error("Database error"));

    await signIn(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Login failed",
      })
    );
  });
});

// Test para el método verifyCode

describe("verifyCode Controller Method", () => {
  let req;
  let res;
  beforeEach(() => {
    jest.clearAllMocks();
    req = { body: {} };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  });

  test("Should return error if email or verification code is missing", async () => {
    req.body = { email: "test@test.com" }; // Falta el código
    await verifyCode(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Email and verification code are required",
    });

    jest.clearAllMocks();
    req.body = { code: "123456" }; // Falta el email
    await verifyCode(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Email and verification code are required",
    });
  });

  test("Should return error if user is not found", async () => {
    req.body = { email: "notfound@test.com", code: "123456" };
    mockFindUnique.mockResolvedValue(null);
    await verifyCode(req, res);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: "notfound@test.com" },
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "User not found" });
  });

  test("Should return error if user is already verified", async () => {
    req.body = { email: "test@test.com", code: "123456" };
    const user = { id: 1, email: "test@test.com", status: "ACTIVE" };
    mockFindUnique.mockResolvedValue(user);
    await verifyCode(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "User is already verified",
    });
  });

  test("Should return error if verification code has expired", async () => {
    req.body = { email: "test@test.com", code: "123456" };
    const pastTime = new Date(Date.now() - 10 * 60000); // 10 minutos en el pasado
    const user = {
      id: 1,
      email: "test@test.com",
      status: "PENDING",
      verificationCode: "123456",
      verificationCodeExpires: pastTime,
    };
    mockFindUnique.mockResolvedValue(user);
    await verifyCode(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Verification code has expired. Please request a new one.",
    });
  });

  test("Should return error if verification code is invalid", async () => {
    req.body = { email: "test@test.com", code: "654321" };
    const futureTime = new Date(Date.now() + 10 * 60000); // 10 minutos en el futuro
    const user = {
      id: 1,
      email: "test@test.com",
      status: "PENDING",
      verificationCode: "123456",
      verificationCodeExpires: futureTime,
    };
    mockFindUnique.mockResolvedValue(user);
    await verifyCode(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Invalid verification code",
    });
  });

  test("Should verify account successfully and return token", async () => {
    req.body = { email: "test@test.com", code: "123456" };
    const futureTime = new Date(Date.now() + 10 * 60000);
    const user = {
      id: 1,
      email: "test@test.com",
      status: "PENDING",
      verificationCode: "123456",
      verificationCodeExpires: futureTime,
    };
    mockFindUnique.mockResolvedValue(user);
    mockUpdate.mockResolvedValue({
      ...user,
      status: "ACTIVE",
      verificationCode: null,
      verificationCodeExpires: null,
    });
    await verifyCode(req, res);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: "test@test.com" },
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: user.id },
      data: {
        status: "ACTIVE",
        verificationCode: null,
        verificationCodeExpires: null,
      },
    });
    expect(jwt.sign).toHaveBeenCalledWith(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Account verified successfully",
      token: "test_token",
    });
  });
});

describe("resendVerificationCode Controller Method", () => {
  let req;
  let res;
  beforeEach(() => {
    jest.clearAllMocks();
    req = { body: {} };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  });

  test("Should return error if email is not provided", async () => {
    req.body = {};
    await resendVerificationCode(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "Email is required" });
  });

  test("Should return error if user is not found", async () => {
    req.body = { email: "notfound@test.com" };
    mockFindUnique.mockResolvedValue(null);
    await resendVerificationCode(req, res);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: "notfound@test.com" },
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "User not found" });
  });

  test("Should return error if user is already verified", async () => {
    req.body = { email: "test@test.com" };
    const user = {
      id: 1,
      email: "test@test.com",
      fullname: "Test User",
      status: "ACTIVE",
    };
    mockFindUnique.mockResolvedValue(user);
    await resendVerificationCode(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "User is already verified",
    });
  });

  test("Should resend verification code successfully", async () => {
    req.body = { email: "test@test.com" };
    const user = {
      id: 1,
      email: "test@test.com",
      fullname: "Test User",
      status: "PENDING",
    };
    mockFindUnique.mockResolvedValue(user);
    mockUpdate.mockResolvedValue({
      ...user,
      verificationCode: "654321",
      verificationCodeExpires: new Date(Date.now() + 15 * 60000),
    });
    await resendVerificationCode(req, res);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: "test@test.com" },
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: user.id },
      data: expect.objectContaining({
        verificationCode: expect.any(String),
        verificationCodeExpires: expect.any(Date),
      }),
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Verification code sent successfully. Please check your email.",
    });
  });

  test("Should return error if sending verification email fails", async () => {
    // Para simular el fallo en el envío de email, reseteamos los módulos para forzar un nuevo mock en nodemailer.
    jest.resetModules();
    // Reconfiguramos el mock de nodemailer para que sendMail rechace.
    jest.doMock("nodemailer", () => ({
      createTransport: jest.fn(() => ({
        sendMail: jest.fn().mockRejectedValue(new Error("SMTP error")),
      })),
    }));
    // Re-importamos el controlador (esto forzará que se use el nuevo mock de nodemailer)
    const {
      resendVerificationCode,
    } = require("../../../src/controllers/AuthController");

    req.body = { email: "test@test.com" };
    const user = {
      id: 1,
      email: "test@test.com",
      fullname: "Test User",
      status: "PENDING",
    };
    // Usamos los mocks de Prisma ya definidos previamente
    mockFindUnique.mockResolvedValue(user);
    mockUpdate.mockResolvedValue({
      ...user,
      verificationCode: "654321",
      verificationCodeExpires: new Date(Date.now() + 15 * 60000),
    });

    await resendVerificationCode(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Failed to send verification email. Please try again later.",
    });
  });
});
