import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const backend = path.join(root, 'backend');
const requireBackend = createRequire(path.join(backend, 'package.json'));
const dotenv = requireBackend('dotenv');
const { JsonRpcProvider } = requireBackend('ethers');
const settings = dotenv.parse(await readFile(path.join(backend, '.env')));
const rpc = new URL(settings.BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:8545');
if (!['localhost','127.0.0.1'].includes(rpc.hostname) || rpc.port !== '8545') throw new Error('dev:local requires BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545 in backend/.env');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Start this script with npm run dev:local');
const children = new Set();
function child(args, cwd = root, quiet = false) {
  const processChild = spawn(process.execPath, args, { cwd, windowsHide: true, stdio: quiet ? 'ignore' : 'inherit' });
  children.add(processChild); processChild.once('exit', () => children.delete(processChild));
  return processChild;
}
async function run(args, cwd = root) {
  const processChild = child(args, cwd);
  await new Promise((resolve, reject) => { processChild.once('error', reject); processChild.once('exit', code => code === 0 ? resolve() : reject(new Error(`Setup step failed (exit ${code})`))); });
}
async function rpcReady() {
  try {
    const response = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]}), signal: AbortSignal.timeout(1500) });
    const data = await response.json(); return data.result === '0x7a69';
  } catch { return false; }
}
function stop() { for (const processChild of children) processChild.kill(); }
process.on('SIGINT', () => { stop(); process.exit(0); });
process.on('SIGTERM', () => { stop(); process.exit(0); });
try {
  console.log('Preparing the local certificate verification application…');
  await run([npmCli, 'run', 'build']);
  await run(['scripts/sync-abi.mjs']);
  await run([npmCli, 'run', 'db:setup'], backend);
  await run([npmCli, 'run', 'create-admin'], backend);
  if (!await rpcReady()) {
    child(['node_modules/hardhat/dist/src/cli.js', 'node', '--hostname', '127.0.0.1'], root, true);
    let ready = false;
    for (let i=0;i<100;i++) { if (await rpcReady()) { ready = true; break; } await new Promise(resolve => setTimeout(resolve,200)); }
    if (!ready) throw new Error('Could not start Hardhat on port 8545. Check for another process using that port.');
  }
  const provider = new JsonRpcProvider(rpc.href);
  let deployed = false;
  try { deployed = !!settings.CONTRACT_ADDRESS && (await provider.getCode(settings.CONTRACT_ADDRESS)) !== '0x'; } finally { provider.destroy(); }
  if (!deployed) await run(['node_modules/hardhat/dist/src/cli.js','run','scripts/deploy.ts','--network','localhost','--no-compile']);
  await run([npmCli,'run','build'], backend);
  console.log('Open http://localhost:' + (settings.PORT || 5000) + '. Staff sign-in uses your existing ADMIN_EMAIL and ADMIN_PASSWORD.');
  if (process.argv.includes('--check')) {
    child(['dist/server.js'], backend);
    let healthy = false;
    let lastStatus = 'No HTTP response';
    for (let i=0;i<30;i++) {
      try {
        const response = await fetch(`http://127.0.0.1:${settings.PORT || 5000}/api/health`, { signal: AbortSignal.timeout(3000) });
        if (response.ok) { healthy = true; break; }
        lastStatus = JSON.stringify(await response.json());
      } catch (error) { lastStatus = error.message; }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    if (!healthy) throw new Error(`The application did not become healthy: ${lastStatus}`);
    console.log('Local startup check passed: database, contract and API are connected.');
  } else {
    await run(['dist/server.js'], backend);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { stop(); }
