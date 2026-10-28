'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Money } = require('../src/domain/money');
const { CountryPackRegistry, loadPackFromDir } = require('../src/countrypack/registry');
const { determineTax } = require('../src/tax/taxEngine');
const { ID_PACK_DIR, makeFinalPackFixture } = require('./helpers');

function mutateManifest(mutator) {
  const pack = loadPackFromDir(ID_PACK_DIR);
  mutator(pack.manifest);
  return pack;
}

describe('CountryPack — penolakan manifest/rule tidak valid', () => {
  it('menolak semver buruk, rentang tanggal terbalik, dan framework masa depan', () => {
    const registry = new CountryPackRegistry();
    assert.throws(() => registry.register(mutateManifest((m) => { m.version = '1.0'; })), /semver/);
    assert.throws(() => registry.register(mutateManifest((m) => { m.validFrom = '2027-01-01'; })), /after validTo/);
    assert.throws(
      () => registry.register(mutateManifest((m) => { m.minFrameworkVersion = '99.0.0'; })),
      /needs framework/,
    );
    assert.equal(registry.list().length, 0);
  });

  it('menolak kunci terlarang (risiko eksekusi kode dari konfigurasi)', () => {
    const registry = new CountryPackRegistry();
    const evil = mutateManifest((m) => { m.eval = '1+1'; });
    assert.throws(() => registry.register(evil), /forbidden key/);
    const evilRule = loadPackFromDir(ID_PACK_DIR);
    evilRule.rules = [{ ...evilRule.rules[0], id: 'X', constructor: 'Function("x")' }];
    assert.throws(() => registry.register(evilRule), /forbidden key/);
  });

  it('menolak rule non-placeholder tanpa sumber terverifikasi', () => {
    const registry = new CountryPackRegistry();
    const pack = loadPackFromDir(ID_PACK_DIR);
    pack.rules = [{
      id: 'ID-BAD-001', category: 'PPN', description: 'tanpa sumber',
      placeholder: false, action: { kind: 'rate', perMille: 110 },
      condition: { all: [{ field: 'jurisdiction', op: 'eq', value: 'ID' }] },
    }];
    assert.throws(() => registry.register(pack), /verified source/);
  });

  it('menolak rule dengan kategori tak dikenal, operator liar, dan id ganda', () => {
    const registry = new CountryPackRegistry();
    const badCat = loadPackFromDir(ID_PACK_DIR);
    badCat.rules = [{ ...badCat.rules[0], id: 'X1', category: 'TIDAK-ADA' }];
    assert.throws(() => registry.register(badCat), /unknown/);

    const badOp = loadPackFromDir(ID_PACK_DIR);
    badOp.rules = [{ ...badOp.rules[0], id: 'X2', condition: { all: [{ field: 'jurisdiction', op: 'regex', value: '.*' }] } }];
    assert.throws(() => registry.register(badOp), /op must be/);

    const dup = loadPackFromDir(ID_PACK_DIR);
    dup.rules = [dup.rules[0], { ...dup.rules[0] }];
    assert.throws(() => registry.register(dup), /duplicate/);
  });

  it('rule placeholder TIDAK PERNAH menghasilkan kewajiban final', () => {
    const pack = loadPackFromDir(ID_PACK_DIR);
    const tax = determineTax({
      jurisdiction: 'ID', currency: 'IDR', kind: 'REVENUE',
      total: Money.fromMajor('10000000', 'IDR'),
    }, pack);
    assert.ok(tax.findings.length >= 1);
    for (const f of tax.findings) {
      assert.equal(f.status, 'PLACEHOLDER');
      assert.equal(f.amount, null);
    }
    assert.ok(tax.finalTotal.isZero());
    assert.equal(tax.hasPlaceholder, true);
  });

  it('rule FINAL sintetik (sumber fixture) dihitung deterministik', () => {
    const registry = new CountryPackRegistry();
    registry.register(makeFinalPackFixture());
    const pack = registry.select('ID', '2026-06-01');
    const tax = determineTax({
      jurisdiction: 'ID', currency: 'IDR', kind: 'REVENUE',
      total: Money.fromMinor('1000000', 'IDR'),
    }, pack);
    assert.equal(tax.findings[0].status, 'FINAL');
    assert.equal(tax.findings[0].amount.amountMinor, 100000n);
    assert.equal(tax.hasPlaceholder, false);
  });
});
