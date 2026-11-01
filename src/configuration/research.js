'use strict';
// Turns configuration requirements into bounded, evidence-first Muse research
// work orders. This module never searches, reads, interprets or approves: it
// prepares the brief the existing procedural research worker executes.

const {fingerprint, deepFreeze} = require('../onboarding/canonical');
const {createResearchNeed} = require('../ai/researchWorkflow');
const {buildResearchBrief} = require('../ai/researchBrief');
const {listSources} = require('../fabric/registry');
const {isKnownJurisdiction} = require('../global/jurisdictions');
const {parseEffectiveDate} = require('../fabric/normalizer');
const {configurationFingerprint} = require('./requirements');
const {domain: domainEntry, researchQuestion} = require('./taxonomy');

const MAX_QUESTIONS_PER_PLAN = 15;
const MAX_JURISDICTIONS_PER_PLAN = 4;

const CONFIGURATION_OUTPUT_SCHEMA = Object.freeze({
  status: 'CANDIDATE | REVIEW_REQUIRED | MISSING_FACT | CONFLICT',
  countryPacks: [{
    pack: {
      packId: 'UPPERCASE_UNDERSCORE_ID', version: 1, jurisdictionCode: 'ISO2', currency: 'ISO4217',
      effectiveFrom: 'YYYY-MM-DD | null', effectiveTo: 'YYYY-MM-DD | null',
      evidenceRefs: [], testOnly: false,
      rules: [{
        ruleId: 'STABLE_RULE_ID', taxType: 'INCOME_TAX|CIT|VAT|GST|SALES_TAX|WHT|SIMPLIFIED_INCOME|FOREIGN_TAX_CREDIT',
        subjectTypes: ['INDIVIDUAL'], incomeOrEventType: 'BUSINESS_INCOME',
        requiredFacts: {FACT_NAME: 'MONEY|NUMBER|BOOLEAN|STRING|COUNTRY'},
        applicabilityPredicate: 'DSL_AST', taxBaseFormula: 'DSL_AST',
        rateDefinition: {kind: 'FORMULA_DERIVED'}, amountFormula: 'DSL_AST',
        parameters: {NAME: {valueType: 'NUMBER', value: 'exact decimal string'}},
        finalRounding: {mode: 'DOWN|UP|HALF_UP', precision: 0},
        effectiveFrom: 'YYYY-MM-DD', effectiveTo: 'YYYY-MM-DD',
        evidenceRefs: [], treatyRelevant: false,
        supersedes: 'PACK@VERSION (optional)', supersededBy: 'PACK@VERSION (optional)',
      }],
    },
    sourceEvidence: [{sourceHandle: 'actual retrieved handle', locator: 'actual read locator', quote: 'exact anchored quotation'}],
    fieldEvidence: [{fieldPath: 'candidateRule.legalTest', evidenceIndex: 0}],
    propositionSupported: 'proposition actually supported by the evidence',
    candidateRule: {legalTest: 'proposition actually supported by the evidence', parameters: [{name: 'PARAMETER', value: 'exact decimal string', unit: 'unit', evidenceIndex: 0}], parameterCitationRule: 'EVERY numeric value used in rules[].parameters must also appear here with the evidenceIndex of the passage that states it verbatim, including percentages and precomputed bracket amounts such as a lower-bracket tax. Never derive, recompute or round a number the source does not state; omit the rule instead.'},
    issuingAuthority: 'official issuing authority',
    applicabilityAssessment: {
      status: 'SUPPORTED_NO_SUPERSEDING_EVIDENCE|APPLICABILITY_UNRESOLVED|SUPERSEDED|CONFLICTING_AUTHORITY|UNSUPPORTED',
      propositionSupported: 'string',
      supportingEvidenceIndices: [0],
      sourcePublicationDate: 'YYYY-MM-DD | null',
      sourceRevisionDate: 'YYYY-MM-DD | null',
      supersedingSearches: [{sourceId: 'registered source id', query: 'observed query', searchCallId: 'observed search id', outcome: 'NO_CONTRARY_EVIDENCE'}],
      uncertainty: 'what remains unverified',
    },
  }],
  treatyPacks: [],
  questionsForUser: [{status: 'MISSING_FACT', factId: 'MATERIAL_FACT', question: 'question for the user', whyNeeded: 'why this is a personal/business fact'}],
  conflicts: [{code: 'SOURCE_CONFLICT', detail: 'conflict kept explicit'}],
  unresolved: [{code: 'MISSING_FACT|SOURCE_CONFLICT|APPLICABILITY_UNRESOLVED|OUT_OF_PERIOD|MISSING_COVERAGE', detail: 'what remains unresolved'}],
  missingFacts: [{status: 'MISSING_FACT', factId: 'MATERIAL_FACT', question: 'question for the user', whyNeeded: 'why this is a personal/business fact'}],
  periodIssues: [{description: 'effective-period evidence gap', sourceHandles: ['actual retrieved handle']}],
});

