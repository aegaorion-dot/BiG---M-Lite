'use strict';

/**
 * Validasi output AI sebelum dipakai Accounting Engine.
 *
 * Kontrak:
 * - validateClassification(raw, ctx) -> { ok:true, suggestion } | { ok:false, error }.
 * - category harus ada di allowlist; accountId (bila ada) harus akun dikenal;
 *   confidence (bila ada) angka 0..1; explanation (bila ada) string terbatas.
 * - Apa pun yang tidak dikenal DITOLAK (fail-closed); engine memakai fallback
 *   deterministik, bukan usulan mentah.
 */

const CLASSIFICATIONS = Object.freeze(['REVENUE', 'EXPENSE', 'TRANSFER', 'UNCLASSIFIED']);
const MAX_EXPLANATION_CHARS = 2000;

function validateClassification(raw, { allowedAccounts = [] } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'suggestion must be an object' };
  }
  if (!CLASSIFICATIONS.includes(raw.category)) {
    return { ok: false, error: `unknown category: ${String(raw.category)}` };
  }
  if (raw.accountId !== undefined && raw.accountId !== null) {
    if (typeof raw.accountId !== 'string' || !allowedAccounts.includes(raw.accountId)) {
      return { ok: false, error: `unknown accountId: ${String(raw.accountId)}` };
    }
  }
  if (raw.confidence !== undefined && raw.confidence !== null) {
    if (typeof raw.confidence !== 'number' || Number.isNaN(raw.confidence)
      || raw.confidence < 0 || raw.confidence > 1) {
      return { ok: false, error: `confidence must be a number 0..1, got: ${String(raw.confidence)}` };
    }
  }
  if (raw.explanation !== undefined && raw.explanation !== null) {
    if (typeof raw.explanation !== 'string' || raw.explanation.length > MAX_EXPLANATION_CHARS) {
      return { ok: false, error: 'explanation must be a string up to 2000 chars' };
    }
  }
  return {
    ok: true,
    suggestion: Object.freeze({
      category: raw.category,
      accountId: raw.accountId ?? null,
      confidence: raw.confidence ?? null,
      explanation: raw.explanation ?? null,
    }),
  };
}

module.exports = { CLASSIFICATIONS, MAX_EXPLANATION_CHARS, validateClassification };
