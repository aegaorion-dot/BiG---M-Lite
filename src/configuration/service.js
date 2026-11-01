'use strict';
// Product runtime for Muse-driven configuration.
// Muse profiles, researches and proposes. Governed content keeps provenance.
// The ONE engine executes. Humans approve law and confirm estimate facts.

const {fingerprint, deepFreeze} = require('../onboarding/canonical');
const {deriveConfiguration} = require('./requirements');
const {buildConfigurationResearchPlans} = require('./research');
const {validateConfigurationCandidates, citationSource} = require('./candidates');
const {estimateTaxes} = require('./estimates');

const HUMAN_ACTOR = /^(ai|model|muse|meta|system)(?:$|[: -])/i;

function human(actor) {
  if (typeof actor !== 'string' || !actor.trim() || HUMAN_ACTOR.test(actor)) throw Error('Explicit human confirmation required');
}

function blankState() {
  return {version: 1, research: null, confirmations: {}, proposal: null, proposalConfirmation: null, lastEstimate: null};
}

function createConfigurationService({
  system,
  profile,
  workspace,
  financial,
  taxFacts = () => [],
  persist = () => {},
  state = null,
  adapterFactory = null,
  retrieverFactory = null,
  researchRoot = null,
  maxTurns = 16,
  maxRetrievals = 8,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof system !== 'function' || typeof profile !== 'function' || typeof workspace !== 'function' || typeof financial !== 'function') throw Error('Configuration service dependencies required');
  let current = state ?? blankState();
  if (!current || current.version !== 1) current = blankState();

  function save() {
    persist();
  }

  function configuration() {
    const state = profile();
    const hasJurisdictions = (state?.jurisdictionFacts ?? []).some((entry) => entry.status !== 'REJECTED' && entry.countryCode);
    // A profile without any jurisdiction has no requirements yet, so the tax
    // content registry is not created merely to render an empty configuration.
    return deriveConfiguration({profileState: state, registry: hasJurisdictions ? system().registry : null, workspace: workspace()});
  }

  function policyMode() {
    return system().registry?.policyMode ?? 'STRICT';
  }

  function plans(domains = null) {
    const config = configuration();
    return buildConfigurationResearchPlans({
      configuration: config,
      maxTurns,
      maxRetrievals,
      policyMode: policyMode() === 'HACKATHON_DEMO' ? 'HACKATHON_DEMO' : 'STRICT_PRODUCTION',
      domains,
      extraFacts: researchExtraFacts(),
    });
  }

  // Posted records are supplied to Muse so it does not ask the user for figures
  // the workspace already holds.
  function researchExtraFacts() {
    const position = financial();
    const facts = [];
    const add = (factId, key) => {
      const value = position?.[key];
      if (value && typeof value.amountMinor === 'string') facts.push({factId, value: {amountMinor: value.amountMinor, currency: value.currency}, source: 'POSTED_ACCOUNTING_RECORDS'});
    };
    add('RECORDED_GROSS_BUSINESS_INCOME', 'recognizedBusinessIncome');
    add('RECORDED_BUSINESS_EXPENSES', 'confirmedBusinessExpenses');
    return facts;
  }

  function researchSummary() {
    const {jobs, telemetry, ...rest} = current.research ?? {};
    return {
      ...(rest.status ? rest : {status: 'NOT_STARTED'}),
      candidateIds: current.research?.results?.flatMap((entry) => entry.candidateIds ?? []) ?? [],
      evidenceAvailable: Boolean(jobs && Object.keys(jobs).length),
      telemetry: telemetry ? {provider: telemetry.provider, model: telemetry.model, requests: telemetry.requests, usage: telemetry.usage, costStatus: telemetry.costStatus, estimatedCost: telemetry.estimatedCost} : null,
    };
  }

  function candidates() {
    const registry = system().registry;
    const produced = new Set(researchSummary().candidateIds);
    return registry.list('COUNTRY_PACK').map((candidate) => {
      const pack = candidate.executableContent;
      return {
        candidateId: candidate.candidateId,
        packId: pack.packId,
        version: pack.version,
        jurisdiction: pack.jurisdictionCode,
        currency: pack.currency,
        effectiveFrom: pack.effectiveFrom,
        effectiveTo: pack.effectiveTo,
        ruleCount: (pack.rules ?? []).length,
        governance: candidate.status,
        runtimeExecutable: Boolean(candidate.runtimeExecutable),
        contentHash: candidate.contentHash,
        researchProduced: produced.has(candidate.candidateId),
        reviewedAt: candidate.reviewHistory?.at(-1)?.at ?? null,
        applicability: candidate.evidenceBundle?.applicabilityAssessment?.status ?? null,
        citations: citationSource(candidate),
      };
    });
  }

  function reviewCandidate({candidateId, actor, decision = 'APPROVED', reason} = {}) {
    human(actor);
    const candidate = system().registry.get(candidateId);
    if (!candidate) throw Error('Unknown governed candidate');
    if (typeof reason !== 'string' || !reason.trim()) throw Error('Human review reason required');
    const reviewedHashes = [...new Set((candidate.provenance ?? []).map((entry) => entry.rawContentHash))].sort();
    const reviewed = system().governance.review(candidateId, {decisionSource: 'HUMAN', actor, decision, reason, reviewedHashes});
    save();
    return {
      candidateId: reviewed.candidateId,
      status: reviewed.status,
      runtimeExecutable: Boolean(reviewed.runtimeExecutable),
      contentHash: reviewed.contentHash,
      reviewedAt: reviewed.reviewHistory?.at(-1)?.at ?? null,
    };
  }

  function buildProposal() {
    const config = configuration();
    const registry = system().registry;
    const decisions = [];
    for (const requirement of config.requirements) {
      for (const pack of requirement.packCandidates ?? []) {
        const candidate = registry.get(pack.candidateId);
        if (!candidate) continue;
        decisions.push({
          requirementId: requirement.id,
          candidateId: candidate.candidateId,
          packId: pack.packId,
          jurisdiction: requirement.jurisdiction,
          domain: requirement.domain,
          governance: candidate.status,
          runtimeExecutable: Boolean(candidate.runtimeExecutable),
          requiresReview: !registry.approved(candidate),
          approvalPath: 'EXPLICIT_HUMAN_CONTENT_REVIEW',
        });
      }
    }
    const data = {
      schemaVersion: 'configuration-proposal/1',
      configurationHash: config.configurationHash,
      profileRevision: config.profileRevision,
      language: config.language,
      fallbackLanguage: config.fallbackLanguage,
      currencies: config.currencies,
      period: config.period,
      jurisdictions: config.jurisdictions,
      requirements: config.requirements.map((entry) => ({id: entry.id, status: entry.status, reason: entry.reason, coveredPackIds: entry.coveredPackIds})),
      decisions: [...new Map(decisions.map((entry) => [entry.candidateId, entry])).values()],
      unresolved: config.unresolved,
      questions: config.questions,
      research: researchSummary(),
      researchStatus: researchSummary().status ?? 'NOT_STARTED',
      contentApprovalRequired: decisions.some((entry) => entry.requiresReview),
      taxReady: config.requirements.filter((entry) => entry.kind === 'TAX').every((entry) => entry.status === 'GOVERNED_EXECUTABLE'),
    };
    return deepFreeze({...data, proposalHash: fingerprint(data)});
  }

  function proposal() {
    const next = buildProposal();
    current.proposal = next;
    save();
    return next;
  }

  function confirmProposal({proposalHash, actor, decisionSource = 'HUMAN'} = {}) {
    human(actor);
    if (decisionSource !== 'HUMAN') throw Error('Explicit human confirmation required');
    const currentProposal = buildProposal();
    if (typeof proposalHash !== 'string' || proposalHash !== currentProposal.proposalHash) throw Error('Confirmation must reference the current configuration proposal');
    const record = {proposalHash, configurationHash: currentProposal.configurationHash, profileRevision: currentProposal.profileRevision, actor, decisionSource, at: now()};
    current.proposal = currentProposal;
    current.proposalConfirmation = record;
    save();
    return record;
  }

  async function runResearch({actor = 'user', domains = null, initialOfficialUrls = []} = {}) {
    if (typeof actor !== 'string' || !actor.trim()) throw Error('Research actor required');
    const researchPlans = plans(domains);
    // A reused official URL is a navigation hint only: the worker still has to fetch,
    // read and cite it in this run before it becomes evidence.
    const seedUrls = Array.isArray(initialOfficialUrls) ? initialOfficialUrls.slice(0, 12) : [];
    const base = {
      planHash: researchPlans.planHash,
      configurationHash: researchPlans.configurationHash,
      policyMode: researchPlans.policyMode,
      at: now(),
      plans: researchPlans.plans.map((plan) => ({jurisdiction: plan.jurisdiction, briefHash: plan.brief.briefHash, requirementIds: plan.requirementIds})),
      seedSources: seedUrls.length ? {mode: 'REUSED_ALLOWED_SOURCE', discoveryClaim: 'NOT_DISCOVERED_BY_THIS_RUN', urls: seedUrls} : null,
    };
    if (researchPlans.status !== 'PLANNED') {
      current.research = {...base, status: researchPlans.status, results: [], unsupported: researchPlans.unsupported};
      save();
      return researchView();
    }
    let adapter, retriever;
    try {
      adapter = adapterFactory ? adapterFactory({maxRequests: maxTurns * researchPlans.plans.length}) : defaultAdapter({maxRequests: maxTurns * researchPlans.plans.length});
      if (!retrieverFactory && !researchRoot) throw Error('Research artifact store is not configured');
      retriever = retrieverFactory ? retrieverFactory({researchPlans}) : new (require('../ai/researchRetriever').ResearchRetriever)({root: researchRoot});
    } catch (error) {
      current.research = {...base, status: 'MUSE_UNAVAILABLE', reason: String(error.message).slice(0, 300), results: [], unsupported: researchPlans.unsupported};
      save();
      return researchView();
    }
    const {RegulatoryResearchWorker} = require('../ai/regulatoryResearch');
    const {sanitizeResearchRecord} = require('../fabric/researchSanitizer');
    const results = [];
    for (const plan of researchPlans.plans) {
      const worker = new RegulatoryResearchWorker({
        adapter,
        retriever,
        maxTurns,
        maxReadSelections: 48,
        maxReadCharacters: 160000,
        initialOfficialUrls: seedUrls,
        validateCandidates: (proposed, context) => validateConfigurationCandidates(proposed, {
          ...context,
          registry: system().registry,
          policyMode: policyMode(),
        }),
        persist: (job) => {
          if (!current.research) current.research = {...base, status: 'RUNNING', results: []};
          current.research.jobs = {...(current.research.jobs ?? {}), [plan.jurisdiction]: sanitizeResearchRecord(job)};
          save();
        },
      });
      try {
        const job = await worker.run({
          profile: {
            subjectType: profile()?.slots?.['org.subjectType']?.value ?? 'UNKNOWN',
            businessType: profile()?.slots?.['org.businessType']?.value ?? null,
            jurisdiction: plan.jurisdiction,
            language: configuration().language,
            source: 'CONFIRMED_PROFILE',
          },
          taxQuestions: plan.need.questionsToResolve,
          jurisdictions: [plan.jurisdiction],
          taxPeriod: configuration().period,
          brief: plan.brief,
          outputSchema: plan.outputSchema,
        });
        results.push({
          jurisdiction: plan.jurisdiction,
          researchId: job.researchId ?? null,
          status: job.status,
          candidateIds: job.candidateIds ?? [],
          unresolved: job.unresolved ?? [],
          missingFacts: job.missingFacts ?? [],
          researchGaps: job.researchGaps ?? [],
          conflictCount: job.conflicts?.length ?? 0,
          failure: job.failure ?? null,
        });
      } catch (error) {
        results.push({
          jurisdiction: plan.jurisdiction,
          status: 'FAILED',
          candidateIds: [],
          unresolved: [{code: 'RESEARCH_REQUEST_FAILED', detail: String(error.message).slice(0, 300)}],
          missingFacts: [],
          researchGaps: [],
        });
      }
    }
    current.research = {
      ...base,
      jobs: current.research?.jobs ?? {},
      telemetry: researchTelemetry(adapter),
      status: results.every((entry) => entry.status === 'CANDIDATES_VALIDATED') ? 'CANDIDATES_VALIDATED'
        : results.some((entry) => entry.status === 'FAILED') ? 'REVIEW_REQUIRED'
          : results.find((entry) => ['MISSING_FACT', 'CONFLICT', 'REVIEW_REQUIRED'].includes(entry.status))?.status ?? 'REVIEW_REQUIRED',
      results,
      unsupported: researchPlans.unsupported,
    };
    save();
    return researchView();
  }

  function researchView() {
    const config = configuration();
    return {
      configuration: config,
      plans: plans(),
      research: researchSummary(),
      candidates: candidates(),
      questions: config.questions,
      unresolved: config.unresolved,
      proposal: buildProposal(),
    };
  }

  // Verified-but-not-yet-governed findings stay visible: official sources that
  // were actually retrieved and read, and the evidence gaps Muse reported.
  function researchEvidence({jurisdiction = null} = {}) {
    const jobs = current.research?.jobs ?? {};
    const selected = jurisdiction ? (jobs[jurisdiction] ? [jobs[jurisdiction]] : []) : Object.values(jobs);
    if (!selected.length) return {researchIds: [], status: current.research?.status ?? 'NOT_STARTED', sources: [], readings: [], searches: [], questions: [], researchGaps: [], unresolved: [], conflicts: [], failure: null};
    const sources = [], readings = [], searches = [], questions = [], researchGaps = [], unresolved = [], conflicts = [];
    for (const job of selected) {
      for (const entry of (job.retrievals ?? []).filter((item) => item.status === 'RETRIEVED')) {
        sources.push({
          sourceHandle: entry.sourceHandle ?? null,
          url: entry.url ?? null,
          title: entry.title ?? null,
          jurisdiction: entry.jurisdictionCode ?? null,
          sourceRole: entry.sourceRole ?? null,
          pageCount: entry.pageCount ?? null,
        });
      }
      for (const entry of (job.readings ?? []).slice(-40)) {
        readings.push({
          sourceHandle: entry.sourceHandle ?? null,
          locator: entry.locator ?? null,
          textHash: entry.textHash ?? null,
          truncated: Boolean(entry.truncated),
          excerpt: typeof entry.text === 'string' ? entry.text.slice(0, 400) : null,
        });
      }
      for (const search of job.searches ?? []) {
        for (const call of search.calls ?? []) searches.push({id: call.id ?? null, queries: call.queries ?? []});
      }
      questions.push(...(job.missingFacts ?? []));
      researchGaps.push(...(job.researchGaps ?? []));
      unresolved.push(...(job.unresolved ?? []));
      conflicts.push(...(job.conflicts ?? []));
    }
    return {
      researchIds: [...new Set(selected.map((job) => job.researchId).filter(Boolean))],
      status: current.research?.status ?? selected.at(-1)?.status ?? null,
      sources,
      readings,
      searches,
      questions,
      researchGaps,
      unresolved,
      conflicts,
      failure: selected.map((job) => job.failure).filter(Boolean).at(-1) ?? null,
    };
  }

  function confirmations() {
    return current.confirmations ?? {};
  }

  function researchTelemetryView() {
    return current.research?.telemetry ?? {provider: 'meta', model: null, requests: 0, records: [], usage: {}, estimatedCost: null, costStatus: 'NOT_REPORTED'};
  }

  function currentEstimate({execute = false} = {}) {
    const config = configuration();
    const result = estimateTaxes({
      registry: system().registry,
      engine: execute ? system().engine : null,
      configuration: config,
      financial: financial(),
      workspace: workspace(),
      confirmedFacts: taxFacts() ?? [],
      confirmations: confirmations(),
    });
    return result;
  }

  function estimateView() {
    const config = configuration();
    const stored = current.lastEstimate;
    if (stored && stored.configurationHash === (config.configurationHash ?? null)) return stored;
    return currentEstimate({execute: false});
  }

  function refreshEstimates({save: shouldSave = true} = {}) {
    const result = currentEstimate({execute: true});
    current.lastEstimate = result;
    if (shouldSave) save();
    return result;
  }

  function confirmEstimate({snapshotHash, actor} = {}) {
    human(actor);
    if (typeof snapshotHash !== 'string' || !snapshotHash.trim()) throw Error('Exact estimate fact snapshot required');
    const prepared = currentEstimate({execute: false}).prepared ?? [];
    if (!prepared.some((entry) => entry.snapshotHash === snapshotHash)) throw Error('Estimate facts changed; review the current snapshot');
    current.confirmations = {...confirmations(), [snapshotHash]: {actor, reviewedSnapshotHash: snapshotHash, at: now()}};
    const result = currentEstimate({execute: true});
    current.lastEstimate = result;
    save();
    return result;
  }

  function view() {
    const config = configuration();
    return {
      configuration: config,
      plans: plans(),
      research: researchSummary(),
      candidates: candidates(),
      proposal: current.proposal?.configurationHash === config.configurationHash ? current.proposal : buildProposal(),
      confirmation: current.proposalConfirmation?.configurationHash === config.configurationHash ? current.proposalConfirmation : null,
      estimates: estimateView(),
      questions: config.questions,
      unresolved: config.unresolved,
      state: {version: current.version},
    };
  }

  function restoreState(next) {
    if (!next || typeof next !== 'object' || next.version !== 1) return current;
    current = {...blankState(), ...next, version: 1};
    return current;
  }

  function requirementsSummary() {
    const config = configuration();
    const counts = {};
    for (const requirement of config.requirements) counts[requirement.status] = (counts[requirement.status] ?? 0) + 1;
    return {
      configurationHash: config.configurationHash,
      language: config.language,
      fallbackLanguage: config.fallbackLanguage,
      subjectType: config.subjectType,
      period: config.period,
      currencies: {functional: config.currencies.functional, reporting: config.currencies.reporting},
      jurisdictions: config.jurisdictions,
      counts,
      requirementCount: config.requirements.length,
      researchRequired: config.researchRequirements.length,
      unresolved: config.unresolved,
      questions: config.questions,
      researchStatus: researchSummary().status ?? 'NOT_STARTED',
      estimateStatus: current.lastEstimate?.status ?? 'NOT_CALCULATED',
      authoritativeFiling: false,
    };
  }

  function researchProgress() {
    const research = current.research ?? null;
    const jobs = Object.values(research?.jobs ?? {});
    const entries = jobs.map((job) => {
      const retrieved = (job.retrievals ?? []).filter((entry) => entry.status === 'RETRIEVED');
      return {
        jurisdiction: (job.jurisdictions ?? [])[0] ?? null,
        status: job.status ?? null,
        turns: Array.isArray(job.turns) ? job.turns.length : 0,
        searches: (job.searches ?? []).length,
        documents: retrieved.length,
        readings: (job.readings ?? []).length,
        candidates: (job.candidateIds ?? []).length,
        failure: job.failure?.code ?? null,
        recentDocuments: retrieved.slice(-4).map((entry) => ({
          title: entry.title ?? null,
          authority: entry.issuingAuthority ?? entry.documentIdentity?.issuingAuthority ?? null,
          url: entry.originalSourceUrl ?? entry.url ?? null,
          sourceType: entry.sourceType ?? null,
          retrievedAt: entry.retrievedAt ?? null,
          contentHash: entry.rawContentHash ?? null,
        })),
      };
    });
    const discovered = research?.results?.flatMap((entry) => entry.candidateIds ?? []) ?? [];
    return {
      status: research?.status ?? 'NOT_STARTED',
      at: research?.at ?? null,
      plans: research?.plans?.length ?? 0,
      entries,
      totals: {
        documents: entries.reduce((sum, entry) => sum + entry.documents, 0),
        readings: entries.reduce((sum, entry) => sum + entry.readings, 0),
        searches: entries.reduce((sum, entry) => sum + entry.searches, 0),
        candidates: discovered.length,
      },
      discovered,
      telemetry: researchTelemetryView(),
      pending: configuration().researchRequirements.length,
    };
  }

  return {
    configuration,
    plans,
    view,
    researchView,
    researchEvidence,
    researchTelemetry: researchTelemetryView,
    researchProgress,
    runResearch,
    candidates,
    reviewCandidate,
    proposal,
    confirmProposal,
    estimates: estimateView,
    refreshEstimates,
    confirmEstimate,
    requirementsSummary,
    state: () => current,
    restoreState,
  };
}

