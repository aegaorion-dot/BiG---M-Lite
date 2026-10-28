'use strict';

/**
 * CSV Import — impor transaksi Sales/Purchase dari teks CSV.
 *
 * Kontrak:
 * - Header wajib: type,id,orgId,date,jurisdiction,currency,description,amountMajor,counterparty,reference
 * - type: SALE|PURCHASE. Validasi ketat per baris; baris gagal dicatat di failures,
 *   tidak menghentikan baris lain.
 * - Duplikasi ditolak dua lapis: id sudah ada di ledger/audit ATAU id duplikat
 *   dalam file yang sama. Baris duplikat masuk failures, tidak diposting ulang.
 * - Hasil: { total, succeeded, failed, receipts, failures } — failures berisi
 *   { row, id, error } sebagai laporan baris gagal.
 */

const { recordSale } = require('../business/salesService');
const { recordPurchase } = require('../business/purchaseService');

const REQUIRED_HEADERS = Object.freeze([
  'type', 'id', 'orgId', 'date', 'jurisdiction', 'currency',
  'description', 'amountMajor', 'counterparty', 'reference',
]);

function splitCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { current += '"'; i += 1; }
        else inQuotes = false;
      } else current += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(current);
      current = '';
    } else current += ch;
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

function parseCsv(text) {
  if (typeof text !== 'string' || text.trim() === '') throw new Error('CSV text is empty');
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
  if (lines.length < 2) throw new Error('CSV needs a header row and at least one data row');
  const headers = splitCsvLine(lines[0]);
  for (const h of REQUIRED_HEADERS) {
    if (!headers.includes(h)) throw new Error(`CSV header missing required column: ${h}`);
  }
  return lines.slice(1).map((line, idx) => {
    const cells = splitCsvLine(line);
    if (cells.length !== headers.length) {
      throw new Error(`CSV row ${idx + 2}: expected ${headers.length} columns, got ${cells.length}`);
    }
    const row = Object.fromEntries(headers.map((h, i) => [h, cells[i]]));
    row.__row = idx + 2;
    return row;
  });
}

function collectExistingIds(deps) {
  const ids = new Set();
  if (deps && deps.ledger && typeof deps.ledger.list === 'function') {
    for (const entry of deps.ledger.list()) {
      if (entry.transactionId) ids.add(entry.transactionId);
    }
  }
  return ids;
}

async function importCsv(deps, csvText, opts = {}) {
  if (!deps || !deps.posting) throw new Error('importCsv needs pipeline deps with posting');
  const rows = parseCsv(csvText);
  const seenInFile = new Set();
  const existingIds = collectExistingIds(deps);
  const receipts = [];
  const failures = [];
  for (const row of rows) {
    const rowNo = row.__row;
    try {
      if (!row.id) throw new Error('id is required');
      if (seenInFile.has(row.id)) throw new Error(`duplicate id in CSV file: ${row.id}`);
      if (existingIds.has(row.id)) throw new Error(`duplicate id already posted: ${row.id}`);
      seenInFile.add(row.id);
      const type = (row.type || '').toUpperCase();
      const base = {
        id: row.id,
        orgId: row.orgId,
        date: row.date,
        jurisdiction: row.jurisdiction,
        currency: row.currency,
        description: row.description,
        amountMajor: row.amountMajor,
      };
      let result;
      if (type === 'SALE') {
        result = await recordSale(deps, { ...base, customer: row.counterparty, invoiceRef: row.reference }, opts);
      } else if (type === 'PURCHASE') {
        result = await recordPurchase(deps, { ...base, supplier: row.counterparty, billRef: row.reference }, opts);
      } else {
        throw new Error(`type must be SALE|PURCHASE, got: ${row.type}`);
      }
      existingIds.add(row.id);
      receipts.push({ row: rowNo, id: row.id, postingId: result.receipt.postingId });
    } catch (err) {
      failures.push({ row: rowNo, id: row.id || null, error: err.message });
    }
  }
  return Object.freeze({
    total: rows.length,
    succeeded: receipts.length,
    failed: failures.length,
    receipts: Object.freeze([...receipts]),
    failures: Object.freeze([...failures]),
  });
}

module.exports = { parseCsv, importCsv, REQUIRED_HEADERS };
