'use strict';

/**
 * Manifest Country Pack — identitas, versi, masa berlaku, kompatibilitas.
 *
 * Kontrak:
 * - Manifest murni data JSON. Kunci yang mengarah ke eksekusi kode
 *   (eval, Function, require, ...) ditolak saat validasi.
 * - version & minFrameworkVersion memakai semver "MAJOR.MINOR.PATCH".
 * - Pack kompatibel bila minFrameworkVersion <= FRAMEWORK_VERSION.
 */

const { assertDate } = require('../domain/organization');
const { ROUNDING_MODES } = require('../domain/money');

const FRAMEWORK_VERSION = '0.1.0';

const FORBIDDEN_KEYS = Object.freeze([
  'script', 'eval', 'handler', 'require', 'import', 'function', 'exec', 'run',
  '__proto__', 'constructor', 'prototype',
]);

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

function findForbiddenKeys(value, path, out) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => findForbiddenKeys(v, `${path}[${i}]`, out));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.includes(key)) out.push(`${path}.${key}`);
      findForbiddenKeys(value[key], `${path}.${key}`, out);
    }
  }
}

/** @returns {string[]} daftar kesalahan (kosong = valid). */
function validateManifest(m) {
  const errors = [];
  if (!m || typeof m !== 'object' || Array.isArray(m)) return ['manifest must be an object'];
  const forbidden = [];
  findForbiddenKeys(m, '$', forbidden);
  for (const f of forbidden) errors.push(`forbidden key (code-execution risk): ${f}`);
  if (!m.id || typeof m.id !== 'string') errors.push('manifest.id is required');
  if (!/^[A-Z]{2}$/.test(m.jurisdiction || '')) {
    errors.push(`manifest.jurisdiction must be 2-letter code, got: ${String(m.jurisdiction)}`);
  }
  if (!SEMVER_RE.test(m.version || '')) errors.push(`manifest.version must be semver, got: ${String(m.version)}`);
  try {
    assertDate(m.validFrom, 'manifest.validFrom');
    assertDate(m.validTo, 'manifest.validTo');
    if (m.validFrom > m.validTo) errors.push(`manifest.validFrom (${m.validFrom}) after validTo (${m.validTo})`);
  } catch (e) {
    errors.push(e.message);
  }
  if (!/^[A-Z]{3}$/.test(m.currency || '')) {
    errors.push(`manifest.currency must be 3-letter code, got: ${String(m.currency)}`);
  }
  if (!m.rounding || typeof m.rounding !== 'object') {
    errors.push('manifest.rounding { mode, decimals } is required');
  } else {
    if (!ROUNDING_MODES.includes(m.rounding.mode)) {
      errors.push(`manifest.rounding.mode must be one of ${ROUNDING_MODES.join(',')}, got: ${m.rounding.mode}`);
    }
    if (!Number.isInteger(m.rounding.decimals) || m.rounding.decimals < 0 || m.rounding.decimals > 3) {
      errors.push(`manifest.rounding.decimals must be an integer 0..3, got: ${m.rounding.decimals}`);
    }
  }
  if (!SEMVER_RE.test(m.minFrameworkVersion || '')) {
    errors.push(`manifest.minFrameworkVersion must be semver, got: ${String(m.minFrameworkVersion)}`);
  } else if (compareSemver(m.minFrameworkVersion, FRAMEWORK_VERSION) > 0) {
    errors.push(`pack needs framework ${m.minFrameworkVersion}, current is ${FRAMEWORK_VERSION}`);
  }
  for (const opt of ['displayName', 'description']) {
    if (m[opt] !== undefined && typeof m[opt] !== 'string') errors.push(`manifest.${opt} must be a string`);
  }
  return errors;
}

function assertValidManifest(m) {
  const errors = validateManifest(m);
  if (errors.length > 0) {
    throw new Error(`Invalid country pack manifest (${m?.id ?? '?'}):\n- ${errors.join('\n- ')}`);
  }
  return m;
}

module.exports = {
  FRAMEWORK_VERSION, FORBIDDEN_KEYS, SEMVER_RE,
  compareSemver, validateManifest, assertValidManifest,
};
