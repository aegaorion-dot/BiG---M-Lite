'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Money } = require('../src/domain/money');

describe('Money — presisi integer tanpa float', () => {
  it('0.1 + 0.2 tepat sama dengan 0.3 (string desimal, bukan float)', () => {
    const sum = Money.fromMajor('0.1', 'USD').add(Money.fromMajor('0.2', 'USD'));
    assert.ok(sum.equals(Money.fromMajor('0.3', 'USD')));
    assert.equal(sum.amountMinor, 30n);
  });

  it('fromMajor menolak tipe Number (jalur float tidak boleh masuk)', () => {
    assert.throws(() => Money.fromMajor(0.1, 'USD'), /decimal string/);
  });

  it('menolak desimal berlebih untuk mata uang 0-desimal (IDR)', () => {
    assert.throws(() => Money.fromMajor('10.5', 'IDR'), /Too many decimals/);
    assert.equal(Money.fromMajor('10', 'IDR').amountMinor, 10n);
  });

  it('menolak operasi beda mata uang', () => {
    const idr = Money.fromMajor('10', 'IDR');
    const usd = Money.fromMajor('10.00', 'USD');
    assert.throws(() => idr.add(usd), /Currency mismatch/);
    assert.throws(() => idr.sub(usd), /Currency mismatch/);
    assert.throws(() => idr.equals(usd), /Currency mismatch/);
  });

  it('multiplyRational memakai integer murni dengan mode pembulatan', () => {
    const ribu = Money.fromMinor('1000', 'IDR');
    assert.equal(ribu.multiplyRational(100, 1000).amountMinor, 100n); // 10%
    const one = Money.fromMinor('1', 'IDR');
    assert.equal(one.multiplyRational(1, 2, 'HALF_UP').amountMinor, 1n);
    assert.equal(one.multiplyRational(1, 2, 'DOWN').amountMinor, 0n);
    assert.equal(one.multiplyRational(1, 2, 'UP').amountMinor, 1n);
    assert.throws(() => ribu.multiplyRational(1, 0), /division by zero/);
    assert.throws(() => ribu.multiplyRational(1, 2, 'BANKERS'), /Unknown rounding/);
  });

  it('HALF_UP pada nilai negatif menjauhi nol secara simetris', () => {
    const neg = Money.fromMinor('-3', 'IDR');
    assert.equal(neg.multiplyRational(1, 2, 'HALF_UP').amountMinor, -2n);
    assert.equal(neg.multiplyRational(1, 2, 'DOWN').amountMinor, -1n);
  });

  it('toMajorString roundtrip akurat', () => {
    assert.equal(Money.fromMajor('123.45', 'USD').toMajorString(), '123.45');
    assert.equal(Money.fromMajor('-0.05', 'USD').toMajorString(), '-0.05');
    assert.equal(Money.fromMinor('5', 'IDR').toMajorString(), '5');
    assert.ok(Object.isFrozen(Money.zero('IDR')));
  });
});
