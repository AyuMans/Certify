import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcryptjs';

dotenv.config({quiet:true});

test('forced server stop clears certificates, PDFs and history but keeps accounts and reusable IDs', { timeout: 120000 }, async () => {
  const schema = `acv_restart_${randomBytes(6).toString('hex')}`;
  const original = new pg.Pool({connectionString:process.env.DATABASE_URL});
  await original.query(`CREATE SCHEMA ${schema}`);
  const dbUrl = new URL(process.env.DATABASE_URL!);
  dbUrl.searchParams.set('options',`-c search_path=${schema}`);
  const database = new pg.Pool({connectionString:dbUrl.href});
  const jwtSecret = randomBytes(32).toString('hex');
  const password = 'Demo-password-42';
  const pdf = Buffer.from('%PDF-1.4\nDemo restart certificate\n%%EOF');
  const certificateHash = `0x${createHash('sha256').update(pdf).digest('hex')}`;
  const academic = {studentName:'Demo Student',rollNumber:'CS-1',degree:'B.Tech',department:'Computer Science',graduationYear:'2026',grade:'8.5'};
  const active = new Set<ChildProcess>();
  let base = '';
  async function start() {
    const child = spawn(process.execPath,['--import','tsx','src/server.ts'],{
      cwd:fileURLToPath(new URL('../',import.meta.url)),windowsHide:true,
      env:{...process.env,DATABASE_URL:dbUrl.href,JWT_SECRET:jwtSecret,HOST:'127.0.0.1',PORT:'0'},stdio:['ignore','pipe','pipe']
    });
    active.add(child); child.once('exit',()=>active.delete(child));
    const ready = await new Promise<string>((resolve,reject)=>{
      let output = '';
      const timer = setTimeout(()=>reject(new Error('Backend startup timed out')),45000);
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',()=>{clearTimeout(timer);reject(new Error(`Backend stopped during startup: ${output}`));});
      child.stderr?.on('data',data=>{output += String(data);});
      child.stdout?.on('data',data=>{
        output += String(data);
        const match = output.match(/Certificate Verification: http:\/\/localhost:(\d+)/);
        if(match){clearTimeout(timer);resolve(`http://127.0.0.1:${match[1]}/api`);}
      });
    });
    base = ready; return child;
  }
  async function stop(child:ChildProcess) {
    const exited = once(child,'exit'); child.kill(); await exited;
  }
  async function request(route:string,method='GET',body?:unknown,token?:string) {
    const response = await fetch(base+route,{method,headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(body && !(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
    return {status:response.status,data:await response.json()};
  }
  function file() {
    const body=new FormData();body.set('certificate',new Blob([pdf],{type:'application/pdf'}),'demo.pdf');body.set('certificateId','DEMO-REUSE-001');
    for(const [key,value] of Object.entries(academic))body.set(key,value);
    return body;
  }
  try {
    await database.query(await readFile(new URL('../sql/schema.sql',import.meta.url),'utf8'));
    await database.query('INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4)',['Demo Admin','demo@example.com',await bcrypt.hash(password,12),'ADMIN']);
    // A legacy table is removed on boot, while the users table is kept byte-for-byte.
    await database.query('CREATE TABLE certificates (id SERIAL PRIMARY KEY, certificate_id TEXT)');
    await database.query("INSERT INTO certificates (certificate_id) VALUES ('OLD-DEMO')");
    const accountBefore=JSON.stringify((await database.query('SELECT * FROM users ORDER BY id')).rows);
    const first=await start();
    const firstHealth=(await request('/health')).data;
    assert.equal(firstHealth.certificateStorage,'memory'); assert.equal(firstHealth.certificateCount,0);
    assert.equal((await database.query("SELECT to_regclass('certificates') AS name")).rows[0].name,null);
    const login=await request('/auth/login','POST',{email:'demo@example.com',password});
    assert.equal(login.status,200);const token=login.data.token;
    assert.equal((await request('/certificates/issue','POST',file(),token)).status,201);
    assert.equal((await request('/certificates','GET',undefined,token)).data.certificates.length,1);
    assert.equal((await request('/certificates/revoke','POST',{certificateHash},token)).status,200);
    assert.equal((await request(`/certificates/audit/${certificateHash}`)).data.history.length,2);
    const storedFiles = await readdir(new URL('../uploads/',import.meta.url)).catch(error => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    assert.deepEqual(storedFiles,[]);
    await stop(first); // Also exercises a forced stop on Windows: no cleanup callback is required.
    const second=await start();
    const secondHealth=(await request('/health')).data;
    assert.notEqual(secondHealth.demoSessionId,firstHealth.demoSessionId);
    assert.equal(secondHealth.certificateCount,0);
    assert.equal((await request('/auth/me','GET',undefined,token)).status,200);
    assert.equal((await request('/auth/login','POST',{email:'demo@example.com',password})).status,200);
    assert.equal((await request('/certificates','GET',undefined,token)).data.certificates.length,0);
    assert.equal((await request('/certificates/verify/hash','POST',{certificateHash})).data.certificate.verificationStatus,'INVALID');
    assert.equal((await request(`/certificates/${certificateHash}`)).status,404);
    assert.equal((await request(`/certificates/${certificateHash}/download`,'GET',undefined,token)).status,404);
    assert.deepEqual((await request(`/certificates/audit/${certificateHash}`)).data.history,[]);
    assert.equal((await request('/certificates/issue','POST',file(),token)).status,201);
    assert.deepEqual((await request(`/certificates/audit/${certificateHash}`)).data.history.map((event:any)=>event.type),['ISSUED']);
    assert.equal(JSON.stringify((await database.query('SELECT * FROM users ORDER BY id')).rows),accountBefore);
    await stop(second);
  } finally {
    for(const child of active)await stop(child);
    await database.end();
    await original.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await original.end();
  }
});
