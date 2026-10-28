'use strict';

/**
 * Web store — konteks runtime bersama untuk lapisan web.
 * Reuse penuh: PostingService satu-satunya pintu posting, Money BigInt,
 * ledger append-only, audit trail, idempotency, CountryPack, Tax Engine.
 * Tanpa database: state in-memory + indeks metadata transaksi.
 */

const { Organization, FinancialPeriod, PeriodRegistry } = require('../domain/organization');
const { Account, ChartOfAccounts } = require('../domain/chartOfAccounts');
const { Ledger } = require('../domain/ledger');
const { AuditTrail, IdempotencyStore } = require('../domain/audit');
const { PostingService } = require('../accounting/postingService');
const { ReversalService } = require('../accounting/reversalService');
const { CountryPackRegistry, loadPackFromDir } = require('../countrypack/registry');
const { recordSale } = require('../business/salesService');
const { recordPurchase } = require('../business/purchaseService');
const { importCsv } = require('../import/csvImporter');
const { getSummary } = require('../dashboard/dashboard');
const path = require('node:path');

const { blankProfile, validateProfile } = require('../onboarding/profile');
const { turn: conversationTurn } = require('../onboarding/conversation');
const { proposeConfiguration, validateProposal, createConfigurator } = require('../onboarding/configurator');
const { MetaModelAdapter } = require('../ai/aiAdapter');
const fs = require('node:fs');

const ID_PACK_DIR = path.join(__dirname, '..', 'countrypack', 'packs', 'id');
const SG_PACK_DIR = path.join(__dirname, '..', 'countrypack', 'packs', 'sg');

function chartForPack(pack) {
  const chart = new ChartOfAccounts();
  for (const a of pack.accounts) chart.add(new Account(a));
  return chart;
}

function revenueExpenseIds(chart) {
  const byCode = (code, type) => {
    try { return chart.getByCode(code).id; } catch { return null; }
  };
  const byType = (type) => {
    try { const f = chart.list().find((a) => a.type === type); return f ? f.id : null; } catch { return null; }
  };
  return { revenueId: byCode('401') ?? byType('REVENUE'), expenseId: byCode('501') ?? byType('EXPENSE') };
}

