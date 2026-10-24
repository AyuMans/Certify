import { fileURLToPath } from "node:url";
import path from "node:path";
import { lstat, realpath, readdir, unlink, rm } from "node:fs/promises";
import { pool } from "./config/database.js";

// One-time migration for older versions, also safe to run on every startup.
// Only certificate storage is touched; the users table is never changed.
export async function removeLegacyCertificateHistory() {
  const table = await pool.query("SELECT to_regclass('certificates') AS name");
  let removedRecords = 0;
  if (table.rows[0].name) {
    removedRecords = Number((await pool.query("SELECT count(*) AS count FROM certificates")).rows[0].count);
    await pool.query("DROP TABLE certificates");
  }

  const uploads = path.resolve(fileURLToPath(new URL("../uploads/", import.meta.url)));
  let removedUploads = 0;
  try {
    const directory = await lstat(uploads);
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error("The legacy uploads path must be a normal directory");
    const root = await realpath(uploads);
    if (root.toLowerCase() !== uploads.toLowerCase()) throw new Error("Refusing to clean an uploads directory outside its expected location");
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const target = path.resolve(root, entry.name);
      const relative = path.relative(root, target);
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Unexpected upload path");
      if (entry.isDirectory()) {
        const actual = await realpath(target);
        const actualRelative = path.relative(root, actual);
        if (actualRelative.startsWith("..") || path.isAbsolute(actualRelative)) throw new Error("Unexpected upload directory");
        await rm(target, { recursive: true });
      } else { await unlink(target); }
      removedUploads++;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return { removedRecords, removedUploads };
}
