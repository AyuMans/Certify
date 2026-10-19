import { Router } from "express";
import fs from "node:fs";
import { certificateContract } from "../services/blockchainService.js";
import { pool } from "../config/database.js";
import { authenticateToken, requireRole } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/:hash/download", authenticateToken, requireRole("ADMIN", "ISSUER"), async (req, res) => {
  try {
    const hash = Array.isArray(req.params.hash)
      ? req.params.hash[0]
      : req.params.hash;

    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      return res.status(400).json({
        status: "ERROR",
        message: "Invalid certificate hash",
      });
    }

    const result = await pool.query(
      `
      SELECT
        certificate_id,
        file_name,
        file_path
      FROM certificates
      WHERE certificate_hash = $1
      `,
      [hash]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "ERROR",
        message: "Certificate file not found",
      });
    }

    const certificate = result.rows[0];

    if (!fs.existsSync(certificate.file_path)) {
      return res.status(404).json({
        status: "ERROR",
        message: "Stored certificate PDF is missing",
      });
    }

    return res.download(
      certificate.file_path,
      certificate.file_name
    );
  } catch (error) {
    console.error("Certificate download error:", error);

    return res.status(500).json({
      status: "ERROR",
      message:
        error instanceof Error
          ? error.message
          : "Unable to download certificate",
    });
  }
});

router.get("/:hash", async (req, res) => {
  try {
    const hash = Array.isArray(req.params.hash)
      ? req.params.hash[0]
      : req.params.hash;

    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      return res.status(400).json({
        status: "ERROR",
        message: "Invalid certificate hash",
      });
    }

    const certificate =
      await certificateContract.getCertificate(hash);

    const [
      certificateHash,
      certificateId,
      issuer,
      issuedAt,
      revoked,
      revokedAt,
    ] = certificate;

    return res.status(200).json({
      status: "OK",
      certificate: {
        certificateHash,
        certificateId,
        issuer,
        issuedAt: issuedAt.toString(),
        revoked,
        revokedAt: revokedAt.toString(),
      },
    });
  } catch (error) {
    console.error("Certificate lookup error:", error);

    return res.status(404).json({
      status: "ERROR",
      message:
        error instanceof Error
          ? error.message
          : "Certificate not found",
    });
  }
});

export default router;
