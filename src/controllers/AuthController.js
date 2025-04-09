const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const bcrypt = require("bcryptjs");
const { json } = require("body-parser");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

// Configuración del transporte de correo electrónico
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // use SSL
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Función para enviar el correo electrónico con el código de verificación
const sendVerificationEmail = async (email, code, fullname) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Código de verificación para tu cuenta",
      html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e9e9e9; border-radius: 5px;">
            <h2 style="color: #333; text-align: center;">Verificación de cuenta</h2>
            <p>Hola ${fullname},</p>
            <p>Gracias por registrarte. Para completar tu registro, por favor utiliza el siguiente código de verificación:</p>
            <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
              ${code}
            </div>
            <p>Este código expirará en 15 minutos.</p>
            <p>Si no has solicitado este código, por favor ignora este correo.</p>
            <p>Saludos,<br>El equipo de soporte</p>
          </div>
        `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent: " + info.response);
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
};

const signUp = async (req, res) => {
  let { fullname, email, current_password } = req.body;

  if (email) email = email.toLowerCase().trim();

  if (!fullname || !email || !current_password) {
    return res.status(400).json({
      message: "All required fields: fullname, email and password",
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }

  if (current_password.length < 6) {
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters long" });
  }

  try {
    const existingUser = await prisma.users.findUnique({ where: { email } });

    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(current_password, 10);

    const verificationCode = generateVerificationCode();
    const expirationTime = new Date();
    expirationTime.setMinutes(expirationTime.getMinutes() + 15);

    const user = await prisma.users.create({
      data: {
        fullname,
        email,
        current_password: hashedPassword,
        status: "PENDING",
        verificationCode,
        verificationCodeExpires: expirationTime,
      },
    });

    const emailSent = await sendVerificationEmail(
      email,
      verificationCode,
      fullname
    );

    if (!emailSent) {
      await prisma.users.delete({
        where: { id: user.id },
      });

      return (
        res.status(500).json /
        {
          message: "Failed to send verification email. Please try again later.",
        }
      );
    }

    res.status(201).json({
      message: "User created successfully",
      userId: user.id,
      email: user.email,
    });
  } catch (error) {
    res.status(500).json({
      message: "User was not created",
      error,
    });
  }
};

const verifyCode = async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({
      message: "Email and verification code are required",
    });
  }

  try {
    const user = await prisma.users.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (user.status === "ACTIVE") {
      return res.status(400).json({
        message: "User is already verified",
      });
    }

    // Verificar si el código ha expirado
    const now = new Date();
    if (now > user.verificationCodeExpires) {
      return res.status(400).json({
        message: "Verification code has expired. Please request a new one.",
      });
    }

    // Verificar si el código es correcto
    if (user.verificationCode !== code) {
      return res.status(400).json({
        message: "Invalid verification code",
      });
    }

    // Actualizar estado del usuario a activo
    await prisma.users.update({
      where: { id: user.id },
      data: {
        status: "ACTIVE",
        verificationCode: null,
        verificationCodeExpires: null,
      },
    });

    // Generar token de autenticación
    const token = jwt.sign(
      {
        id: user.id,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "2h",
      }
    );

    res.status(200).json({
      message: "Account verified successfully",
      token,
    });
  } catch (error) {
    console.log("Error during verification:", error);
    res.status(500).json({
      message: "Verification failed",
      error: error.message,
    });
  }
};

const resendVerificationCode = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      message: "Email is required",
    });
  }

  try {
    const user = await prisma.users.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (user.status === "ACTIVE") {
      return res.status(400).json({
        message: "User is already verified",
      });
    }

    // Generar nuevo código y actualizar fecha de expiración
    const newCode = generateVerificationCode();
    const expirationTime = new Date();
    expirationTime.setMinutes(expirationTime.getMinutes() + 15);

    await prisma.users.update({
      where: { id: user.id },
      data: {
        verificationCode: newCode,
        verificationCodeExpires: expirationTime,
      },
    });

    // Enviar nuevo código por correo
    const emailSent = await sendVerificationEmail(
      email,
      newCode,
      user.fullname
    );

    if (!emailSent) {
      return res.status(500).json({
        message: "Failed to send verification email. Please try again later.",
      });
    }

    res.status(200).json({
      message: "Verification code sent successfully. Please check your email.",
    });
  } catch (error) {
    console.log("Error resending code:", error);
    res.status(500).json({
      message: "Failed to resend verification code",
      error: error.message,
    });
  }
};

const signIn = async (req, res) => {
  let { email, current_password } = req.body;

  if (email) email = email.toLowerCase().trim();

  if (!email || !current_password) {
    return res.status(400).json({ message: "Both fields are required" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }

  try {
    const findUser = await prisma.users.findUnique({ where: { email } });

    if (!findUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const validatePassword = await bcrypt.compare(
      current_password,
      findUser.current_password
    );

    if (!validatePassword) {
      return res.status(400).json({ message: "Password doesn't match" });
    }

    const code2FA = generateCode();
    const expiration = new Date();
    expiration.setMinutes(expiration.getMinutes() + 5);

    await prisma.users.update({
      where: { id: findUser.id },
      data: {
        twoFactorCode: code2FA,
        twoFactorCodeExpires: expiration,
      },
    });

    await sendSMS(code2FA, findUser);

    return res.status(200).json({ message: "2FA code sent" });
  } catch (error) {
    res.status(500).json({ message: "Login failed", error });
  }
};

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const sendSMS = async (code, user) => {
  const accountSid = process.env.TWILIO_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const client = require("twilio")(accountSid, authToken);

  // Obtén los números desde las variables de entorno
  const fromNumber = process.env.TWILIO_FROM;
  const toNumber = process.env.TWILIO_TO;

  await client.messages.create({
    body: `Tu código de verificación es: ${code}`,
    from: fromNumber,
    to: toNumber,
  });
};

const secondAuthenticationFactor = async (req, res) => {
  const { email, code } = req.body;

  if (code.length > 6 || code.length < 6) {
    return res.status(400).json({ message: "The code must be 6 digits long" });
  }

  if (!email || !code) {
    return res.status(400).json({ message: "Email and code are required" });
  }

  try {
    const user = await prisma.users.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ message: "User not found" });

    const now = new Date();
    const isValidCode =
      user.twoFactorCode === code && user.twoFactorCodeExpires > now;

    if (!isValidCode) {
      return res.status(401).json({ message: "Invalid or expired code" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    return res.status(200).json({
      message: "Login successful",
      token,
    });
  } catch (error) {
    console.error("2FA verification error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  signIn,
  signUp,
  verifyCode,
  resendVerificationCode,
  secondAuthenticationFactor,
};
