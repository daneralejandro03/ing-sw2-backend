const multer = require("multer");
const path = require("path");
const { uploadCsv, getAllMunicipios } = require("../controllers/csvController");
const router = require("express").Router();

const upload = multer({ dest: path.join(__dirname, "..", "uploads/") });

router.post("/upload", upload.single("file"), uploadCsv);
router.get("/", getAllMunicipios);

module.exports = router;
