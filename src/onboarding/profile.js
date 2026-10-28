'use strict';

/**
 * Profiling — skema profil terstruktur 9 bagian.
 *
 * Kontrak:
 * - Profil murni data (JSON-serializable); tidak ada kode/fungsi di dalamnya.
 * - validateProfile() fail-closed: profil tidak valid DITOLAK dengan daftar error.
 * - Preferensi pribadi user TIDAK PERNAH disamakan dengan ketentuan hukum org.
 * - Tidak ada tarif pajak di profil; status pajak hanya "pending-verification".
 */

const ISO2_RE = /^[A-Z]{2}$/;
const ISO3_RE = /^[A-Z]{3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCALES = Object.freeze(['id', 'en']);
const MODULES = Object.freeze(['sales', 'purchase', 'accounting', 'reports', 'import']);

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function reqStr(obj, field, errors, { pattern = null, label = null } = {}) {
  const v = obj?.[field];
  const name = label ?? field;
  if (typeof v !== 'string' || v.trim() === '') {
    errors.push(`${name} is required`);
    return null;
  }
  if (pattern && !pattern.test(v.trim())) {
    errors.push(`${name} has invalid format: ${v}`);
    return null;
  }
  return v.trim();
}

function validateUserProfile(p, errors) {
  if (!isObj(p)) { errors.push('userProfile must be an object'); return null; }
  const displayName = reqStr(p, 'displayName', errors, { label: 'userProfile.displayName' });
  const preferredLanguage = reqStr(p, 'preferredLanguage', errors, { label: 'userProfile.preferredLanguage' });
  if (preferredLanguage && !LOCALES.includes(preferredLanguage)) {
    errors.push(`userProfile.preferredLanguage must be one of ${LOCALES.join(',')}`);
  }
  return displayName ? { displayName, preferredLanguage: p.preferredLanguage } : null;
}

function validateOrgProfile(p, errors) {
  if (!isObj(p)) { errors.push('organizationProfile must be an object'); return null; }
  const id = reqStr(p, 'id', errors, { label: 'organizationProfile.id' });
  const name = reqStr(p, 'name', errors, { label: 'organizationProfile.name' });
  const domicile = reqStr(p, 'domicile', errors, { label: 'organizationProfile.domicile', pattern: ISO2_RE });
  const businessField = reqStr(p, 'businessField', errors, { label: 'organizationProfile.businessField' });
  if (!id) return null;
  return { id, name, domicile, businessField };
}

function validateEntities(p, errors) {
  if (!Array.isArray(p) || p.length === 0) { errors.push('entityProfiles must be a non-empty array'); return null; }
  const ids = new Set();
  const out = [];
  p.forEach((e, i) => {
    const where = `entityProfiles[${i}]`;
    if (!isObj(e)) { errors.push(`${where} must be an object`); return; }
    const id = reqStr(e, 'id', errors, { label: `${where}.id` });
    const name = reqStr(e, 'name', errors, { label: `${where}.name` });
    const jurisdiction = reqStr(e, 'jurisdiction', errors, { label: `${where}.jurisdiction`, pattern: ISO2_RE });
    if (id && ids.has(id)) errors.push(`${where}.id duplicate: ${id}`);
    if (id) ids.add(id);
    if (id && name && jurisdiction) out.push({ id, name, jurisdiction });
  });
  return errors.length ? null : out;
}

function validateJurisdictions(p, errors) {
  if (!Array.isArray(p) || p.length === 0) { errors.push('jurisdictionProfiles must be a non-empty array'); return null; }
  const out = [];
  p.forEach((j, i) => {
    const where = `jurisdictionProfiles[${i}]`;
    if (!isObj(j)) { errors.push(`${where} must be an object`); return; }
    const code = reqStr(j, 'code', errors, { label: `${where}.code`, pattern: ISO2_RE });
    const packStatus = j.packStatus ?? 'pending-validation';
    if (!['available', 'pending-validation', 'unavailable'].includes(packStatus)) {
      errors.push(`${where}.packStatus must be available|pending-validation|unavailable`);
    }
    if (code) out.push({ code, packStatus, taxStatus: 'pending-verification' });
  });
  return errors.length ? null : out;
}

function validateCurrency(p, errors) {
  if (!isObj(p)) { errors.push('currencyProfile must be an object'); return null; }
  const functional = reqStr(p, 'functional', errors, { label: 'currencyProfile.functional', pattern: ISO3_RE });
  const others = p.otherCurrencies ?? [];
  if (!Array.isArray(others)) { errors.push('currencyProfile.otherCurrencies must be an array'); return null; }
  for (const c of others) {
    if (typeof c !== 'string' || !ISO3_RE.test(c)) errors.push(`currencyProfile.otherCurrencies has invalid code: ${c}`);
  }
  if (functional && others.includes(functional)) errors.push('currencyProfile.otherCurrencies must not repeat functional');
  return functional ? { functional, otherCurrencies: [...others] } : null;
}

function validateLanguage(p, errors) {
  if (!isObj(p)) { errors.push('languageProfile must be an object'); return null; }
  const ui = reqStr(p, 'ui', errors, { label: 'languageProfile.ui' });
  if (ui && !LOCALES.includes(ui)) errors.push(`languageProfile.ui must be one of ${LOCALES.join(',')}`);
  return ui ? { ui } : null;
}

function validateAccounting(p, errors) {
  if (!isObj(p)) { errors.push('accountingConfiguration must be an object'); return null; }
  const periodStart = reqStr(p, 'periodStart', errors, { label: 'accountingConfiguration.periodStart', pattern: DATE_RE });
  const periodEnd = reqStr(p, 'periodEnd', errors, { label: 'accountingConfiguration.periodEnd', pattern: DATE_RE });
  if (periodStart && periodEnd && periodStart > periodEnd) {
    errors.push('accountingConfiguration.periodStart must not be after periodEnd');
  }
  return periodStart ? { periodStart, periodEnd } : null;
}

function validateTax(p, errors) {
  if (!isObj(p)) { errors.push('taxConfiguration must be an object'); return null; }
  if (p.status !== 'pending-verification') {
    errors.push('taxConfiguration.status must be pending-verification (no final liability without verified rules)');
  }
  return { status: 'pending-verification' };
}

function validateModules(p, errors) {
  if (!Array.isArray(p) || p.length === 0) { errors.push('moduleConfiguration must be a non-empty array'); return null; }
  for (const m of p) {
    if (!MODULES.includes(m)) errors.push(`moduleConfiguration has unknown module: ${m}`);
  }
  return errors.length ? null : [...p];
}

function validateProfile(profile) {
  const errors = [];
  if (!isObj(profile)) return { ok: false, errors: ['profile must be an object'] };
  const userProfile = validateUserProfile(profile.userProfile, errors);
  const organizationProfile = validateOrgProfile(profile.organizationProfile, errors);
  const entityProfiles = validateEntities(profile.entityProfiles, errors);
  const jurisdictionProfiles = validateJurisdictions(profile.jurisdictionProfiles, errors);
  const currencyProfile = validateCurrency(profile.currencyProfile, errors);
  const languageProfile = validateLanguage(profile.languageProfile, errors);
  const accountingConfiguration = validateAccounting(profile.accountingConfiguration, errors);
  const taxConfiguration = validateTax(profile.taxConfiguration, errors);
  const moduleConfiguration = validateModules(profile.moduleConfiguration, errors);
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    profile: Object.freeze({
      userProfile, organizationProfile, entityProfiles, jurisdictionProfiles,
      currencyProfile, languageProfile, accountingConfiguration,
      taxConfiguration, moduleConfiguration,
      version: 1,
    }),
  };
}

function blankProfile() {
  return {
    userProfile: { displayName: '', preferredLanguage: 'id' },
    organizationProfile: { id: '', name: '', domicile: '', businessField: '' },
    entityProfiles: [],
    jurisdictionProfiles: [],
    currencyProfile: { functional: '', otherCurrencies: [] },
    languageProfile: { ui: 'id' },
    accountingConfiguration: { periodStart: '2026-01-01', periodEnd: '2026-12-31' },
    taxConfiguration: { status: 'pending-verification' },
    moduleConfiguration: ['sales', 'purchase', 'accounting', 'reports'],
  };
}

module.exports = { validateProfile, blankProfile, LOCALES, MODULES };
