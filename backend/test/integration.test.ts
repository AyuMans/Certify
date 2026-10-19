import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";
import { ContractFactory, HDNodeWallet, JsonRpcProvider, NonceManager } from "ethers";
import type { Server } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

dotenv.config({ quiet: true });
const schema = `acv_test_${randomBytes(6).toString('hex')}`;
const adminPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const rpc = process.env.TEST_RPC_URL || 'http://127.0.0.1:18546';
const provider = new JsonRpcProvider(rpc);
let chainProcess: ChildProcess | undefined;
let server: Server, base: string, database: pg.Pool, backendProvider: JsonRpcProvider, uploads: string;
let adminToken: string, issuerToken: string, verifierToken: string, certificateHash: string;
const pdf = Buffer.from('%PDF-1.4\n% Integration test certificate ' + randomBytes(12).toString('hex') + '\n%%EOF');
async function request(route: string, method = 'GET', body?: unknown, token?: string) {
  const headers: Record<string,string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(base + route, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}
function file(data = pdf, id?: string) { const body = new FormData(); body.set('certificate', new Blob([data], { type: 'application/pdf' }), 'certificate.pdf'); if (id) body.set('certificateId', id); return body; }

before(async () => {
  if (!process.env.TEST_RPC_URL) {
    chainProcess = spawn(process.execPath, ['node_modules/hardhat/dist/src/cli.js', 'node', '--hostname', '127.0.0.1', '--port', '18546'], {
      cwd: fileURLToPath(new URL('../../', import.meta.url)), windowsHide: true, stdio: 'ignore'
    });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { const r = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]}), signal: AbortSignal.timeout(1000) }); if (r.ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.ok(ready, 'Local test blockchain could not start');
  }
  assert.equal((await provider.getNetwork()).chainId, 31337n, 'Tests require a local Hardhat blockchain');
  await adminPool.query(`CREATE SCHEMA ${schema}`);
  const dbUrl = new URL(process.env.DATABASE_URL!); dbUrl.searchParams.set('options', `-c search_path=${schema}`); process.env.DATABASE_URL = dbUrl.href;
  uploads = await mkdtemp(path.join(tmpdir(), 'acv-test-')); process.env.UPLOAD_DIR = uploads;
  const phrase = 'test test test test test test test test test test test junk';
  const owner = HDNodeWallet.fromPhrase(phrase, undefined, "m/44'/60'/0'/0/0").connect(provider);
  const issuer = HDNodeWallet.fromPhrase(phrase, undefined, "m/44'/60'/0'/0/1").connect(provider);
  const artifact = JSON.parse(await readFile(new URL('../../artifacts/contracts/CertificateVerification.sol/CertificateVerification.json', import.meta.url), 'utf8'));
  const contract = await new ContractFactory(artifact.abi, artifact.bytecode, new NonceManager(owner)).deploy();
  await contract.waitForDeployment(); await (await (contract as any).registerIssuer(issuer.address)).wait();
  process.env.BLOCKCHAIN_RPC_URL = rpc; process.env.CONTRACT_ADDRESS = await contract.getAddress();
  process.env.OWNER_PRIVATE_KEY = owner.privateKey; process.env.ISSUER_PRIVATE_KEY = issuer.privateKey; process.env.JWT_SECRET = randomBytes(32).toString('hex');
  database = (await import('../src/config/database.js')).pool;
  await database.query(await readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8'));
  const { createUser } = await import('../src/services/authService.js');
  for (const role of ['ADMIN', 'ISSUER', 'VERIFIER'] as const) await createUser(role, `${role.toLowerCase()}@example.com`, 'Test-password-42', role);
  const { app } = await import('../src/app.js'); backendProvider = (await import('../src/services/blockchainService.js')).provider;
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}/api`;
  const login = async (role: string) => (await request('/auth/login', 'POST', { email: `${role}@example.com`, password: 'Test-password-42' })).data.token;
  adminToken = await login('admin'); issuerToken = await login('issuer'); verifierToken = await login('verifier');
});
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await database?.end(); backendProvider?.destroy(); provider.destroy();
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await adminPool.end();
  if (uploads) await rm(uploads, { recursive: true, force: true });
  chainProcess?.kill();
});
test('health checks real services and the browser interface loads', async () => {
  assert.equal((await request('/health')).status, 200);
  const page = await fetch(base.replace('/api','')); assert.match(await page.text(), /Verify a certificate/);
});
test('anonymous users cannot issue, revoke, list, or download certificates', async () => {
  for (const [route, method] of [['/certificates/issue','POST'],['/certificates/revoke','POST'],['/certificates','GET'],[`/certificates/0x${'0'.repeat(64)}/download`,'GET']]) assert.equal((await request(route,method)).status,401);
});
test('role boundaries prevent verifier writes and issuer administration', async () => {
  assert.equal((await request('/certificates/issue','POST',file(pdf,'DENIED'),verifierToken)).status,403);
  assert.equal((await request('/auth/users','POST',{},issuerToken)).status,403);
  assert.equal((await request('/certificates/revoke','POST',{},issuerToken)).status,403);
});
test('bad login and malformed input return controlled errors', async () => {
  assert.equal((await request('/auth/login','POST',{email:42,password:[]})).status,401);
  assert.equal((await request('/certificates/issue','POST',file(Buffer.from('not a PDF'),'BAD'),issuerToken)).status,400);
  assert.equal((await request('/certificates/verify','POST')).status,400);
  assert.equal((await request('/certificates/not-a-hash')).status,400);
});
test('authorized issuance persists the PDF and blockchain details', async () => {
  const r = await request('/certificates/issue','POST',file(pdf,'ACV-TEST-001'),issuerToken);
  assert.equal(r.status,201,JSON.stringify(r.data)); certificateHash = r.data.certificate.certificateHash;
  assert.match(certificateHash,/^0x[0-9a-f]{64}$/);
  assert.equal((await request('/certificates','GET',undefined,issuerToken)).data.certificates.length,1);
});
test('duplicate files and IDs are rejected', async () => {
  assert.equal((await request('/certificates/issue','POST',file(pdf,'OTHER-ID'),issuerToken)).status,409);
  assert.equal((await request('/certificates/issue','POST',file(Buffer.concat([pdf,Buffer.from('new')]),'ACV-TEST-001'),issuerToken)).status,409);
});
test('verification distinguishes original and tampered files', async () => {
  assert.equal((await request('/certificates/verify','POST',file())).data.certificate.verificationStatus,'VALID');
  assert.equal((await request('/certificates/verify','POST',file(Buffer.concat([pdf,Buffer.from('tampered')])))).data.certificate.verificationStatus,'INVALID');
});
test('lookup, authenticated PDF download and audit return real records', async () => {
  assert.equal((await request(`/certificates/${certificateHash}`)).data.certificate.certificateId,'ACV-TEST-001');
  const response = await fetch(base+`/certificates/${certificateHash}/download`,{headers:{Authorization:`Bearer ${issuerToken}`}});
  assert.equal(response.status,200); assert.deepEqual(Buffer.from(await response.arrayBuffer()),pdf);
  assert.equal((await request(`/certificates/audit/${certificateHash}`)).data.history[0].type,'ISSUED');
});
test('admin revocation updates verification and preserves audit history', async () => {
  const r = await request('/certificates/revoke','POST',{certificateHash},adminToken); assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal((await request('/certificates/verify','POST',file())).data.certificate.verificationStatus,'REVOKED');
  assert.deepEqual((await request(`/certificates/audit/${certificateHash}`)).data.history.map((e:any)=>e.type),['ISSUED','REVOKED']);
  assert.equal((await request('/certificates/revoke','POST',{certificateHash},adminToken)).status,200);
});
test('admin provisions accounts with validated roles', async () => {
  assert.equal((await request('/auth/users','POST',{name:'New staff',email:'new@example.com',password:'Test-password-42',role:'ISSUER'},adminToken)).status,201);
  assert.equal((await request('/auth/users','POST',{name:'Bad role',email:'bad@example.com',password:'Test-password-42',role:'ROOT'},adminToken)).status,400);
});
test('confirmed issuance is recovered after a database save failure', async () => {
  const recoveryPdf = Buffer.concat([pdf, Buffer.from('\nrecovery-case')]);
  await database.query(`CREATE FUNCTION fail_certificate_save() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated metadata outage'; END $$;
    CREATE TRIGGER fail_save BEFORE INSERT ON certificates FOR EACH ROW EXECUTE FUNCTION fail_certificate_save()`);
  const first = await request('/certificates/issue','POST',file(recoveryPdf,'RECOVER-001'),issuerToken);
  assert.equal(first.status,503); assert.ok(first.data.certificate.transactionHash);
  await database.query('DROP TRIGGER fail_save ON certificates');
  const retry = await request('/certificates/issue','POST',file(recoveryPdf,'RECOVER-001'),issuerToken);
  assert.equal(retry.status,201,JSON.stringify(retry.data));
  assert.equal(retry.data.certificate.transactionHash,first.data.certificate.transactionHash);
  assert.equal((await request('/certificates/verify','POST',file(recoveryPdf))).data.certificate.verificationStatus,'VALID');
});
test('issuer administration disables and restores issuance', async () => {
  const { blockchain } = (await request('/blockchain')).data;
  assert.equal((await request('/issuers/remove','POST',{issuerAddress:blockchain.issuer},adminToken)).status,200);
  assert.equal((await request('/certificates/issue','POST',file(Buffer.concat([pdf,Buffer.from('disabled')]),'DISABLED'),issuerToken)).status,400);
  assert.equal((await request('/issuers/register','POST',{issuerAddress:blockchain.issuer},adminToken)).status,200);
  assert.equal((await request(`/issuers/${blockchain.issuer}`,'GET',undefined,adminToken)).data.issuer.registered,true);
});
