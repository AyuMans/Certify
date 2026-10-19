import { pool } from "../config/database.js";

export interface CertificateRecord {
  certificateId: string;
  certificateHash: string;
  fileName: string;
  filePath: string;
  issuerAddress: string;
  transactionHash: string;
  blockNumber: number;
  issuedAt: Date;
}

export async function saveCertificate(
  certificate: CertificateRecord
) {
  const query = `
    INSERT INTO certificates (
      certificate_id,
      certificate_hash,
      file_name,
      file_path,
      issuer_address,
      transaction_hash,
      block_number,
      issued_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;

  const values = [
    certificate.certificateId,
    certificate.certificateHash,
    certificate.fileName,
    certificate.filePath,
    certificate.issuerAddress,
    certificate.transactionHash,
    certificate.blockNumber,
    certificate.issuedAt,
  ];

  const result = await pool.query(query, values);

  return result.rows[0];
}

export async function revokeCertificateInDatabase(
  certificateHash: string
) {
  const query = `
    UPDATE certificates
    SET
      revoked = TRUE,
      revoked_at = CURRENT_TIMESTAMP
    WHERE certificate_hash = $1
    RETURNING *
  `;

  const result = await pool.query(query, [certificateHash]);

  if (result.rows.length === 0) {
    throw new Error(
      "Certificate was revoked on blockchain but no matching database record was found"
    );
  }

  return result.rows[0];
}