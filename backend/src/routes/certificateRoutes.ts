import { Router } from "express";
import type { Response } from "express";
import multer from "multer";
import path from "node:path";
import { issueCertificate } from "../services/certificateService.js";
import { saveCertificate, listCertificates, certificateExists } from "../services/certificateStore.js";
import { calculateSHA256 } from "../services/hashService.js";
import { academicHash, normalizeDetails, validateId } from "../services/academicService.js";
import { acquireWriteLock } from "../services/chainWriteQueue.js";
import { authenticateToken, requireRole, type AuthenticatedRequest } from "../middleware/authMiddleware.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 8 } });

router.get("/", authenticateToken, requireRole("ADMIN", "ISSUER"), (_req, res) => {
  res.json({ status: "OK", certificates: listCertificates() });
});

async function saveIssuedCertificate(req: AuthenticatedRequest, res: Response, replacement: boolean) {
  let certificateId, details, previousHash: string | undefined;
  try {
    certificateId = validateId(req.body?.certificateId);
    details = normalizeDetails(req.body || {});
    if (replacement) {
      if (typeof req.body.previousHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(req.body.previousHash)) throw new Error("Enter the old certificate's document hash");
      previousHash = req.body.previousHash.toLowerCase();
    }
  } catch (error) {
    return res.status(400).json({ status: "ERROR", message: (error as Error).message });
  }
  if (!req.file || req.file.buffer.subarray(0, 5).toString() !== "%PDF-") {
    return res.status(400).json({ status: "ERROR", message: "A PDF certificate is required (maximum 10 MB)" });
  }
  const hash = `0x${calculateSHA256(req.file.buffer)}`;
  const detailsHash = academicHash(certificateId, details);
  const release = await acquireWriteLock();
  try {
    if (certificateExists(hash, certificateId)) return res.status(409).json({ status: "ERROR", message: "Certificate file or ID is already used in this demo session. Use a new ID and PDF for a correction." });
    const confirmed = await issueCertificate(certificateId, req.file.buffer, detailsHash, previousHash);
    const record = saveCertificate({ ...confirmed, fileName: path.basename(req.file.originalname), fileData: req.file.buffer,
      blockNumber: confirmed.blockNumber ?? 0, issuedAt: new Date(Number(confirmed.issuedAt) * 1000),
      academicDetails: details, academicHash: detailsHash, previousHash });
    return res.status(201).json({ status: "OK", message: replacement ? "Correction saved for this demo session. The old version is superseded." : "Certificate issued for this demo session",
      certificate: { ...confirmed, academicHash: detailsHash, previousHash: previousHash || null, fileName: req.file.originalname, sessionRecordId: record.id } });
  } catch (error) {
    console.error("Certificate issuance failed:", (error as { reason?: string }).reason || (error as Error).message);
    return res.status(400).json({ status: "ERROR", message: (error as { reason?: string }).reason || "Unable to issue certificate. Check the ID, issuer permission and old certificate status." });
  } finally { release(); }
}

router.post("/issue", authenticateToken, requireRole("ADMIN", "ISSUER"), upload.single("certificate"), (req, res) => saveIssuedCertificate(req, res, false));
router.post("/replace", authenticateToken, requireRole("ADMIN"), upload.single("certificate"), (req, res) => saveIssuedCertificate(req, res, true));
export default router;
