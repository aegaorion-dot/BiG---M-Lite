'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { CountryPackRegistry, loadPackFromDir } = require('../src/countrypack/registry');
const { ID_PACK_DIR } = require('./helpers');

function registryWithID() {
  const registry = new CountryPackRegistry();
  registry.register(loadPackFromDir(ID_PACK_DIR));
  return registry;
}

describe('CountryPack — pemilihan berdasar yurisdiksi & tanggal', () => {
  it('memilih pack Indonesia untuk transaksi ID di dalam masa berlaku', () => {
    const registry = registryWithID();
    const pack = registry.select('ID', '2026-06-01');
    assert.ok(pack);
    assert.equal(pack.manifest.id, 'bigm-pack-id');
  });

  it('batas masa berlaku inklusif; di luar itu null', () => {
    const registry = registryWithID();
    assert.ok(registry.select('ID', '2026-01-01'));
    assert.ok(registry.select('ID', '2026-12-31'));
    assert.equal(registry.select('ID', '2025-12-31'), null);
    assert.equal(registry.select('ID', '2027-01-01'), null);
    assert.equal(registry.select('MY', '2026-06-01'), null);
  });

  it('bila beberapa versi cocok, versi semver tertinggi menang', () => {
    const registry = registryWithID();
    const newer = loadPackFromDir(ID_PACK_DIR);
    newer.manifest = { ...newer.manifest, version: '0.2.0' };
    registry.register(newer);
    assert.equal(registry.select('ID', '2026-06-01').manifest.version, '0.2.0');
    assert.equal(registry.get('bigm-pack-id', '0.1.0').manifest.version, '0.1.0');
  });

  it('menolak pack duplikat id@version', () => {
    const registry = registryWithID();
    assert.throws(() => registry.register(loadPackFromDir(ID_PACK_DIR)), /Duplicate country pack/);
  });
});
