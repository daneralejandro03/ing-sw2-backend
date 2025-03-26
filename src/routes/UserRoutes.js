const express = require("express");
const router = express.Router();

const { getAllUsers, getUserById } = require("../controllers/UserController");

router.get("/", getAllUsers);
router.get("/:id", getUserById);

module.exports = router;
