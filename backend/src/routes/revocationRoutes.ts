import { Router } from "express";
import { revokeCertificate } from "../services/revocationService.js";
import { authenticateToken, requireRole } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/", authenticateToken, requireRole("ADMIN"), async (req, res) => {
  try {
    const { certificateHash } = req.body;

    if (!certificateHash) {
      return res.status(400).json({
        status: "ERROR",
        message: "Certificate hash is required",
      });
    }

    const result = await revokeCertificate(certificateHash);

    return res.status(200).json({
      status: "OK",
      message: "Certificate revoked successfully",
      certificate: result,
    });
  } catch (error) {
    console.error("Certificate revocation error:", error);

    return res.status(500).json({
      status: "ERROR",
      message:
        error instanceof Error
          ? error.message
          : "Unable to revoke certificate",
    });
  }
});

export default router;
