import { calculateSHA256 } from "./hashService.js";

// Fixed field order is important: the same details must always produce the same hash.
export const academicFields = ["studentName", "rollNumber", "degree", "department", "graduationYear", "grade"] as const;
export type AcademicDetails = Record<(typeof academicFields)[number], string>;

export function normalizeDetails(input: Record<string, unknown>): AcademicDetails {
  const details = {} as AcademicDetails;
  for (const field of academicFields) {
    const value = input[field];
    if (typeof value !== "string" || !value.trim() || value.length > 150) {
      throw new Error(`${field} must contain 1–150 characters`);
    }
    details[field] = value.normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase();
  }
  if (!/^\d{4}$/.test(details.graduationYear)) throw new Error("Graduation year must have four digits");
  return details;
}

export function academicHash(certificateId: string, details: AcademicDetails): string {
  const ordered = ["ACV_DETAILS_V1", certificateId.trim(), ...academicFields.map(field => details[field])];
  return `0x${calculateSHA256(Buffer.from(JSON.stringify(ordered), "utf8"))}`;
}

export function validateId(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 100) {
    throw new Error("Certificate ID must contain 1–100 characters");
  }
  return value.trim();
}
