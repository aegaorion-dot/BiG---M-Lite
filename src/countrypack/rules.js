'use strict';

/**
 * Validasi isi Country Pack: kategori pajak, mapping akun, rule registry.
 *
 * Kontrak:
 * - Rule deklaratif (data JSON saja). Kondisi hanya memakai field & operator
 *   allowlist yang dievaluasi TaxEngine — tidak ada ekspresi/kode dari pack.
 * - Rule non-placeholder WAJIB punya sumber terverifikasi (source) + aksi
 *   rate|exempt. Tanpa itu, rule harus placeholder dan tidak menghasilkan
 *   kewajiban final.
 */

const { ACCOUNT_TYPES } = require('../domain/chartOfAccounts');
const { CONDITION_FIELDS, CONDITION_OPS } = require('../tax/taxEngine');
const { FORBIDDEN_KEYS } = require('./manifest');

function collectForbidden(value, path, out) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectForbidden(v, `${path}[${i}]`, out));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.includes(key)) out.push(`${path}.${key}`);
      collectForbidden(value[key], `${path}.${key}`, out);
    }
  }
}

const TAX_CATEGORY_STATUS = Object.freeze(['PLACEHOLDER', 'FINAL']);
const RULE_ACTION_KINDS = Object.freeze(['rate', 'exempt', 'manual']);

function validateTaxCategories(cats) {
  const errors = [];
  if (!Array.isArray(cats)) return ['taxCategories must be an array'];
  const seen = new Set();
  cats.forEach((c, i) => {
    const where = `taxCategories[${i}]`;
    if (!c || typeof c !== 'object') { errors.push(`${where} must be an object`); return; }
    if (!c.code || typeof c.code !== 'string') errors.push(`${where}.code is required`);
    else if (seen.has(c.code)) errors.push(`${where}.code duplicate: ${c.code}`);
    else seen.add(c.code);
    if (!c.name || typeof c.name !== 'string') errors.push(`${where}.name is required`);
    if (!TAX_CATEGORY_STATUS.includes(c.status)) {
      errors.push(`${where}.status must be PLACEHOLDER|FINAL, got: ${c.status}`);
    }
    if (c.status === 'FINAL' && (!c.source || typeof c.source !== 'string')) {
      errors.push(`${where}: FINAL category needs a verified source reference`);
    }
    if (c.source !== undefined && c.source !== null && typeof c.source !== 'string') {
      errors.push(`${where}.source must be a string or null`);
    }
    if (c.note !== undefined && c.note !== null && typeof c.note !== 'string') {
      errors.push(`${where}.note must be a string or null`);
    }
  });
  return errors;
}

function validateAccounts(accounts) {
  const errors = [];
  if (!Array.isArray(accounts) || accounts.length === 0) return ['accounts must be a non-empty array'];
  const ids = new Set();
  const codes = new Set();
  accounts.forEach((a, i) => {
    const where = `accounts[${i}]`;
    if (!a || typeof a !== 'object') { errors.push(`${where} must be an object`); return; }
    if (!a.id || typeof a.id !== 'string') errors.push(`${where}.id is required`);
    else if (ids.has(a.id)) errors.push(`${where}.id duplicate: ${a.id}`);
    else ids.add(a.id);
    if (!a.code || typeof a.code !== 'string') errors.push(`${where}.code is required`);
    else if (codes.has(a.code)) errors.push(`${where}.code duplicate: ${a.code}`);
    else codes.add(a.code);
    if (!a.name || typeof a.name !== 'string') errors.push(`${where}.name is required`);
    if (!ACCOUNT_TYPES.includes(a.type)) {
      errors.push(`${where}.type must be one of ${ACCOUNT_TYPES.join(',')}, got: ${a.type}`);
    }
  });
  return errors;
}

function validateCondition(cond, where, errors) {
  if (cond === undefined || cond === null) return;
  if (!cond || typeof cond !== 'object' || !Array.isArray(cond.all)) {
    errors.push(`${where}.condition must be { all: [...] }`);
    return;
  }
  cond.all.forEach((atom, i) => {
    const aw = `${where}.condition.all[${i}]`;
    if (!atom || typeof atom !== 'object') { errors.push(`${aw} must be an object`); return; }
    if (!CONDITION_FIELDS.includes(atom.field)) {
      errors.push(`${aw}.field must be one of ${CONDITION_FIELDS.join(',')}, got: ${atom.field}`);
    }
    if (!CONDITION_OPS.includes(atom.op)) {
      errors.push(`${aw}.op must be one of ${CONDITION_OPS.join(',')}, got: ${atom.op}`);
    }
    if (typeof atom.value !== 'string') errors.push(`${aw}.value must be a string`);
  });
}

function validateRules(rules, taxCategories) {
  const errors = [];
  if (!Array.isArray(rules)) return ['rules must be an array'];
  const knownCategories = new Set((taxCategories ?? []).map((c) => c?.code));
  const seen = new Set();
  rules.forEach((r, i) => {
    const where = `rules[${i}]`;
    if (!r || typeof r !== 'object') { errors.push(`${where} must be an object`); return; }
    if (!r.id || typeof r.id !== 'string') errors.push(`${where}.id is required`);
    else if (seen.has(r.id)) errors.push(`${where}.id duplicate: ${r.id}`);
    else seen.add(r.id);
    if (!r.category || typeof r.category !== 'string') errors.push(`${where}.category is required`);
    else if (!knownCategories.has(r.category)) {
      errors.push(`${where}.category unknown: ${r.category}`);
    }
    if (!r.description || typeof r.description !== 'string') errors.push(`${where}.description is required`);
    if (typeof r.placeholder !== 'boolean') {
      errors.push(`${where}.placeholder must be boolean`);
      return;
    }
    validateCondition(r.condition, where, errors);
    const action = r.action;
    if (r.placeholder) {
      if (action !== undefined && action?.kind !== 'manual') {
        errors.push(`${where}: placeholder rule action must be absent or { kind: 'manual' }`);
      }
    } else {
      if (!r.source || typeof r.source !== 'string') {
        errors.push(`${where}: non-placeholder rule needs a verified source (UU/PMK/regulation reference)`);
      }
      if (!action || typeof action !== 'object') {
        errors.push(`${where}: non-placeholder rule needs action { kind: rate|exempt, ... }`);
      } else if (action.kind === 'rate') {
        if (!Number.isInteger(action.perMille) || action.perMille < 0 || action.perMille > 1000) {
          errors.push(`${where}.action.perMille must be an integer 0..1000`);
        }
      } else if (action.kind !== 'exempt') {
        errors.push(`${where}.action.kind must be rate|exempt for non-placeholder rules, got: ${action.kind}`);
      }
    }
    if (r.note !== undefined && r.note !== null && typeof r.note !== 'string') {
      errors.push(`${where}.note must be a string or null`);
    }
  });
  return errors;
}

function assertValidPackContent({ taxCategories, accounts, rules }) {
  const forbidden = [];
  collectForbidden({ taxCategories, accounts, rules }, '$', forbidden);
  const errors = [
    ...forbidden.map((f) => `forbidden key (code-execution risk): ${f}`),
    ...validateTaxCategories(taxCategories),
    ...validateAccounts(accounts),
    ...validateRules(rules, taxCategories),
  ];
  if (errors.length > 0) {
    throw new Error(`Invalid country pack content:\n- ${errors.join('\n- ')}`);
  }
}

module.exports = {
  TAX_CATEGORY_STATUS, RULE_ACTION_KINDS,
  validateTaxCategories, validateAccounts, validateRules, assertValidPackContent,
};
