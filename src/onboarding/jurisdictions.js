'use strict';

/**
 * Jurisdiction intelligence (P1 final §2). No new engine; uses ISO registry.
 * Nine bases; only relevant ones used for freelancer/UMKM.
 */

const { isKnownJurisdiction } = require('../global/jurisdictions');
const { verifyQuote } = require('./evidence');

const BASES = Object.freeze([
  'ACCOUNT_LOCATION',
  'INCORPORATION',
  'TAX_RESIDENCE',
  'SOURCE',
  'REGISTRATION',
  'BUSINESS_WORK_LOCATION',
  'CUSTOMER_LOCATION',
  'WITHHOLDING',
  'POSSIBLE_PE',
]);

function blankJurisdictionState() {
  return { candidates: [] };
}

function normalizeCountry(code) {
  if (code === null || code === undefined) return null;
  const c = String(code).trim().toUpperCase();
  if (c === '' || c === 'UNKNOWN') return null;
  return c;
}

function addJurisdictionCandidate(state, { basis, countryCode, supportingQuote = null, status = 'CANDIDATE' }, userText = '') {
  const errors = [];
  if (!BASES.includes(basis)) errors.push(`unknown basis: ${basis}`);
  const cc = normalizeCountry(countryCode);
  if (cc !== null && !isKnownJurisdiction(cc)) errors.push(`unknown country: ${countryCode}`);
  if (!['CANDIDATE', 'CONFIRMED', 'REJECTED', 'UNKNOWN'].includes(status)) errors.push(`bad status: ${status}`);
  if (supportingQuote !== null && supportingQuote !== undefined && supportingQuote !== '') {
    if (!verifyQuote(supportingQuote, userText)) errors.push('supportingQuote must occur verbatim in user message');
  }
  if (status === 'CONFIRMED' && (!supportingQuote || !verifyQuote(supportingQuote, userText))) {
    errors.push('CONFIRMED jurisdiction requires verbatim supportingQuote');
  }
  if (errors.length) return { ok: false, errors };
  const next = { candidates: [...(state?.candidates ?? [])] };
  const idx = next.candidates.findIndex((c) => c.basis === basis);
  const rec = {
    basis, countryCode: cc, status,
    supportingQuote: supportingQuote ? String(supportingQuote).trim().slice(0, 200) : null,
  };
  if (idx >= 0) next.candidates[idx] = rec;
  else next.candidates.push(rec);
  return { ok: true, state: next };
}

function getBasis(state, basis) {
  return (state?.candidates ?? []).find((c) => c.basis === basis) ?? null;
}

/**
 * Basis-aware extraction from free text. Deterministic, no network.
 * Rules (strict):
 * - UI language never implies jurisdiction.
 * - Owner nationality never implies business jurisdiction.
 * - Customer location never implies registration.
 * - Operating location never auto-implies tax residence.
 */
function extractJurisdictionCandidates(text) {
  const t = String(text ?? '');
  const tl = t.toLowerCase();
  const out = [];
  const hasWord = (re) => re.test(tl);

  const pickQuote = (m) => (m && m[0] ? m[0].slice(0, 200) : null);

  // Operating location: "in Bali/Bandung/Indonesia", "run ... in X", "coffee shop in X".
  let m = tl.match(/\bin\s+(bali|bandung|indonesia|singapore|malaysia)\b/);
  if (m) {
    const map = { bali: 'ID', bandung: 'ID', indonesia: 'ID', singapore: 'SG', malaysia: 'MY' };
    out.push({ basis: 'BUSINESS_WORK_LOCATION', countryCode: map[m[1]], supportingQuote: pickQuote(t.match(new RegExp(`\\bin\\s+${m[1]}`, 'i'))) });
  }
  // Customer location: "US clients", "customers pay", "working with X clients".
  if (/client|customer/.test(tl)) {
    if (/\bus\b|\bu\.s\.?\b/.test(tl) || /united states|america/.test(tl)) {
      const q = t.match(/US clients|united states|america|\bUS\b/i);
      out.push({ basis: 'CUSTOMER_LOCATION', countryCode: 'US', supportingQuote: pickQuote(q) });
    }
  }
  // Owner nationality only: "I'm Australian" -> no jurisdiction candidate, record nationality separately.
  // Explicit registration language: "registered in X", "terdaftar di X".
  m = tl.match(/(registered in|terdaftar di)\s+([a-z ]{2,40})/i);
  if (m) {
    const seg = m[2].toLowerCase();
    let cc = null;
    if (/indonesia/.test(seg)) cc = 'ID';
    else if (/singapore|singapura/.test(seg)) cc = 'SG';
    else if (/malaysia/.test(seg)) cc = 'MY';
    else if (/united states|usa|america/.test(seg)) cc = 'US';
    else if (/australia/.test(seg)) cc = 'AU';
    out.push({ basis: 'REGISTRATION', countryCode: cc, supportingQuote: pickQuote(m) });
  }
  // Import purchase hint -> foreign currency unknown, possible source basis left null.
  if (/import/.test(tl)) {
    out.push({ basis: 'SOURCE', countryCode: null, supportingQuote: pickQuote(t.match(/import/i)) });
  }
  void hasWord;
  return out;
}

module.exports = { BASES, blankJurisdictionState, addJurisdictionCandidate, getBasis, extractJurisdictionCandidates };
