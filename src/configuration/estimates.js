'use strict';
// Calculates tax estimates from actual posted financial records with the ONE
// deterministic engine. This module never selects a rate or a legal conclusion:
// it supplies evidenced financial facts to governed rules, and reports every
// point where the profile, the facts or the governed content is not ready.

const {Money} = require('../domain/money');
const {fingerprint, deepFreeze} = require('../onboarding/canonical');
const {candidateTaxFacts, confirmTaxFacts} = require('../tax/facts');
const {ESTIMATE_INPUT_ALIASES} = require('./taxonomy');

const CLASSIFICATION_FACTS = Object.freeze({
  SUBJECT_TYPE: (configuration) => configuration.subjectType === 'UNKNOWN' ? null : {value: configuration.subjectType, evidence: 'profile:org.subjectType'},
  TAX_RESIDENCE: (configuration) => configuration.jurisdictions.taxResidence[0] ? {value: configuration.jurisdictions.taxResidence[0], evidence: 'profile:jurisdiction.TAX_RESIDENCE'} : null,
  REGISTRATION: (configuration) => configuration.jurisdictions.registration[0] ? {value: configuration.jurisdictions.registration[0], evidence: 'profile:jurisdiction.REGISTRATION'} : null,
  SOURCE: (configuration) => configuration.jurisdictions.sourceCountries[0] ? {value: configuration.jurisdictions.sourceCountries[0], evidence: 'profile:jurisdiction.SOURCE'} : null,
  WITHHOLDING: (configuration) => configuration.jurisdictions.withholding[0] ? {value: configuration.jurisdictions.withholding[0], evidence: 'profile:jurisdiction.WITHHOLDING'} : null,
});

const BASIS_PREFERENCE = Object.freeze({
  WHT: ['WITHHOLDING', 'SOURCE', 'REGISTRATION', 'TAX_RESIDENCE'],
  DEFAULT: ['REGISTRATION', 'TAX_RESIDENCE', 'SOURCE'],
});

const DEMO_POLICY_FACTS = Object.freeze(['TAX_RESIDENCE', 'SOURCE', 'SUBJECT_TYPE', 'INCOME_TYPE', 'HOUSEHOLD_PARTS']);

function financialFactValues(financial, currency, snapshotHash) {
  const value = (key) => {
    const raw = financial?.[key];
    if (!raw || typeof raw.amountMinor !== 'string' || raw.currency !== currency) return null;
    return Money.fromJSON(raw);
  };
  const gross = value('recognizedBusinessIncome');
  const expenses = value('confirmedBusinessExpenses');
  const employment = value('employmentWage');
  const net = gross && expenses ? gross.sub(expenses) : null;
  const evidence = (key) => `financial-position:${key}@${snapshotHash}`;
  return {
    grossBusinessIncome: gross ? {money: gross, evidence: evidence('recognizedBusinessIncome')} : null,
    businessExpenses: expenses ? {money: expenses, evidence: evidence('confirmedBusinessExpenses')} : null,
    netBusinessIncome: net ? {money: net, evidence: evidence('recognizedBusinessIncome-establishedBusinessExpenses')} : null,
    employmentIncome: employment ? {money: employment, evidence: evidence('employmentWage')} : null,
  };
}

function basisFor(target, configuration) {
  const preference = BASIS_PREFERENCE[target.taxType] ?? BASIS_PREFERENCE.DEFAULT;
  const available = {
    TAX_RESIDENCE: configuration.jurisdictions.taxResidence,
    REGISTRATION: configuration.jurisdictions.registration,
    SOURCE: configuration.jurisdictions.sourceCountries,
    WITHHOLDING: configuration.jurisdictions.withholding,
  };
  for (const basis of preference) if ((available[basis] ?? []).includes(target.jurisdiction)) return basis;
  return null;
}

function rulesForTarget(registry, target) {
  if (!registry) return [];
  return registry.list('COUNTRY_PACK')
    .filter((candidate) => {
      if (candidate.executableContent?.jurisdictionCode !== target.jurisdiction) return false;
      try { return registry.approved(candidate); } catch { return false; }
    })
    .flatMap((candidate) => (candidate.executableContent.rules ?? [])
      .filter((rule) => rule.taxType === target.taxType && rule.incomeOrEventType === target.incomeOrEventType)
      .map((rule) => ({candidate, pack: candidate.executableContent, rule})));
}

