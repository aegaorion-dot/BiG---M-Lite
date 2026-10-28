'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Money } = require('../src/domain/money');
const { JournalEntry, JournalLine } = require('../src/domain/journal');

function line(accountId, side, minor, currency = 'IDR') {
  return new JournalLine({ accountId, side, money: Money.fromMinor(minor, currency) });
}

describe('Journal — debit wajib sama dengan kredit', () => {
  it('jurnal seimbang lolos finalize dan menjadi immutable', () => {
    const entry = new JournalEntry({
      id: 'j-1', orgId: 'org', date: '2026-06-01', currency: 'IDR',
      lines: [line('a', 'DEBIT', '500'), line('b', 'CREDIT', '500')],
    });
    assert.ok(entry.isBalanced());
    entry.finalize(() => '2026-06-01T00:00:00.000Z');
    assert.equal(entry.finalized, true);
    assert.ok(Object.isFrozen(entry));
    assert.throws(() => { entry.memo = 'diubah diam-diam'; }, TypeError);
    assert.throws(() => { entry.lines.push(line('c', 'DEBIT', '1')); }, TypeError);
  });

  it('jurnal tidak seimbang ditolak dengan pesan jelas', () => {
    const entry = new JournalEntry({
      id: 'j-2', orgId: 'org', date: '2026-06-01', currency: 'IDR',
      lines: [line('a', 'DEBIT', '500'), line('b', 'CREDIT', '499')],
    });
    assert.equal(entry.isBalanced(), false);
    assert.throws(() => entry.finalize(), /Unbalanced journal j-2/);
  });

  it('menolak baris beda mata uang', () => {
    assert.throws(() => new JournalEntry({
      id: 'j-3', orgId: 'org', date: '2026-06-01', currency: 'IDR',
      lines: [line('a', 'DEBIT', '500', 'IDR'), line('b', 'CREDIT', '500', 'USD')],
    }), /differs from journal/);
  });

  it('menolak jurnal satu baris dan baris bernilai nol', () => {
    assert.throws(() => new JournalEntry({
      id: 'j-4', orgId: 'org', date: '2026-06-01', currency: 'IDR',
      lines: [line('a', 'DEBIT', '500')],
    }), /at least 2 lines/);
    assert.throws(() => line('a', 'DEBIT', '0'), /must not be zero/);
    assert.throws(() => line('a', 'DEBIT', '-5'), /must not be negative/);
  });

  it('finalize idempotent bila sudah final', () => {
    const entry = new JournalEntry({
      id: 'j-5', orgId: 'org', date: '2026-06-01', currency: 'IDR',
      lines: [line('a', 'DEBIT', '100'), line('b', 'CREDIT', '100')],
    });
    entry.finalize(() => 't1');
    entry.finalize(() => 't2');
    assert.equal(entry.finalizedAt, 't1');
  });
});
