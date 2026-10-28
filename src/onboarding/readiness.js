'use strict';

/**
 * Deterministic configuration readiness (§3).
 * Reads stored config state; never decided by AI.
 * Statuses: configured | missing | requires_user_input |
 *   requires_review | requires_governed_source | not_applicable
 */

const crypto = require('node:crypto');

function hashProposal(proposal) {
  const canon = JSON.stringify(proposal, Object.keys(proposal ?? {}).sort());
  return crypto.createHash('sha256').update(canon).digest('hex').slice(0, 16);
}

function slotStatus(value, { needsReview = false, needsGoverned = false } = {}) {
  if (needsGoverned) return 'requires_governed_source';
  if (needsReview) return 'requires_review';
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) return 'missing';
  return 'configured';
}

function evaluateReadiness({ profileSlots, jurisdictionState, proposal, confirmedHash }) {
  const v = (k) => profileSlots?.[k]?.value ?? null;
  const slots = {};

  slots['org.name'] = v('org.name') ? 'configured' : 'missing';
  const bt = v('org.businessType');
  // Back-compat: legacy P1 flows may not set a business type; the proposal
  // defaults to small-business, so treat missing as needing user input only
  // when no proposal exists yet.
  if (bt === 'freelancer' || bt === 'small-business' || bt === 'umkm' || bt === 'perdagangan' || bt === 'jasa' || bt === 'kuliner' || bt === 'manufaktur') {
    slots['org.businessType'] = 'configured';
  } else if (bt) {
    slots['org.businessType'] = 'requires_review';
  } else if (proposal) {
    slots['org.businessType'] = 'configured';
  } else {
    slots['org.businessType'] = 'missing';
  }
  slots['user.language'] = v('user.language') ? 'configured' : 'missing';

  const cands = jurisdictionState?.candidates ?? [];
  const reg = cands.find((c) => c.basis === 'REGISTRATION');
  const work = cands.find((c) => c.basis === 'BUSINESS_WORK_LOCATION');
  const dom = v('org.domicile');
  if (reg?.countryCode || dom) slots['jurisdiction.operating'] = 'configured';
  else if (work?.countryCode) slots['jurisdiction.operating'] = 'requires_user_input';
  else slots['jurisdiction.operating'] = 'missing';

  slots['currency.functional'] = v('currency.functional') ? 'configured' : 'missing';
  const mods = v('modules.enabled');
  // Back-compat: legacy flows rely on proposal-default MVP modules.
  if (Array.isArray(mods) && mods.length > 0) slots['modules.enabled'] = 'configured';
  else if (proposal) slots['modules.enabled'] = 'configured';
  else slots['modules.enabled'] = 'missing';

  if (!proposal) slots['approval'] = 'missing';
  else if (confirmedHash && confirmedHash === proposal.hash) slots['approval'] = 'configured';
  else slots['approval'] = 'requires_user_input';

  slots['tax.pack'] = 'not_applicable';

  const workspaceKeys = ['org.name', 'org.businessType', 'user.language', 'jurisdiction.operating', 'currency.functional', 'modules.enabled', 'approval'];
  const workspaceReady = workspaceKeys.every((k) => slots[k] === 'configured');
  const taxReady = false;

  return { slots, workspaceReady, taxReady };
}

module.exports = { hashProposal, evaluateReadiness };
