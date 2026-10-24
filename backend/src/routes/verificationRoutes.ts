import { Router } from "express";
import multer from "multer";
import { verifyCertificate, verifyHash, verifyAcademicDetails, validateHash } from "../services/verificationService.js";
import { normalizeDetails, validateId } from "../services/academicService.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

// The website uses this endpoint: PDF bytes never leave the browser for verification.
router.post("/hash", async (req, res, next) => {
  let hash: string;
  try { hash = validateHash(req.body?.certificateHash); }
  catch (error) { return res.status(400).json({ status: "ERROR", message: (error as Error).message }); }
  try { res.json({ status: "OK", certificate: await verifyHash(hash) }); } catch (error) { next(error); }
});

router.post("/details", async (req, res, next) => {
  try { validateId(req.body?.certificateId); normalizeDetails(req.body || {}); }
  catch (error) { return res.status(400).json({ status: "ERROR", message: (error as Error).message }); }
  try { res.json({ status: "OK", certificate: await verifyAcademicDetails(req.body || {}) }); }
  catch (error) { next(error); }
});

// Kept for older API clients. Unlike /hash, this endpoint uploads a file.
router.post("/", upload.single("certificate"), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ status: "ERROR", message: "Certificate file is required" });
  try { res.json({ status: "OK", certificate: await verifyCertificate(req.file.buffer) }); } catch (error) { next(error); }
});
export default router;
