// This page uses ordinary forms, fetch requests and DOM updates; no UI framework.
const $ = selector => document.querySelector(selector);
const academicFields = ['studentName', 'rollNumber', 'degree', 'department', 'graduationYear', 'grade'];
let token = sessionStorage.getItem('acv-token');
let user = null;
let demoSessionId = null;
let serverOnline = false;

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
function date(value) {
  if (!value || value === '0') return '-';
  return new Date(/^\d+$/.test(String(value)) ? Number(value) * 1000 : value).toLocaleString();
}
function message(target, text, error = false) {
  target.hidden = false;
  target.textContent = text;
  target.classList.toggle('error', error);
  if (target.classList.contains('result')) target.className = `result ${error ? 'bad' : ''}`;
}
function notice(text) { message($('#notice'), text); }

async function api(path, options = {}) {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api${path}`, { ...options, headers, signal: AbortSignal.timeout(60000) });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && user) logout();
    throw new Error(data.message || 'Request failed. Check the database and blockchain.');
  }
  return data;
}
function post(path, body) { return api(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }); }
async function submit(form, target, action) {
  const buttons = [...form.querySelectorAll('button')];
  buttons.forEach(button => { button.disabled = true; });
  message(target, 'Please wait...');
  try { await action(); }
  catch (error) { message(target, error.message, true); }
  finally { buttons.forEach(button => { button.disabled = false; }); }
}
function showPanel(id) {
  document.querySelectorAll('.panel').forEach(panel => { panel.hidden = panel.id !== id; });
  document.querySelectorAll('.tab').forEach(tab => { tab.classList.toggle('active', tab.dataset.panel === id); });
  if (id === 'records') void loadRecords();
}
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => showPanel(tab.dataset.panel)));
function updateSession() {
  const staff = user && ['ADMIN', 'ISSUER'].includes(user.role);
  document.querySelectorAll('.staff').forEach(node => { node.hidden = !staff; });
  document.querySelectorAll('.admin').forEach(node => { node.hidden = user?.role !== 'ADMIN'; });
  $('#login-open').hidden = Boolean(user);
  $('#logout').hidden = !user;
  $('#account').hidden = !user;
  $('#account').textContent = user ? `${user.name} (${user.role})` : '';
}
function logout() {
  token = null; user = null;
  sessionStorage.removeItem('acv-token');
  $('#issue-form').reset();
  $('#records-body').replaceChildren();
  updateSession(); showPanel('verify');
}
$('#login-open').addEventListener('click', () => $('#login-dialog').showModal());
$('#login-close').addEventListener('click', () => $('#login-dialog').close());
$('#logout').addEventListener('click', logout);
$('#login-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  void submit(form, form.querySelector('.form-message'), async () => {
    const result = await post('/auth/login', Object.fromEntries(new FormData(form)));
    token = result.token; user = result.user;
    sessionStorage.setItem('acv-token', token);
    updateSession(); form.reset(); $('#login-dialog').close();
    message(form.querySelector('.form-message'), '');
    showPanel(['ADMIN', 'ISSUER'].includes(user.role) ? 'records' : 'verify');
    await fillIssuer();
  });
});

function showResult(target, title, rows, good) {
  target.hidden = false;
  target.className = `result ${good ? 'good' : 'bad'}`;
  target.replaceChildren(element('h3', title));
  const list = element('dl');
  for (const [key, value] of rows) {
    list.append(element('dt', key), element('dd', String(value ?? '-')));
  }
  target.append(list);
}
function recordRows(c) {
  return [['Certificate ID', c.certificateId || 'Not registered'], ['Status', c.verificationStatus],
    ['Document hash', c.certificateHash], ...(c.certificateId ? [['Issuer', c.issuer], ['Issued', date(c.issuedAt)]] : []),
    ...(c.revoked ? [['Revoked', date(c.revokedAt)]] : [])];
}
function openRecord(hash) {
  showPanel('lookup'); $('#lookup-form input').value = hash; void lookup(hash);
}
function correctionLinks(target, c) {
  for (const [label, hash] of [['View previous certificate', c.previousHash], ['View corrected certificate', c.replacementHash]]) {
    if (!hash) continue;
    const button = element('button', label);
    button.type = 'button'; button.addEventListener('click', () => openRecord(hash)); target.append(button);
  }
}
function selectedFile(form) {
  const file = new FormData(form).get('certificate');
  if (!file?.size) throw new Error('Select a nonempty certificate file.');
  if (file.size > 10 * 1024 * 1024) throw new Error('The file must be 10 MB or smaller.');
  return file;
}

// Verification sends a hash only. Issuance still uploads the PDF for storage.
$('#verify-form').addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget; const target = $('#verify-result');
  void submit(form, target, async () => {
    const file = selectedFile(form);
    if (!globalThis.crypto?.subtle) throw new Error('Open this application on localhost or HTTPS to use browser hashing.');
    const bytes = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    const certificateHash = '0x' + [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const { certificate: c } = await post('/certificates/verify/hash', { certificateHash });
    const titles = { VALID: 'Exact file matches an active certificate', INVALID: 'No registered record matches this file', REVOKED: 'This certificate has been revoked', SUPERSEDED: 'This certificate has a corrected replacement' };
    showResult(target, titles[c.verificationStatus], recordRows(c), c.valid);
    correctionLinks(target, c);
  });
});
$('#details-form').addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget; const target = $('#details-result');
  void submit(form, target, async () => {
    const { certificate: c } = await post('/certificates/verify/details', Object.fromEntries(new FormData(form)));
    const title = c.detailsMatch ? 'Entered academic details match the registered record' : 'Academic details could not be verified';
    showResult(target, title, [['Certificate ID', c.certificateId], ['Details match', c.detailsMatch ? 'Yes' : 'No'],
      ['Record status', c.verificationStatus], ['Explanation', c.message]], c.detailsMatch && c.valid);
    correctionLinks(target, c);
  });
});
async function lookup(hash) {
  const target = $('#lookup-result'); message(target, 'Loading record...');
  try {
    const { certificate: c } = await api(`/certificates/${encodeURIComponent(hash)}`);
    showResult(target, 'Blockchain certificate record', recordRows(c), c.valid);
    correctionLinks(target, c);
    try {
      const { history } = await api(`/certificates/audit/${encodeURIComponent(hash)}`);
      target.append(element('h3', 'Transaction history'));
      const list = element('ol');
      for (const entry of history) {
        const row = element('li', `${entry.type} - block ${entry.blockNumber}`);
        row.append(element('br'), element('code', entry.transactionHash)); list.append(row);
      }
      target.append(list);
    } catch { target.append(element('p', 'Audit history is temporarily unavailable.')); }
  } catch (error) { message(target, error.message, true); }
}
$('#lookup-form').addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget;
  void submit(form, $('#lookup-result'), () => lookup(new FormData(form).get('hash').trim()));
});
$('#issue-form').addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget;
  const body = new FormData(form);
  const previous = body.get('previousHash')?.trim();
  if (!previous) body.delete('previousHash');
  else body.set('previousHash', previous);
  if (previous && !confirm('Issue this correction and permanently mark the old certificate as superseded?')) return;
  void submit(form, $('#issue-result'), async () => {
    selectedFile(form);
    const { certificate: c, message: text } = await post(previous ? '/certificates/replace' : '/certificates/issue', body);
    showResult($('#issue-result'), text, [['Certificate ID', c.certificateId], ['Document hash', c.certificateHash],
      ['Academic-details hash', c.academicHash], ['Transaction hash', c.transactionHash]], true);
    form.reset();
  });
});

async function download(hash, filename) {
  try {
    const response = await fetch(`/api/certificates/${hash}/download`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error((await response.json()).message || 'Download failed');
    const url = URL.createObjectURL(await response.blob());
    const link = element('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { notice(error.message); }
}
async function loadRecords() {
  const target = $('#records-message'); message(target, 'Loading...'); $('#records-body').replaceChildren();
  try {
    const { certificates } = await api('/certificates');
    for (const c of certificates) {
      const row = element('tr');
      row.append(element('td', c.certificate_id), element('td', c.academic_details?.studentName || '-'), element('td', date(c.issued_at)),
        element('td', c.replacement_hash ? 'Superseded' : c.revoked ? 'Revoked' : 'Issued'));
      const actions = element('td');
      const view = element('button', 'View'); view.addEventListener('click', () => openRecord(c.certificate_hash));
      const save = element('button', 'Download'); save.addEventListener('click', () => void download(c.certificate_hash, c.file_name));
      actions.append(view, save);
      if (user?.role === 'ADMIN' && !c.revoked && !c.replacement_hash) {
        const correct = element('button', 'Correct');
        correct.addEventListener('click', () => {
          const form = $('#issue-form'); form.reset();
          for (const field of academicFields) form.elements.namedItem(field).value = c.academic_details?.[field] || '';
          form.elements.namedItem('certificateId').value = c.certificate_id + '-R1';
          form.elements.namedItem('previousHash').value = c.certificate_hash;
          showPanel('issue');
        });
        actions.append(correct);
      }
      row.append(actions); $('#records-body').append(row);
    }
    message(target, certificates.length ? '' : 'No certificates in this demo session. You can issue a new one or reuse an ID from a previous run.');
  } catch (error) { message(target, error.message, true); }
}
$('#refresh-records').addEventListener('click', () => void loadRecords());
$('#user-form').addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget; const target = form.querySelector('.form-message');
  void submit(form, target, async () => {
    const { user: created } = await post('/auth/users', Object.fromEntries(new FormData(form)));
    message(target, `Account created: ${created.email}`); form.reset();
  });
});
$('#issuer-form').addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget; const action = event.submitter?.value || 'status';
  const issuerAddress = new FormData(form).get('issuerAddress').trim();
  if (action === 'remove' && !confirm('Remove this wallet’s permission to issue new certificates?')) return;
  void submit(form, form.querySelector('.form-message'), async () => {
    const result = action === 'status' ? await api(`/issuers/${issuerAddress}`) : await post(`/issuers/${action}`, { issuerAddress });
    message(form.querySelector('.form-message'), result.issuer.registered ? 'Issuer is authorized.' : 'Issuer is not authorized.');
  });
});
$('#revoke-form').addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget;
  if (!confirm('Permanently revoke this certificate?')) return;
  void submit(form, form.querySelector('.form-message'), async () => {
    await post('/certificates/revoke', Object.fromEntries(new FormData(form)));
    message(form.querySelector('.form-message'), 'Certificate revoked.');
  });
});
async function fillIssuer() {
  if (user?.role !== 'ADMIN') return;
  try { $('#issuer-form input').value = (await api('/blockchain')).blockchain.issuer; } catch {}
}
function clearCertificateDisplay() {
  for (const id of ['verify-result', 'details-result', 'lookup-result', 'issue-result']) {
    const target = document.getElementById(id); target.replaceChildren(); target.hidden = true;
  }
  for (const id of ['verify-form', 'details-form', 'lookup-form', 'issue-form', 'revoke-form']) document.getElementById(id).reset();
  $('#records-body').replaceChildren();
  message($('#records-message'), 'No certificates loaded for this demo session.');
}
async function checkDemoSession() {
  try {
    const response = await fetch('/api/health', { signal: AbortSignal.timeout(10000) });
    const status = await response.json();
    if (status.applicationVersion !== 3) {
      $('#connection').textContent = 'Restart required: the older backend is still running.';
      notice('Stop the old server with Ctrl+C in its VS Code terminal, then run npm run dev:local. Refresh this page after startup finishes.');
      $('#login-open').disabled = true;
      document.querySelectorAll('form button:not([type="button"])').forEach(button => { button.disabled = true; });
      return;
    }
    if (demoSessionId && demoSessionId !== status.demoSessionId) {
      clearCertificateDisplay();
      notice('A fresh demo session has started. Previous certificates have been cleared; your user account is unchanged.');
    }
    demoSessionId = status.demoSessionId;
    serverOnline = true;
    $('#connection').textContent = response.ok ? 'Database and blockchain connected' : `Services unavailable: database ${status.database}, blockchain ${status.blockchain}`;
  } catch {
    if (serverOnline) clearCertificateDisplay();
    serverOnline = false;
    $('#connection').textContent = 'Server stopped or unreachable. Certificate data is temporary.';
  }
}
async function init() {
  updateSession();
  await checkDemoSession();
  if (token) {
    try { user = (await api('/auth/me')).user; updateSession(); await fillIssuer(); }
    catch { logout(); }
  }
}
void init();
setInterval(() => { void checkDemoSession(); }, 5000);
