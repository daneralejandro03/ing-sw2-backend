const express = require("express");
const router = express.Router();
const {
  signIn,
  signUp,
  verifyCode,
  resendVerificationCode,
} = require("../controllers/AuthController");

router.post("/signup", signUp);
router.post("/signin", signIn);
router.post("/verify", verifyCode);
router.post("/resend", resendVerificationCode);

module.exports = router;
