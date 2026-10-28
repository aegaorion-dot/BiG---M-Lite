'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { AuditTrail, IdempotencyStore } = require('../src/domain/audit');

describe('AuditTrail — rantai hash tamper-evident', () => {
  it('mencatat berurutan dan rantai terverifikasi', () => {
    const audit = new AuditTrail();
    audit.record({ actor: 'app', action: 'POST', entityType: 'journal', entityId: 'j1', ts: '2026-01-01T00:00:00.000Z' });
    audit.record({ actor: 'app', action: 'POST', entityType: 'journal', entityId: 'j2', ts: '2026-01-01T00:00:01.000Z' });
    assert.equal(audit.size, 2);
    const [e1, e2] = audit.list();
    assert.equal(e1.seq, 1);
    assert.equal(e2.prevHash, e1.hash);
    assert.deepEqual(audit.verifyChain(), { ok: true, brokenAt: null, reason: null });
    assert.ok(Object.isFrozen(e1));
  });

  it('mendeteksi entri yang diubah (hash mismatch)', () => {
    const audit = new AuditTrail();
    audit.record({ actor: 'app', action: 'POST', entityType: 'journal', entityId: 'j1' });
    audit.record({ actor: 'app', action: 'POST', entityType: 'journal', entityId: 'j2' });
    const tampered = JSON.parse(JSON.stringify(audit.list()));
    tampered[0].entityId = 'j999';
    const result = AuditTrail.verify(tampered);
    assert.equal(result.ok, false);
    assert.equal(result.brokenAt, 1);
  });

  it('mendeteksi celah urutan (penghapusan entri)', () => {
    const audit = new AuditTrail();
    audit.record({ actor: 'a', action: 'X', entityType: 'e', entityId: '1' });
    audit.record({ actor: 'a', action: 'X', entityType: 'e', entityId: '2' });
    const gapped = audit.list().slice(1);
    assert.equal(AuditTrail.verify(gapped).ok, false);
  });
});

describe('IdempotencyStore — kunci respons', () => {
  it('menyimpan dan menolak penulisan ganda', () => {
    const store = new IdempotencyStore();
    assert.equal(store.get('k'), null);
    store.set('k', { postingId: 'j1' });
    assert.deepEqual(store.get('k'), { postingId: 'j1' });
    assert.throws(() => store.set('k', { postingId: 'j2' }), /already stored/);
  });
});
