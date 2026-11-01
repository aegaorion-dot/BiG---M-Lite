'use strict';
// Proves the document review path without any local-only files.
//
// Always verified (no credentials needed):
//   - the .xlsx ledger is parsed into typed records,
//   - the import creates intake candidates for review.
// Verified when Meta Muse is configured in .env:
//   - candidates are reviewed and posted as journals,
//   - a synthetic receipt is rendered in memory, OCR'd, reviewed and posted.
// Without credentials those steps print SKIPPED instead of failing; a live Muse
// rejection of the receipt payload twice is reported as WARN, not as a failure.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.join(__dirname, '..');
require('../src/web/environment').loadEnvironment(path.join(ROOT, '.env'));
process.env.BIGM_DEMO_TAX_CATALOGS = '0';
process.env.BIGM_CONFIGURATION_AUTO_RESEARCH = '0';
delete process.env.BIGM_REGULATORY_POLICY;

const {createWebStore} = require('../src/web/store');
const {parseXlsxTransactions} = require('../src/intake/xlsx');
const {createCanvas} = require('@napi-rs/canvas');

const ACTOR = 'Demo operator';
const MUSE = Boolean(process.env.BIGM_META_API_URL && process.env.BIGM_META_API_KEY && process.env.BIGM_META_MODEL);

function receiptPng() {
  const canvas = createCanvas(640, 820);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 640, 820);
  ctx.fillStyle = '#111111';
  ctx.font = '22px sans-serif';
  [
    'TOKO BANGUN JAYA',
    'Jl. Merdeka 12, Jakarta',
    'No. INV-2026-0100',
    'Tanggal: 2026-09-24',
    'Pelanggan: Maya Bakery',
    '',
    'Semen 50kg x1     Rp  75.000',
    'Cat Tembok x2     Rp 440.000',
    '',
    'TOTAL             Rp 515.000',
    'Lunas - Tunai',
  ].forEach((line, index) => ctx.fillText(line, 40, 80 + index * 36));
  return canvas.toBuffer('image/png');
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bigm-review-'));
const store = createWebStore({persistPath: path.join(workDir, 'store.json'), orgId: 'org-review-proof', demoTaxCatalogs: false});
for (const [slot, value] of [
  ['user.displayName', 'Maya'], ['user.language', 'id'], ['org.name', 'Maya Bakery'],
  ['org.businessType', 'kuliner'], ['org.subjectType', 'INDIVIDUAL'], ['org.activities', ['CAFE_OPERATOR']],
  ['currency.functional', 'IDR'], ['modules.enabled', ['sales', 'purchase', 'accounting', 'reports', 'import']],
  ['accounting.periodStart', '2026-01-01'], ['accounting.periodEnd', '2026-12-31'],
]) store.editProfile({slot, value, actor: ACTOR});
for (const basis of ['REGISTRATION', 'BUSINESS_WORK_LOCATION', 'TAX_RESIDENCE', 'SOURCE']) store.editProfile({basis, countryCode: 'ID', actor: ACTOR});

const proposal = store.onboardingPropose();
if (!proposal.ok) throw Error('proposal failed: ' + proposal.errors.join('; '));
const validated = store.onboardingValidate();
if (!validated.ok) throw Error('validation failed: ' + validated.errors.join('; '));
store.onboardingConfirm({proposalHash: proposal.proposal.hash, actor: ACTOR, decisionSource: 'HUMAN'});
store.onboardingActivate({activationKey: 'review:' + proposal.proposal.hash, actor: ACTOR});

const reviewAndPost = async (candidate, extra = {}) => {
  const edited = await store.intake.edit({candidateId: candidate.candidateId, revision: candidate.revision, actor: ACTOR,
    changes: {paymentAccountId: 'id-cash', settlementStatus: 'PAID', ...extra}});
  return store.intake.confirm({candidateId: edited.candidateId, revision: edited.revision,
    reviewHash: edited.reviewHash, idempotencyKey: 'review:' + edited.candidateId, actor: ACTOR});
};

(async () => {
  const report = [];
  const problems = [];
  const warnings = [];
  console.log('workspace', store.workspaceProfile().policyMode, '| activated', store.workspaceProfile().activated, '| muse', MUSE ? 'configured' : 'not configured');

  const xlsx = fs.readFileSync(path.join(ROOT, 'docs', 'samples', 'jurnal-template.xlsx'));
  const parsed = parseXlsxTransactions(xlsx);
  console.log('xlsx parsed headers', parsed.headers.join(','));
  for (const record of parsed.records) console.log('  row', record.sourceRow, record.date, record.vendor, record.amount, record.currency, record.type);
  if (parsed.records.length !== 2) problems.push('xlsx parser returned ' + parsed.records.length + ' rows, expected 2');

  const sheet = await store.intake.upload({bytes: xlsx, originalFilename: 'jurnal-maya.xlsx',
    declaredMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  console.log('xlsx import', sheet.document.processingStatus, '| candidates', sheet.document.candidates.length);
  if (!sheet.document.candidates.length) problems.push('xlsx import produced no candidates');

  if (MUSE) {
    for (const candidate of sheet.document.candidates) {
      const posted = await reviewAndPost(candidate);
      report.push('xlsx     ' + posted.status + ' ' + posted.current.transactionDate + ' ' + posted.current.counterparty + ' ' + posted.current.amount + ' ' + posted.current.currency);
      if (posted.status !== 'POSTED') problems.push('xlsx candidate not posted: ' + posted.status);
    }
    let receipt = null;
    for (let attempt = 1; attempt <= 2 && !(receipt && receipt.document.candidates.length); attempt += 1) {
      receipt = await store.intake.upload({bytes: receiptPng(), originalFilename: 'nota-inv-0100.png', declaredMimeType: 'image/png'});
      const reason = receipt.document.lastError ? ' (' + receipt.document.lastError.slice(0, 140) + ')' : '';
      console.log('receipt import attempt', attempt, receipt.document.processingStatus, '| candidates', (receipt.document.candidates ?? []).length + reason);
    }
    const candidates = receipt.document.candidates ?? [];
    for (const candidate of candidates) {
      const extra = candidate.current && candidate.current.transactionDate ? {} : {transactionDate: '2026-09-24'};
      const posted = await reviewAndPost(candidate, extra);
      report.push('receipt  ' + posted.status + ' ' + posted.current.transactionDate + ' ' + posted.current.counterparty + ' ' + posted.current.amount + ' ' + posted.current.currency);
      if (posted.status !== 'POSTED') problems.push('receipt candidate not posted: ' + posted.status);
    }
    if (!candidates.length) warnings.push('receipt OCR review skipped: live Muse declined the document payload twice (' + (receipt.document.lastError ?? 'unknown reason').slice(0, 160) + ')');
  } else {
    report.push('posting  SKIPPED (Meta Muse not configured; add .env to verify review + posting)');
  }

  const summary = store.summary();
  console.log('---');
  for (const line of report) console.log(line);
  console.log('journals', store.ctx.ledger.size, '| revenue', summary.totals.revenueMinor, '| expense', summary.totals.expenseMinor);
  for (const problem of problems) console.log('PROBLEM', problem);
  for (const warning of warnings) console.log('WARN', warning);
  if (problems.length) {
    process.exitCode = 1;
    return;
  }
  console.log(warnings.length ? 'OK (' + warnings.length + ' warning)' : 'OK');
})().catch((error) => {
  console.error('FAILED', error.message);
  process.exit(1);
});
