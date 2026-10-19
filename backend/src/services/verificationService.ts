import { certificateContract } from "./blockchainService.js";
import { calculateSHA256 } from "./hashService.js";

export async function verifyCertificate(fileData: Buffer) {
  if (!fileData || fileData.length === 0) {
    throw new Error("Certificate file is required");
  }

  const sha256Hash = calculateSHA256(fileData);
  const certificateHash = `0x${sha256Hash}`;

  const result =
    await certificateContract.verifyCertificate(certificateHash);

  const [
    valid,
    revoked,
    certificateId,
    issuer,
    issuedAt,
  ] = result;

  let verificationStatus: "VALID" | "INVALID" | "REVOKED";

  if (revoked) {
    verificationStatus = "REVOKED";
  } else if (valid) {
    verificationStatus = "VALID";
  } else {
    verificationStatus = "INVALID";
  }

  return {
    verificationStatus,
    certificateHash,
    valid,
    revoked,
    certificateId,
    issuer,
    issuedAt: issuedAt.toString(),
  };
}