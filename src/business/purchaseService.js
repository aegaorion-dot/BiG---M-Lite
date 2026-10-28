'use strict';

/**
 * PurchaseService — pembelian sederhana (EXPENSE) di atas pipeline fondasi.
 *
 * Kontrak:
 * - Hanya membangun input transaksi + memanggil runTransactionPipeline.
 * - Posting tetap lewat PostingService (satu-satunya pintu posting).
 * - Evidence RECEIPT/INVOICE wajib (billRef).
 */

const { runTransactionPipeline } = require('../app/verticalSlice');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT_RE = /^\d+(?:\.\d+)?$/;

function assertNonEmptyString(value, field) {
  if (!value || typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function normalizeItems(draft) {
  if (Array.isArray(draft.items) && draft.items.length > 0) {
    return draft.items.map((it, idx) => {
      const description = assertNonEmptyString(it.description, `items[${idx}].description`);
      if (typeof it.amountMajor !== 'string' || !AMOUNT_RE.test(it.amountMajor.trim())) {
        throw new Error(`items[${idx}].amountMajor must be a positive decimal string`);
      }
      return { description, amountMajor: it.amountMajor.trim(), category: it.category ?? null };
    });
  }
  const description = assertNonEmptyString(draft.description, 'description');
  if (typeof draft.amountMajor !== 'string' || !AMOUNT_RE.test(draft.amountMajor.trim())) {
    throw new Error('amountMajor must be a positive decimal string');
  }
  return [{ description, amountMajor: draft.amountMajor.trim(), category: draft.category ?? null }];
}

function buildPurchaseInput(draft) {
  if (!draft || typeof draft !== 'object') throw new Error('purchase draft must be an object');
  const id = assertNonEmptyString(draft.id, 'id');
  const orgId = assertNonEmptyString(draft.orgId, 'orgId');
  const date = assertNonEmptyString(draft.date, 'date');
  if (!DATE_RE.test(date)) throw new Error(`date must be YYYY-MM-DD, got: ${date}`);
  const jurisdiction = assertNonEmptyString(draft.jurisdiction, 'jurisdiction');
  if (!/^[A-Z]{2}$/.test(jurisdiction)) throw new Error(`jurisdiction must be 2-letter code, got: ${jurisdiction}`);
  const currency = assertNonEmptyString(draft.currency, 'currency');
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`currency must be 3-letter code, got: ${currency}`);
  const supplier = assertNonEmptyString(draft.supplier, 'supplier');
  const billRef = assertNonEmptyString(draft.billRef, 'billRef');
  const items = normalizeItems(draft);
  const evidenceKind = draft.evidenceKind ?? 'RECEIPT';
  if (!['RECEIPT', 'INVOICE'].includes(evidenceKind)) {
    throw new Error(`evidenceKind must be RECEIPT|INVOICE, got: ${evidenceKind}`);
  }
  return {
    id,
    orgId,
    kind: 'EXPENSE',
    date,
    jurisdiction,
    currency,
    items,
    evidence: { kind: evidenceKind, reference: billRef },
    idempotencyKey: draft.idempotencyKey ?? `purchase:${id}`,
    memo: draft.memo ?? `Pembelian ${id} dari ${supplier}`,
  };
}

async function recordPurchase(deps, draft, opts = {}) {
  if (!deps || !deps.posting) throw new Error('recordPurchase needs pipeline deps with posting');
  const input = buildPurchaseInput(draft);
  return runTransactionPipeline({ ...deps, ...opts, input });
}

module.exports = { buildPurchaseInput, recordPurchase };
