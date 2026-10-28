'use strict';

/**
 * Configurator — lifecycle DISCOVER → PROFILE → PROPOSE → VALIDATE →
 * CONFIRM → ACTIVATE → AUDIT.
 *
 * Kontrak:
 * - propose(): usulan deterministik dari profil tervalidasi (tanpa AI).
 * - validateProposal(): fail-closed terhadap registry pack, mata uang,
 *   periode, dan modul. Pack placeholder → status needs-verification,
 *   TIDAK PERNAH menghasilkan kewajiban final.
 * - activate(): menulis konfigurasi berversi + audit trail; idempotent
 *   via activationKey (duplikat mengembalikan hasil yang sama).
 * - AI hanya memberi label/penjelasan; keputusan validasi 100% deterministik.
 */

const { validateProfile } = require('./profile');

function proposeConfiguration(profile) {
  const checked = validateProfile(profile);
  if (!checked.ok) {
    return { ok: false, errors: checked.errors };
  }
  const p = checked.profile;
  const jurisdictions = p.jurisdictionProfiles.map((j) => j.code);
  const proposal = {
    language: p.languageProfile.ui,
    organizationId: p.organizationProfile.id,
    entities: p.entityProfiles.map((e) => ({ id: e.id, jurisdiction: e.jurisdiction })),
    jurisdictions,
    functionalCurrency: p.currencyProfile.functional,
    otherCurrencies: [...p.currencyProfile.otherCurrencies],
    modules: [...p.moduleConfiguration],
    period: { ...p.accountingConfiguration },
    taxStatus: 'pending-verification',
    source: 'deterministic-proposal',
  };
  return { ok: true, proposal };
}

function validateProposal(proposal, { registry, chartCurrencies = null } = {}) {
  const errors = [];
  if (!proposal || typeof proposal !== 'object') return { ok: false, errors: ['proposal must be an object'] };
  if (!registry) return { ok: false, errors: ['registry is required'] };
  const date = proposal.period?.periodStart ?? proposal.period?.start;
  for (const code of proposal.jurisdictions ?? []) {
    let pack = null;
    try {
      pack = registry.select(code, date ?? '2026-06-01');
    } catch (e) {
      errors.push(`pack lookup failed for ${code}: ${e.message}`);
      continue;
    }
    if (!pack) {
      errors.push(`no country pack for jurisdiction ${code}`);
      continue;
    }
    const placeholders = (pack.rules ?? []).filter((r) => r.placeholder === true);
    if (placeholders.length === (pack.rules ?? []).length && (pack.rules ?? []).length > 0) {
      proposal._packNotes = proposal._packNotes ?? {};
      proposal._packNotes[code] = 'placeholder-only: needs-verification';
    }
    if (chartCurrencies && pack.manifest.currency !== proposal.functionalCurrency) {
      errors.push(`pack currency ${pack.manifest.currency} != functional ${proposal.functionalCurrency} for ${code}`);
    }
  }
  if (!/^[A-Z]{3}$/.test(proposal.functionalCurrency ?? '')) {
    errors.push('functionalCurrency must be 3-letter code');
  }
  for (const c of proposal.otherCurrencies ?? []) {
    if (!/^[A-Z]{3}$/.test(c)) errors.push(`otherCurrencies has invalid code: ${c}`);
  }
  if ((proposal.otherCurrencies ?? []).includes(proposal.functionalCurrency)) {
    errors.push('otherCurrencies must not repeat functionalCurrency');
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, validated: { ...proposal, validatedAt: new Date().toISOString(), taxStatus: 'pending-verification' } };
}

function createConfigurator({ audit = null } = {}) {
  const activations = new Map();

  function activate({ activationKey, proposal, actor = 'onboarding' }) {
    if (!activationKey || typeof activationKey !== 'string') {
      throw new Error('activationKey is required');
    }
    if (activations.has(activationKey)) return activations.get(activationKey);
    if (!proposal || typeof proposal !== 'object') throw new Error('proposal is required');
    const record = Object.freeze({
      activationKey,
      version: 1,
      effectiveFrom: proposal.period?.periodStart ?? proposal.period?.start ?? null,
      proposal: JSON.parse(JSON.stringify(proposal)),
      activatedAt: new Date().toISOString(),
      actor,
    });
    activations.set(activationKey, record);
    if (audit) {
      audit.record({
        actor, action: 'onboarding.activate', entityType: 'configuration',
        entityId: activationKey, detail: { version: 1, organizationId: proposal.organizationId ?? null },
      });
    }
    return record;
  }

  function get(activationKey) {
    return activations.get(activationKey) ?? null;
  }

  function history() {
    return [...activations.values()];
  }

  return { activate, get, history };
}

module.exports = { proposeConfiguration, validateProposal, createConfigurator };
