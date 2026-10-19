import { network } from "hardhat";
const { ethers } = await network.create();
const contractAddress = process.env.CONTRACT_ADDRESS;
const issuerAddress = process.env.ISSUER_ADDRESS;
if (!contractAddress || !issuerAddress) throw new Error("Set CONTRACT_ADDRESS and ISSUER_ADDRESS, or use the admin interface.");
const contract = await ethers.getContractAt("CertificateVerification", contractAddress);
if (!await contract.authorizedIssuers(issuerAddress)) await (await contract.registerIssuer(issuerAddress)).wait();
console.log("Issuer is authorized:", issuerAddress);
