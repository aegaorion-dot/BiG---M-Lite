'use strict';

/**
 * SalesService — penjualan sederhana (REVENUE) di atas pipeline fondasi.
 *
 * Kontrak:
 * - Hanya membangun input transaksi + memanggil runTransactionPipeline.
 * - Posting tetap lewat PostingService (satu-satunya pintu posting).
 * - Uang via string desimal -> Money (BigInt); tidak ada Number/float.
 * - Evidence INVOICE wajib (invoiceRef).
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

function buildSaleInput(draft) {
  if (!draft || typeof draft !== 'object') throw new Error('sale draft must be an object');
  const id = assertNonEmptyString(draft.id, 'id');
  const orgId = assertNonEmptyString(draft.orgId, 'orgId');
  const date = assertNonEmptyString(draft.date, 'date');
  if (!DATE_RE.test(date)) throw new Error(`date must be YYYY-MM-DD, got: ${date}`);
  const jurisdiction = assertNonEmptyString(draft.jurisdiction, 'jurisdiction');
  if (!/^[A-Z]{2}$/.test(jurisdiction)) throw new Error(`jurisdiction must be 2-letter code, got: ${jurisdiction}`);
  const currency = assertNonEmptyString(draft.currency, 'currency');
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`currency must be 3-letter code, got: ${currency}`);
  const customer = assertNonEmptyString(draft.customer, 'customer');
  const invoiceRef = assertNonEmptyString(draft.invoiceRef, 'invoiceRef');
  const items = normalizeItems(draft);
  return {
    id,
    orgId,
    kind: 'REVENUE',
    date,
    jurisdiction,
    currency,
    items,
    evidence: { kind: 'INVOICE', reference: invoiceRef },
    idempotencyKey: draft.idempotencyKey ?? `sale:${id}`,
    memo: draft.memo ?? `Penjualan ${id} ke ${customer}`,
  };
}

async function recordSale(deps, draft, opts = {}) {
  if (!deps || !deps.posting) throw new Error('recordSale needs pipeline deps with posting');
  const input = buildSaleInput(draft);
  return runTransactionPipeline({ ...deps, ...opts, input });
}

module.exports = { buildSaleInput, recordSale };
