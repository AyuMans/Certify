import { ownerContract } from "./blockchainService.js";
import { revokeSavedCertificate } from "./certificateStore.js";
import { acquireWriteLock } from "./chainWriteQueue.js";
import { validateHash } from "./verificationService.js";

export async function revokeCertificate(value: string) {
  const certificateHash = validateHash(value);
  const release = await acquireWriteLock();
  try {
    const existing = await ownerContract.getCertificate(certificateHash);
    if (existing[4]) {
      const record = revokeSavedCertificate(certificateHash);
      return { certificateHash, revoked: true, revokedAt: record.revoked_at };
    }
    const transaction = await ownerContract.revokeCertificate(certificateHash);
    const receipt = await transaction.wait();
    const record = revokeSavedCertificate(certificateHash);
    return { certificateHash, transactionHash: transaction.hash, blockNumber: receipt?.blockNumber ?? null,
      sessionRecordId: record.id, revoked: record.revoked, revokedAt: record.revoked_at };
  } finally { release(); }
}
