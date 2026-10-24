import { calculateSHA256 } from "./hashService.js";
import { certificateContract, ownerContract, issuerWallet, ownerWallet } from "./blockchainService.js";

export async function issueCertificate(certificateId: string, fileData: Buffer, academicHash: string, previousHash?: string) {
  const certificateHash = `0x${calculateSHA256(fileData)}`;
  const contract = previousHash ? ownerContract : certificateContract;
  const issuerAddress = await (previousHash ? ownerWallet : issuerWallet).getAddress();
  const existing = await contract.certificates(certificateHash);
  // If a request was interrupted after confirmation, reuse its current-session transaction.
  if (existing.issuedAt > 0n) {
    const expectedPrevious = previousHash || `0x${"0".repeat(64)}`;
    if (existing.certificateId !== certificateId || existing.issuer.toLowerCase() !== issuerAddress.toLowerCase() ||
        existing.academicHash !== academicHash || existing.previousHash !== expectedPrevious || existing.revoked ||
        existing.replacementHash !== `0x${"0".repeat(64)}`) {
      throw new Error("This file is already registered with different details, or is no longer active");
    }
    const events = await contract.queryFilter(contract.filters.CertificateIssued(certificateHash));
    const event = events[0];
    if (!event) throw new Error("Unable to recover the issuance transaction");
    return { certificateId, certificateHash, issuerAddress, transactionHash: event.transactionHash,
      blockNumber: event.blockNumber, issuedAt: existing.issuedAt.toString() as string };
  }
  const transaction = previousHash
    ? await contract.replaceCertificate(previousHash, certificateHash, certificateId, academicHash)
    : await contract.issueCertificateWithDetails(certificateHash, certificateId, academicHash);
  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) throw new Error("Transaction was not confirmed");
  const block = await receipt.getBlock();
  return { certificateId, certificateHash, issuerAddress, transactionHash: receipt.hash as string,
    blockNumber: receipt.blockNumber as number, issuedAt: String(block.timestamp) };
}
