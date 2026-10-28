'use strict';

/**
 * Vertical slice: input transaksi -> klasifikasi -> validasi -> posting -> ledger -> laporan.
 *
 * Kontrak:
 * - Pack dipilih via CountryPackRegistry (yurisdiksi + tanggal transaksi).
 * - Klasifikasi AI (bila ada provider) divalidasi; gagal/tolak -> fallback deterministik.
 * - Pemetaan jurnal deterministik berdasar kind:
 *   REVENUE: Dr kas (total+pajak final) / Cr pendapatan / Cr akun pajak (bila final > 0)
 *   EXPENSE: Dr beban / Cr kas (pajak final pada EXPENSE di luar cakupan -> throw eksplisit)
 *   TRANSFER: Dr/Cr dari transferAccounts eksplisit (divalidasi ke chart)
 * - Temuan pajak PLACEHOLDER tidak pernah menjadi baris jurnal; hanya catatan laporan.
 */

const { JournalEntry, JournalLine } = require('../domain/journal');
const { Money } = require('../domain/money');
const { SourceEvidence, TransactionItem, Transaction } = require('../domain/transaction');
const { determineTax } = require('../tax/taxEngine');
const { validateClassification } = require('../ai/validation');
const { renderTextReport } = require('./report');

function toTransaction(input) {
  const items = input.items.map((it) => new TransactionItem({
    description: it.description,
    amount: it.amountMinor !== undefined
      ? Money.fromMinor(it.amountMinor, input.currency)
      : Money.fromMajor(it.amountMajor, input.currency),
    category: it.category ?? null,
  }));
  return new Transaction({
    id: input.id,
    orgId: input.orgId,
    kind: input.kind,
    date: input.date,
    jurisdiction: input.jurisdiction,
    currency: input.currency,
    items,
    evidence: new SourceEvidence(input.evidence),
    idempotencyKey: input.idempotencyKey,
    memo: input.memo ?? null,
  });
}

/**
 * @param {object} args
 * @param {Transaction} args.tx
 * @param {object} args.tax hasil determineTax
 * @param {object} args.chart ChartOfAccounts
 * @param {object} [args.transferAccounts] { debitAccountId, creditAccountId } untuk TRANSFER
 * @param {string|null} [args.taxAccountId] akun kewajiban pajak (wajib bila pajak final > 0)
 */
function buildJournal({ tx, tax, chart, transferAccounts = null, taxAccountId = null, journalId = null }) {
  const total = tx.total();
  const finalTax = tax.finalTotal;
  if (!finalTax.isZero() && !taxAccountId) {
    throw new Error('Final tax > 0 but no taxAccountId provided');
  }
  if (taxAccountId && !chart.has(taxAccountId)) {
    throw new Error(`Unknown taxAccountId: ${taxAccountId}`);
  }
  const id = journalId ?? `j-${tx.id}`;
  let lines;
  if (tx.kind === 'REVENUE') {
    const cashId = 'id-cash';
    const revenueId = 'id-revenue';
    if (!chart.has(cashId) || !chart.has(revenueId)) throw new Error('Chart lacks id-cash/id-revenue');
    const gross = total.add(finalTax);
    lines = [
      new JournalLine({ accountId: cashId, side: 'DEBIT', money: gross }),
      new JournalLine({ accountId: revenueId, side: 'CREDIT', money: total }),
    ];
    if (!finalTax.isZero()) {
      lines.push(new JournalLine({ accountId: taxAccountId, side: 'CREDIT', money: finalTax }));
    }
  } else if (tx.kind === 'EXPENSE') {
    if (!finalTax.isZero()) {
      throw new Error('Final tax on EXPENSE is out of scope for this slice (explicit, not silent)');
    }
    const expenseId = 'id-expense';
    const cashId = 'id-cash';
    if (!chart.has(expenseId) || !chart.has(cashId)) throw new Error('Chart lacks id-expense/id-cash');
    lines = [
      new JournalLine({ accountId: expenseId, side: 'DEBIT', money: total }),
      new JournalLine({ accountId: cashId, side: 'CREDIT', money: total }),
    ];
  } else if (tx.kind === 'TRANSFER') {
    if (!finalTax.isZero()) throw new Error('Final tax on TRANSFER is out of scope for this slice');
    if (!transferAccounts?.debitAccountId || !transferAccounts?.creditAccountId) {
      throw new Error('TRANSFER needs explicit transferAccounts { debitAccountId, creditAccountId }');
    }
    if (!chart.has(transferAccounts.debitAccountId)) {
      throw new Error(`Unknown debitAccountId: ${transferAccounts.debitAccountId}`);
    }
    if (!chart.has(transferAccounts.creditAccountId)) {
      throw new Error(`Unknown creditAccountId: ${transferAccounts.creditAccountId}`);
    }
    lines = [
      new JournalLine({ accountId: transferAccounts.debitAccountId, side: 'DEBIT', money: total }),
      new JournalLine({ accountId: transferAccounts.creditAccountId, side: 'CREDIT', money: total }),
    ];
  } else {
    throw new Error(`Unsupported transaction kind: ${tx.kind}`);
  }
  return new JournalEntry({
    id,
    orgId: tx.orgId,
    date: tx.date,
    currency: tx.currency,
    lines,
    memo: tx.memo ?? `Posting ${tx.kind} ${tx.id}`,
    transactionId: tx.id,
  });
}

