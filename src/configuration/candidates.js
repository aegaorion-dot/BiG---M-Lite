'use strict';
// Converts a Muse research candidate into governed, evidence-bound CountryPack
// content using the existing Fabric candidate model and tax DSL validator.
// Registration is candidate-only: this module never approves legal content.

const {evidenceCandidate, countryPackCandidate} = require('../fabric/candidates');
const {buildExecutableMuseCandidate, demoDisclosureBlockers} = require('../ai/musePackBridge');
const {feedbackFromError, toValidationFeedback} = require('../ai/researchWorkflow');
const {routeResearchQuestions} = require('../ai/researchQuestions');
const {lookupSource} = require('../fabric/registry');
const {sanitizeResearchRecord} = require('../fabric/researchSanitizer');

function bindReadEvidence(retriever, ref) {
  if (!ref || typeof ref.sourceHandle !== 'string' || typeof ref.locator !== 'string' || typeof ref.quote !== 'string' || !ref.quote.trim()) throw Error('Citation must reference an actually read passage');
  const source = retriever.sources.get(ref.sourceHandle);
  if (!source) throw Error('Muse cited an unknown retrieved source');
  const envelope = source.envelope;
  const anchor = envelope.citationAnchors.find((entry) => entry.locator === ref.locator);
  const start = anchor ? envelope.normalizedContent.text.indexOf(ref.quote, anchor.start) : -1;
  if (!anchor || start < anchor.start || start + ref.quote.length > anchor.end) throw Error('Muse citation is not an exact anchored reading');
  return {
    source,
    evidence: evidenceCandidate(envelope, {anchorId: anchor.anchorId, start, end: start + ref.quote.length, quote: ref.quote, proposedBy: 'META_MUSE'}),
  };
}

function evidenceRefsFor(bound) {
  return bound.map(({evidence}) => ({
    evidenceId: evidence.evidenceId,
    rawContentHash: evidence.provenance.rawContentHash,
    sourceUrl: evidence.provenance.sourceUrl,
    locator: evidence.provenance.locator,
  }));
}

function fieldEvidenceOf(entry) {
  const bindings = Array.isArray(entry.fieldEvidence)
    ? entry.fieldEvidence.map((binding) => ({field: binding.fieldPath ?? binding.field, evidenceIndex: binding.evidenceIndex}))
    : [];
  if (!bindings.some((binding) => binding.field === 'candidateRule.legalTest')) bindings.push({field: 'candidateRule.legalTest', evidenceIndex: 0});
  return bindings;
}

function evidenceBundleFor({entry, bound, primary, fieldEvidence}) {
  const assessment = entry.applicabilityAssessment ?? {};
  const legalTest = entry.propositionSupported ?? entry.candidateRule?.legalTest ?? null;
  return {
    jurisdiction: primary.source.item.jurisdictionCode,
    sourceClassification: primary.source.item.sourceRole,
    sourceTitle: primary.source.item.title,
    sourceUrl: primary.source.item.url,
    issuingAuthority: entry.issuingAuthority ?? primary.source.envelope.authority?.authorityName ?? null,
    fieldEvidence,
    propositionSupported: legalTest,
    evidence: bound.map(({source, evidence}, index) => ({
      authority: evidence.authority,
      provenance: evidence.provenance,
      sourceHandle: entry.sourceEvidence[index].sourceHandle,
      locator: entry.sourceEvidence[index].locator,
    })),
    candidateRule: {legalTest, parameters: entry.candidateRule?.parameters ?? []},
    applicabilityAssessment: {
      status: assessment.status ?? 'APPLICABILITY_UNRESOLVED',
      propositionSupported: assessment.propositionSupported ?? legalTest,
      supportingEvidenceIndices: assessment.supportingEvidenceIndices ?? [0],
      sourcePublicationDate: assessment.sourcePublicationDate ?? primary.source.artifact.publishedAt?.slice(0, 10) ?? null,
      sourceRevisionDate: assessment.sourceRevisionDate ?? primary.source.artifact.lastModified?.slice(0, 10) ?? null,
      supersedingSearches: assessment.supersedingSearches ?? [],
      uncertainty: assessment.uncertainty ?? 'Applicability to the requested calculation period has not been fully verified.',
    },
    validator: {issues: []},
  };
}

