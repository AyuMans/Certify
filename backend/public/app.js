const $ = (selector) => document.querySelector(selector);
let token = sessionStorage.getItem('certify-token');
let user = null;
const date = (value) => value ? new Date(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) * 1000 : value).toLocaleString() : '—';
function element(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
async function api(path, options = {}) {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api${path}`, { ...options, headers, signal: AbortSignal.timeout(60000) });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && user) logout();
    throw new Error(data.message || 'Service unavailable. Check that the database and blockchain are running.');
  }
  return data;
}
function message(target, text, error = false) { target.textContent = text; if (target.classList.contains('result')) target.className = `result ${error ? 'bad' : ''}`; target.classList.toggle('error', error); }
function notify(text) { $('#notice').textContent = text; $('#notice').hidden = false; setTimeout(() => { $('#notice').hidden = true; }, 5000); }
function showPanel(id) {
  document.querySelectorAll('.panel').forEach(panel => { panel.hidden = panel.id !== id; });
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.panel === id));
  if (id === 'records') void loadRecords();
}
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => showPanel(tab.dataset.panel)));
function updateSession() {
  const staff = user && ['ADMIN', 'ISSUER'].includes(user.role);
  document.querySelectorAll('.staff').forEach(node => { node.hidden = !staff; });
  document.querySelectorAll('.admin').forEach(node => { node.hidden = user?.role !== 'ADMIN'; });
  $('#login-open').hidden = Boolean(user); $('#logout').hidden = !user; $('#account').hidden = !user;
  $('#account').textContent = user ? `${user.name} · ${user.role.toLowerCase()}` : '';
}
function logout() { token = null; user = null; sessionStorage.removeItem('certify-token'); updateSession(); showPanel('verify'); $('#records-body').replaceChildren(); }
$('#logout').addEventListener('click', logout);
$('#login-open').addEventListener('click', () => $('#login-dialog').showModal());
$('#login-close').addEventListener('click', () => $('#login-dialog').close());
async function submit(form, task, target) {
  const buttons = [...form.querySelectorAll('button')]; buttons.forEach(button => { button.disabled = true; });
  if (target) message(target, 'Working…');
  try { await task(); } catch (error) { if (target) message(target, error.message, true); else notify(error.message); }
  finally { buttons.forEach(button => { button.disabled = false; }); }
}
$('#login-form').addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget;
  void submit(form, async () => {
    const result = await api('/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    token = result.token; user = result.user; sessionStorage.setItem('certify-token', token); updateSession();
    $('#login-dialog').close(); form.reset(); message(form.querySelector('.form-message'), '');
    showPanel(['ADMIN', 'ISSUER'].includes(user.role) ? 'records' : 'verify');
    await fillIssuer();
  }, form.querySelector('.form-message'));
});
function details(target, title, fields, state = '') {
  target.hidden = false; target.replaceChildren(); target.className = `result ${state}`;
  target.append(element('h3', title, 'status'));
  const dl = element('dl');
  for (const [label, value] of fields) {
    const pair = element('div'); pair.append(element('dt', label), element('dd', String(value ?? '—'), /hash|address|issuer/i.test(label) ? 'hash' : '')); dl.append(pair);
  }
  target.append(dl);
}
function checkFile(form) {
  const file = new FormData(form).get('certificate');
  if (!file?.size) throw new Error('Choose a nonempty certificate file.');
  if (file.size > 10 * 1024 * 1024) throw new Error('File must be 10 MB or smaller.');
}
$('#verify-form').addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget; const target = $('#verify-result');
  void submit(form, async () => {
    checkFile(form); const { certificate: c } = await api('/certificates/verify', { method: 'POST', body: new FormData(form) });
    details(target, c.verificationStatus === 'VALID' ? '✓ Valid certificate' : c.revoked ? 'Revoked certificate' : 'No matching certificate', [
      ['Result', c.valid ? 'The exact file matches an active blockchain record.' : c.revoked ? 'The issuer or administrator has revoked this certificate.' : 'This file is unregistered or has changed since issuance.'],
      ['Certificate ID', c.certificateId || 'Not registered'], ['Document hash', c.certificateHash],
      ...(c.certificateId ? [['Issuer address', c.issuer], ['Issued', date(c.issuedAt)]] : [])
    ], c.valid ? 'good' : 'bad');
  }, target);
});
async function lookup(hash) {
  const target = $('#lookup-result'); target.hidden = false; message(target, 'Checking blockchain record…');
  try {
    const { certificate: c } = await api(`/certificates/${encodeURIComponent(hash)}`);
    details(target, c.revoked ? 'Revoked certificate' : 'Registered certificate', [ ['Certificate ID', c.certificateId], ['Document hash', c.certificateHash], ['Issuer address', c.issuer], ['Issued', date(c.issuedAt)], ...(c.revoked ? [['Revoked', date(c.revokedAt)]] : []) ], c.revoked ? 'bad' : 'good');
    try {
      const { history } = await api(`/certificates/audit/${encodeURIComponent(hash)}`);
      target.append(element('h3', 'On-chain history')); const list = element('ol', undefined, 'history');
      for (const entry of history) { const item = element('li', `${entry.type} · Block ${entry.blockNumber}`); item.append(element('br'), element('code', entry.transactionHash)); list.append(item); }
      target.append(list);
    } catch { target.append(element('p', 'Record found. Audit history is temporarily unavailable.')); }
  } catch (error) { message(target, error.message, true); }
}
$('#lookup-form').addEventListener('submit', event => { event.preventDefault(); const form = event.currentTarget; void submit(form, () => lookup(new FormData(form).get('hash').trim())); });
$('#issue-form').addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget;
  void submit(form, async () => {
    checkFile(form); const { certificate: c } = await api('/certificates/issue', { method: 'POST', body: new FormData(form) });
    details($('#issue-result'), '✓ Certificate issued', [['Certificate ID', c.certificateId], ['Document hash', c.certificateHash], ['Transaction hash', c.transactionHash], ['Block', c.blockNumber]], 'good'); form.reset();
  }, $('#issue-result'));
});
async function download(hash, filename) {
  try {
    const response = await fetch(`/api/certificates/${hash}/download`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error((await response.json()).message || 'Unable to download');
    const url = URL.createObjectURL(await response.blob()); const a = element('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { notify(error.message); }
}
async function loadRecords() {
  message($('#records-message'), 'Loading records…'); $('#records-body').replaceChildren();
  try {
    const { certificates } = await api('/certificates');
    for (const c of certificates) {
      const tr = element('tr'); tr.append(element('td', c.certificate_id), element('td', date(c.issued_at)));
      const status = element('td'); status.append(element('span', c.revoked ? 'Revoked' : 'Issued', `badge ${c.revoked ? 'revoked' : ''}`)); tr.append(status);
      const actions = element('td'); const view = element('button', 'View', 'button secondary'); view.addEventListener('click', () => { showPanel('lookup'); $('#lookup-form input').value = c.certificate_hash; void lookup(c.certificate_hash); });
      const save = element('button', 'PDF ↓', 'button secondary'); save.addEventListener('click', () => void download(c.certificate_hash, c.file_name)); actions.append(view, save); tr.append(actions); $('#records-body').append(tr);
    }
    message($('#records-message'), certificates.length ? '' : 'No certificates yet. Issue your first certificate to see it here.');
  } catch (error) { message($('#records-message'), error.message, true); }
}
$('#refresh-records').addEventListener('click', () => void loadRecords());
$('#user-form').addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget; const target = form.querySelector('.form-message');
  void submit(form, async () => { const result = await api('/auth/users', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); message(target, `Account created for ${result.user.email}.`); form.reset(); }, target);
});
$('#issuer-form').addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget; const action = event.submitter.value; const address = new FormData(form).get('issuerAddress').trim();
  if (action === 'remove' && !confirm('Remove this wallet’s permission to issue new certificates? Existing certificates stay valid.')) return;
  void submit(form, async () => {
    const result = await api(action === 'status' ? `/issuers/${address}` : `/issuers/${action}`, action === 'status' ? {} : { method: 'POST', body: JSON.stringify({ issuerAddress: address }) });
    message(form.querySelector('.form-message'), result.issuer.registered ? 'This wallet is authorized to issue certificates.' : 'This wallet is not authorized to issue certificates.');
  }, form.querySelector('.form-message'));
});
$('#revoke-form').addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget;
  if (!confirm('Permanently revoke this certificate? This cannot be undone.')) return;
  void submit(form, async () => { await api('/certificates/revoke', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); message(form.querySelector('.form-message'), 'Certificate revoked. The blockchain history remains available.'); }, form.querySelector('.form-message'));
});
async function fillIssuer() { if (user?.role !== 'ADMIN') return; try { const { blockchain } = await api('/blockchain'); $('#issuer-form input').value = blockchain.issuer; } catch {} }
async function init() {
  updateSession();
  try { const response = await fetch('/api/health', { signal: AbortSignal.timeout(10000) }); const health = await response.json(); $('#connection').textContent = response.ok ? 'Services connected' : `Check ${health.database === 'unavailable' ? 'database' : 'blockchain'}`; $('#connection').classList.toggle('connected', response.ok); }
  catch { $('#connection').textContent = 'Services unavailable'; }
  if (token) { try { user = (await api('/auth/me')).user; updateSession(); await fillIssuer(); } catch { logout(); } }
}
void init();
