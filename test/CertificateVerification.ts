import { expect } from "chai";
import { network } from "hardhat";

describe("CertificateVerification", function () {

  // --------------------------------------------------
  // ISSUER MANAGEMENT
  // --------------------------------------------------

  it("Should register an issuer", async function () {
    const { ethers } = await network.create();
    const [owner, issuer] = await ethers.getSigners();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    await contract.registerIssuer(issuer.address);

    expect(
      await contract.authorizedIssuers(issuer.address)
    ).to.equal(true);
  });


  it("Should emit an event when registering an issuer", async function () {
    const { ethers } = await network.create();
    const [owner, issuer] = await ethers.getSigners();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    await expect(
      contract.registerIssuer(issuer.address)
    )
      .to.emit(contract, "IssuerAdded")
      .withArgs(issuer.address);
  });


  it("Should reject registration by a non-owner", async function () {
    const { ethers } = await network.create();
    const [owner, issuer] = await ethers.getSigners();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    const issuerContract = contract.connect(issuer);

    await expect(
      issuerContract.registerIssuer(issuer.address)
    ).to.be.revertedWith(
      "Only owner can perform this action"
    );
  });


  it("Should reject registering the same issuer twice", async function () {
    const { ethers } = await network.create();
    const [owner, issuer] = await ethers.getSigners();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    await contract.registerIssuer(issuer.address);

    await expect(
      contract.registerIssuer(issuer.address)
    ).to.be.revertedWith(
      "Issuer already registered"
    );
  });


  it("Should remove an issuer", async function () {
    const { ethers } = await network.create();
    const [owner, issuer] = await ethers.getSigners();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    await contract.registerIssuer(issuer.address);
    await contract.removeIssuer(issuer.address);

    expect(
      await contract.authorizedIssuers(issuer.address)
    ).to.equal(false);
  });


  it("Should emit an event when removing an issuer", async function () {
    const { ethers } = await network.create();
    const [owner, issuer] = await ethers.getSigners();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    await contract.registerIssuer(issuer.address);

    await expect(
      contract.removeIssuer(issuer.address)
    )
      .to.emit(contract, "IssuerRemoved")
      .withArgs(issuer.address);
  });


  it("Should reject certificate issuance after issuer is removed", async function () {
    const { ethers } = await network.create();
    const [owner, issuer] = await ethers.getSigners();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    await contract.registerIssuer(issuer.address);
    await contract.removeIssuer(issuer.address);

    const certificateHash = ethers.keccak256(
      ethers.toUtf8Bytes("certificate-removed-issuer")
    );

    const issuerContract = contract.connect(issuer);

    await expect(
      issuerContract.issueCertificate(
        certificateHash,
        "CERT-REMOVED"
      )
    ).to.be.revertedWith(
      "Not an authorized issuer"
    );
  });


  // --------------------------------------------------
  // CERTIFICATE ISSUANCE
  // --------------------------------------------------

  it("Should allow an authorized issuer to issue a certificate", async function () {
    const { ethers } = await network.create();
    const [owner, issuer] = await ethers.getSigners();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    await contract.registerIssuer(issuer.address);

    const certificateHash = ethers.keccak256(
      ethers.toUtf8Bytes("certificate-001")
    );

    const issuerContract = contract.connect(issuer);

    await issuerContract.issueCertificate(
      certificateHash,
      "CERT-001"
    );

    const certificate =
      await contract.certificates(certificateHash);

    expect(certificate.certificateHash)
      .to.equal(certificateHash);

    expect(certificate.certificateId)
      .to.equal("CERT-001");

    expect(certificate.issuer)
      .to.equal(issuer.address);

    expect(certificate.revoked)
      .to.equal(false);

    expect(certificate.revokedAt)
      .to.equal(0);
  });


  it("Should emit an event when issuing a certificate", async function () {
    const { ethers } = await network.create();
    const [owner, issuer] = await ethers.getSigners();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    await contract.registerIssuer(issuer.address);

    const certificateHash = ethers.keccak256(
      ethers.toUtf8Bytes("certificate-event")
    );

    const issuerContract = contract.connect(issuer);

    const tx = await issuerContract.issueCertificate(
      certificateHash,
      "CERT-EVENT"
    );

    const receipt = await tx.wait();

    expect(receipt).to.not.equal(null);

    const certificate =
      await contract.certificates(certificateHash);

    expect(certificate.certificateHash)
      .to.equal(certificateHash);

    expect(certificate.certificateId)
      .to.equal("CERT-EVENT");

    expect(certificate.issuer)
      .to.equal(issuer.address);

    expect(certificate.issuedAt)
      .to.be.greaterThan(0);
  });

  it("Should reject an unauthorized issuer", async function () {
    const { ethers } = await network.create();
    const [owner, issuer] = await ethers.getSigners();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    const certificateHash = ethers.keccak256(
      ethers.toUtf8Bytes("certificate-002")
    );

    const issuerContract = contract.connect(issuer);

    await expect(
      issuerContract.issueCertificate(
        certificateHash,
        "CERT-002"
      )
    ).to.be.revertedWith(
      "Not an authorized issuer"
    );
  });


  it("Should reject a duplicate certificate hash", async function () {
    const { ethers } = await network.create();
    const [owner, issuer] = await ethers.getSigners();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    await contract.registerIssuer(issuer.address);

    const certificateHash = ethers.keccak256(
      ethers.toUtf8Bytes("duplicate-hash")
    );

    const issuerContract = contract.connect(issuer);

    await issuerContract.issueCertificate(
      certificateHash,
      "CERT-003"
    );

    await expect(
      issuerContract.issueCertificate(
        certificateHash,
        "CERT-004"
      )
    ).to.be.revertedWith(
      "Certificate already exists"
    );
  });


  it("Should reject a duplicate certificate ID", async function () {
    const { ethers } = await network.create();
    const [owner, issuer] = await ethers.getSigners();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    await contract.registerIssuer(issuer.address);

    const firstHash = ethers.keccak256(
      ethers.toUtf8Bytes("certificate-first")
    );

    const secondHash = ethers.keccak256(
      ethers.toUtf8Bytes("certificate-second")
    );

    const issuerContract = contract.connect(issuer);

    await issuerContract.issueCertificate(
      firstHash,
      "CERT-DUPLICATE-ID"
    );

    await expect(
      issuerContract.issueCertificate(
        secondHash,
        "CERT-DUPLICATE-ID"
      )
    ).to.be.revertedWith(
      "Certificate ID already exists"
    );
  });


  it("Should reject an invalid certificate hash", async function () {
    const { ethers } = await network.create();
    const [owner, issuer] = await ethers.getSigners();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    await contract.registerIssuer(issuer.address);

    const issuerContract = contract.connect(issuer);

    await expect(
      issuerContract.issueCertificate(
        ethers.ZeroHash,
        "CERT-INVALID-HASH"
      )
    ).to.be.revertedWith(
      "Invalid certificate hash"
    );
  });


  it("Should reject an empty certificate ID", async function () {
    const { ethers } = await network.create();
    const [owner, issuer] = await ethers.getSigners();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    await contract.registerIssuer(issuer.address);

    const certificateHash = ethers.keccak256(
      ethers.toUtf8Bytes("certificate-empty-id")
    );

    const issuerContract = contract.connect(issuer);

    await expect(
      issuerContract.issueCertificate(
        certificateHash,
        ""
      )
    ).to.be.revertedWith(
      "Invalid certificate ID"
    );
  });


  // --------------------------------------------------
  // CERTIFICATE VERIFICATION
  // --------------------------------------------------

  it("Should verify a registered certificate", async function () {
    const { ethers } = await network.create();
    const [owner, issuer] = await ethers.getSigners();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    await contract.registerIssuer(issuer.address);

    const certificateHash = ethers.keccak256(
      ethers.toUtf8Bytes("certificate-005")
    );

    const issuerContract = contract.connect(issuer);

    await issuerContract.issueCertificate(
      certificateHash,
      "CERT-005"
    );

    const result =
      await contract.verifyCertificate(certificateHash);

    expect(result[0]).to.equal(true);
    expect(result[1]).to.equal(false);
    expect(result[2]).to.equal("CERT-005");
    expect(result[3]).to.equal(issuer.address);
    expect(result[4]).to.be.greaterThan(0);
  });


  it("Should return invalid for an unregistered certificate", async function () {
    const { ethers } = await network.create();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    const unknownHash = ethers.keccak256(
      ethers.toUtf8Bytes("unknown-certificate")
    );

    const result =
      await contract.verifyCertificate(unknownHash);

    expect(result[0]).to.equal(false);
    expect(result[1]).to.equal(false);
    expect(result[2]).to.equal("");
    expect(result[3]).to.equal(ethers.ZeroAddress);
    expect(result[4]).to.equal(0);
  });


  // --------------------------------------------------
  // GET CERTIFICATE
  // --------------------------------------------------

  it("Should return complete certificate details", async function () {
    const { ethers } = await network.create();
    const [owner, issuer] = await ethers.getSigners();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    await contract.registerIssuer(issuer.address);

    const certificateHash = ethers.keccak256(
      ethers.toUtf8Bytes("certificate-details")
    );

    const issuerContract = contract.connect(issuer);

    await issuerContract.issueCertificate(
      certificateHash,
      "CERT-DETAILS"
    );

    const certificate =
      await contract.getCertificate(certificateHash);

    expect(certificate[0])
      .to.equal(certificateHash);

    expect(certificate[1])
      .to.equal("CERT-DETAILS");

    expect(certificate[2])
      .to.equal(issuer.address);

    expect(certificate[3])
      .to.be.greaterThan(0);

    expect(certificate[4])
      .to.equal(false);

    expect(certificate[5])
      .to.equal(0);
  });


  it("Should reject getting a certificate that does not exist", async function () {
    const { ethers } = await network.create();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    const unknownHash = ethers.keccak256(
      ethers.toUtf8Bytes("missing-certificate")
    );

    await expect(
      contract.getCertificate(unknownHash)
    ).to.be.revertedWith(
      "Certificate does not exist"
    );
  });


  // --------------------------------------------------
  // CERTIFICATE REVOCATION
  // --------------------------------------------------

  it("Should allow the original issuer to revoke a certificate", async function () {
    const { ethers } = await network.create();
    const [owner, issuer] = await ethers.getSigners();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    await contract.registerIssuer(issuer.address);

    const certificateHash = ethers.keccak256(
      ethers.toUtf8Bytes("certificate-revoke-issuer")
    );

    const issuerContract = contract.connect(issuer);

    await issuerContract.issueCertificate(
      certificateHash,
      "CERT-REVOKE-ISSUER"
    );

    await issuerContract.revokeCertificate(
      certificateHash
    );

    const certificate =
      await contract.certificates(certificateHash);

    expect(certificate.revoked)
      .to.equal(true);

    expect(certificate.revokedAt)
      .to.be.greaterThan(0);
  });


  it("Should allow the owner to revoke a certificate", async function () {
    const { ethers } = await network.create();
    const [owner, issuer] = await ethers.getSigners();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    await contract.registerIssuer(issuer.address);

    const certificateHash = ethers.keccak256(
      ethers.toUtf8Bytes("certificate-revoke-owner")
    );

    const issuerContract = contract.connect(issuer);

    await issuerContract.issueCertificate(
      certificateHash,
      "CERT-REVOKE-OWNER"
    );

    await contract.revokeCertificate(
      certificateHash
    );

    const certificate =
      await contract.certificates(certificateHash);

    expect(certificate.revoked)
      .to.equal(true);
  });


  it("Should reject revocation by an unauthorized account", async function () {
    const { ethers } = await network.create();
    const [owner, issuer, unauthorized] =
      await ethers.getSigners();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    await contract.registerIssuer(issuer.address);

    const certificateHash = ethers.keccak256(
      ethers.toUtf8Bytes("certificate-unauthorized-revoke")
    );

    const issuerContract = contract.connect(issuer);

    await issuerContract.issueCertificate(
      certificateHash,
      "CERT-UNAUTHORIZED-REVOKE"
    );

    const unauthorizedContract =
      contract.connect(unauthorized);

    await expect(
      unauthorizedContract.revokeCertificate(
        certificateHash
      )
    ).to.be.revertedWith(
      "Not authorized to revoke"
    );
  });


  it("Should reject revoking a certificate that does not exist", async function () {
    const { ethers } = await network.create();
    const [owner] = await ethers.getSigners();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    const unknownHash = ethers.keccak256(
      ethers.toUtf8Bytes("unknown-revoke")
    );

    await expect(
      contract.revokeCertificate(unknownHash)
    ).to.be.revertedWith(
      "Certificate does not exist"
    );
  });


  it("Should reject revoking an already revoked certificate", async function () {
    const { ethers } = await network.create();
    const [owner, issuer] = await ethers.getSigners();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    await contract.registerIssuer(issuer.address);

    const certificateHash = ethers.keccak256(
      ethers.toUtf8Bytes("certificate-double-revoke")
    );

    const issuerContract = contract.connect(issuer);

    await issuerContract.issueCertificate(
      certificateHash,
      "CERT-DOUBLE-REVOKE"
    );

    await issuerContract.revokeCertificate(
      certificateHash
    );

    await expect(
      issuerContract.revokeCertificate(
        certificateHash
      )
    ).to.be.revertedWith(
      "Certificate already revoked"
    );
  });


  it("Should emit an event when revoking a certificate", async function () {
    const { ethers } = await network.create();
    const [owner, issuer] = await ethers.getSigners();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    await contract.registerIssuer(issuer.address);

    const certificateHash = ethers.keccak256(
      ethers.toUtf8Bytes("certificate-revoke-event")
    );

    const issuerContract = contract.connect(issuer);

    await issuerContract.issueCertificate(
      certificateHash,
      "CERT-REVOKE-EVENT"
    );

    const tx = await issuerContract.revokeCertificate(
      certificateHash
    );

    const receipt = await tx.wait();

    expect(receipt).to.not.equal(null);

    const certificate =
      await contract.certificates(certificateHash);

    expect(certificate.revoked)
      .to.equal(true);

    expect(certificate.revokedAt)
      .to.be.greaterThan(0);
  });


  it("Should report a revoked certificate as invalid", async function () {
    const { ethers } = await network.create();
    const [owner, issuer] = await ethers.getSigners();

    const CertificateVerification =
      await ethers.getContractFactory("CertificateVerification");

    const contract = await CertificateVerification.deploy();

    await contract.registerIssuer(issuer.address);

    const certificateHash = ethers.keccak256(
      ethers.toUtf8Bytes("certificate-revoked")
    );

    const issuerContract = contract.connect(issuer);

    await issuerContract.issueCertificate(
      certificateHash,
      "CERT-REVOKED"
    );

    await issuerContract.revokeCertificate(
      certificateHash
    );

    const result =
      await contract.verifyCertificate(certificateHash);

    expect(result[0]).to.equal(false);
    expect(result[1]).to.equal(true);
    expect(result[2]).to.equal("CERT-REVOKED");
    expect(result[3]).to.equal(issuer.address);
    expect(result[4]).to.be.greaterThan(0);
  });

});


// --------------------------------------------------
// HELPER
// --------------------------------------------------

async function getLatestBlockTimestamp(ethers: any) {
  const block = await ethers.provider.getBlock("latest");

  if (!block) {
    throw new Error("Latest block could not be found");
  }

  return block.timestamp;
}