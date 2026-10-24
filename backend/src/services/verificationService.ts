import { certificateContract } from "./blockchainService.js";
import { calculateSHA256 } from "./hashService.js";
import { academicHash, normalizeDetails, validateId } from "./academicService.js";

const zeroHash = `0x${"0".repeat(64)}`;
export function validateHash(value: unknown): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error("Enter a valid 0x-prefixed document hash");
  return value.toLowerCase();
}

export async function verifyHash(hash: string) {
  const certificateHash = validateHash(hash);
  const record = await certificateContract.certificates(certificateHash);
  const exists = record.issuedAt > 0n;
  const superseded = exists && record.replacementHash !== zeroHash;
  const verificationStatus = !exists ? "INVALID" : superseded ? "SUPERSEDED" : record.revoked ? "REVOKED" : "VALID";
  return { verificationStatus, certificateHash, valid: verificationStatus === "VALID", revoked: record.revoked as boolean,
    certificateId: record.certificateId as string, issuer: record.issuer as string, issuedAt: record.issuedAt.toString() as string,
    revokedAt: record.revokedAt.toString() as string,
    previousHash: exists && record.previousHash !== zeroHash ? record.previousHash as string : null,
    replacementHash: superseded ? record.replacementHash as string : null,
    hasAcademicRecord: exists && record.academicHash !== zeroHash };
}

export async function verifyCertificate(fileData: Buffer) {
  if (!fileData?.length) throw new Error("Certificate file is required");
  return verifyHash(`0x${calculateSHA256(fileData)}`);
}

export async function verifyAcademicDetails(input: Record<string, unknown>) {
  const certificateId = validateId(input.certificateId);
  const details = normalizeDetails(input);
  const hash = await certificateContract.getCertificateHashById(certificateId);
  if (hash === zeroHash) return { verificationStatus: "INVALID", detailsMatch: false, certificateId, message: "Certificate ID is not registered" };
  const [record, status] = await Promise.all([certificateContract.certificates(hash), verifyHash(hash)]);
  const supported = record.academicHash !== zeroHash;
  return { ...status, detailsMatch: supported && record.academicHash === academicHash(certificateId, details),
    message: supported ? "This compares the entered fields with the registered record. It does not authenticate an uploaded PDF." : "This older certificate has no academic-details hash." };
}
