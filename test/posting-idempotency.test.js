'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { makeContext, balancedEntry } = require('./helpers');

describe('Posting — idempotensi & periode', () => {
  it('request ulang dengan kunci sama tidak memposting ganda', () => {
    const ctx = makeContext();
    const r1 = ctx.posting.post(balancedEntry({ id: 'j-a' }), { actor: 't', idempotencyKey: 'k-1' });
    const r2 = ctx.posting.post(balancedEntry({ id: 'j-a' }), { actor: 't', idempotencyKey: 'k-1' });
    assert.deepEqual(r1, r2);
    assert.equal(ctx.ledger.size, 1);
    assert.equal(ctx.audit.size, 1); // replay tidak menambah audit posting
  });

  it('kunci berbeda menghasilkan posting berbeda', () => {
    const ctx = makeContext();
    ctx.posting.post(balancedEntry({ id: 'j-a' }), { idempotencyKey: 'k-1' });
    ctx.posting.post(balancedEntry({ id: 'j-b' }), { idempotencyKey: 'k-2' });
    assert.equal(ctx.ledger.size, 2);
  });

  it('idempotencyKey wajib diisi', () => {
    const ctx = makeContext();
    assert.throws(() => ctx.posting.post(balancedEntry({ id: 'j-x' }), {}), /idempotencyKey is required/);
  });

  it('menolak posting ke periode CLOSED', () => {
    const ctx = makeContext();
    const closed = ctx.periods.findFor('org-contoh', '2026-06-01').close();
    ctx.periods.replace(closed);
    assert.throws(
      () => ctx.posting.post(balancedEntry({ id: 'j-c' }), { idempotencyKey: 'k-c' }),
      /is CLOSED/,
    );
    assert.equal(ctx.ledger.size, 0);
  });

  it('menolak posting di luar periode yang ada', () => {
    const ctx = makeContext({ periodStart: '2026-01-01', periodEnd: '2026-01-31' });
    assert.throws(
      () => ctx.posting.post(balancedEntry({ id: 'j-d', date: '2026-06-01' }), { idempotencyKey: 'k-d' }),
      /No financial period/,
    );
  });

  it('jurnal tidak seimbang tidak pernah masuk ledger', () => {
    const ctx = makeContext();
    const bad = balancedEntry({ id: 'j-e' });
    bad.lines.push(bad.lines[0]); // rusak: debit ganda
    assert.throws(() => ctx.posting.post(bad, { idempotencyKey: 'k-e' }), /Unbalanced/);
    assert.equal(ctx.ledger.size, 0);
  });
});
