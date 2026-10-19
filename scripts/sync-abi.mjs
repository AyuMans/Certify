import { readFile, writeFile } from 'node:fs/promises';
const artifact = JSON.parse(await readFile(new URL('../artifacts/contracts/CertificateVerification.sol/CertificateVerification.json', import.meta.url), 'utf8'));
await writeFile(new URL('../backend/src/config/CertificateVerificationABI.ts', import.meta.url), '// Generated from the compiled CertificateVerification contract.\nexport const CertificateVerificationABI = ' + JSON.stringify(artifact.abi, null, 2) + ' as const;\n');
console.log('Backend contract ABI synchronized.');
