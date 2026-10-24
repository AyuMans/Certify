import express from "express";
import { randomUUID } from "node:crypto";
import type { ErrorRequestHandler } from "express";
import multer from "multer";
import { fileURLToPath } from "node:url";
import { getBlockchainInfo } from "./services/blockchainService.js";
import certificateRoutes from "./routes/certificateRoutes.js";
import verificationRoutes from "./routes/verificationRoutes.js";
import revocationRoutes from "./routes/revocationRoutes.js";
import certificateLookupRoutes from "./routes/certificateLookupRoutes.js";
import auditRoutes from "./routes/auditRoutes.js";
import { testDatabaseConnection } from "./config/database.js";
import authRoutes from "./routes/authRoutes.js";
import issuerRoutes from "./routes/issuerRoutes.js";
import { listCertificates } from "./services/certificateStore.js";

export const app = express();
const demoSessionId = randomUUID();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  next();
});
app.use(express.json({ limit: "32kb" }));
app.use("/api/auth", authRoutes);
app.use("/api/certificates", certificateRoutes);
app.use("/api/certificates/verify", verificationRoutes);
app.use("/api/certificates/revoke", revocationRoutes);
app.use("/api/certificates/audit", auditRoutes);
app.use("/api/certificates", certificateLookupRoutes);
app.use("/api/issuers", issuerRoutes);
app.get("/api/health", async (_req, res) => {
  const [database, blockchain] = await Promise.allSettled([testDatabaseConnection(), getBlockchainInfo()]);
  const healthy = database.status === "fulfilled" && blockchain.status === "fulfilled";
  res.status(healthy ? 200 : 503).json({ status: healthy ? "OK" : "DEGRADED", applicationVersion: 3,
    demoSessionId, certificateStorage: "memory", certificateCount: listCertificates().length,
    contractAddress: blockchain.status === "fulfilled" ? blockchain.value.contractAddress : null,
    database: database.status === "fulfilled" ? "connected" : "unavailable",
    blockchain: blockchain.status === "fulfilled" ? "connected" : "unavailable" });
});
app.get("/api/blockchain", async (_req, res, next) => {
  try { res.json({ status: "OK", blockchain: await getBlockchainInfo() }); } catch (error) { next(error); }
});
app.use("/api", (_req, res) => { res.status(404).json({ status: "ERROR", message: "API route not found" }); });
app.use(express.static(fileURLToPath(new URL("../public/", import.meta.url))));
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    res.status(400).json({ status: "ERROR", message: error.code === "LIMIT_FILE_SIZE" ? "File must be 10 MB or smaller" : "Invalid upload; select one certificate file" });
    return;
  }
  if (error instanceof SyntaxError && "body" in error) { res.status(400).json({ status: "ERROR", message: "Invalid JSON request" }); return; }
  console.error("Request failed:", error);
  res.status(503).json({ status: "ERROR", message: "Service unavailable. Check the database and blockchain connection." });
};
app.use(errorHandler);
