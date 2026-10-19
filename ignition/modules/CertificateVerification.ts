import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
export default buildModule("CertificateVerificationModule", (m) => {
  const certificateVerification = m.contract("CertificateVerification");
  return { certificateVerification };
});
