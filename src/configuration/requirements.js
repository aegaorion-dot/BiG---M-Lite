'use strict';
// Deterministic derivation of the configuration surface for one workspace.
// The profile supplies facts; governed content supplies law; this module only
// decides which configuration questions exist and whether they are already
// covered. It never chooses a rate, threshold or legal classification.

const {fingerprint, deepFreeze} = require('../onboarding/canonical');
const {slotValue} = require('../onboarding/profiler');
const {listSources} = require('../fabric/registry');
const {getJurisdiction, isKnownJurisdiction} = require('../global/jurisdictions');
const {isKnownCurrency} = require('../global/currencies');
const {temporalEligibility} = require('../tax/contentRegistry');
const {domainsFor, researchQuestion} = require('./taxonomy');
const STATUS = Object.freeze({
  GOVERNED_EXECUTABLE: 'GOVERNED_EXECUTABLE',
  GOVERNANCE_REVIEW_REQUIRED: 'GOVERNANCE_REVIEW_REQUIRED',
  OUT_OF_PERIOD: 'OUT_OF_PERIOD',
  RESEARCH_REQUIRED: 'RESEARCH_REQUIRED',
  RESEARCH_UNSUPPORTED: 'RESEARCH_UNSUPPORTED',
  USER_FACT_REQUIRED: 'USER_FACT_REQUIRED',
});

const RESEARCH_STATUSES = Object.freeze([STATUS.RESEARCH_REQUIRED]);

function fact(profileState, key) {
  return slotValue(profileState ?? {}, key);
}

function factList(profileState, basis) {
  return [...new Set((profileState?.jurisdictionFacts ?? [])
    .filter((entry) => entry.basis === basis && entry.status !== 'REJECTED' && typeof entry.countryCode === 'string')
    .map((entry) => entry.countryCode))];
}

/**
 * Which governed CountryPack versions cover this requirement for the period.
 * Approval is decided by the existing registry; this function only reports it.
 */
function coverageFor({registry, jurisdiction, taxTypes, subjectType, period, approvedCache = null}) {
  if (!registry || !jurisdiction || !taxTypes.length) return {covered: [], reviewable: [], outOfPeriod: []};
  const all = registry.list('COUNTRY_PACK');
  const approvedOf = (candidate) => {
    const key = `${candidate.candidateId}|${candidate.status}|${candidate.contentHash}|${candidate.reviewHistory?.length ?? 0}`;
    if (approvedCache?.has(key)) return approvedCache.get(key);
    let approved = false;
    try { approved = registry.approved(candidate); } catch { approved = false; }
    approvedCache?.set(key, approved);
    return approved;
  };
  const scoped = all.filter((candidate) => {
    const pack = candidate.executableContent;
    return pack?.jurisdictionCode === jurisdiction
      && (pack.rules ?? []).some((rule) => taxTypes.includes(rule.taxType)
        && (subjectType === 'UNKNOWN' || rule.subjectTypes.includes(subjectType)));
  });
  const covered = [], reviewable = [], outOfPeriod = [];
  for (const candidate of scoped) {
    const pack = candidate.executableContent;
    let eligibility = 'IN_PERIOD';
    if (period?.periodStart && period?.periodEnd) {
      try { eligibility = temporalEligibility(candidate, all, period, period.periodEnd); } catch { eligibility = 'REVIEW_REQUIRED'; }
    }
    const summary = {
      candidateId: candidate.candidateId,
      packId: pack.packId,
      version: pack.version,
      contentHash: candidate.contentHash,
      governance: candidate.status,
      effectiveFrom: pack.effectiveFrom,
      effectiveTo: pack.effectiveTo,
      taxTypes: [...new Set((pack.rules ?? []).filter((rule) => taxTypes.includes(rule.taxType)).map((rule) => rule.taxType))],
    };
    if (eligibility !== 'IN_PERIOD') { outOfPeriod.push({...summary, eligibility}); continue; }
    (approvedOf(candidate) ? covered : reviewable).push(summary);
  }
  return {covered, reviewable, outOfPeriod};
}

