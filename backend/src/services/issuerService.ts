import { ethers } from "ethers";
import { ownerContract } from "./blockchainService.js";
import { acquireWriteLock } from "./chainWriteQueue.js";

function validateAddress(value: string) {
  if (typeof value !== "string" || !ethers.isAddress(value)) throw new Error("Enter a valid Ethereum address");
  return ethers.getAddress(value);
}

export async function registerIssuer(issuerAddress: string) {
  const issuer = validateAddress(issuerAddress);
  const release = await acquireWriteLock();
  try {
    if (await ownerContract.authorizedIssuers(issuer)) throw new Error("Issuer is already registered");
    const transaction = await ownerContract.registerIssuer(issuer);
    const receipt = await transaction.wait();
    return { issuerAddress: issuer, transactionHash: transaction.hash, blockNumber: receipt?.blockNumber ?? null, registered: true };
  } finally { release(); }
}

export async function removeIssuer(issuerAddress: string) {
  const issuer = validateAddress(issuerAddress);
  const release = await acquireWriteLock();
  try {
    if (!await ownerContract.authorizedIssuers(issuer)) throw new Error("Issuer is not registered");
    const transaction = await ownerContract.removeIssuer(issuer);
    const receipt = await transaction.wait();
    return { issuerAddress: issuer, transactionHash: transaction.hash, blockNumber: receipt?.blockNumber ?? null, registered: false };
  } finally { release(); }
}

export async function getIssuerStatus(issuerAddress: string) {
  const issuer = validateAddress(issuerAddress);
  return { issuerAddress: issuer, registered: await ownerContract.authorizedIssuers(issuer) as boolean };
}
