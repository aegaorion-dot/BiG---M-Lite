'use strict';

/**
 * Indonesia 2025 runtime adapter for BiG-M Lite.
 *
 * This module DOES NOT invent a second tax engine or duplicate legal content.
 * It selects the already hash-bound Phase 4 Indonesia candidates and exposes
 * an explicit human-review gate before UniversalTaxEngine may execute them.
 */

const { loadPhase4Catalog } = require('./phase4Catalog');
const { originalCompanyCandidate } = require('./referenceCandidates');

const INDONESIA_2025_PACK_IDS = Object.freeze([
  'ID_INDIVIDUAL_ORDINARY_2025',
  'ID_UMKM_INDIVIDUAL_2025',
]);

function unique(values) {
  return [...new Set(values)];
}

function indonesia2025Candidates({ catalog = loadPhase4Catalog(), includeCompanyCIT = true } = {}) {
  const candidates = catalog.candidates.filter(
    (candidate) =>
      candidate.contentKind === 'COUNTRY_PACK'
      && candidate.executableContent?.jurisdictionCode === 'ID'
      && candidate.executableContent?.effectiveFrom <= '2025-01-01'
      && candidate.executableContent?.effectiveTo >= '2025-12-31'
      && INDONESIA_2025_PACK_IDS.includes(candidate.executableContent.packId),
  );

  if (includeCompanyCIT) {
    const company = originalCompanyCandidate();
    if (
      company.executableContent?.jurisdictionCode === 'ID'
      && company.executableContent?.effectiveFrom <= '2025-01-01'
      && company.executableContent?.effectiveTo >= '2025-12-31'
    ) {
      candidates.push(company);
    }
  }

  return candidates;
}

function registerIndonesia2025(registry, options = {}) {
  if (!registry?.governance || typeof registry.register !== 'function') {
    throw new Error('TaxContentRegistry required');
  }

  const registered = [];
  for (const candidate of indonesia2025Candidates(options)) {
    if (!registry.governance.get(candidate.candidateId)) registry.register(candidate);
    registered.push(registry.governance.get(candidate.candidateId));
  }
  return registered;
}

function reviewChecklist(registry) {
  return registry.list('COUNTRY_PACK')
    .filter((candidate) => {
      const p = candidate.executableContent;
      return p?.jurisdictionCode === 'ID'
        && p.effectiveFrom <= '2025-01-01'
        && p.effectiveTo >= '2025-12-31';
    })
    .map((candidate) => ({
      candidateId: candidate.candidateId,
      packId: candidate.executableContent.packId,
      version: candidate.executableContent.version,
      contentHash: candidate.contentHash,
      currentStatus: candidate.status,
      executable: registry.approved(candidate),
      sourceHashes: unique(candidate.provenance.map((p) => p.rawContentHash)).sort(),
      sourceUrls: unique(candidate.provenance.map((p) => p.sourceUrl)).sort(),
      label: candidate.executableContent.label ?? candidate.label ?? null,
      reviewPackage: candidate.reviewPackage ?? null,
    }));
}

/**
 * Approval remains HUMAN-only. This helper merely enforces that the caller
 * explicitly acknowledges the exact raw-source hashes before invoking the
 * existing Fabric governance transition.
 */
function approveIndonesiaPack(
  registry,
  packId,
  { actor, reason, reviewedHashes, decisionSource = 'HUMAN' } = {},
) {
  if (!actor || !reason) throw new Error('Explicit human reviewer and reason required');

  const candidate = registry.list('COUNTRY_PACK')
    .find((c) => c.executableContent?.packId === packId);

  if (!candidate) throw new Error(`Unknown Indonesia pack: ${packId}`);

  const expected = unique(candidate.provenance.map((p) => p.rawContentHash)).sort();
  const supplied = [...(reviewedHashes ?? [])].sort();

  if (JSON.stringify(expected) !== JSON.stringify(supplied)) {
    throw new Error('Human reviewer must acknowledge every exact raw source hash');
  }

  return registry.governance.review(candidate.candidateId, {
    decisionSource,
    actor,
    decision: 'APPROVED',
    reason,
    reviewedHashes: supplied,
  });
}

module.exports = {
  INDONESIA_2025_PACK_IDS,
  indonesia2025Candidates,
  registerIndonesia2025,
  reviewChecklist,
  approveIndonesiaPack,
};