async function runTransactionPipeline(deps) {
  const {
    periods, posting, ledger, audit: _audit, idempotency: _idem,
    registry, chart, aiProvider = null, input,
    actor = 'app', transferAccounts = null, taxAccountId = null, journalId = null,
  } = deps;
  void _audit; void _idem;
  if (!periods || !posting || !ledger || !registry || !chart || !input) {
    throw new Error('runTransactionPipeline needs { periods, posting, ledger, registry, chart, input }');
  }

  const tx = toTransaction(input);

  const pack = registry.select(tx.jurisdiction, tx.date);
  if (!pack) throw new Error(`No country pack for jurisdiction ${tx.jurisdiction} at ${tx.date}`);

  let classification = { category: tx.kind, accountId: null, confidence: null, explanation: null, source: 'fallback-deterministik' };
  let aiNote = 'AI tidak dipakai (tanpa provider). Klasifikasi fallback deterministik.';
  if (aiProvider) {
    try {
      const raw = await aiProvider.classify({
        id: tx.id, kind: tx.kind, currency: tx.currency, jurisdiction: tx.jurisdiction,
        totalMinor: tx.total().amountMinor.toString(),
        items: tx.items.map((i) => ({ description: i.description, amountMinor: i.amount.amountMinor.toString() })),
      });
      const validated = validateClassification(raw, { allowedAccounts: chart.list().map((a) => a.id) });
      if (validated.ok) {
        classification = { ...validated.suggestion, source: 'ai-tervalidasi' };
        aiNote = 'Klasifikasi AI lolos validasi dan dipakai sebagai usulan.';
      } else {
        aiNote = `Usulan AI ditolak (${validated.error}). Dipakai fallback deterministik.`;
      }
    } catch (err) {
      aiNote = `AI gagal (${err.message}). Dipakai fallback deterministik.`;
    }
  }

  const tax = determineTax(
    { jurisdiction: tx.jurisdiction, currency: tx.currency, total: tx.total(), kind: tx.kind, category: classification.category },
    pack,
  );

  const journal = buildJournal({ tx, tax, chart, transferAccounts, taxAccountId, journalId });
  const receipt = posting.post(journal, { actor, idempotencyKey: tx.idempotencyKey });

  const balances = [...ledger.balances(tx.currency).entries()]
    .map(([accountId, money]) => {
      let code = null; let name = null;
      try { const acc = chart.get(accountId); code = acc.code; name = acc.name; } catch { /* akun di luar chart pack */ }
      return { accountId, code, name, netMinor: money.amountMinor.toString(), netMajor: money.toMajorString() };
    })
    .sort((a, b) => (a.accountId < b.accountId ? -1 : 1));

  const result = {
    transactionId: tx.id, packId: pack.manifest.id, packVersion: pack.manifest.version,
    classification, aiNote,
    tax: {
      finalTotalMinor: tax.finalTotal.amountMinor.toString(),
      hasPlaceholder: tax.hasPlaceholder,
      findings: tax.findings.map((f) => ({
        ruleId: f.ruleId, category: f.category, status: f.status,
        amountMinor: f.amount ? f.amount.amountMinor.toString() : null,
        source: f.source ?? null, note: f.note ?? null,
      })),
    },
    receipt,
    journal: {
      id: journal.id, balanced: journal.isBalanced(), finalized: journal.finalized,
      lines: journal.lines.map((l) => ({
        accountId: l.accountId, side: l.side,
        amountMinor: l.money.amountMinor.toString(), currency: l.money.currency,
      })),
    },
    balances,
  };
  result.report = renderTextReport(result);
  return result;
}

module.exports = { toTransaction, buildJournal, runTransactionPipeline };
