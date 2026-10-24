import "dotenv/config";
import { removeLegacyCertificateHistory } from "./cleanupCertificateHistory.js";
import { pool } from "./config/database.js";
try {
  const before = JSON.stringify((await pool.query("SELECT * FROM users ORDER BY id")).rows);
  const result = await removeLegacyCertificateHistory();
  const after = JSON.stringify((await pool.query("SELECT * FROM users ORDER BY id")).rows);
  if (before !== after) throw new Error("User records changed unexpectedly");
  console.log(`Removed ${result.removedRecords} legacy certificate records and ${result.removedUploads} stored uploads. All user accounts and password hashes were preserved.`);
} finally { await pool.end(); }
