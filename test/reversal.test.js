'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Money } = require('../src/domain/money');
const { ReversalService } = require('../src/accounting/reversalService');
const { makeContext, balancedEntry } = require('./helpers');

describe('Reversal — koreksi tepat tanpa mengubah aslinya', () => {
  it('reversal membuat saldo bersih nol dan asli tidak berubah', () => {
    const ctx = makeContext();
    const original = balancedEntry({ id: 'j-orig', minor: '2500' });
    ctx.posting.post(original, { idempotencyKey: 'k-orig' });
    const before = JSON.stringify(original.lines.map((l) => [l.accountId, l.side, l.money.amountMinor.toString()]));

    const reversals = new ReversalService({ posting: ctx.posting });
    const { entry, receipt } = reversals.reverse(original, {
      id: 'j-rev', date: '2026-07-01', idempotencyKey: 'k-rev',
    });
    assert.equal(entry.reversalOf, 'j-orig');
    assert.equal(receipt.postingId, 'j-rev');
    assert.ok(entry.finalized);

    const balances = ctx.ledger.balances('IDR');
    assert.ok((balances.get('id-expense') ?? Money.zero('IDR')).isZero());
    assert.ok((balances.get('id-cash') ?? Money.zero('IDR')).isZero());
    const after = JSON.stringify(original.lines.map((l) => [l.accountId, l.side, l.money.amountMinor.toString()]));
    assert.equal(after, before);
    assert.ok(Object.isFrozen(original));
  });

  it('menolak reversal atas jurnal yang belum finalize', () => {
    const ctx = makeContext();
    const reversals = new ReversalService({ posting: ctx.posting });
    assert.throws(
      () => reversals.reverse(balancedEntry({ id: 'j-draft' }), { id: 'j-r', date: '2026-07-01' }),
      /Only a finalized journal/,
    );
  });

  it('reversal idempotent terhadap kunci yang sama', () => {
    const ctx = makeContext();
    const original = balancedEntry({ id: 'j-o2' });
    ctx.posting.post(original, { idempotencyKey: 'k-o2' });
    const reversals = new ReversalService({ posting: ctx.posting });
    const first = reversals.reverse(original, { id: 'j-r2', date: '2026-07-01', idempotencyKey: 'k-r2' });
    const second = reversals.reverse(original, { id: 'j-r2', date: '2026-07-01', idempotencyKey: 'k-r2' });
    assert.deepEqual(first.receipt, second.receipt);
    assert.equal(ctx.ledger.size, 2);
  });
});
