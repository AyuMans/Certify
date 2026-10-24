import "dotenv/config";
import { readFile } from "node:fs/promises";
import { pool } from "./config/database.js";
try {
  await pool.query(await readFile(new URL("../sql/schema.sql", import.meta.url), "utf8"));
  console.log("Persistent user accounts table is ready. Existing accounts were preserved.");
} finally { await pool.end(); }
