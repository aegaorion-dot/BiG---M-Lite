'use strict';
/* BiG-M Lite SPA — tanpa framework, tanpa hitung akuntansi di frontend. */

const $ = (sel) => document.querySelector(sel);
const view = $('#view');
const tabsEl = $('#tabs');
const toasts = $('#toasts');
const auditPill = $('#auditPill');
const demoNote = $('#demoNote');

const TABS = [
  ['onboarding', 'AI Onboarding'],
  ['dashboard', 'Dashboard'],
  ['sales', 'Sales'],
  ['purchase', 'Purchase'],
  ['accounting', 'Accounting'],
  ['reports', 'Reports'],
  ['import', 'CSV Import'],
  ['tax', 'Tax & Pack'],
  ['settings', 'Settings'],
];
let route = 'onboarding';
let cache = { summary: null, txs: [], journals: [], audit: null, tax: null, settings: null, monthly: [], ob: null };
let obChat = [];
let obBooted = false;

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  toasts.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const fmtIDR = (minorStr) => {
  const neg = String(minorStr).startsWith('-');
  const digits = String(minorStr).replace('-', '');
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}Rp${grouped}`;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderTabs() {
  tabsEl.innerHTML = '';
  for (const [id, label] of TABS) {
    const b = document.createElement('button');
    b.className = 'tab';
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-selected', id === route ? 'true' : 'false');
    b.addEventListener('click', () => { route = id; render(); });
    tabsEl.appendChild(b);
  }
}

async function refresh(partial = false) {
  const [s, t, j, a, m] = await Promise.all([
    api('/api/summary').catch((e) => ({ error: e.message })),
    api('/api/transactions').catch(() => ({ transactions: [] })),
    api('/api/journals').catch(() => ({ journals: [] })),
    api('/api/audit').catch(() => ({ verify: { ok: false }, entries: [] })),
    api('/api/reports/monthly').catch(() => ({ months: [] })),
  ]);
  if (s.summary) cache.summary = s.summary;
  cache.txs = t.transactions || [];
  cache.journals = j.journals || [];
  cache.audit = a;
  cache.monthly = m.months || [];
  if (!partial) {
    cache.tax = await api('/api/tax').catch(() => null);
    cache.settings = await api('/api/settings').catch(() => null);
    await refreshOb();
  }
  const ok = cache.audit && cache.audit.verify && cache.audit.verify.ok === true;
  auditPill.textContent = ok ? 'audit OK' : 'audit ?';
  auditPill.className = `pill ${ok ? 'ok' : 'bad'}`;
  demoNote.hidden = !cache.txs.some((x) => x.demo);
}

function txRows(list) {
  if (!list.length) return '<tr><td colspan="7" class="muted">Belum ada transaksi.</td></tr>';
  return list.map((t) => `<tr>
    <td class="mono">${esc(t.id)}${t.demo ? ' <span class="tag demo">DEMO</span>' : ''}</td>
    <td><span class="tag ${t.kind === 'SALE' ? 'sale' : t.kind === 'PURCHASE' ? 'purchase' : 'reversal'}">${esc(t.kind)}</span></td>
    <td>${esc(t.date)}</td><td>${esc(t.counterparty)}</td>
    <td class="num">${fmtIDR(t.totalMinor)}</td>
    <td class="mono">${esc(t.postingId)}</td>
    <td><button class="btn small navy" data-detail="${esc(t.id)}" type="button">Detail</button></td>
  </tr>`).join('');
}

function vDashboard() {
  const s = cache.summary;
  if (!s) return '<div class="panel">Memuat…</div>';
  const maxMonth = cache.monthly.reduce((a, b) => {
    const v = BigInt(b.revenueMinor) > BigInt(b.expenseMinor) ? BigInt(b.revenueMinor) : BigInt(b.expenseMinor);
    return v > a ? v : a;
  }, 1n);
  const bars = cache.monthly.slice(0, 6).map((m) => {
    const r = BigInt(m.revenueMinor); const e = BigInt(m.expenseMinor);
    const rp = Number((r * 100n) / maxMonth); const ep = Number((e * 100n) / maxMonth);
    return `<div class="bar-row"><strong>${esc(m.month)}</strong>
      <div class="bar-track"><div class="bar-rev" style="width:${rp}%"></div><div class="bar-exp" style="width:${ep}%"></div></div>
      <span class="num">${fmtIDR(m.netMinor)}</span></div>`;
  }).join('') || '<p class="muted">Belum ada data bulanan.</p>';
  const recent = [...cache.txs].slice(0, 6);
  return `<div class="hero">
    <div class="panel hero-main">
      <p class="hero-kicker">LEDGER ATELIER · IDR</p>
      <h1>Keuangan yang tenang, tercatat, dan dapat diaudit.</h1>
      <p>Pendapatan ${fmtIDR(s.totals.revenueMinor)} · Beban ${fmtIDR(s.totals.expenseMinor)} · ${s.transactionCount} jurnal terposting.</p>
      <p class="net">${fmtIDR(s.totals.netMinor)}</p>
    </div>
    <div class="panel">
      <h3>Arus bulanan</h3>
      <div class="bars">${bars}</div>
      <p class="muted"><span style="color:#1f7a6d">■</span> pendapatan &nbsp;<span style="color:#b97f1f">■</span> beban</p>
    </div>
  </div>
  <div class="stat-grid">
    <div class="stat"><h4>Pendapatan</h4><strong class="up">${fmtIDR(s.totals.revenueMinor)}</strong><small>akun id-revenue</small></div>
    <div class="stat"><h4>Beban</h4><strong class="down">${fmtIDR(s.totals.expenseMinor)}</strong><small>akun id-expense</small></div>
    <div class="stat"><h4>Kas (net)</h4><strong>${fmtIDR((s.balances.find((b) => b.accountId === 'id-cash') || {}).netMinor || '0')}</strong><small>akun id-cash</small></div>
    <div class="stat"><h4>Audit trail</h4><strong>${s.auditOk ? 'Valid' : 'Periksa'}</strong><small>rantai hash SHA-256</small></div>
  </div>
  <div class="cards">
    <div class="panel"><h3>Transaksi terbaru</h3><table><thead><tr><th>ID</th><th>Jenis</th><th>Tanggal</th><th>Relasi</th><th style="text-align:right">Nominal</th><th>Posting</th><th></th></tr></thead><tbody>${txRows(recent)}</tbody></table></div>
    <div class="panel"><h3>Saldo akun</h3><table><thead><tr><th>Akun</th><th style="text-align:right">Saldo</th></tr></thead><tbody>
      ${s.balances.map((b) => `<tr><td>${esc(b.accountId)} <span class="muted">${esc(b.code || '')} ${esc(b.name || '')}</span></td><td class="num">${fmtIDR(b.netMinor)}</td></tr>`).join('') || '<tr><td colspan="2">Kosong</td></tr>'}
    </tbody></table></div>
  </div>`;
}

function vSalesPurchase(kind) {
  const isSale = kind === 'SALE';
  const list = cache.txs.filter((t) => t.kind === kind);
  return `<div class="panel">
    <h3>${isSale ? 'Sales — penjualan' : 'Purchase — pembelian'}</h3>
    <p class="muted">${isSale ? 'Dr kas / Cr pendapatan. Evidence INVOICE wajib.' : 'Dr beban / Cr kas. Evidence RECEIPT/INVOICE wajib.'} Posting via PostingService, idempotency otomatis.</p>
    <div class="toolbar"><button class="btn gold" id="newTx" type="button">+ Transaksi baru</button></div>
    <table><thead><tr><th>ID</th><th>Jenis</th><th>Tanggal</th><th>${isSale ? 'Pelanggan' : 'Pemasok'}</th><th style="text-align:right">Nominal</th><th>Posting</th><th></th></tr></thead>
    <tbody>${txRows(list)}</tbody></table>
  </div>`;
}

function vAccounting() {
  const j = cache.journals;
  const rows = j.length ? [...j].reverse().map((e) => `<tr>
    <td class="mono">${esc(e.id)}${e.reversalOf ? `<br><span class="tag reversal">reversal of ${esc(e.reversalOf)}</span>` : ''}</td>
    <td>${esc(e.date)}</td><td>${esc(e.transactionId || '-')}</td>
    <td>${e.lines.map((l) => `<span class="mono">${l.side} ${esc(l.accountId)} ${fmtIDR(l.amountMinor)}</span>`).join('<br>')}</td>
    <td><button class="btn small navy" data-rev="${esc(e.id)}" type="button">Reversal</button></td>
  </tr>`).join('') : '<tr><td colspan="5" class="muted">Belum ada jurnal.</td></tr>';
  const a = cache.audit || {};
  const entries = (a.entries || []).slice(-8).reverse().map((e) => `<tr><td class="mono">#${e.seq}</td><td>${esc(e.action)}</td><td class="mono">${esc(e.entityId)}</td><td class="mono">${esc(String(e.hash).slice(0, 12))}…</td></tr>`).join('');
  return `<div class="cards">
    <div class="panel"><h3>Jurnal (append-only)</h3><table><thead><tr><th>ID</th><th>Tanggal</th><th>Transaksi</th><th>Baris</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <p class="footer-note">Koreksi hanya via jurnal reversal baru — jurnal asli tidak pernah diubah.</p></div>
    <div class="panel"><h3>Audit trail</h3><p class="${a.verify && a.verify.ok ? 'ok-text' : 'err'}">${a.verify && a.verify.ok ? 'Rantai valid ✓' : 'Belum terverifikasi'}</p>
    <table><thead><tr><th>Seq</th><th>Aksi</th><th>Entitas</th><th>Hash</th></tr></thead><tbody>${entries || '<tr><td colspan="4">Kosong</td></tr>'}</tbody></table></div>
  </div>`;
}