function createWebStore({ persistPath = null } = {}) {
  const org = new Organization({ id: 'org-contoh', name: 'Contoh', jurisdiction: 'ID', baseCurrency: 'IDR' });
  const periods = new PeriodRegistry();
  periods.add(new FinancialPeriod({ id: 'per-2026', orgId: org.id, code: '2026', start: '2026-01-01', end: '2026-12-31' }));
  const ledger = new Ledger();
  const audit = new AuditTrail();
  const idempotency = new IdempotencyStore();
  const posting = new PostingService({ ledger, periods, audit, idempotency });
  const reversal = new ReversalService({ posting });
  const registry = new CountryPackRegistry();
  registry.register(loadPackFromDir(ID_PACK_DIR));
  registry.register(loadPackFromDir(SG_PACK_DIR));
  const pack = registry.select('ID', '2026-06-01');
  const charts = new Map();
  for (const p of registry.list()) {
    try { charts.set(p.manifest.jurisdiction, chartForPack(p)); } catch { /* skip invalid */ }
  }
  const chart = charts.get('ID') ?? chartForPack(pack);
  const txMeta = new Map();

  const ctx = { org, periods, ledger, audit, idempotency, posting, reversal, registry, pack, chart };
  const configurator = createConfigurator({ audit });
  let draft = blankProfile();
  let lastProposal = null;
  let lastValidation = null;
  let activeConfig = null;

  function chartFor(jurisdiction) {
    return charts.get(jurisdiction) ?? chart;
  }

  function pipelineDepsFor(input) {
    const p = registry.select(input.jurisdiction, input.date);
    if (!p) return { ...ctx };
    return { ...ctx, pack: p, chart: chartFor(input.jurisdiction) };
  }

  function rememberMeta(kind, draft, result) {
    const { revenueId, expenseId } = revenueExpenseIds(chartFor(draft.jurisdiction));
    const want = kind === 'SALE' ? revenueId : expenseId;
    const totalMinor = result.journal.lines
      .filter((l) => l.accountId === want)
      .reduce((acc, l) => (BigInt(acc) + BigInt(l.amountMinor)).toString(), '0');
    txMeta.set(result.transactionId, {
      id: result.transactionId,
      kind,
      date: draft.date,
      currency: draft.currency,
      totalMinor,
      counterparty: draft.customer ?? draft.supplier ?? draft.counterparty ?? '-',
      reference: draft.invoiceRef ?? draft.billRef ?? draft.reference ?? '-',
      postingId: result.receipt.postingId,
      journalId: result.journal.id,
      demo: String(result.transactionId).startsWith('demo-'),
    });
  }

  function syncMetaFromLedger() {
    for (const entry of ledger.list()) {
      const txId = entry.transactionId;
      if (!txId || txMeta.has(txId)) continue;
      const { revenueId, expenseId } = revenueExpenseIds(chartFor('ID'));
      const ids = new Set(entry.lines.map((l) => l.accountId));
      const allRevenue = [...charts.values()].map((c) => revenueExpenseIds(c).revenueId).filter(Boolean);
      const allExpense = [...charts.values()].map((c) => revenueExpenseIds(c).expenseId).filter(Boolean);
      const hasRevenue = allRevenue.some((id) => ids.has(id)) || (revenueId && ids.has(revenueId));
      const hasExpense = allExpense.some((id) => ids.has(id)) || (expenseId && ids.has(expenseId));
      const kind = hasRevenue && !hasExpense ? 'SALE' : hasExpense && !hasRevenue ? 'PURCHASE' : 'TRANSFER';
      const want = kind === 'SALE'
        ? (allRevenue.find((id) => ids.has(id)) ?? revenueId)
        : (allExpense.find((id) => ids.has(id)) ?? expenseId);
      const totalLine = want ? entry.lines.find((l) => l.accountId === want) : null;
      txMeta.set(txId, {
        id: txId,
        kind: entry.reversalOf ? 'REVERSAL' : kind,
        date: entry.date,
        currency: entry.currency,
        totalMinor: totalLine ? totalLine.money.amountMinor.toString() : '0',
        counterparty: '-',
        reference: '-',
        postingId: entry.id,
        journalId: entry.id,
        demo: String(txId).startsWith('demo-'),
      });
    }
  }

  async function createSale(draft) {
    const result = await recordSale(pipelineDepsFor(draft), draft);
    rememberMeta('SALE', draft, result);
    return result;
  }

  async function createPurchase(draft) {
    const result = await recordPurchase(pipelineDepsFor(draft), draft);
    rememberMeta('PURCHASE', draft, result);
    return result;
  }

  async function importCsvText(csvText, opts = {}) {
    const { parseCsv } = require('../import/csvImporter');
    const { recordSale: sale } = require('../business/salesService');
    const { recordPurchase: purchase } = require('../business/purchaseService');
    const rows = parseCsv(csvText);
    const seenInFile = new Set();
    const existingIds = new Set(ledger.list().map((e) => e.transactionId).filter(Boolean));
    const receipts = [];
    const failures = [];
    for (const row of rows) {
      const rowNo = row.__row;
      try {
        if (!row.id) throw new Error('id is required');
        if (seenInFile.has(row.id)) throw new Error(`duplicate id in CSV file: ${row.id}`);
        if (existingIds.has(row.id)) throw new Error(`duplicate id already posted: ${row.id}`);
        seenInFile.add(row.id);
        const type = String(row.type || '').toUpperCase();
        const base = {
          id: row.id, orgId: row.orgId, date: row.date, jurisdiction: row.jurisdiction,
          currency: row.currency, description: row.description, amountMajor: row.amountMajor,
        };
        let result;
        if (type === 'SALE') {
          const d = { ...base, customer: row.counterparty, invoiceRef: row.reference };
          result = await sale(pipelineDepsFor(d), d, opts);
          rememberMeta('SALE', d, result);
        } else if (type === 'PURCHASE') {
          const d = { ...base, supplier: row.counterparty, billRef: row.reference };
          result = await purchase(pipelineDepsFor(d), d, opts);
          rememberMeta('PURCHASE', d, result);
        } else {
          throw new Error(`type must be SALE|PURCHASE, got: ${row.type}`);
        }
        existingIds.add(row.id);
        receipts.push({ row: rowNo, id: row.id, postingId: result.receipt.postingId });
      } catch (e2) {
        failures.push({ row: rowNo, id: row.id || null, error: e2.message });
      }
    }
    syncMetaFromLedger();
    return Object.freeze({
      total: rows.length, succeeded: receipts.length, failed: failures.length,
      receipts: Object.freeze(receipts), failures: Object.freeze(failures),
    });
  }

  function reverseJournal({ journalId, id, date, memo, actor = 'web' }) {
    const original = ledger.get(journalId);
    if (!original) throw new Error(`Unknown journal: ${journalId}`);
    const { entry, receipt } = reversal.reverse(original, { id, date, memo, actor });
    const meta = {
      id: entry.transactionId, kind: 'REVERSAL', date: entry.date, currency: entry.currency,
      totalMinor: '0', counterparty: '-', reference: `reversal-of:${original.id}`,
      postingId: receipt.postingId, journalId: entry.id, demo: false,
    };
    txMeta.set(`${entry.id}`, meta);
    return { entry: serializeJournal(entry), receipt };
  }

  function serializeJournal(entry) {
    return {
      id: entry.id, orgId: entry.orgId, date: entry.date, currency: entry.currency,
      transactionId: entry.transactionId, reversalOf: entry.reversalOf ?? null,
      finalized: entry.finalized, finalizedAt: entry.finalizedAt ?? null,
      balanced: entry.isBalanced(),
      lines: entry.lines.map((l) => ({
        accountId: l.accountId, side: l.side,
        amountMinor: l.money.amountMinor.toString(), currency: l.money.currency,
      })),
    };
  }

  function listTransactions() {
    syncMetaFromLedger();
    return [...txMeta.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  function monthlyReport(currency = 'IDR') {
    syncMetaFromLedger();
    const buckets = new Map();
    for (const meta of txMeta.values()) {
      if (meta.currency !== currency || meta.kind === 'REVERSAL') continue;
      const month = String(meta.date).slice(0, 7);
      const b = buckets.get(month) ?? { month, revenueMinor: 0n, expenseMinor: 0n, count: 0 };
      if (meta.kind === 'SALE') b.revenueMinor += BigInt(meta.totalMinor);
      if (meta.kind === 'PURCHASE') b.expenseMinor += BigInt(meta.totalMinor);
      b.count += 1;
      buckets.set(month, b);
    }
    return [...buckets.values()]
      .sort((a, b) => (a.month < b.month ? -1 : 1))
      .map((b) => ({
        month: b.month, count: b.count,
        revenueMinor: b.revenueMinor.toString(),
        expenseMinor: b.expenseMinor.toString(),
        netMinor: (b.revenueMinor - b.expenseMinor).toString(),
      }));
  }

  async function seedDemo() {
    if (txMeta.has('demo-sale-1')) return { seeded: false, reason: 'demo already loaded' };
    await createSale({
      id: 'demo-sale-1', orgId: org.id, date: '2026-06-01', jurisdiction: 'ID',
      currency: 'IDR', customer: 'PT Demo Maju', invoiceRef: 'DEMO-INV-001',
      description: '[DEMO] Jasa konsultasi', amountMajor: '10000000',
    });
    await createSale({
      id: 'demo-sale-2', orgId: org.id, date: '2026-07-02', jurisdiction: 'ID',
      currency: 'IDR', customer: 'PT Demo Jaya', invoiceRef: 'DEMO-INV-002',
      description: '[DEMO] Jasa pendampingan', amountMajor: '5000000',
    });
    await createPurchase({
      id: 'demo-buy-1', orgId: org.id, date: '2026-07-05', jurisdiction: 'ID',
      currency: 'IDR', supplier: 'Toko Demo ATK', billRef: 'DEMO-KW-001',
      description: '[DEMO] ATK kantor', amountMajor: '750000',
    });
    return { seeded: true, ids: ['demo-sale-1', 'demo-sale-2', 'demo-buy-1'] };
  }

  async function onboardingTurn(userText, { aiProvider = null } = {}) {
    let signals = {};
    let aiLabel = 'deterministik';
    if (aiProvider) {
      try {
        const raw = await aiProvider.explain({ text: String(userText ?? ''), task: 'onboarding-signals' });
        if (raw && typeof raw === 'object' && raw.signals && typeof raw.signals === 'object') {
          const allowed = ['jurisdiction', 'currency', 'businessField', 'language', 'orgName'];
          for (const k of allowed) {
            if (typeof raw.signals[k] === 'string' && raw.signals[k].trim() !== '') signals[k] = raw.signals[k].trim().slice(0, 60);
          }
          aiLabel = 'ai-tervalidasi';
        }
      } catch { /* fallback deterministik */ }
    }
    const { detectSignals } = require('../onboarding/conversation');
    const det = detectSignals(userText);
    signals = { ...det, ...signals };
    const out = conversationTurn(draft, userText);
    // Gabungkan sinyal AI tervalidasi bila ada, lalu terapkan ulang agar id org ikut terisi.
    draft = out.draft;
    if (Object.keys(signals).length > 0) {
      const { applySignalsToDraft, nextQuestion } = require('../onboarding/conversation');
      draft = applySignalsToDraft(draft, signals);
      const question = nextQuestion(draft);
      persist();
      return { draft: JSON.parse(JSON.stringify(draft)), signals, question, complete: question.key === 'done', aiLabel };
    }
    persist();
    return { draft: JSON.parse(JSON.stringify(draft)), signals: out.signals, question: out.question, complete: out.complete, aiLabel };
  }

  function onboardingDraft() {
    return JSON.parse(JSON.stringify(draft));
  }

  function onboardingPropose() {
    const out = proposeConfiguration(draft);
    if (out.ok) lastProposal = out.proposal;
    return out;
  }

  function onboardingValidate() {
    if (!lastProposal) {
      const p = proposeConfiguration(draft);
      if (!p.ok) return p;
      lastProposal = p.proposal;
    }
    const out = validateProposal(lastProposal, { registry });
    if (out.ok) lastValidation = out.validated;
    return out;
  }

  function onboardingActivate({ activationKey, actor = 'onboarding' } = {}) {
    if (!lastValidation) {
      const v = onboardingValidate();
      if (!v.ok) throw new Error(`cannot activate: ${v.errors.join('; ')}`);
    }
    const record = configurator.activate({ activationKey, proposal: lastValidation, actor });
    activeConfig = record;
    persist();
    return record;
  }

  function onboardingHistory() {
    return configurator.history();
  }

  function onboardingState() {
    return {
      draft: onboardingDraft(),
      proposal: lastProposal ? JSON.parse(JSON.stringify(lastProposal)) : null,
      validated: lastValidation ? JSON.parse(JSON.stringify(lastValidation)) : null,
      active: activeConfig ? JSON.parse(JSON.stringify(activeConfig)) : null,
      history: onboardingHistory(),
    };
  }

  function persist() {
    if (!persistPath) return;
    try {
      const data = JSON.stringify({
        draft, lastProposal, lastValidation, active: activeConfig,
        savedAt: new Date().toISOString(),
      }, null, 2);
      fs.mkdirSync(path.dirname(persistPath), { recursive: true });
      fs.writeFileSync(persistPath, data, 'utf8');
    } catch { /* persistensi best-effort, tidak menggagalkan transaksi */ }
  }

  function restore() {
    if (!persistPath || !fs.existsSync(persistPath)) return false;
    try {
      const raw = JSON.parse(fs.readFileSync(persistPath, 'utf8'));
      if (raw.draft && validateProfile(raw.draft).ok) draft = validateProfile(raw.draft).profile;
      else if (raw.draft) draft = raw.draft;
      lastProposal = raw.lastProposal ?? null;
      lastValidation = raw.lastValidation ?? null;
      activeConfig = raw.active ?? null;
      return true;
    } catch { return false; }
  }

  restore();

  function aiStatus() {
    const hasEndpoint = Boolean(process.env.BIGM_META_API_URL);
    const hasKey = Boolean(process.env.BIGM_META_API_KEY);
    return {
      configured: hasEndpoint && hasKey,
      mode: hasEndpoint && hasKey ? 'ai' : 'deterministik',
      note: hasEndpoint && hasKey
        ? 'AI terkonfigurasi; output tetap divalidasi deterministik.'
        : 'AI tidak terkonfigurasi — memakai fallback deterministik (jujur, bukan klaim AI).',
    };
  }

  return {
    ctx, txMeta, createSale, createPurchase, importCsvText, reverseJournal,
    listTransactions, monthlyReport, seedDemo, serializeJournal,
    summary: (currency) => getSummary(ctx, { currency: currency ?? org.baseCurrency }),
    charts, chartFor, pipelineDepsFor,
    onboardingTurn, onboardingDraft, onboardingPropose, onboardingValidate,
    onboardingActivate, onboardingHistory, onboardingState, aiStatus,
    configurator,
  };
}

module.exports = { createWebStore };
