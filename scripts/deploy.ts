import { network } from "hardhat";
import { readFile, writeFile } from "node:fs/promises";
import { Wallet, NonceManager } from "ethers";

const connection = await network.create();
const { ethers } = connection;
const chain = await ethers.provider.getNetwork();
if (chain.chainId !== 31337n) throw new Error("This setup script is for local Hardhat only (chain ID 31337).");
const envPath = new URL("../backend/.env", import.meta.url);
const envText = await readFile(envPath, "utf8");
function value(name: string) {
  const line = envText.split(/\r?\n/).find(line => line.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, "");
}
const ownerKey = value("OWNER_PRIVATE_KEY");
const issuerKey = value("ISSUER_PRIVATE_KEY");
if (!ownerKey || !issuerKey) throw new Error("Configure local OWNER_PRIVATE_KEY and ISSUER_PRIVATE_KEY in backend/.env first.");
const owner = new Wallet(ownerKey, ethers.provider);
const issuer = new Wallet(issuerKey).address;
const contract = await ethers.deployContract("CertificateVerification", [], new NonceManager(owner));
await contract.waitForDeployment();
await (await contract.registerIssuer(issuer)).wait();
const address = await contract.getAddress();
const replacement = `CONTRACT_ADDRESS=${address}`;
await writeFile(envPath, /^CONTRACT_ADDRESS=.*$/m.test(envText) ? envText.replace(/^CONTRACT_ADDRESS=.*$/m, replacement) : `${envText}\n${replacement}\n`);
console.log("Local contract deployed and issuer authorized:", address);
console.log("Updated only CONTRACT_ADDRESS in backend/.env. Restart the API if it was running.");
await connection.close();
