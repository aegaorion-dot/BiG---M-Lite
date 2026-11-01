'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ROOT = path.join(__dirname, '..');
require('../src/web/environment').loadEnvironment(path.join(ROOT, '.env'));
process.env.BIGM_DEMO_TAX_CATALOGS = '0';
process.env.BIGM_CONFIGURATION_AUTO_RESEARCH = '0';
delete process.env.BIGM_REGULATORY_POLICY;
const {createWebStore} = require('../src/web/store');
const dir = path.join(os.tmpdir(), 'strict-review-' + Date.now());
fs.mkdirSync(dir, {recursive: true});
const store = createWebStore({persistPath: path.join(dir, 'store.json'), orgId: 'org-maya-review', demoTaxCatalogs: false});
const A = 'Demo operator';
for (const [slot, value] of [['user.displayName','Maya'],['user.language','id'],['org.name','Maya Bakery'],['org.businessType','kuliner'],['org.subjectType','INDIVIDUAL'],['org.activities',['CAFE_OPERATOR']],['currency.functional','IDR'],['modules.enabled',['sales','purchase','accounting','reports','import']],['accounting.periodStart','2026-01-01'],['accounting.periodEnd','2026-12-31']]) store.editProfile({slot, value, actor: A});
for (const basis of ['REGISTRATION','BUSINESS_WORK_LOCATION','TAX_RESIDENCE','SOURCE']) store.editProfile({basis, countryCode:'ID', actor:A});
const prop = store.onboardingPropose();
if (!prop.ok) throw Error('proposal: ' + prop.errors.join('; '));
const val = store.onboardingValidate();
if (!val.ok) throw Error('validate: ' + val.errors.join('; '));
store.onboardingConfirm({proposalHash: prop.proposal.hash, actor: A, decisionSource: 'HUMAN'});
store.onboardingActivate({activationKey: 'review:' + prop.proposal.hash, actor: A});
console.log('policy', store.workspaceProfile().policyMode, '| activated', store.workspaceProfile().activated);

const reviewAndPost = async (c, extra = {}) => {
  const changes = {paymentAccountId:'id-cash', settlementStatus:'PAID', ...extra};
  const edited = await store.intake.edit({candidateId: c.candidateId, revision: c.revision, actor: A, changes});
  const posted = await store.intake.confirm({candidateId: edited.candidateId, revision: edited.revision, reviewHash: edited.reviewHash, idempotencyKey: 'review:' + edited.candidateId, actor: A});
  return posted;
};

(async () => {
  const xlsx = fs.readFileSync(path.join(ROOT, 'docs', 'samples', 'jurnal-template.xlsx'));
  const sheet = await store.intake.upload({bytes: xlsx, originalFilename: 'jurnal-maya.xlsx', declaredMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  console.log('XLSX doc keys:', Object.keys(sheet.document).join(','));
  console.log('XLSX candidates payload:', JSON.stringify(sheet.document.candidates).slice(0, 400));
  const sheetCands = Array.isArray(sheet.document.candidates) ? sheet.document.candidates : [];
  for (const c of sheetCands) {
    const obj = typeof c === 'string' ? (store.intake.list().candidates || []).find(x => x.candidateId === c) : c;
    if (!obj) { console.log('  unresolved candidate', c); continue; }
    const posted = await reviewAndPost(obj);
    console.log('  XLSX ->', posted.status, posted.current.transactionDate, posted.current.counterparty, posted.current.amount, posted.current.currency);
  }
  const receipt = fs.readFileSync(path.join(ROOT, 'research', '_receipt-live.png'));
  const doc = await store.intake.upload({bytes: receipt, originalFilename: 'nota-inv-0100.png', declaredMimeType: 'image/png'});
  console.log('RECEIPT', doc.document.processingStatus, '| keys:', Object.keys(doc.document).join(','));
  console.log('RECEIPT candidates payload:', JSON.stringify(doc.document.candidates).slice(0, 400));
  console.log('RECEIPT error:', doc.document.lastError || '-');
  const recCands = Array.isArray(doc.document.candidates) ? doc.document.candidates : [];
  for (const c of recCands) {
    const obj = typeof c === 'string' ? (store.intake.list().candidates || []).find(x => x.candidateId === c) : c;
    if (!obj) { console.log('  unresolved candidate', c); continue; }
    const posted = await reviewAndPost(obj, {transactionDate:'2026-09-24'});
    console.log('  RECEIPT ->', posted.status, posted.current.transactionDate, posted.current.counterparty, posted.current.amount, posted.current.currency);
  }
  const summary = store.summary();
  console.log('LEDGER journals', store.ctx.ledger.size, '| revenue', summary.totals.revenueMinor, '| expense', summary.totals.expenseMinor);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
