import { Router } from "express";
import { authenticateToken, requireRole } from "../middleware/authMiddleware.js";
import { getSavedCertificate } from "../services/certificateStore.js";
import { verifyHash, validateHash } from "../services/verificationService.js";

const router = Router();
router.get("/:hash/download", authenticateToken, requireRole("ADMIN", "ISSUER"), (req, res) => {
  let hash: string;
  try { hash = validateHash(req.params.hash); }
  catch (error) { return res.status(400).json({ status: "ERROR", message: (error as Error).message }); }
  const certificate = getSavedCertificate(hash);
  if (!certificate) return res.status(404).json({ status: "ERROR", message: "No PDF is available in this demo session" });
  res.type("application/pdf");
  res.attachment(certificate.file_name);
  return res.send(certificate.file_data);
});
router.get("/:hash", async (req, res, next) => {
  let hash: string;
  try { hash = validateHash(req.params.hash); }
  catch (error) { return res.status(400).json({ status: "ERROR", message: (error as Error).message }); }
  try {
    const certificate = await verifyHash(hash);
    if (!certificate.certificateId) return res.status(404).json({ status: "ERROR", message: "Certificate not found in this demo session" });
    return res.json({ status: "OK", certificate });
  } catch (error) { next(error); }
});
export default router;