function vReports() {
  const months = cache.monthly;
  const rows = months.length ? months.map((m) => `<tr><td class="mono">${esc(m.month)}</td><td class="num">${fmtIDR(m.revenueMinor)}</td><td class="num">${fmtIDR(m.expenseMinor)}</td><td class="num"><strong>${fmtIDR(m.netMinor)}</strong></td><td class="num">${m.count}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">Belum ada data.</td></tr>';
  return `<div class="panel"><h3>Laporan bulanan — dari engine</h3>
    <p class="muted">Dihitung dari metadata posting + ledger. Pajak final: Rp0 (seluruh rule ID placeholder).</p>
    <table><thead><tr><th>Bulan</th><th style="text-align:right">Pendapatan</th><th style="text-align:right">Beban</th><th style="text-align:right">Bersih</th><th style="text-align:right">Transaksi</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function vImport() {
  return `<div class="cards">
    <div class="panel"><h3>CSV Import</h3>
      <p class="muted">Header: <span class="mono">type,id,orgId,date,jurisdiction,currency,description,amountMajor,counterparty,reference</span> · type = SALE|PURCHASE</p>
      <div class="drop"><textarea id="csvText" rows="8" placeholder="SALE,sale-3,org-contoh,2026-08-01,ID,IDR,Jasa,2500000,PT Baru,INV-003"></textarea></div>
      <div class="toolbar"><button class="btn navy" id="csvPreview" type="button">Pratinjau</button><button class="btn gold" id="csvRun" type="button">Validasi &amp; Posting</button></div>
      <p class="err" id="csvErr" hidden></p><div id="csvOut"></div>
    </div>
    <div class="panel"><h3>Hasil terakhir</h3><div id="csvReport"><p class="muted">Belum ada impor pada sesi ini.</p></div></div>
  </div>`;
}

function vTax() {
  const t = cache.tax;
  if (!t) return '<div class="panel">Memuat…</div>';
  return t.packs.map((p) => `<div class="panel">
    <h3>${esc(p.displayName || p.id)} <span class="tag warn">PLACEHOLDER</span></h3>
    <div class="kv"><span>Pack</span><strong class="mono">${esc(p.id)} v${esc(p.version)}</strong>
    <span>Yurisdiksi</span><strong>${esc(p.jurisdiction)} · ${esc(p.validFrom)} → ${esc(p.validTo)}</strong>
    <span>Mata uang</span><strong>${esc(p.currency)}</strong></div>
    <table><thead><tr><th>Rule</th><th>Kategori</th><th>Status</th><th>Sumber</th></tr></thead><tbody>
    ${p.rules.map((r) => `<tr><td class="mono">${esc(r.id)}</td><td>${esc(r.category)}</td><td><span class="tag warn">PLACEHOLDER</span></td><td>${esc(r.source || r.note || '—')}</td></tr>`).join('')}
    </tbody></table><p class="footer-note">${esc(t.note)}</p></div>`).join('');
}

function vOnboarding() {
  const ob = cache.ob;
  const msgs = obChat.map((m) => `<div class="chat-row ${m.who}"><div class="bubble"><strong>${m.who === 'ai' ? 'AI Assistant' : 'Anda'}</strong><p>${esc(m.text)}</p>${m.tag ? `<span class="tag ${m.tag === 'AI' ? 'sale' : 'warn'}">${esc(m.tag)}</span>` : ''}</div></div>`).join('');
  const draft = ob?.draft;
  const summary = draft ? `<div class="kv"><span>Bahasa</span><strong>${esc(draft.languageProfile?.ui || '-')}</strong><span>Yurisdiksi</span><strong>${esc(draft.organizationProfile?.domicile || draft.jurisdictionProfiles?.[0]?.code || '-')}</strong><span>Mata uang</span><strong>${esc(draft.currencyProfile?.functional || '-')}${draft.currencyProfile?.otherCurrencies?.length ? ` (+${draft.currencyProfile.otherCurrencies.map(esc).join(', ')})` : ''} (usulan)</strong><span>CountryPack</span><strong>${esc(ob?.proposal ? 'Siap validasi' : 'Perlu validasi')}</strong><span>Status pajak</span><strong>menunggu verifikasi (placeholder)</strong></div>` : '<p class="muted">Memuat…</p>';
  return `<div class="hero"><div class="panel hero-main"><p class="hero-kicker">AI-FIRST ONBOARDING · ONE ENGINE</p><h1>Selamat datang di BiG-M.</h1><p>Ceritakan sedikit tentang bisnis Anda. Saya akan membantu menyiapkan sistemnya.</p><p class="muted">${esc(ob?.ai?.note || '')}</p></div>
  <div class="panel"><h3>Usulan konfigurasi</h3>${summary}<div class="toolbar"><button class="btn navy" id="obPropose" type="button">Susun usulan</button><button class="btn navy" id="obValidate" type="button">Validasi</button><button class="btn gold" id="obActivate" type="button">Konfirmasi &amp; Aktifkan</button></div><div id="obOut"></div></div></div>
  <div class="panel"><h3>Percakapan</h3><div class="chat" id="obChat">${msgs || '<p class="muted">Mulai dengan menyapa, contoh: Saya punya perusahaan perdagangan di Singapura, tapi ingin memakai bahasa Indonesia.</p>'}</div>
  <div class="toolbar"><input id="obInput" placeholder="Tulis jawaban Anda…" style="flex:1" /><button class="btn gold" id="obSend" type="button">Kirim</button></div></div>`;
}

function wireOnboarding() {
  const send = async () => {
    const el = $('#obInput');
    const text = String(el?.value || '').trim();
    if (!text) return;
    obChat.push({ who: 'user', text });
    el.value = '';
    render();
    try {
      const r = await api('/api/onboarding/turn', { method: 'POST', body: JSON.stringify({ text }) });
      obChat.push({ who: 'ai', text: r.question.text, tag: r.aiLabel === 'ai-tervalidasi' ? 'AI' : 'deterministik' });
      await refreshOb();
    } catch (e) { obChat.push({ who: 'ai', text: `Maaf: ${e.message}`, tag: 'deterministik' }); }
    render();
  };
  $('#obSend')?.addEventListener('click', send);
  $('#obInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  $('#obPropose')?.addEventListener('click', async () => {
    try { const r = await api('/api/onboarding/propose', { method: 'POST', body: '{}' }); await refreshOb(); toast(`Usulan tersusun: ${r.proposal.functionalCurrency} · ${(r.proposal.jurisdictions || []).join(',')}`); render(); }
    catch (e) { toast(e.message, 'error'); }
  });
  $('#obValidate')?.addEventListener('click', async () => {
    try { await api('/api/onboarding/validate', { method: 'POST', body: '{}' }); await refreshOb(); toast('Validasi OK — placeholder, menunggu verifikasi'); render(); }
    catch (e) { toast(e.message, 'error'); }
  });
  $('#obActivate')?.addEventListener('click', async () => {
    try {
      const key = `web-${Date.now()}`;
      const r = await api('/api/onboarding/activate', { method: 'POST', body: JSON.stringify({ activationKey: key }) });
      await refreshOb(); toast(`Aktif v${r.record.version} ✓`); render();
    } catch (e) { toast(e.message, 'error'); }
  });
}

async function refreshOb() {
  cache.ob = await api('/api/onboarding/state').catch(() => null);
  if (cache.ob && !obBooted && obChat.length === 0) {
    obBooted = true;
    obChat.push({ who: 'ai', text: 'Selamat datang di BiG-M. Ceritakan sedikit tentang bisnis Anda. Saya akan membantu menyiapkan sistemnya.', tag: 'deterministik' });
  }
}

function vSettings() {
  const s = cache.settings;
  if (!s) return '<div class="panel">Memuat…</div>';
  return `<div class="cards three">
    <div class="panel"><h3>Organisasi</h3><div class="kv"><span>ID</span><strong class="mono">${esc(s.org.id)}</strong><span>Nama</span><strong>${esc(s.org.name)}</strong><span>Yurisdiksi</span><strong>${esc(s.org.jurisdiction)}</strong><span>Kurs dasar</span><strong>${esc(s.org.baseCurrency)}</strong></div></div>
    <div class="panel"><h3>Periode</h3>${s.periods.map((p) => `<p><span class="tag">${esc(p.status)}</span> <strong class="mono">${esc(p.id)}</strong><br><span class="muted">${esc(p.start)} → ${esc(p.end)}</span></p>`).join('')}</div>
    <div class="panel"><h3>Chart of Accounts</h3>${s.chart.map((a) => `<p class="mono">${esc(a.code)} · ${esc(a.id)}<br><span class="muted">${esc(a.name)} (${esc(a.type)})</span></p>`).join('')}</div>
  </div>`;
}

function render() {
  renderTabs();
  if (route === 'onboarding') { view.innerHTML = vOnboarding(); wireOnboarding(); return; }
  if (route === 'dashboard') view.innerHTML = vDashboard();
  else if (route === 'sales') view.innerHTML = vSalesPurchase('SALE');
  else if (route === 'purchase') view.innerHTML = vSalesPurchase('PURCHASE');
  else if (route === 'accounting') view.innerHTML = vAccounting();
  else if (route === 'reports') view.innerHTML = vReports();
  else if (route === 'import') view.innerHTML = vImport();
  else if (route === 'tax') view.innerHTML = vTax();
  else view.innerHTML = vSettings();
  wire();
}

function wire() {
  view.querySelectorAll('[data-detail]').forEach((b) => b.addEventListener('click', () => {
    const tx = cache.txs.find((x) => x.id === b.dataset.detail);
    const j = cache.journals.find((e) => e.id === (tx ? tx.journalId : ''));
    toast(tx ? `${tx.id} · ${tx.kind} · ${fmtIDR(tx.totalMinor)} · jurnal ${j ? j.lines.map((l) => `${l.side} ${l.accountId}`).join(' / ') : '-'}` : 'Tidak ditemukan');
  }));
  view.querySelectorAll('[data-rev]').forEach((b) => b.addEventListener('click', () => openReversal(b.dataset.rev)));
  const nt = $('#newTx');
  if (nt) nt.addEventListener('click', () => openTx(route === 'purchase' ? 'PURCHASE' : 'SALE'));
  const pv = $('#csvPreview');
  if (pv) pv.addEventListener('click', previewCsv);
  const rn = $('#csvRun');
  if (rn) rn.addEventListener('click', runCsv);
}

let pendingKind = 'SALE';
let pendingJournal = null;
function openTx(kind) {
  pendingKind = kind;
  $('#txTitle').textContent = kind === 'SALE' ? 'Penjualan baru' : 'Pembelian baru';
  $('#cpLabel').firstChild.textContent = kind === 'SALE' ? 'Pelanggan' : 'Pemasok';
  $('#txErr').hidden = true;
  $('#txDialog').showModal();
}
function openReversal(journalId) {
  pendingJournal = journalId;
  $('#revErr').hidden = true;
  $('#revDialog').showModal();
}

function formData(form) {
  const fd = new FormData(form);
  return Object.fromEntries(fd.entries());
}

$('#txForm').addEventListener('submit', async (e) => {
  if (e.submitter && e.submitter.value === 'cancel') return;
  e.preventDefault();
  const f = formData(e.target);
  const errEl = $('#txErr');
  try {
    if (!/^\d+(\.\d+)?$/.test(String(f.amountMajor).trim())) throw new Error('Nominal harus desimal positif, contoh 1500000');
    const payload = {
      id: f.id.trim(), orgId: 'org-contoh', date: f.date, jurisdiction: 'ID', currency: 'IDR',
      description: f.description.trim(), amountMajor: String(f.amountMajor).trim(),
    };
    if (pendingKind === 'SALE') { payload.customer = f.counterparty.trim(); payload.invoiceRef = f.reference.trim(); }
    else { payload.supplier = f.counterparty.trim(); payload.billRef = f.reference.trim(); }
    const path = pendingKind === 'SALE' ? '/api/sales' : '/api/purchases';
    await api(path, { method: 'POST', body: JSON.stringify(payload) });
    $('#txDialog').close();
    e.target.reset();
    toast('Terposting ✓');
    await refresh(true); render();
  } catch (err2) { errEl.textContent = err2.message; errEl.hidden = false; }
});

$('#revForm').addEventListener('submit', async (e) => {
  if (e.submitter && e.submitter.value === 'cancel') return;
  e.preventDefault();
  const f = formData(e.target);
  const errEl = $('#revErr');
  try {
    await api('/api/reversals', { method: 'POST', body: JSON.stringify({ journalId: pendingJournal, id: f.id.trim(), date: f.date, memo: f.memo || null }) });
    $('#revDialog').close();
    e.target.reset();
    toast('Reversal terposting ✓');
    await refresh(true); render();
  } catch (err2) { errEl.textContent = err2.message; errEl.hidden = false; }
});

function previewCsv() {
  const text = $('#csvText').value;
  const errEl = $('#csvErr'); const out = $('#csvOut');
  try {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length < 2) throw new Error('Butuh header + minimal 1 baris data.');
    const headers = lines[0].split(',').map((s) => s.trim());
    const rows = lines.slice(1, 6).map((l) => l.split(',').map((s) => s.trim()));
    out.innerHTML = `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="muted">Pratinjau 5 baris pertama dari ${lines.length - 1} baris.</p>`;
    errEl.hidden = true;
  } catch (e) { errEl.textContent = e.message; errEl.hidden = false; }
}

