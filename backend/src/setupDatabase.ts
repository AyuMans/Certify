import "dotenv/config";
import { readFile } from "node:fs/promises";
import { pool } from "./config/database.js";
try {
  await pool.query(await readFile(new URL("../sql/schema.sql", import.meta.url), "utf8"));
  console.log("Database tables are ready. Existing records were preserved.");
} finally { await pool.end(); }