function planObjective(jurisdiction) {
  return `Resolve the governed executable tax rule for ${jurisdiction} from official sources. Locate the specific official document, retrieve it, then read it with read_regulatory_passages before proposing. If a page links a full-text, Read or PDF document, retrieve that: abstracts, metadata and portal home pages are not the law. A .pdf URL that returns an HTML viewer is not the document (check observedRetrievals). For a PDF, pass readFindText and readMaxCharacters in the same retrieve call. Read only the pages with the operative article; do not re-read them. Propose only evidence-bound CountryPack candidates from exactly read quotations, with only the rates, thresholds, deductions, conditions and effective dates the source states. Bind every numeric pack parameter to its stating passage in candidateRule.parameters with that evidenceIndex; never derive a number the source does not state. Keep missing taxpayer facts as questions but keep researching while an official document remains retrievable.`;
}

const DOMAIN_PRIORITY = Object.freeze(['CONSUMPTION_TAX', 'INCOME_TAX', 'CIT', 'WITHHOLDING_TAX', 'TREATY_RELIEF']);
const priorityOf = (question) => {
  const index = DOMAIN_PRIORITY.indexOf(question.domain);
  return index < 0 ? DOMAIN_PRIORITY.length : index;
};

function configurationFacts(configuration) {
  const facts = [];
  const push = (factId, value, source) => {
    if (value === null || value === undefined || value === '') return;
    facts.push({factId, value, source});
  };
  push('SUBJECT_TYPE', configuration.subjectType, 'CONFIRMED_PROFILE');
  push('BUSINESS_TYPE', configuration.businessType, 'CONFIRMED_PROFILE');
  push('ACTIVITIES', configuration.activities, 'CONFIRMED_PROFILE');
  push('FUNCTIONAL_CURRENCY', configuration.currencies.functional, 'CONFIRMED_PROFILE');
  push('ACCOUNTING_PERIOD', configuration.period, 'CONFIRMED_PROFILE');
  push('REGISTRATION_JURISDICTIONS', configuration.jurisdictions.registration, 'CONFIRMED_PROFILE');
  push('INCORPORATION_JURISDICTIONS', configuration.jurisdictions.incorporation, 'CONFIRMED_PROFILE');
  push('TAX_RESIDENCE_JURISDICTIONS', configuration.jurisdictions.taxResidence, 'CONFIRMED_PROFILE');
  push('WORK_LOCATION_JURISDICTIONS', configuration.jurisdictions.workLocations, 'CONFIRMED_PROFILE');
  push('CUSTOMER_JURISDICTIONS', configuration.jurisdictions.customerLocations, 'PROFILE_FACT');
  push('SOURCE_JURISDICTIONS', configuration.jurisdictions.sourceCountries, 'PROFILE_FACT');
  return facts;
}

/**
 * Build the bounded research work orders for the open configuration questions.
 * Jurisdictions without any registered official source are preserved as
 * explicit unsupported items instead of being silently dropped.
 */