function requirementStatus({covered, reviewable, outOfPeriod, jurisdiction, userFactsNeeded}) {
  if (userFactsNeeded.length) return {status: STATUS.USER_FACT_REQUIRED, reason: 'MATERIAL_PROFILE_FACT_REQUIRED'};
  if (covered.length) return {status: STATUS.GOVERNED_EXECUTABLE, reason: 'APPROVED_COUNTRY_PACK_IN_PERIOD'};
  if (reviewable.length) return {status: STATUS.GOVERNANCE_REVIEW_REQUIRED, reason: 'COUNTRY_PACK_REQUIRES_HUMAN_REVIEW'};
  if (outOfPeriod.length) return {status: STATUS.OUT_OF_PERIOD, reason: 'COUNTRY_PACK_OUT_OF_PERIOD'};
  if (!jurisdiction || !isKnownJurisdiction(jurisdiction)) return {status: STATUS.USER_FACT_REQUIRED, reason: 'TAX_JURISDICTION_REQUIRED'};
  if (!listSources(jurisdiction).length) return {status: STATUS.RESEARCH_UNSUPPORTED, reason: 'NO_REGISTERED_OFFICIAL_SOURCE'};
  return {status: STATUS.RESEARCH_REQUIRED, reason: 'NO_GOVERNED_CONTENT_FOR_PERIOD'};
}

function describeRequirement(context, entry, jurisdiction) {
  return {jurisdiction, domain: entry.code, kind: entry.kind, taxTypes: [...entry.taxTypes], text: researchQuestion(entry, {...context, jurisdiction})};
}

/**
 * @param {object} input
 * @param {object} input.profileState confirmed-or-candidate onboarding profile
 * @param {object} [input.registry] TaxContentRegistry (candidate-only content included)
 * @param {object} [input.workspace] activated workspace projection
 */
