import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { issueCertificate } from "../services/certificateService.js";
import { saveCertificate } from "../services/databaseService.js";
import { pool } from "../config/database.js";
import { calculateSHA256 } from "../services/hashService.js";
import { authenticateToken, requireRole } from "../middleware/authMiddleware.js";

const router = Router();
const uploadDirectory = process.env.UPLOAD_DIR || fileURLToPath(new URL("../../uploads/", import.meta.url));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1 } });

router.get("/", authenticateToken, requireRole("ADMIN", "ISSUER"), async (_req, res, next) => {
  try {
    const result = await pool.query(`SELECT certificate_id, certificate_hash, file_name, issuer_address,
      transaction_hash, issued_at, revoked, revoked_at FROM certificates ORDER BY issued_at DESC LIMIT 100`);
    res.json({ status: "OK", certificates: result.rows });
  } catch (error) { next(error); }
});

router.post("/issue", authenticateToken, requireRole("ADMIN", "ISSUER"), upload.single("certificate"), async (req, res) => {
  const certificateId = req.body?.certificateId;
  if (typeof certificateId !== "string" || !certificateId.trim() || certificateId.trim().length > 100) {
    return res.status(400).json({ status: "ERROR", message: "Certificate ID must contain 1–100 characters" });
  }
  if (!req.file || req.file.buffer.subarray(0, 5).toString() !== "%PDF-") {
    return res.status(400).json({ status: "ERROR", message: "A PDF certificate is required (maximum 10 MB)" });
  }
  const hash = `0x${calculateSHA256(req.file.buffer)}`;
  const filePath = path.join(uploadDirectory, `${hash.slice(2)}.pdf`);
  let fileCreated = false;
  let confirmed: Awaited<ReturnType<typeof issueCertificate>> | undefined;
  try {
    const existing = await pool.query("SELECT id FROM certificates WHERE certificate_hash = $1 OR certificate_id = $2", [hash, certificateId.trim()]);
    if (existing.rowCount) return res.status(409).json({ status: "ERROR", message: "Certificate file or ID is already registered" });
    await mkdir(uploadDirectory, { recursive: true });
    try { await writeFile(filePath, req.file.buffer, { flag: "wx" }); fileCreated = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    confirmed = await issueCertificate(certificateId, req.file.buffer);
    const record = await saveCertificate({ ...confirmed, fileName: path.basename(req.file.originalname), filePath,
      blockNumber: confirmed.blockNumber ?? 0, issuedAt: new Date(Number(confirmed.issuedAt) * 1000) });
    return res.status(201).json({ status: "OK", message: "Certificate issued successfully", certificate: { ...confirmed, fileName: req.file.originalname, databaseId: record.id } });
  } catch (error) {
    if (fileCreated && !confirmed) await unlink(filePath).catch(() => {});
    console.error("Certificate issuance failed:", error);
    return res.status(confirmed ? 503 : 400).json({ status: "ERROR", message: confirmed
      ? "Blockchain issuance confirmed, but metadata could not be saved. Retry the same file and ID to recover."
      : (error as { reason?: string }).reason || "Unable to issue certificate. Check that the ID is unique and the issuer is authorized.",
      ...(confirmed ? { certificate: confirmed } : {}) });
  }
});
export default router;
