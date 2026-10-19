import { calculateSHA256 } from "./hashService.js";
import { certificateContract, issuerWallet } from "./blockchainService.js";

export async function issueCertificate(certificateId: string, fileData: Buffer) {
  const certificateHash = `0x${calculateSHA256(fileData)}`;
  const issuerAddress = await issuerWallet.getAddress();
  const existing = await certificateContract.certificates(certificateHash);
  // Recover a confirmed transaction whose database write failed, without issuing twice.
  if (existing.issuedAt > 0n) {
    if (existing.certificateId !== certificateId.trim() || existing.issuer.toLowerCase() !== issuerAddress.toLowerCase() || existing.revoked) {
      throw new Error("Certificate hash is already registered with different details or is revoked");
    }
    const events = await certificateContract.queryFilter(certificateContract.filters.CertificateIssued(certificateHash));
    const event = events[0];
    if (!event) throw new Error("Unable to recover issuance transaction");
    return { certificateId: existing.certificateId as string, certificateHash, issuerAddress, transactionHash: event.transactionHash,
      blockNumber: event.blockNumber, issuedAt: existing.issuedAt.toString() as string };
  }
  const transaction = await certificateContract.issueCertificate(certificateHash, certificateId.trim());
  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) throw new Error("Transaction was not confirmed");
  const block = await receipt.getBlock();
  return { certificateId: certificateId.trim(), certificateHash, issuerAddress, transactionHash: receipt.hash as string,
    blockNumber: receipt.blockNumber as number, issuedAt: String(block.timestamp) };
}