function estimateTargets({registry, configuration}) {
  if (!registry) throw Error('Tax content registry required');
  if (configuration.subjectType === 'UNKNOWN') return {status: 'PROFILE_INCOMPLETE', targets: [], unresolved: [{code: 'SUBJECT_TYPE_REQUIRED'}]};
  const jurisdictions = [...new Set([configuration.jurisdictions.primary, ...configuration.jurisdictions.taxResidence, ...configuration.jurisdictions.workLocations].filter(Boolean))];
  const seen = new Set(), targets = [];
  for (const candidate of registry.list('COUNTRY_PACK')) {
    const pack = candidate.executableContent;
    if (!pack || !jurisdictions.includes(pack.jurisdictionCode)) continue;
    let approved = false;
    try { approved = registry.approved(candidate); } catch { approved = false; }
    if (!approved) continue;
    for (const rule of pack.rules ?? []) {
      if (!rule.subjectTypes.includes(configuration.subjectType)) continue;
      const key = `${pack.jurisdictionCode}|${rule.taxType}|${rule.incomeOrEventType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({key, jurisdiction: pack.jurisdictionCode, taxType: rule.taxType, incomeOrEventType: rule.incomeOrEventType});
    }
  }
  targets.sort((a, b) => a.key.localeCompare(b.key));
  return {status: targets.length ? 'READY_TO_PREPARE' : 'NO_GOVERNED_RULE', targets, unresolved: targets.length ? [] : [{code: 'NO_GOVERNED_RULE_FOR_PROFILE'}]};
}

function factsForTarget({registry, target, configuration, financialValues, confirmedFacts, basis}) {
  const declarations = {SUBJECT_TYPE: 'STRING', INCOME_TYPE: 'STRING'};
  if (basis) declarations[basis] = 'COUNTRY';
  // Treaty-capable tax types are evaluated by the engine only when the confirmed
  // residence and source facts are present; otherwise the result stays unresolved.
  if (configuration.jurisdictions.taxResidence[0]) declarations.TAX_RESIDENCE = 'COUNTRY';
  if (configuration.jurisdictions.sourceCountries[0]) declarations.SOURCE = 'COUNTRY';
  const conflicts = [];
  for (const {rule} of rulesForTarget(registry, target)) {
    for (const [name, type] of Object.entries(rule.requiredFacts ?? {})) {
      if (!declarations[name]) declarations[name] = type;
      else if (declarations[name] !== type) conflicts.push({name, code: 'CONFLICTING_FACT_DECLARATION'});
    }
  }
  const supplied = new Map((confirmedFacts ?? []).map((entry) => [entry.name, entry]));
  const facts = [], missing = [];
  for (const [name, type] of Object.entries(declarations)) {
    // Posted accounting records are authoritative for mapped monetary inputs.
    const alias = type === 'MONEY' ? ESTIMATE_INPUT_ALIASES[name] : null;
    const financial = alias ? financialValues[alias] : null;
    if (financial) {
      facts.push({name, type: 'MONEY', value: financial.money.toJSON(), evidenceReference: financial.evidence, confirmationAuthority: 'CALCULATION', provisional: true});
      continue;
    }
    const entry = supplied.get(name);
    if (entry) {
      facts.push({
        name,
        type: entry.type ?? type,
        value: entry.value,
        evidenceReference: entry.evidenceReference,
        ...(entry.confirmationAuthority ? {confirmationAuthority: entry.confirmationAuthority} : {}),
        ...(entry.provisional ? {provisional: true} : {}),
      });
      continue;
    }
    if (type === 'MONEY') {
      missing.push({name, code: alias ? 'FINANCIAL_VALUE_NOT_RECORDED' : 'UNMAPPED_FINANCIAL_FACT'});
      continue;
    }
    if (name === 'INCOME_TYPE') {
      facts.push({name, type: 'STRING', value: target.incomeOrEventType, evidenceReference: 'configuration:incomeOrEventType'});
      continue;
    }
    const mapped = CLASSIFICATION_FACTS[name]?.(configuration);
    if (mapped) {
      // These values are facts the user stated in the profile, not legal conclusions.
      facts.push({name, type, value: mapped.value, evidenceReference: mapped.evidence, confirmationAuthority: 'USER_INPUT'});
      continue;
    }
    missing.push({name, code: 'CONFIRMED_CLASSIFICATION_FACT_REQUIRED'});
  }
  return {facts, missing: [...conflicts, ...missing], declarations};
}

function describeCalculation(result) {
  const evidenceIds = [...new Set((result.evidenceRefs ?? []).map((ref) => ref.evidenceId))];
  return {
    status: result.status,
    reason: result.reason ?? null,
    taxType: result.taxType,
    jurisdictionCode: result.jurisdictionCode,
    taxableBase: result.taxableBase ?? null,
    rate: result.rate ?? null,
    taxAmount: result.taxAmount ?? null,
    reliefs: result.reliefs ?? [],
    withholding: result.withholding ?? null,
    appliedRules: (result.appliedRules ?? []).map((rule) => ({
      ruleId: rule.ruleId,
      packId: rule.packId ?? rule.treatyPackId ?? null,
      packVersion: rule.packVersion ?? null,
      candidateId: rule.candidateId ?? null,
      governanceStatus: rule.governanceStatus ?? null,
      evidenceIds,
    })),
    demoDisclosures: result.demoDisclosures ?? [],
    requiredMissingFacts: result.requiredMissingFacts ?? [],
    determinationId: result.determinationId ?? null,
    calculationTrace: (result.calculationTrace ?? []).slice(-200),
    postingPerformed: false,
    authoritativeFiling: false,
  };
}

function legalSourcesFor(registry, appliedRules) {
  const sources = [];
  for (const applied of appliedRules ?? []) {
    const candidate = applied.candidateId ? registry?.get(applied.candidateId) : null;
    for (const ref of candidate?.executableContent?.evidenceRefs ?? []) {
      sources.push({
        ruleId: applied.ruleId,
        packId: applied.packId,
        evidenceId: ref.evidenceId,
        sourceUrl: ref.sourceUrl ?? null,
        locator: ref.locator ?? null,
        rawContentHash: ref.rawContentHash ?? null,
        legalSourceUrl: ref.legalSourceUrl ?? null,
        sourceKind: ref.sourceKind ?? null,
      });
    }
  }
  return [...new Map(sources.map((source) => [`${source.ruleId}|${source.evidenceId}`, source])).values()];
}

function demoConfirm(snapshot) {
  try {
    const facts = snapshot.facts.map((fact) => {
      if (fact.confirmationAuthority === 'CALCULATION' && fact.type === 'MONEY') return fact;
      if (DEMO_POLICY_FACTS.includes(fact.name)) return {...fact, confirmationAuthority: 'BIGM_DEMO_POLICY', provisional: true};
      return fact;
    });
    const candidate = candidateTaxFacts({...snapshot, facts});
    return {ok: true, snapshot: confirmTaxFacts(candidate, {decisionSource: 'BIGM_DEMO_POLICY', policyMode: 'HACKATHON_DEMO', reviewedSnapshotHash: candidate.snapshotHash})};
  } catch {
    return {ok: false, code: 'FACT_CONFIRMATION_REQUIRED'};
  }
}

function humanConfirm(snapshot, confirmation) {
  try {
    return {
      ok: true,
      snapshot: confirmTaxFacts(snapshot, {
        decisionSource: 'HUMAN',
        actor: confirmation.actor,
        reviewedSnapshotHash: confirmation.reviewedSnapshotHash,
      }),
    };
  } catch {
    return {ok: false, code: 'FACT_CONFIRMATION_REQUIRED'};
  }
}

function pendingGovernedCandidates({registry, configuration}) {
  const jurisdictions = [...new Set([configuration.jurisdictions.primary, ...configuration.jurisdictions.taxResidence, ...configuration.jurisdictions.workLocations].filter(Boolean))];
  return registry.list('COUNTRY_PACK').filter((candidate) => {
    const pack = candidate.executableContent;
    if (!pack || !jurisdictions.includes(pack.jurisdictionCode)) return false;
    if (!(pack.rules ?? []).some((rule) => rule.subjectTypes.includes(configuration.subjectType))) return false;
    try { return !registry.approved(candidate); } catch { return true; }
  }).map((candidate) => ({
    candidateId: candidate.candidateId,
    packId: candidate.executableContent.packId,
    version: candidate.executableContent.version,
    jurisdiction: candidate.executableContent.jurisdictionCode,
    governance: candidate.status,
    requiresHumanReview: !candidate.demoDisclosure,
  }));
}

/**
 * @param {object} input
 * @param {object} input.registry TaxContentRegistry
 * @param {object} [input.engine] UniversalTaxEngine (omit to prepare only)
 * @param {object} input.configuration derived configuration profile
 * @param {object} input.financial financial-position projection
 * @param {object} input.workspace active workspace projection
 * @param {Array}  [input.confirmedFacts] extra evidenced classification facts
 * @param {object} [input.confirmations] snapshotHash -> human confirmation record
 */
function estimateTaxes({registry, engine = null, configuration, financial, workspace, confirmedFacts = [], confirmations = {}} = {}) {
  if (!configuration) throw Error('Configuration profile required');
  if (!financial || financial.available === false) {
    return deepFreeze({status: 'UNAVAILABLE', reason: 'WORKSPACE_NOT_ACTIVATED', estimates: [], unresolved: [{code: 'WORKSPACE_NOT_ACTIVATED'}], prepared: [], currency: null, period: configuration.period, configurationHash: configuration.configurationHash ?? null, postingPerformed: false, authoritativeFiling: false});
  }
  const currency = financial.currency ?? workspace?.functionalCurrency ?? configuration.currencies.functional;
  if (!currency) {
    return deepFreeze({status: 'UNAVAILABLE', reason: 'FUNCTIONAL_CURRENCY_REQUIRED', estimates: [], unresolved: [{code: 'FUNCTIONAL_CURRENCY_REQUIRED'}], prepared: [], currency: null, period: configuration.period, configurationHash: configuration.configurationHash ?? null, postingPerformed: false, authoritativeFiling: false});
  }
  const period = {periodStart: financial.period?.periodStart ?? configuration.period.periodStart, periodEnd: financial.period?.periodEnd ?? configuration.period.periodEnd};
  const financialSnapshotHash = fingerprint({
    currency,
    period,
    journalCount: financial.accounting?.journalCount ?? 0,
    recognizedBusinessIncome: financial.recognizedBusinessIncome ?? null,
    confirmedBusinessExpenses: financial.confirmedBusinessExpenses ?? null,
    employmentWage: financial.employmentWage ?? null,
    profileRevision: configuration.profileRevision,
  });
  const targetsResult = estimateTargets({registry, configuration});
  if (targetsResult.status !== 'READY_TO_PREPARE') {
    return deepFreeze({
      status: targetsResult.status,
      reason: targetsResult.status,
      estimates: [],
      unresolved: targetsResult.unresolved.map((entry) => ({...entry, configurationRequired: true})),
      prepared: [],
      financialSnapshotHash,
      currency,
      period,
      configurationHash: configuration.configurationHash ?? null,
      pendingReview: pendingGovernedCandidates({registry, configuration}),
      postingPerformed: false,
      authoritativeFiling: false,
    });
  }
  const financialValues = financialFactValues(financial, currency, financialSnapshotHash);
  const policyMode = registry.policyMode ?? 'STRICT';
  const prepared = [], estimates = [], unresolved = [];

  for (const target of targetsResult.targets) {
    const basis = basisFor(target, configuration);
    if (!basis) {
      unresolved.push({taxType: target.taxType, incomeOrEventType: target.incomeOrEventType, jurisdiction: target.jurisdiction, code: 'JURISDICTION_BASIS_UNRESOLVED', researchRequired: true});
      continue;
    }
    const {facts, missing} = factsForTarget({registry, target, configuration, financialValues, confirmedFacts, basis});
    if (missing.length) {
      unresolved.push({
        taxType: target.taxType,
        incomeOrEventType: target.incomeOrEventType,
        jurisdiction: target.jurisdiction,
        code: 'MISSING_REQUIRED_FACT',
        requiredMissingFacts: missing.map((entry) => entry.name),
        details: missing,
        researchRequired: missing.some((entry) => entry.code === 'CONFIRMED_CLASSIFICATION_FACT_REQUIRED'),
      });
      continue;
    }
    const scopeId = workspace?.organizationId ?? 'workspace';
    const subjectId = `configuration-subject:${workspace?.organizationId ?? 'workspace'}`.slice(0, 160);
    let snapshot;
    try {
      snapshot = candidateTaxFacts({
        scopeId,
        subjectId,
        revision: configuration.profileRevision,
        period,
        economicDate: period.periodEnd,
        currency,
        facts,
      });
    } catch (error) {
      unresolved.push({taxType: target.taxType, jurisdiction: target.jurisdiction, code: 'FACT_SNAPSHOT_INVALID', detail: String(error.message).slice(0, 300)});
      continue;
    }
    const preparedEntry = {target, basis, snapshot, snapshotHash: snapshot.snapshotHash};
    prepared.push(preparedEntry);
    const confirmation = confirmations[snapshot.snapshotHash] ?? null;
    const confirmed = policyMode === 'HACKATHON_DEMO'
      ? demoConfirm(snapshot)
      : confirmation ? humanConfirm(snapshot, confirmation) : {ok: false, code: 'FACT_CONFIRMATION_REQUIRED'};
    if (!confirmed.ok) {
      unresolved.push({
        taxType: target.taxType,
        incomeOrEventType: target.incomeOrEventType,
        jurisdiction: target.jurisdiction,
        code: confirmed.code ?? 'FACT_CONFIRMATION_REQUIRED',
        requiredMissingFacts: confirmed.requiredMissingFacts ?? [],
        snapshotHash: snapshot.snapshotHash,
        snapshot,
      });
      continue;
    }
    if (!engine) {
      unresolved.push({taxType: target.taxType, jurisdiction: target.jurisdiction, code: 'ENGINE_NOT_AVAILABLE', snapshotHash: snapshot.snapshotHash});
      continue;
    }
    const request = {
      scopeId,
      subjectId,
      requestKey: `estimate:${fingerprint({taxType: target.taxType, incomeOrEventType: target.incomeOrEventType, facts: confirmed.snapshot}).slice(0, 40)}`.slice(0, 160),
      taxType: target.taxType,
      jurisdictionCode: target.jurisdiction,
      jurisdictionBasis: basis,
      incomeOrEventType: target.incomeOrEventType,
      currency,
      period,
      economicDate: period.periodEnd,
    };
    preparedEntry.request = request;
    let result;
    try {
      result = engine.determine(request, confirmed.snapshot);
    } catch (error) {
      unresolved.push({taxType: target.taxType, jurisdiction: target.jurisdiction, code: 'CALCULATION_FAILED', detail: String(error.message).slice(0, 300)});
      continue;
    }
    const estimate = describeCalculation(result);
    estimate.legalSources = legalSourcesFor(registry, estimate.appliedRules);
    estimates.push(estimate);
  }

  const calculated = estimates.filter((entry) => entry.status === 'CALCULATED');
  const status = estimates.length && calculated.length === estimates.length ? 'CALCULATED'
    : calculated.length ? 'PARTIAL'
      : prepared.length ? 'REVIEW_REQUIRED' : 'UNAVAILABLE';
  return deepFreeze({
    status,
    estimates,
    unresolved,
    prepared,
    financialSnapshotHash,
    currency,
    period,
    configurationHash: configuration.configurationHash ?? null,
    asOf: new Date().toISOString(),
    postingPerformed: false,
    authoritativeFiling: false,
    disclaimer: 'Estimates use posted records and approved governed rules. They are not a filed return, and every unresolved item is shown explicitly.',
  });
}

module.exports = {
  estimateTaxes,
  estimateTargets,
  factsForTarget,
  basisFor,
  financialFactValues,
  legalSourcesFor,
  CLASSIFICATION_FACTS,
  ESTIMATE_INPUT_ALIASES,
};
