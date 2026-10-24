import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { CertificateVerificationABI } from "../config/CertificateVerificationABI.js";

// A new in-process development chain is created for each backend process.
// No external node, RPC URL or saved private key is used by the demo server.
const connection = await network.create({ network: "hardhatMainnet" });
const { ethers } = connection;
export const provider = ethers.provider;
const signers = await ethers.getSigners();
export const ownerWallet = signers[0]!;
export const issuerWallet = signers[1]!;

const deployed = await ethers.deployContract("CertificateVerification", [], ownerWallet);
await deployed.waitForDeployment();
await (await deployed.registerIssuer(await issuerWallet.getAddress())).wait();
const contractAddress = await deployed.getAddress();
export const ownerContract = new ethers.Contract(contractAddress, CertificateVerificationABI, ownerWallet);
export const certificateContract = new ethers.Contract(contractAddress, CertificateVerificationABI, issuerWallet);

export async function getBlockchainInfo() {
  const chain = await provider.getNetwork();
  return { network: "Temporary demo blockchain", chainId: chain.chainId.toString(), contractAddress,
    owner: await ownerWallet.getAddress(), issuer: await issuerWallet.getAddress(), contractVersion: "2", temporary: true };
}

export async function closeDemoBlockchain() {
  await connection.close();
}
