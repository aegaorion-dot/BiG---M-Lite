'use strict';

/**
 * CountryPackRegistry — pendaftaran & pemilihan pack.
 *
 * Kontrak:
 * - register() memvalidasi manifest + isi; pack tidak valid ditolak.
 * - select(jurisdiction, date): pack yang masa berlakunya memuat tanggal
 *   transaksi; bila beberapa cocok, versi semver tertinggi menang.
 * - Pack dimuat sebagai JSON murni (JSON.parse); tidak ada require/eval
 *   terhadap file pack, sehingga konfigurasi tidak bisa menjalankan kode.
 */

const fs = require('node:fs');
const path = require('node:path');
const { assertDate } = require('../domain/organization');
const { assertValidManifest, compareSemver } = require('./manifest');
const { assertValidPackContent } = require('./rules');

function packKey(id, version) {
  return `${id}@${version}`;
}

class CountryPackRegistry {
  constructor() {
    this._packs = new Map();
  }

  register(pack) {
    if (!pack || typeof pack !== 'object') throw new Error('register() expects a pack object');
    assertValidManifest(pack.manifest);
    assertValidPackContent(pack);
    const key = packKey(pack.manifest.id, pack.manifest.version);
    if (this._packs.has(key)) throw new Error(`Duplicate country pack: ${key}`);
    this._packs.set(key, Object.freeze({ ...pack }));
    return key;
  }

  get(id, version) {
    return this._packs.get(packKey(id, version)) ?? null;
  }

  list() {
    return [...this._packs.values()];
  }

  /**
   * Pilih pack untuk yurisdiksi + tanggal transaksi.
   * @returns {object|null} pack terbaik atau null bila tidak ada yang cocok.
   */
  select(jurisdiction, dateStr) {
    if (!/^[A-Z]{2}$/.test(jurisdiction || '')) {
      throw new Error(`select jurisdiction must be 2-letter code, got: ${String(jurisdiction)}`);
    }
    assertDate(dateStr, 'select date');
    const candidates = [...this._packs.values()].filter(
      (p) => p.manifest.jurisdiction === jurisdiction
        && p.manifest.validFrom <= dateStr
        && dateStr <= p.manifest.validTo,
    );
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => compareSemver(b.manifest.version, a.manifest.version));
    return candidates[0];
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** Muat pack dari direktori berisi manifest.json, tax-categories.json, accounts.json, rules.json. */
function loadPackFromDir(dir) {
  const manifest = readJson(path.join(dir, 'manifest.json'));
  const taxCategories = readJson(path.join(dir, 'tax-categories.json'));
  const accounts = readJson(path.join(dir, 'accounts.json'));
  const rules = readJson(path.join(dir, 'rules.json'));
  return { manifest, taxCategories, accounts, rules };
}

module.exports = { CountryPackRegistry, loadPackFromDir, packKey };
