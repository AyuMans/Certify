import { ownerContract } from "./blockchainService.js";
import { revokeCertificateInDatabase } from "./databaseService.js";

export async function revokeCertificate(
  certificateHash: string
) {
  if (!certificateHash) {
    throw new Error("Certificate hash is required");
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(certificateHash)) {
    throw new Error(
      "Certificate hash must be a valid bytes32 value"
    );
  }

  certificateHash = certificateHash.toLowerCase();
  const existing = await ownerContract.getCertificate(certificateHash);
  // Retrying after a database outage reconciles the confirmed chain state.
  if (existing[4]) {
    const record = await revokeCertificateInDatabase(certificateHash);
    return { certificateHash, revoked: true, revokedAt: record.revoked_at, reconciled: true };
  }

  // First revoke on blockchain
  const transaction =
    await ownerContract.revokeCertificate(
      certificateHash
    );

  const receipt = await transaction.wait();

  // Only update PostgreSQL after blockchain confirmation
  const databaseResult =
    await revokeCertificateInDatabase(certificateHash);

  return {
    certificateHash,
    transactionHash: transaction.hash,
    blockNumber: receipt?.blockNumber ?? null,
    databaseId: databaseResult.id,
    revoked: databaseResult.revoked,
    revokedAt: databaseResult.revoked_at,
  };
}