function citationSource(candidate) {
  const refs = candidate.executableContent?.evidenceRefs ?? [];
  return refs.map((ref, index) => {
    const bundle = candidate.evidenceBundle?.evidence?.[index] ?? null;
    const authorised = (() => { try { return Boolean(lookupSource(candidate.executableContent.jurisdictionCode, ref.sourceUrl)); } catch { return false; } })();
    return {
      evidenceId: ref.evidenceId,
      sourceUrl: ref.sourceUrl ?? null,
      locator: ref.locator ?? null,
      rawContentHash: ref.rawContentHash ?? null,
      authority: bundle?.authority?.authorityName ?? bundle?.authority ?? null,
      quote: bundle?.provenance?.quote ?? null,
      officialSource: authorised,
    };
  });
}

function rejection(error, context = {}) {
  return {
    status: 'REJECTED',
    feedback: feedbackFromError(error, context),
    candidateIds: [],
    unresolved: [{code: 'RESEARCH_VALIDATION_REQUIRED', detail: String(error?.message ?? error).slice(0, 500)}],
    conflicts: [],
    questionsForUser: [],
    researchGaps: [],
    activatedRules: 0,
    userFactsChanged: false,
    postingPerformed: false,
  };
}

/**
 * Deterministic validator for the Muse configuration-research output.
 * Every candidate is registered as candidate-only content; approval stays a
 * separate human decision.
 */