async function runCsv() {
  const errEl = $('#csvErr');
  try {
    const data = await api('/api/import/csv', { method: 'POST', body: JSON.stringify({ csv: $('#csvText').value }) });
    const r = data.report;
    $('#csvReport').innerHTML = `<p><span class="tag ${r.failed ? 'warn' : 'sale'}">total ${r.total} · sukses ${r.succeeded} · gagal ${r.failed}</span></p>
      ${r.failures.length ? `<table><thead><tr><th>Baris</th><th>ID</th><th>Error</th></tr></thead><tbody>${r.failures.map((f) => `<tr><td>${f.row}</td><td class="mono">${esc(f.id || '-')}</td><td>${esc(f.error)}</td></tr>`).join('')}</tbody></table>` : '<p class="ok-text">Semua baris lolos validasi.</p>'}`;
    toast(`Impor selesai: ${r.succeeded} sukses, ${r.failed} gagal`);
    await refresh(true); render();
    const keep = $('#csvReport');
    if (keep) keep.innerHTML = `<p><span class="tag ${r.failed ? 'warn' : 'sale'}">total ${r.total} · sukses ${r.succeeded} · gagal ${r.failed}</span></p>${r.failures.length ? `<table><thead><tr><th>Baris</th><th>ID</th><th>Error</th></tr></thead><tbody>${r.failures.map((f) => `<tr><td>${f.row}</td><td class="mono">${esc(f.id || '-')}</td><td>${esc(f.error)}</td></tr>`).join('')}</tbody></table>` : '<p class="ok-text">Semua baris lolos validasi.</p>'}`;
  } catch (e) { errEl.textContent = e.message; errEl.hidden = false; }
}

$('#demoBtn').addEventListener('click', async () => {
  try {
    const r = await api('/api/demo/seed', { method: 'POST', body: '{}' });
    toast(r.seeded ? 'Data demo dimuat (berlabel DEMO)' : 'Demo sudah ada');
    await refresh(true); render();
  } catch (e) { toast(e.message, 'error'); }
});

(async () => { renderTabs(); view.innerHTML = '<div class="panel">Memuat engine…</div>'; await refresh(); render(); })();
