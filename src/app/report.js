'use strict';

/**
 * Laporan sederhana: teks deterministik dari hasil pipeline.
 */

function renderTextReport(result) {
  const lines = [];
  lines.push('=== BiG-M Lite — Laporan Posting ===');
  lines.push(`Transaksi : ${result.transactionId}`);
  lines.push(`Pack      : ${result.packId} v${result.packVersion}`);
  lines.push(`Klasifikasi: ${result.classification.category} (sumber: ${result.classification.source})`);
  lines.push(`Catatan AI : ${result.aiNote}`);
  lines.push('--- Pajak ---');
  if (result.tax.findings.length === 0) {
    lines.push('(tidak ada rule pajak yang cocok)');
  }
  for (const f of result.tax.findings) {
    const amount = f.amountMinor === null ? '-' : f.amountMinor;
    lines.push(`[${f.status}] ${f.ruleId} ${f.category} amountMinor=${amount}${f.source ? ` source=${f.source}` : ''}${f.note ? ` — ${f.note}` : ''}`);
  }
  lines.push(`Total final: ${result.tax.finalTotalMinor}`);
  if (result.tax.hasPlaceholder) {
    lines.push('PERHATIAN: ada aturan placeholder — total final di atas BUKAN kewajiban pajak final.');
  }
  lines.push('--- Jurnal ---');
  lines.push(`ID: ${result.journal.id} balanced=${result.journal.balanced} finalized=${result.journal.finalized}`);
  for (const l of result.journal.lines) {
    lines.push(`  ${l.side} ${l.accountId} ${l.amountMinor} ${l.currency}`);
  }
  lines.push('--- Saldo ledger ---');
  for (const b of result.balances) {
    lines.push(`  ${b.accountId}${b.code ? ` (${b.code} ${b.name})` : ''}: ${b.netMajor}`);
  }
  lines.push(`Receipt: posting=${result.receipt.postingId} periode=${result.receipt.periodId}`);
  return lines.join('\n');
}

module.exports = { renderTextReport };