function researchTelemetry(adapter) {
  const records = typeof adapter?.metrics === 'function' ? adapter.metrics() : [];
  const usage = {};
  for (const record of records) {
    for (const key of ['input_tokens', 'output_tokens', 'total_tokens', 'reasoning_tokens']) {
      const value = record?.usage?.[key];
      if (Number.isSafeInteger(value) && value >= 0) usage[key] = (usage[key] ?? 0) + value;
    }
  }
  const costs = records.map((record) => record.estimatedCost).filter((value) => typeof value === 'number' && Number.isFinite(value));
  return {
    provider: 'meta',
    model: adapter?.model ?? null,
    requests: adapter?.requestCount ?? records.length,
    records,
    usage,
    estimatedCost: costs.length ? costs.reduce((sum, value) => sum + value, 0) : null,
    costStatus: records.some((record) => record.costStatus && record.costStatus !== 'NOT_REPORTED') ? 'REPORTED' : 'NOT_REPORTED',
  };
}

function defaultAdapter({maxRequests}) {  const {MetaModelAdapter} = require('../ai/aiAdapter');
  const adapter = new MetaModelAdapter({allowLive: true, maxRequests, maxRetries: 0, timeoutMs: 90000});
  if (!adapter.endpoint || !adapter.apiKey || !adapter.model) throw Error('MUSE_UNAVAILABLE: Meta Muse configuration is missing');
  if (!/^muse-spark(?:-[\w.-]+)?$/.test(adapter.model)) throw Error('MUSE_UNAVAILABLE: a Muse Spark model is required');
  return adapter;
}

module.exports = {createConfigurationService, blankState};
