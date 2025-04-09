const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const isSuperAdmin = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Authorization header missing" });
  }

  // Se espera el token en el formato "Bearer <token>"
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Token missing" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Buscamos el usuario en la base de datos
    const user = await prisma.users.findUnique({
      where: { id: decoded.id },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verifica que el usuario tenga el rol SUPERADMIN
    if (user.role !== "SUPERADMIN") {
      return res.status(403).json({
        message:
          "Access restricted: only SUPERADMIN users can access this route",
      });
    }

    // Se puede agregar el usuario a la request para usarlo en otras partes si es necesario
    req.user = user;

    next();
  } catch (error) {
    return res
      .status(401)
      .json({ message: "Invalid or expired token", error: error.message });
  }
};

module.exports = { isSuperAdmin };
