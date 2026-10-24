import type { AcademicDetails } from "./academicService.js";

export interface CertificateRecord {
  certificateId: string;
  certificateHash: string;
  fileName: string;
  fileData: Buffer;
  issuerAddress: string;
  transactionHash: string;
  blockNumber: number;
  issuedAt: Date;
  academicDetails: AcademicDetails;
  academicHash: string;
  previousHash?: string;
}

interface SavedCertificate {
  id: number;
  certificate_id: string;
  certificate_hash: string;
  file_name: string;
  file_data: Buffer;
  issuer_address: string;
  transaction_hash: string;
  block_number: number;
  issued_at: Date;
  academic_details: AcademicDetails;
  academic_hash: string;
  previous_hash: string | null;
  replacement_hash: string | null;
  revoked: boolean;
  revoked_at: Date | null;
}

// This Map and its PDF buffers disappear when the backend process exits.
const certificates = new Map<string, SavedCertificate>();
let nextId = 1;

export function getSavedCertificate(hash: string) {
  return certificates.get(hash.toLowerCase());
}
export function certificateExists(hash: string, id: string) {
  return certificates.has(hash) || [...certificates.values()].some(record => record.certificate_id === id);
}
export function listCertificates() {
  return [...certificates.values()].reverse().slice(0, 100).map(({ file_data, ...record }) => record);
}
export function saveCertificate(input: CertificateRecord) {
  if (certificateExists(input.certificateHash, input.certificateId)) throw new Error("Certificate already saved in this demo session");
  const record: SavedCertificate = {
    id: nextId++, certificate_id: input.certificateId, certificate_hash: input.certificateHash,
    file_name: input.fileName, file_data: Buffer.from(input.fileData), issuer_address: input.issuerAddress,
    transaction_hash: input.transactionHash, block_number: input.blockNumber, issued_at: input.issuedAt,
    academic_details: input.academicDetails, academic_hash: input.academicHash,
    previous_hash: input.previousHash || null, replacement_hash: null, revoked: false, revoked_at: null,
  };
  certificates.set(input.certificateHash, record);
  if (input.previousHash) {
    const previous = getSavedCertificate(input.previousHash);
    if (previous) previous.replacement_hash = input.certificateHash;
  }
  return record;
}
export function revokeSavedCertificate(hash: string) {
  const record = getSavedCertificate(hash);
  if (!record) throw new Error("No certificate is saved in this demo session");
  record.revoked = true;
  record.revoked_at = new Date();
  return record;
}
export function clearSessionCertificates() {
  certificates.clear();
  nextId = 1;
}
