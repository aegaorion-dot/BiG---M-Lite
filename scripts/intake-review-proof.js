'use strict';
// Proves the document review path end to end without any local-only files:
// a synthetic workspace is onboarded, an .xlsx ledger is imported and posted,
// then a synthetic receipt is rendered in memory, OCR'd, reviewed and posted.
//
// Muse is required for the receipt step. Without credentials the spreadsheet
// proof still runs and the receipt step is reported as SKIPPED.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.join(__dirname, '..');
require('../src/web/environment').loadEnvironment(path.join(ROOT, '.env'));
process.env.BIGM_DEMO_TAX_CATALOGS = '0';
process.env.BIGM_CONFIGURATION_AUTO_RESEARCH = '0';
delete process.env.BIGM_REGULATORY_POLICY;

const {createWebStore} = require('../src/web/store');
const {createCanvas} = require('@napi-rs/canvas');

const ACTOR = 'Demo operator';

function receiptPng() {
  const canvas = createCanvas(640, 820);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 640, 820);
  ctx.fillStyle = '#111111';
  ctx.font = '22px sans-serif';
  const lines = [
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
  ];
  lines.forEach((line, index) => ctx.fillText(line, 40, 80 + index * 36));
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
  console.log('workspace', store.workspaceProfile().policyMode, '| activated', store.workspaceProfile().activated);

  const xlsx = fs.readFileSync(path.join(ROOT, 'docs', 'samples', 'jurnal-template.xlsx'));
  const sheet = await store.intake.upload({bytes: xlsx, originalFilename: 'jurnal-maya.xlsx',
    declaredMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  console.log('xlsx document', sheet.document.processingStatus, '| candidates', sheet.document.candidates.length);
  for (const candidate of sheet.document.candidates) {
    const posted = await reviewAndPost(candidate);
    report.push('xlsx     ' + posted.status + ' ' + posted.current.transactionDate + ' ' + posted.current.counterparty + ' ' + posted.current.amount + ' ' + posted.current.currency);
  }

  const museConfigured = Boolean(process.env.BIGM_META_API_URL && process.env.BIGM_META_API_KEY && process.env.BIGM_META_MODEL);
  if (!museConfigured) {
    report.push('receipt  SKIPPED (Meta Muse is not configured in .env)');
  } else {
    const doc = await store.intake.upload({bytes: receiptPng(), originalFilename: 'nota-inv-0100.png', declaredMimeType: 'image/png'});
    const candidates = doc.document.candidates ?? [];
    console.log('receipt document', doc.document.processingStatus, '| candidates', candidates.length, doc.document.lastError ? '(' + doc.document.lastError.slice(0, 140) + ')' : '');
    for (const candidate of candidates) {
      const extra = candidate.current && candidate.current.transactionDate ? {} : {transactionDate: '2026-09-24'};
      const posted = await reviewAndPost(candidate, extra);
      report.push('receipt  ' + posted.status + ' ' + posted.current.transactionDate + ' ' + posted.current.counterparty + ' ' + posted.current.amount + ' ' + posted.current.currency);
    }
    if (!candidates.length) report.push('receipt  NO_CANDIDATE ' + (doc.document.lastError ?? ''));
  }

  const summary = store.summary();
  console.log('---');
  for (const line of report) console.log(line);
  console.log('journals', store.ctx.ledger.size, '| revenue', summary.totals.revenueMinor, '| expense', summary.totals.expenseMinor);
  if (report.some((line) => /NO_CANDIDATE|FAILED/.test(line))) process.exitCode = 1;
})().catch((error) => {
  console.error('FAILED', error.message);
  process.exit(1);
});
