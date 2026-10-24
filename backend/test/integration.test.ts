import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";
import type { Server } from "node:http";

dotenv.config({ quiet: true });
const schema = `acv_test_${randomBytes(6).toString('hex')}`;
const adminPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let server: Server, base: string, database: pg.Pool;
let closeBlockchain: (() => Promise<void>) | undefined;
let adminToken: string, issuerToken: string, verifierToken: string, certificateHash: string;
const academic = { studentName: 'Ayush Kumar', rollNumber: 'CS-101', degree: 'B.Tech', department: 'Computer Science', graduationYear: '2026', grade: '8.5' };
const pdf = Buffer.from('%PDF-1.4\n% Integration test certificate ' + randomBytes(12).toString('hex') + '\n%%EOF');
async function request(route: string, method = 'GET', body?: unknown, token?: string) {
  const headers: Record<string,string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(base + route, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}
function file(data = pdf, id?: string, details = academic) {
  const body = new FormData();
  body.set('certificate', new Blob([data], { type: 'application/pdf' }), 'certificate.pdf');
  if (id) { body.set('certificateId', id); for (const [key,value] of Object.entries(details)) body.set(key,value); }
  return body;
}

before(async () => {
  await adminPool.query(`CREATE SCHEMA ${schema}`);
  const dbUrl = new URL(process.env.DATABASE_URL!);
  dbUrl.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = dbUrl.href;
  process.env.JWT_SECRET = randomBytes(32).toString('hex');
  database = (await import('../src/config/database.js')).pool;
  await database.query(await readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8'));
  const { createUser } = await import('../src/services/authService.js');
  for (const role of ['ADMIN', 'ISSUER', 'VERIFIER'] as const) await createUser(role, `${role.toLowerCase()}@example.com`, 'Test-password-42', role);
  const { app } = await import('../src/app.js');
  closeBlockchain = (await import('../src/services/blockchainService.js')).closeDemoBlockchain;
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}/api`;
  const login = async (role: string) => (await request('/auth/login', 'POST', { email: `${role}@example.com`, password: 'Test-password-42' })).data.token;
  adminToken = await login('admin'); issuerToken = await login('issuer'); verifierToken = await login('verifier');
});
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await closeBlockchain?.();
  await database?.end();
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await adminPool.end();
});

test('health checks real services and the browser interface loads', async () => {
  assert.equal((await request('/health')).status, 200);
  const page = await fetch(base.replace('/api','')); assert.match(await page.text(), /Academic Certificate Verification/);
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
test('authorized issuance retains PDF and blockchain details within the current session', async () => {
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
test('certificate metadata and PDFs use memory, while PostgreSQL stores only users', async () => {
  const recoveryPdf = Buffer.concat([pdf,Buffer.from('second session record')]);
  const issued = await request('/certificates/issue','POST',file(recoveryPdf,'RECOVER-001'),issuerToken);
  assert.equal(issued.status,201,JSON.stringify(issued.data));
  assert.equal((await database.query("SELECT to_regclass('certificates') AS name")).rows[0].name,null);
  const records = (await request('/certificates','GET',undefined,adminToken)).data.certificates;
  assert.ok(records.every((record:any) => record.file_data === undefined));
  assert.equal((await database.query('SELECT count(*) AS count FROM users')).rows[0].count,'4');
});

test('issuer administration disables and restores issuance', async () => {
  const { blockchain } = (await request('/blockchain')).data;
  assert.equal((await request('/issuers/remove','POST',{issuerAddress:blockchain.issuer},adminToken)).status,200);
  assert.equal((await request('/certificates/issue','POST',file(Buffer.concat([pdf,Buffer.from('disabled')]),'DISABLED'),issuerToken)).status,400);
  assert.equal((await request('/issuers/register','POST',{issuerAddress:blockchain.issuer},adminToken)).status,200);
  assert.equal((await request(`/issuers/${blockchain.issuer}`,'GET',undefined,adminToken)).data.issuer.registered,true);
});

test('hash-only verification works without uploading a PDF', async () => {
  const { calculateSHA256 } = await import('../src/services/hashService.js');
  const r = await request('/certificates/verify/hash','POST',{certificateHash:`0x${calculateSHA256(pdf)}`});
  assert.equal(r.status,200);
  assert.equal(r.data.certificate.verificationStatus,'REVOKED');
  const unknown = await request('/certificates/verify/hash','POST',{certificateHash:`0x${'ab'.repeat(32)}`});
  assert.equal(unknown.data.certificate.verificationStatus,'INVALID');
  assert.equal((await request('/certificates/verify/hash','POST',{certificateHash:123})).status,400);
});

test('academic comparison uses on-chain commitment and normalizes case/spaces', async () => {
  const input = { certificateId:'RECOVER-001', ...academic, studentName:'  ayush   kumar  ', department:'computer science' };
  const good = await request('/certificates/verify/details','POST',input);
  assert.equal(good.status,200,JSON.stringify(good.data));
  assert.equal(good.data.certificate.detailsMatch,true);
  assert.equal(good.data.certificate.verificationStatus,'VALID');
  assert.equal((await request('/certificates/verify/details','POST',{...input,grade:'9.9'})).data.certificate.detailsMatch,false);
  assert.equal((await request('/certificates/verify/details','POST',{...input,certificateId:'NOT-REGISTERED'})).data.certificate.detailsMatch,false);
  assert.equal((await request('/certificates/verify/details','POST',{...input,graduationYear:'year'})).status,400);
  const { getSavedCertificate } = await import('../src/services/certificateStore.js');
  getSavedCertificate(good.data.certificate.certificateHash)!.academic_details.grade = '9.9';
  assert.equal((await request('/certificates/verify/details','POST',input)).data.certificate.detailsMatch,true);
});

test('matching entered details do not authenticate an unrelated PDF', async () => {
  const result = await request('/certificates/verify/details','POST',{certificateId:'RECOVER-001',...academic});
  assert.equal(result.data.certificate.detailsMatch,true);
  const { calculateSHA256 } = await import('../src/services/hashService.js');
  const unrelated = `0x${calculateSHA256(Buffer.from('unrelated file'))}`;
  assert.equal((await request('/certificates/verify/hash','POST',{certificateHash:unrelated})).data.certificate.valid,false);
});

test('issuance requires all academic fields and correction requires admin', async () => {
  const body = file(Buffer.concat([pdf,Buffer.from('missing-grade')]),'NO-GRADE'); body.delete('grade');
  assert.equal((await request('/certificates/issue','POST',body,issuerToken)).status,400);
  assert.equal((await request('/certificates/replace','POST',file(pdf,'NOT-ALLOWED'),issuerToken)).status,403);
});

let correctedHash: string;
const correctedDetails = {...academic,grade:'9.0'};
test('correction supersedes the old version and links both records on-chain', async () => {
  const old = await request('/certificates/verify/details','POST',{certificateId:'RECOVER-001',...academic});
  const body = file(Buffer.concat([pdf,Buffer.from('corrected certificate')]),'RECOVER-001-R1',correctedDetails);
  body.set('previousHash',old.data.certificate.certificateHash);
  const r = await request('/certificates/replace','POST',body,adminToken);
  assert.equal(r.status,201,JSON.stringify(r.data)); correctedHash = r.data.certificate.certificateHash;
  const previous = (await request(`/certificates/${old.data.certificate.certificateHash}`)).data.certificate;
  const current = (await request(`/certificates/${correctedHash}`)).data.certificate;
  assert.equal(previous.verificationStatus,'SUPERSEDED'); assert.equal(previous.valid,false); assert.equal(previous.revoked,false);
  assert.equal(previous.replacementHash,correctedHash); assert.equal(current.previousHash,previous.certificateHash);
  assert.equal(current.verificationStatus,'VALID');
  assert.equal((await request('/certificates/verify/details','POST',{certificateId:'RECOVER-001-R1',...correctedDetails})).data.certificate.detailsMatch,true);
  const oldDetails = (await request('/certificates/verify/details','POST',{certificateId:'RECOVER-001',...academic})).data.certificate;
  assert.equal(oldDetails.detailsMatch,true); assert.equal(oldDetails.valid,false);
  assert.ok((await request(`/certificates/audit/${previous.certificateHash}`)).data.history.some((e:any)=>e.type==='SUPERSEDED'));
  assert.ok((await request(`/certificates/audit/${correctedHash}`)).data.history.some((e:any)=>e.type==='REPLACEMENT'));
});

test('revoked and superseded records cannot be replaced again', async () => {
  const body = file(Buffer.concat([pdf,Buffer.from('invalid correction')]),'BAD-CORRECTION');
  body.set('previousHash',certificateHash); // The original test certificate was revoked.
  assert.equal((await request('/certificates/replace','POST',body,adminToken)).status,400);
  const old = (await request(`/certificates/${correctedHash}`)).data.certificate.previousHash;
  body.set('previousHash',old);
  assert.equal((await request('/certificates/replace','POST',body,adminToken)).status,400);
});

test('further corrections update session metadata and preserve the version chain', async () => {
  const body = file(Buffer.concat([pdf,Buffer.from('second correction')]),'RECOVER-001-R2');
  body.set('previousHash',correctedHash);
  const result = await request('/certificates/replace','POST',body,adminToken);
  assert.equal(result.status,201,JSON.stringify(result.data));
  const previous = (await request(`/certificates/${correctedHash}`)).data.certificate;
  assert.equal(previous.verificationStatus,'SUPERSEDED');
  const { getSavedCertificate } = await import('../src/services/certificateStore.js');
  assert.equal(getSavedCertificate(correctedHash)!.replacement_hash,result.data.certificate.certificateHash);
});
