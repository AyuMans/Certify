import "dotenv/config";
import { app } from "./app.js";
import { pool } from "./config/database.js";
import { closeDemoBlockchain } from "./services/blockchainService.js";
import { clearSessionCertificates } from "./services/certificateStore.js";
import { removeLegacyCertificateHistory } from "./cleanupCertificateHistory.js";

try { await removeLegacyCertificateHistory(); }
catch (error) { await pool.end(); await closeDemoBlockchain(); throw error; }
const port = Number(process.env.PORT || 5000);
const server = app.listen(port, process.env.HOST || "127.0.0.1", () => {
  const actualPort = (server.address() as { port: number }).port;
  console.log(`Certificate Verification: http://localhost:${actualPort}`);
  console.log("Demo mode: certificates, PDFs and blockchain history are temporary. User accounts are saved.");
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(() => {
    clearSessionCertificates();
    void Promise.all([pool.end(), closeDemoBlockchain()]).catch(error => { console.error(error); process.exitCode = 1; });
  });
}
server.on("error", error => { console.error(error); clearSessionCertificates(); void Promise.all([pool.end(), closeDemoBlockchain()]).finally(() => { process.exitCode = 1; }); });
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
