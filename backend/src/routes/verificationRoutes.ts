import { Router } from "express";
import multer from "multer";
import { verifyCertificate } from "../services/verificationService.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
});

router.post(
  "/",
  upload.single("certificate"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          status: "ERROR",
          message: "Certificate file is required",
        });
      }

      const result = await verifyCertificate(req.file.buffer);

      return res.status(200).json({
        status: "OK",
        message:
          result.verificationStatus === "VALID"
            ? "Certificate is valid"
            : result.verificationStatus === "REVOKED"
              ? "Certificate has been revoked"
              : "Certificate is not valid",
        certificate: result,
      });
    } catch (error) {
      console.error("Certificate verification error:", error);

      return res.status(500).json({
        status: "ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Unable to verify certificate",
      });
    }
  }
);

export default router;