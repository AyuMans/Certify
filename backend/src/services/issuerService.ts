import { ethers } from "ethers";
import {
  ownerContract,
} from "./blockchainService.js";

export async function registerIssuer(issuerAddress: string) {
  if (!issuerAddress) {
    throw new Error("Issuer address is required");
  }

  if (!ethers.isAddress(issuerAddress)) {
    throw new Error("Invalid Ethereum address");
  }

  const issuer = ethers.getAddress(issuerAddress);

  const alreadyRegistered =
    await ownerContract.authorizedIssuers(issuer);

  if (alreadyRegistered) {
    throw new Error("Issuer is already registered");
  }

  const transaction =
    await ownerContract.registerIssuer(issuer);

  const receipt = await transaction.wait();

  return {
    issuerAddress: issuer,
    transactionHash: transaction.hash,
    blockNumber: receipt?.blockNumber ?? null,
    registered: true,
  };
}

export async function removeIssuer(issuerAddress: string) {
  if (!issuerAddress) {
    throw new Error("Issuer address is required");
  }

  if (!ethers.isAddress(issuerAddress)) {
    throw new Error("Invalid Ethereum address");
  }

  const issuer = ethers.getAddress(issuerAddress);

  const alreadyRegistered =
    await ownerContract.authorizedIssuers(issuer);

  if (!alreadyRegistered) {
    throw new Error("Issuer is not registered");
  }

  const transaction =
    await ownerContract.removeIssuer(issuer);

  const receipt = await transaction.wait();

  return {
    issuerAddress: issuer,
    transactionHash: transaction.hash,
    blockNumber: receipt?.blockNumber ?? null,
    registered: false,
  };
}

export async function getIssuerStatus(
  issuerAddress: string
) {
  if (!issuerAddress) {
    throw new Error("Issuer address is required");
  }

  if (!ethers.isAddress(issuerAddress)) {
    throw new Error("Invalid Ethereum address");
  }

  const issuer = ethers.getAddress(issuerAddress);

  const registered =
    await ownerContract.authorizedIssuers(issuer);

  return {
    issuerAddress: issuer,
    registered,
  };
}