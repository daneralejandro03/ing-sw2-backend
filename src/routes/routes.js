const express = require("express");
const router = express.Router();
const authRoutes = require("./AuthRoutes");
const userRoutes = require("./UserRoutes");
const csvRoutes = require("./CsvRoutes");

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/csv", csvRoutes);

module.exports = router;