function deriveConfiguration({profileState, registry = null, workspace = null} = {}) {
  const slots = profileState?.slots ?? {};
  const language = fact(profileState, 'user.language') ?? 'en';
  const functioning = fact(profileState, 'currency.functional');
  const moduleList = fact(profileState, 'modules.enabled') ?? [];
  const businessType = fact(profileState, 'org.businessType');
  const subjectType = fact(profileState, 'org.subjectType') ?? 'UNKNOWN';
  const activities = fact(profileState, 'org.activities') ?? [];
  const registration = factList(profileState, 'REGISTRATION');
  const incorporation = factList(profileState, 'INCORPORATION');
  const taxResidence = factList(profileState, 'TAX_RESIDENCE');
  const workLocations = factList(profileState, 'BUSINESS_WORK_LOCATION');
  const customerLocations = factList(profileState, 'CUSTOMER_LOCATION');
  const sourceCountries = factList(profileState, 'SOURCE');
  const withholdingCountries = factList(profileState, 'WITHHOLDING');
  const employmentCountry = fact(profileState, 'employment.workCountry') ?? fact(profileState, 'employment.employerCountry');
  const period = workspace?.period ?? {
    periodStart: fact(profileState, 'accounting.periodStart'),
    periodEnd: fact(profileState, 'accounting.periodEnd'),
  };
  const primaryJurisdiction = registration[0] ?? incorporation[0] ?? taxResidence[0] ?? workLocations[0] ?? sourceCountries[0] ?? null;
  const hasBusinessActivity = Boolean(businessType) || activities.length > 0;
  const context = {
    subjectType,
    businessType,
    period,
    currency: functioning,
    hasBusinessActivity,
    hasSalesActivity: hasBusinessActivity && (moduleList.includes('sales') || Boolean(businessType) || activities.length > 0),
    hasEmploymentIncome: Boolean(fact(profileState, 'employment.relationship') || employmentCountry),
    crossBorderPayments: customerLocations.some((code) => !registration.includes(code))
      || withholdingCountries.some((code) => !registration.includes(code)),
    hasCrossBorderScope: (taxResidence.length > 0 && [...customerLocations, ...sourceCountries].some((code) => !taxResidence.includes(code)))
      || (registration.length > 0 && [...customerLocations, ...sourceCountries].some((code) => !registration.includes(code))),
  };

  const materialGaps = [];
  const addGap = (key, domain, text) => materialGaps.push({key, domain, text});
  if (!functioning) addGap('currency.functional', 'FUNCTIONAL_CURRENCY', 'Which currency do you keep your books in?');
  if (!period?.periodStart || !period?.periodEnd) addGap('accounting.period', 'ACCOUNTING_PERIOD', 'Which accounting period should be configured?');
  if (subjectType === 'UNKNOWN') addGap('org.subjectType', 'SUBJECT_TYPE', 'Is this activity carried on by an individual, a company, or a partnership?');
  if (!primaryJurisdiction) addGap('jurisdiction', 'TAX_JURISDICTION', 'Where is this activity registered or operated for tax purposes?');
  if (functioning && !isKnownCurrency(functioning)) addGap('currency.functional', 'FUNCTIONAL_CURRENCY', 'Which supported currency should the books use?');

  const researchJurisdictions = [...new Set([primaryJurisdiction, ...taxResidence, ...workLocations, ...withholdingCountries].filter(Boolean))];
  const requirements = [];
  const questionSeeds = [];
  const approvedCache = new Map();

  for (const jurisdiction of researchJurisdictions) {
    const meta = getJurisdiction(jurisdiction);
    for (const entry of domainsFor(context, subjectType)) {
      const userFactsNeeded = entry.kind === 'TAX'
        ? materialGaps.filter((gap) => ['SUBJECT_TYPE', 'TAX_JURISDICTION', 'FUNCTIONAL_CURRENCY', 'ACCOUNTING_PERIOD'].includes(gap.domain)).map((gap) => gap.key)
        : materialGaps.filter((gap) => ['FUNCTIONAL_CURRENCY', 'ACCOUNTING_PERIOD', 'TAX_JURISDICTION'].includes(gap.domain)).map((gap) => gap.key);
      const {covered, reviewable, outOfPeriod} = coverageFor({
        registry,
        jurisdiction,
        taxTypes: entry.taxTypes,
        subjectType,
        period,
        approvedCache,
      });
      const {status, reason} = requirementStatus({covered, reviewable, outOfPeriod, jurisdiction, userFactsNeeded});
      const requirement = deepFreeze({
        id: `${jurisdiction}-${entry.code}`,
        jurisdiction,
        jurisdictionName: meta?.name ?? jurisdiction,
        domain: entry.code,
        kind: entry.kind,
        taxTypes: [...entry.taxTypes],
        status,
        reason,
        packCandidates: [...covered, ...reviewable, ...outOfPeriod],
        coveredPackIds: covered.map((pack) => `${pack.packId}@${pack.version}`),
        userFactsNeeded,
        researchRequired: RESEARCH_STATUSES.includes(status),
        localSearchHints: meta ? {language: meta.locale ?? null, terminology: meta.terminology ?? [], researchInstruction: meta.researchInstruction ?? null} : {language: null, terminology: [], researchInstruction: null},
      });
      requirements.push(requirement);
      if (requirement.researchRequired) questionSeeds.push(describeRequirement(context, entry, jurisdiction));
    }
  }

  // Accounting obligations are universal but never executable content; they stay
  // explicit research questions while no governed obligation content exists.
  const researchRequirements = requirements.filter((entry) => entry.status === STATUS.RESEARCH_REQUIRED);
  const unresolved = requirements.filter((entry) => [STATUS.RESEARCH_UNSUPPORTED, STATUS.GOVERNANCE_REVIEW_REQUIRED, STATUS.OUT_OF_PERIOD].includes(entry.status));
  const data = {
    schemaVersion: 'configuration-profile/1',
    language,
    fallbackLanguage: 'en',
    localeHint: getJurisdiction(primaryJurisdiction)?.locale ?? null,
    subjectType,
    businessType,
    activities,
    modules: moduleList,
    currencies: {
      functional: functioning,
      reporting: fact(profileState, 'currency.reporting') ?? functioning,
      transaction: fact(profileState, 'currency.transactions') ?? [],
      foreignPurchases: fact(profileState, 'currency.foreignPurchases') ?? [],
      fxSource: fact(profileState, 'currency.fxSource'),
    },
    period: {periodStart: period?.periodStart ?? null, periodEnd: period?.periodEnd ?? null},
    jurisdictions: {
      primary: primaryJurisdiction,
      registration,
      incorporation,
      taxResidence,
      workLocations,
      customerLocations,
      sourceCountries,
      withholding: withholdingCountries,
    },
    researchJurisdictions,
    requirements,
    researchRequirements: researchRequirements.map((entry) => entry.id),
    unresolved: unresolved.map((entry) => ({id: entry.id, jurisdiction: entry.jurisdiction, domain: entry.domain, status: entry.status, reason: entry.reason})),
    profileGaps: materialGaps,
    questions: materialGaps.map((gap) => ({key: gap.key, domain: gap.domain, text: gap.text})),
    researchQuestions: questionSeeds,
    profileRevision: profileState?.revision ?? 0,
    postingPerformed: false,
    authoritativeDetermination: false,
  };
  const {configurationHash, ...payload} = data;
  return deepFreeze({...payload, configurationHash: fingerprint(payload)});
}

function configurationFingerprint(configuration) {
  const {configurationHash, ...payload} = configuration ?? {};
  return fingerprint(payload);
}

module.exports = {
  STATUS,
  coverageFor,
  deriveConfiguration,
  configurationFingerprint,
};
