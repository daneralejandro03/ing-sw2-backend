const multer = require("multer");
const path = require("path");
const {
  uploadCsv,
  getAllMunicipios,
  getAllDepartamentos,
} = require("../controllers/csvController");
const { isSuperAdmin } = require("../middlewares/isSuperAdmin");

const router = require("express").Router();

const upload = multer({ dest: path.join(__dirname, "..", "uploads/") });

router.post("/upload", isSuperAdmin, upload.single("file"), uploadCsv);
router.get("/municipios", isSuperAdmin, getAllMunicipios);
router.get("/departamentos", isSuperAdmin, getAllDepartamentos);

module.exports = router;