function validateConfigurationCandidates(proposed, {job, retriever, registry, policyMode = 'STRICT'} = {}) {
  try {
    if (!registry || typeof registry.register !== 'function') throw Error('Tax content registry required');
    if (!job || !retriever) throw Error('Research job and retriever required');
    if (!proposed || typeof proposed !== 'object' || Array.isArray(proposed)) throw Error('Research result object required');
    if (!['CANDIDATE', 'REVIEW_REQUIRED', 'MISSING_FACT', 'CONFLICT'].includes(proposed?.status)) throw Error('Research status must stay candidate-only');
    if (/"(?:status|governance|decision)"\s*:\s*"(?:APPROVED|ACTIVE)"/.test(JSON.stringify(proposed))) throw Error('Muse cannot approve or activate law');
    const jurisdiction = job.brief?.jurisdictions?.[0] ?? null;
    if (!jurisdiction) throw Error('Research brief jurisdiction required');
    const packs = Array.isArray(proposed.countryPacks) ? proposed.countryPacks : [];
    if (packs.length > 4) throw Error('At most four candidate packs per research turn');
    if (Array.isArray(proposed.treatyPacks) && proposed.treatyPacks.length) throw Error('Treaty candidates require a dedicated treaty research work order');

    const questions = [
      ...(Array.isArray(proposed.questionsForUser) ? proposed.questionsForUser : []),
      ...(Array.isArray(proposed.missingFacts) ? proposed.missingFacts : []),
    ];
    const seenQuestions = new Set();
    for (const question of questions) {
      if (question?.status !== 'MISSING_FACT' || !question.factId || !question.question || !question.whyNeeded) throw Error('Explicit conversational missing-fact request required');
      const key = `${question.factId}|${question.question}`;
      if (seenQuestions.has(key)) continue;
      seenQuestions.add(key);
    }
    const uniqueQuestions = [...new Map(questions.map((question) => [`${question.factId}|${question.question}`, question])).values()];
    const routing = routeResearchQuestions(uniqueQuestions);
    const unresolved = (Array.isArray(proposed.unresolved) ? proposed.unresolved : []).map((item) => {
      if (typeof item === 'string') return {code: 'UNRESOLVED', detail: item.slice(0, 500)};
      return {
        code: typeof item?.code === 'string' ? item.code.slice(0, 120) : 'UNRESOLVED',
        detail: typeof item?.detail === 'string' ? item.detail.slice(0, 500) : null,
      };
    });
    for (const issue of Array.isArray(proposed.periodIssues) ? proposed.periodIssues : []) {
      unresolved.push({code: 'WRONG_EFFECTIVE_PERIOD', detail: (typeof issue === 'string' ? issue : issue?.description ?? null)?.slice(0, 500) ?? null});
    }
    const conflicts = (Array.isArray(proposed.conflicts) ? proposed.conflicts : []).map((item) => ({code: typeof item?.code === 'string' ? item.code.slice(0, 120) : 'CONFLICT', detail: typeof item?.detail === 'string' ? item.detail.slice(0, 500) : null}));

    if (!packs.length) {
      const reason = [...unresolved.map((entry) => entry.detail).filter(Boolean), ...uniqueQuestions.map((question) => question.question)].join(' ').slice(0, 900);
      return {
        status: 'REJECTED',
        feedback: toValidationFeedback({
          code: 'SOURCE_NOT_RETRIEVED',
          field: 'candidate',
          message: 'No evidence-bound CountryPack candidate was returned yet. ' + (reason || 'Continue from the observed official sources.'),
          hint: 'Follow an official full-text or PDF link exposed by the retrieved page, then read the controlling provision with read_regulatory_passages and propose the candidate. Keep any material taxpayer fact in missingFacts without stopping the legal research.',
        }),
        candidateIds: [],
        unresolved,
        conflicts,
        questionsForUser: routing.questionsForUser,
        researchGaps: [...routing.researchGaps, ...unresolved.filter((item) => item.code === 'MISSING_COVERAGE')],
        activatedRules: 0,
        userFactsChanged: false,
        postingPerformed: false,
      };
    }

    const registered = [];
    for (const entry of packs) {
      if (!entry?.pack || !Array.isArray(entry.sourceEvidence) || !entry.sourceEvidence.length || entry.sourceEvidence.length > 15) throw Error('Evidence-backed CountryPack candidate required');
      if (entry.pack.jurisdictionCode !== jurisdiction) throw Error(`Candidate pack jurisdiction must match the researched jurisdiction ${jurisdiction}`);
      const bound = entry.sourceEvidence.map((ref) => bindReadEvidence(retriever, ref));
      const evidenceRefs = evidenceRefsFor(bound);
      const pack = JSON.parse(JSON.stringify(entry.pack));
      pack.evidenceRefs = evidenceRefs;
      for (const rule of pack.rules ?? []) rule.evidenceRefs = evidenceRefs;
      const fieldEvidence = fieldEvidenceOf(entry);
      const sourceBase = countryPackCandidate(bound.map(({source}) => source.envelope), bound.map(({evidence}) => evidence), {label: pack.packId});
      const sourceCandidate = {...sourceBase, evidenceBundle: evidenceBundleFor({entry, bound, primary: bound[0], fieldEvidence})};
      const built = buildExecutableMuseCandidate({sourceCandidate, declarativePack: pack, policyMode});
      if (!built.ok) return {
        ...rejection(Object.assign(Error(built.feedback?.message ?? 'Executable CountryPack rejected'), {feedback: built.feedback}), {packId: pack.packId}),
        feedback: built.feedback,
        unresolved: [...unresolved, ...(built.feedback?.code ? [{code: built.feedback.code, detail: built.feedback.message}] : [])],
      };
      const stored = registry.register(built.candidate);
      if (policyMode === 'HACKATHON_DEMO' && !built.candidate.demoDisclosure) {
        const gaps = demoDisclosureBlockers(sourceCandidate, pack).gaps;
        if (gaps.length) unresolved.push({code: 'DEMO_PROVISIONAL_ACCEPTANCE_BLOCKED', detail: `${pack.packId}@${pack.version}: ${gaps.join('; ')}`});
      }
      registered.push({
        candidateId: stored.candidateId,
        packId: pack.packId,
        version: pack.version,
        jurisdiction,
        contentHash: stored.contentHash,
        governance: stored.status,
        runtimeExecutable: Boolean(stored.runtimeExecutable),
        ruleIds: (pack.rules ?? []).map((rule) => rule.ruleId),
        citations: citationSource(stored),
      });
    }

    return {
      status: registered.length ? 'EVIDENCE_VALIDATED_CANDIDATES' : proposed.status === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : 'MISSING_FACT',
      candidateIds: registered.map((candidate) => candidate.candidateId),
      candidates: sanitizeResearchRecord(registered),
      unresolved,
      conflicts,
      questionsForUser: routing.questionsForUser,
      researchGaps: [...routing.researchGaps, ...unresolved.filter((item) => item.code === 'MISSING_COVERAGE')],
      activatedRules: 0,
      userFactsChanged: false,
      postingPerformed: false,
    };
  } catch (error) {
    return rejection(error);
  }
}

module.exports = {validateConfigurationCandidates, citationSource, bindReadEvidence};