function buildConfigurationResearchPlans({configuration, maxTurns = 5, maxRetrievals = 8, policyMode = 'STRICT_PRODUCTION', domains = null, extraFacts = []} = {}) {
  if (!configuration || configuration.schemaVersion !== 'configuration-profile/1') throw Error('Configuration profile required');
  if (!['STRICT_PRODUCTION', 'HACKATHON_DEMO'].includes(policyMode)) throw Error('Known research policy mode required');
  const period = configuration.period ?? {};
  const requestedDomains = Array.isArray(domains) && domains.length ? new Set(domains) : null;
  // The Muse output contract is a tax-rule CountryPack. Non-tax obligations stay
  // visible as deferred configuration requirements instead of being sent into a
  // research turn that cannot carry their result.
  const baseQuestions = requestedDomains
    ? (configuration.requirements ?? [])
      .filter((requirement) => requirement.kind === 'TAX' && requestedDomains.has(requirement.domain))
      .map((requirement) => ({
        jurisdiction: requirement.jurisdiction,
        domain: requirement.domain,
        kind: requirement.kind,
        taxTypes: requirement.taxTypes,
        text: researchQuestion(domainEntry(requirement.domain), {
          subjectType: configuration.subjectType,
          businessType: configuration.businessType,
          period: configuration.period,
          currency: configuration.currencies?.functional,
          jurisdiction: requirement.jurisdiction,
        }),
      }))
    : (configuration.researchQuestions ?? []).filter((question) => question.kind === 'TAX');
  const questions = baseQuestions
    .sort((a, b) => priorityOf(a) - priorityOf(b) || String(a.domain).localeCompare(String(b.domain)));
  const deferred = (configuration.requirements ?? [])
    .filter((requirement) => requirement.kind !== 'TAX' && requirement.status === 'RESEARCH_REQUIRED')
    .map((requirement) => ({id: requirement.id, jurisdiction: requirement.jurisdiction, domain: requirement.domain, reason: 'TAX_RULE_OUTPUT_CONTRACT_ONLY'}));
  const plans = [];
  const unsupported = [];
  const grouped = new Map();
  const unsupportedRequirements = (configuration.unresolved ?? []).filter((entry) => entry.status === 'RESEARCH_UNSUPPORTED');
  for (const requirement of unsupportedRequirements) {
    const existing = unsupported.find((entry) => entry.jurisdiction === requirement.jurisdiction);
    if (existing) existing.requirementIds.push(requirement.id);
    else unsupported.push({jurisdiction: requirement.jurisdiction ?? null, requirementIds: [requirement.id], reason: 'NO_REGISTERED_OFFICIAL_SOURCE', status: 'RESEARCH_UNSUPPORTED'});
  }
  for (const question of questions) {
    const jurisdiction = question.jurisdiction;
    if (!isKnownJurisdiction(jurisdiction) || !listSources(jurisdiction).length) {
      unsupported.push({
        jurisdiction: jurisdiction ?? null,
        requirementIds: configuration.researchRequirements ?? [],
        reason: jurisdiction && isKnownJurisdiction(jurisdiction) ? 'NO_REGISTERED_OFFICIAL_SOURCE' : 'UNKNOWN_TAX_JURISDICTION',
        status: 'RESEARCH_UNSUPPORTED',
      });
      continue;
    }
    const entry = grouped.get(jurisdiction) ?? [];
    entry.push(question);
    grouped.set(jurisdiction, entry);
  }
  const periodReady = parseEffectiveDate(period.periodStart) && parseEffectiveDate(period.periodEnd) && period.periodStart <= period.periodEnd;
  if (periodReady) {
    const confirmedFacts = [...configurationFacts(configuration), ...extraFacts];
    for (const [jurisdiction, entries] of grouped) {
      const questionsToResolve = [...new Set(entries.map((entry) => entry.text))].slice(0, MAX_QUESTIONS_PER_PLAN);
      if (!questionsToResolve.length) continue;
      const need = createResearchNeed({
        objective: planObjective(jurisdiction),
        profile: {
          subjectType: configuration.subjectType,
          businessType: configuration.businessType,
          currency: configuration.currencies.functional,
          period: configuration.period,
          jurisdiction,
          language: configuration.language,
        },
        transactions: [],
        questionsToResolve,
      });
      const brief = buildResearchBrief({
        objective: need.objective,
        confirmedFacts,
        unknownFacts: entries.map((entry) => ({factId: `CONFIGURATION_${entry.domain}`, domain: entry.domain, value: 'UNRESOLVED_BY_PROFILE'})),
        taxPeriod: {periodStart: configuration.period.periodStart, periodEnd: configuration.period.periodEnd},
        jurisdictions: [jurisdiction].slice(0, MAX_JURISDICTIONS_PER_PLAN),
        questionsToResolve: need.questionsToResolve,
        maxTurns,
        maxRetrievals,
        policyMode,
      });
      const plan = {
        kind: 'ResearchPlan',
        briefHash: brief.briefHash,
        targetJurisdiction: jurisdiction,
        requirementIds: entries.map((entry) => entry.id ?? `${jurisdiction}-${entry.domain}`),
        stages: ['DISCOVER', 'READ', 'EXTRACT'],
        budgets: {maxTurns, maxRetrievals, maxReadSelections: 24, maxToolCallsPerTurn: 2},
        stopReasons: ['CANDIDATES_VALIDATED', 'CONFLICT', 'MISSING_FACT', 'REVIEW_REQUIRED', 'BUDGET_EXHAUSTED', 'RESEARCH_VALIDATION_OR_TOOL_REVIEW_REQUIRED', 'STOP_CREDENTIAL_RISK'],
      };
      plans.push({jurisdiction, need, brief, plan, outputSchema: CONFIGURATION_OUTPUT_SCHEMA});
    }
  }
  const data = {
    schemaVersion: 'configuration-research-plan/1',
    configurationHash: configuration.configurationHash ?? configurationFingerprint(configuration),
    policyMode,
    status: plans.length ? 'PLANNED' : unsupported.length ? 'RESEARCH_UNSUPPORTED' : deferred.length ? 'DEFERRED' : periodReady ? 'NO_RESEARCH_REQUIRED' : 'PROFILE_INCOMPLETE',
    plans,
    unsupported,
    deferred,
    questionsForUser: configuration.questions ?? [],
    outputSchema: CONFIGURATION_OUTPUT_SCHEMA,
  };
  return deepFreeze({...data, planHash: fingerprint({...data, plans: data.plans.map((plan) => ({...plan, need: plan.need, briefHash: plan.brief.briefHash}))})});
}

module.exports = {buildConfigurationResearchPlans, CONFIGURATION_OUTPUT_SCHEMA, MAX_QUESTIONS_PER_PLAN, MAX_JURISDICTIONS_PER_PLAN};
