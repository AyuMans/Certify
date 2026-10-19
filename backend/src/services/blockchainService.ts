import { ethers } from "ethers";
import dotenv from "dotenv";
import { CertificateVerificationABI } from "../config/CertificateVerificationABI.js";

dotenv.config();

const rpcUrl = process.env.BLOCKCHAIN_RPC_URL;
const contractAddress = process.env.CONTRACT_ADDRESS;
const ownerPrivateKey = process.env.OWNER_PRIVATE_KEY;
const issuerPrivateKey = process.env.ISSUER_PRIVATE_KEY;

if (!rpcUrl) {
  throw new Error("BLOCKCHAIN_RPC_URL is not configured");
}

if (!contractAddress) {
  throw new Error("CONTRACT_ADDRESS is not configured");
}

if (!ownerPrivateKey) {
  throw new Error("OWNER_PRIVATE_KEY is not configured");
}

if (!issuerPrivateKey) {
  throw new Error("ISSUER_PRIVATE_KEY is not configured");
}

const request = new ethers.FetchRequest(rpcUrl);
request.timeout = 5000;
export const provider = new ethers.JsonRpcProvider(request, undefined, { cacheTimeout: -1 });

// Owner/admin wallet
export const ownerWallet = new ethers.Wallet(
  ownerPrivateKey,
  provider
);

// Dedicated certificate issuer wallet
export const issuerWallet = new ethers.Wallet(
  issuerPrivateKey,
  provider
);

// Contract connected as owner
export const ownerContract = new ethers.Contract(
  contractAddress,
  CertificateVerificationABI,
  ownerWallet
);

// Contract connected as issuer
export const certificateContract = new ethers.Contract(
  contractAddress,
  CertificateVerificationABI,
  issuerWallet
);

export async function getBlockchainInfo() {
  const network = await provider.getNetwork();
  const owner = await ownerContract.owner();
  const issuer = await issuerWallet.getAddress();

  return {
    network: network.name,
    chainId: network.chainId.toString(),
    contractAddress,
    owner,
    issuer,
  };
}
