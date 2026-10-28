'use strict';

/**
 * Evidence-based profiling layer (P1 final enhancement §1).
 * Wraps existing slots without changing Accounting Engine.
 *
 * Fact metadata: value, status, source, supportingQuote, confidence.
 * - status: UNKNOWN | CANDIDATE | CONFIRMED | REJECTED
 * - source: USER | AI_INFERENCE
 * Rules:
 * - Only USER-stated facts with a verbatim quote can become CONFIRMED.
 * - AI must not fabricate quotes: quote must occur in referenced user text.
 * - Answer changes invalidate related confirmations.
 * - Only the short quote is stored per fact, never the full history.
 * - Active business values are untouched until a new config is approved.
 */

const STATUSES = Object.freeze(['UNKNOWN', 'CANDIDATE', 'CONFIRMED', 'REJECTED']);
const SOURCES = Object.freeze(['USER', 'AI_INFERENCE']);

function normalizeText(t) {
  return String(t ?? '').trim().replace(/\s+/g, ' ');
}

function verifyQuote(quote, userText) {
  const q = normalizeText(quote).toLowerCase();
  const u = normalizeText(userText).toLowerCase();
  if (!q) return false;
  if (q.length > 200) return false;
  return u.includes(q);
}

function createEvidenceFact({ slot, value, source = 'AI_INFERENCE', supportingQuote = null, confidence = null, userText = '' }) {
  const errors = [];
  if (!slot || typeof slot !== 'string') errors.push('slot is required');
  if (value === undefined || value === null || value === '') errors.push('value is required');
  if (!SOURCES.includes(source)) errors.push(`source must be one of ${SOURCES.join(',')}`);
  let status = 'CANDIDATE';
  if (source === 'AI_INFERENCE') {
    status = 'CANDIDATE';
    if (supportingQuote !== null && supportingQuote !== undefined && supportingQuote !== '') {
      if (!verifyQuote(supportingQuote, userText)) errors.push('supportingQuote must occur verbatim in user message');
    }
  } else {
    if (!supportingQuote || !verifyQuote(supportingQuote, userText)) {
      errors.push('USER facts require a verbatim supportingQuote from the user message');
    } else {
      status = 'CONFIRMED';
    }
  }
  let conf = null;
  if (confidence !== null && confidence !== undefined) {
    conf = Number(confidence);
    if (!Number.isFinite(conf) || conf < 0 || conf > 1) errors.push('confidence must be 0-1');
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    fact: {
      slot, value,
      status, source,
      supportingQuote: supportingQuote ? normalizeText(supportingQuote).slice(0, 200) : null,
      confidence: conf,
    },
  };
}

function applyEvidenceFacts(slotMap, facts, userText = '') {
  const next = JSON.parse(JSON.stringify(slotMap));
  const errors = [];
  for (const f of facts ?? []) {
    const slot = next[f.slot];
    if (!slot) { errors.push(`unknown slot: ${f.slot}`); continue; }
    const prev = { value: slot.value, status: slot.evidenceStatus ?? null };
    if (f.source === 'USER') {
      const checked = createEvidenceFact({ ...f, source: 'USER', userText });
      if (!checked.ok) { errors.push(...checked.errors.map((e) => `${f.slot}: ${e}`)); continue; }
      if (prev.value !== null && prev.value !== undefined && prev.value !== '' && JSON.stringify(prev.value) !== JSON.stringify(f.value)) {
        slot.confirmationInvalidated = true;
      }
      slot.value = f.value;
      slot.evidenceStatus = 'CONFIRMED';
      slot.status = 'validated';
      slot.source = 'user';
      slot.supportingQuote = checked.fact.supportingQuote;
      slot.confidence = checked.fact.confidence;
    } else {
      if (f.supportingQuote && !verifyQuote(f.supportingQuote, userText)) {
        errors.push(`${f.slot}: supportingQuote must occur verbatim in user message`);
        continue;
      }
      if (prev.value !== null && prev.value !== undefined && prev.value !== '' && JSON.stringify(prev.value) !== JSON.stringify(f.value)) {
        slot.confirmationInvalidated = true;
        slot.evidenceStatus = 'CANDIDATE';
        slot.status = 'proposed';
      } else if (slot.evidenceStatus !== 'CONFIRMED') {
        slot.evidenceStatus = slot.evidenceStatus ?? 'CANDIDATE';
        if (slot.status === 'unconfigured') slot.status = 'proposed';
      }
      if (slot.evidenceStatus !== 'CONFIRMED') {
        slot.value = f.value;
        slot.source = 'ai';
        if (f.supportingQuote) slot.supportingQuote = normalizeText(f.supportingQuote).slice(0, 200);
        if (typeof f.confidence === 'number') slot.confidence = f.confidence;
      }
    }
  }
  return { slots: next, errors };
}

function confirmSlot(slotMap, key) {
  const next = JSON.parse(JSON.stringify(slotMap));
  const slot = next[key];
  if (!slot) return { ok: false, errors: [`unknown slot: ${key}`] };
  if (slot.confirmationInvalidated) return { ok: false, errors: [`${key}: confirmation invalidated by changed answer`] };
  if (slot.value === null || slot.value === '' || (Array.isArray(slot.value) && slot.value.length === 0)) {
    return { ok: false, errors: [`${key}: nothing to confirm`] };
  }
  slot.evidenceStatus = 'CONFIRMED';
  slot.status = 'validated';
  return { ok: true, slots: next };
}

module.exports = { STATUSES, SOURCES, verifyQuote, createEvidenceFact, applyEvidenceFacts, confirmSlot };
