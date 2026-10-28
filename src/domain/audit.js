'use strict';

/**
 * AuditTrail & IdempotencyStore.
 *
 * Kontrak:
 * - AuditTrail append-only dengan rantai hash SHA-256 (tamper-evident).
 * - verifyChain() mendeteksi entri yang diubah/disisipkan/dihapus.
 * - IdempotencyStore memetakan idempotencyKey -> respons, mencegah posting ganda.
 */

const { createHash } = require('node:crypto');

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}}`;
}

function hashEntry({ seq, ts, actor, action, entityType, entityId, detail, prevHash }) {
  return createHash('sha256')
    .update(stableStringify({ seq, ts, actor, action, entityType, entityId, detail, prevHash }))
    .digest('hex');
}

class AuditTrail {
  constructor() {
    this._entries = [];
  }

  record({ actor, action, entityType, entityId, detail = null, ts = null }) {
    if (!actor || typeof actor !== 'string') throw new Error('Audit actor is required');
    if (!action || typeof action !== 'string') throw new Error('Audit action is required');
    if (!entityType || typeof entityType !== 'string') throw new Error('Audit entityType is required');
    if (!entityId || typeof entityId !== 'string') throw new Error('Audit entityId is required');
    const seq = this._entries.length + 1;
    const prevHash = seq === 1 ? 'GENESIS' : this._entries[seq - 2].hash;
    const entry = {
      seq,
      ts: ts ?? new Date().toISOString(),
      actor,
      action,
      entityType,
      entityId,
      detail: detail ?? null,
      prevHash,
    };
    entry.hash = hashEntry(entry);
    Object.freeze(entry);
    this._entries.push(entry);
    return entry;
  }

  list() {
    return [...this._entries];
  }

  get size() {
    return this._entries.length;
  }

  verifyChain() {
    return AuditTrail.verify(this._entries);
  }

  static verify(entries) {
    let prevHash = 'GENESIS';
    for (let i = 0; i < entries.length; i += 1) {
      const e = entries[i];
      if (e.seq !== i + 1) return { ok: false, brokenAt: e.seq ?? i + 1, reason: 'sequence gap' };
      if (e.prevHash !== prevHash) return { ok: false, brokenAt: e.seq, reason: 'prevHash mismatch' };
      if (e.hash !== hashEntry(e)) return { ok: false, brokenAt: e.seq, reason: 'hash mismatch (tampered?)' };
      prevHash = e.hash;
    }
    return { ok: true, brokenAt: null, reason: null };
  }
}

class IdempotencyStore {
  constructor() {
    this._map = new Map();
  }

  get(key) {
    return this._map.get(key) ?? null;
  }

  has(key) {
    return this._map.has(key);
  }

  set(key, response) {
    if (!key || typeof key !== 'string') throw new Error('Idempotency key is required');
    if (this._map.has(key)) throw new Error(`Idempotency key already stored: ${key}`);
    this._map.set(key, response);
    return response;
  }

  get size() {
    return this._map.size;
  }
}

module.exports = { AuditTrail, IdempotencyStore, stableStringify };
