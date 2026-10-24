import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const backend = path.join(root, 'backend');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Start with npm run dev:local');
const children = new Set();
function child(args, cwd = root, extraEnv = {}) {
  const processChild = spawn(process.execPath, args, { cwd, windowsHide: true, stdio: 'inherit', env: { ...process.env, ...extraEnv } });
  children.add(processChild); processChild.once('exit', () => children.delete(processChild));
  return processChild;
}
async function run(args, cwd = root) {
  const processChild = child(args, cwd);
  await new Promise((resolve, reject) => {
    processChild.once('error', reject);
    processChild.once('exit', code => code === 0 ? resolve() : reject(new Error(`Setup step failed (exit ${code})`)));
  });
}
function stop() { for (const processChild of children) processChild.kill(); }
process.on('SIGINT', () => { stop(); process.exit(0); });
process.on('SIGTERM', () => { stop(); process.exit(0); });
try {
  console.log('Starting a fresh demo. User accounts are retained; certificates exist only until this backend stops.');
  await run([npmCli, 'run', 'build']);
  await run(['scripts/sync-abi.mjs']);
  await run([npmCli, 'run', 'db:setup'], backend);
  await run([npmCli, 'run', 'create-admin'], backend);
  await run([npmCli, 'run', 'build'], backend);
  if (process.argv.includes('--check')) {
    const processChild = child(['dist/server.js'], backend, { PORT: '15000' });
    let healthy = false;
    for (let i = 0; i < 60; i++) {
      if (processChild.exitCode !== null) throw new Error('Demo backend stopped before it became ready');
      try {
        const response = await fetch('http://127.0.0.1:15000/api/health', { signal: AbortSignal.timeout(2000) });
        const health = await response.json();
        if (response.ok && health.applicationVersion === 3 && health.certificateStorage === 'memory' && health.certificateCount === 0) { healthy = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    if (!healthy) throw new Error('The fresh demo backend did not become healthy');
    console.log('Fresh demo startup passed: zero certificates, temporary blockchain, persistent user database.');
  } else { await run(['dist/server.js'], backend); }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { stop(); }
