import { createHash } from "node:crypto";

export function calculateSHA256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}