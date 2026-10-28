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

const ID_PACK_DIR = path.join(__dirname, '..', 'countrypack', 'packs', 'id');

function createWebStore() {
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
  const pack = registry.select('ID', '2026-06-01');
  const chart = new ChartOfAccounts();
  for (const a of pack.accounts) chart.add(new Account(a));
  const txMeta = new Map();

  const ctx = { org, periods, ledger, audit, idempotency, posting, reversal, registry, pack, chart };

  function rememberMeta(kind, draft, result) {
    const totalMinor = result.journal.lines
      .filter((l) => (kind === 'SALE' ? l.accountId === 'id-revenue' : l.accountId === 'id-expense'))
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
      const hasRevenue = entry.lines.some((l) => l.accountId === 'id-revenue');
      const hasExpense = entry.lines.some((l) => l.accountId === 'id-expense');
      const kind = hasRevenue && !hasExpense ? 'SALE' : hasExpense && !hasRevenue ? 'PURCHASE' : 'TRANSFER';
      const totalLine = entry.lines.find((l) => l.accountId === (kind === 'SALE' ? 'id-revenue' : 'id-expense'));
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
    const result = await recordSale(ctx, draft);
    rememberMeta('SALE', draft, result);
    return result;
  }

  async function createPurchase(draft) {
    const result = await recordPurchase(ctx, draft);
    rememberMeta('PURCHASE', draft, result);
    return result;
  }

  async function importCsvText(csvText, opts = {}) {
    const report = await importCsv(ctx, csvText, opts);
    syncMetaFromLedger();
    return report;
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

  return {
    ctx, txMeta, createSale, createPurchase, importCsvText, reverseJournal,
    listTransactions, monthlyReport, seedDemo, serializeJournal,
    summary: (currency) => getSummary(ctx, { currency: currency ?? org.baseCurrency }),
  };
}

module.exports = { createWebStore };
