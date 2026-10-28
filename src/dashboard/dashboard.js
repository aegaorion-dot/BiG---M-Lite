'use strict';

/**
 * Dashboard — ringkasan baca-saja dari ledger + audit + hasil impor.
 *
 * Kontrak:
 * - Tidak menulis ke ledger/audit; hanya membaca state yang ada.
 * - Uang tetap BigInt minor; netMajor dihitung via Money.
 * - getSummary(deps, { currency }) -> { balances, transactionCount, totals, auditOk }.
 */

const { Money } = require('../domain/money');

function getSummary(deps, { currency = 'IDR' } = {}) {
  if (!deps || !deps.ledger) throw new Error('getSummary needs deps with ledger');
  const entries = typeof deps.ledger.list === 'function' ? deps.ledger.list() : [];
  const relevant = entries.filter((e) => e.currency === currency);
  const balancesMap = typeof deps.ledger.balances === 'function'
    ? deps.ledger.balances(currency)
    : new Map();
  const balances = [...balancesMap.entries()]
    .map(([accountId, money]) => {
      let code = null;
      let name = null;
      if (deps.chart && typeof deps.chart.has === 'function' && deps.chart.has(accountId)) {
        const acc = deps.chart.get(accountId);
        code = acc.code;
        name = acc.name;
      }
      return {
        accountId, code, name,
        netMinor: money.amountMinor.toString(),
        netMajor: money.toMajorString(),
      };
    })
    .sort((a, b) => (a.accountId < b.accountId ? -1 : 1));
  let revenue = Money.zero(currency);
  let expense = Money.zero(currency);
  for (const e of relevant) {
    for (const line of e.lines) {
      if (line.accountId === 'id-revenue' && line.side === 'CREDIT') revenue = revenue.add(line.money);
      if (line.accountId === 'id-expense' && line.side === 'DEBIT') expense = expense.add(line.money);
    }
  }
  const net = revenue.sub(expense);
  const audit = deps.audit && typeof deps.audit.verifyChain === 'function'
    ? deps.audit.verifyChain()
    : { ok: null, reason: 'no-audit' };
  return Object.freeze({
    currency,
    transactionCount: relevant.length,
    balances: Object.freeze(balances),
    totals: Object.freeze({
      revenueMinor: revenue.amountMinor.toString(),
      expenseMinor: expense.amountMinor.toString(),
      netMinor: net.amountMinor.toString(),
      revenueMajor: revenue.toMajorString(),
      expenseMajor: expense.toMajorString(),
      netMajor: net.toMajorString(),
    }),
    auditOk: audit.ok === true,
  });
}

function renderDashboardText(summary, importReport = null) {
  const lines = [];
  lines.push('=== BiG-M Lite — Dashboard ===');
  lines.push(`Mata uang : ${summary.currency}`);
  lines.push(`Transaksi : ${summary.transactionCount}`);
  lines.push(`Audit     : ${summary.auditOk ? 'OK (rantai valid)' : 'BELUM TERVERIFIKASI'}`);
  lines.push('--- Saldo ---');
  if (summary.balances.length === 0) lines.push('(ledger kosong)');
  for (const b of summary.balances) {
    lines.push(`  ${b.accountId}${b.code ? ` (${b.code} ${b.name})` : ''}: ${b.netMajor}`);
  }
  lines.push('--- Ringkasan ---');
  lines.push(`  Pendapatan: ${summary.totals.revenueMajor}`);
  lines.push(`  Beban     : ${summary.totals.expenseMajor}`);
  lines.push(`  Bersih    : ${summary.totals.netMajor}`);
  if (importReport) {
    lines.push('--- Impor CSV terakhir ---');
    lines.push(`  total=${importReport.total} sukses=${importReport.succeeded} gagal=${importReport.failed}`);
    for (const f of importReport.failures) {
      lines.push(`  GAGAL baris ${f.row} id=${f.id ?? '-'}: ${f.error}`);
    }
  }
  return lines.join('\n');
}

module.exports = { getSummary, renderDashboardText };
