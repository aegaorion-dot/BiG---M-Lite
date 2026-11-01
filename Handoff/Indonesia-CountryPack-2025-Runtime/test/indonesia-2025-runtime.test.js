'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createTaxSystem } = require('../src/tax');
const {
  registerIndonesia2025,
  reviewChecklist,
  approveIndonesiaPack,
} = require('../src/tax/indonesia2025Runtime');
const {
  ordinaryIndividualExample,
  umkmIndividualMonthlyExample,
} = require('../src/tax/indonesia2025Examples');

function approveByExactHash(registry, packId) {
  const item = reviewChecklist(registry).find((x) => x.packId === packId);
  assert.ok(item, `missing ${packId}`);
  approveIndonesiaPack(registry, packId, {
    actor: 'Test Human Reviewer',
    reason: 'Acceptance-test simulated human review of exact source hashes and content',
    reviewedHashes: item.sourceHashes,
  });
}

describe('Indonesia 2025 governed runtime CountryPack', () => {
  it('registers the existing hash-bound 2025 Indonesia candidates', () => {
    const system = createTaxSystem();
    const candidates = registerIndonesia2025(system.registry);

    assert.ok(candidates.some((c) => c.executableContent.packId === 'ID_INDIVIDUAL_ORDINARY_2025'));
    assert.ok(candidates.some((c) => c.executableContent.packId === 'ID_UMKM_INDIVIDUAL_2025'));

    const checklist = reviewChecklist(system.registry);
    assert.ok(checklist.every((x) => x.sourceHashes.length > 0));
    assert.ok(checklist.every((x) => x.sourceUrls.length > 0));
  });

  it('fails closed before explicit human legal-content approval', () => {
    const system = createTaxSystem();
    registerIndonesia2025(system.registry);

    const example = ordinaryIndividualExample();
    const result = system.engine.determine(example.request, example.facts);

    assert.equal(result.status, 'REVIEW_REQUIRED');
    assert.equal(result.taxReady, false);
  });

  it('executes Article 17 on reviewed PKP after human approval', () => {
    const system = createTaxSystem();
    registerIndonesia2025(system.registry);
    approveByExactHash(system.registry, 'ID_INDIVIDUAL_ORDINARY_2025');

    const example = ordinaryIndividualExample({ taxableIncome: '134621000' });
    const result = system.engine.determine(example.request, example.facts);

    assert.equal(result.status, 'CALCULATED');
    assert.equal(result.taxReady, true);
    assert.deepEqual(result.taxableBase, { amountMinor: '134621000', currency: 'IDR' });
    assert.deepEqual(result.taxAmount, { amountMinor: '14193150', currency: 'IDR' });
    assert.equal(result.packId, 'ID_INDIVIDUAL_ORDINARY_2025');
    assert.equal(result.appliedRules[0].ruleId, 'ID_ART17_REVIEWED_PKP_2025');
    assert.ok(result.evidenceRefs.length > 0);
  });

  it('executes the governed 2025 individual UMKM monthly rule', () => {
    const system = createTaxSystem();
    registerIndonesia2025(system.registry);
    approveByExactHash(system.registry, 'ID_UMKM_INDIVIDUAL_2025');

    // YTD before October = 450m, October = 100m.
    // First 500m cumulative gross is exempt, so 50m is the governed monthly base.
    // 50m x 0.5% = 250,000.
    const example = umkmIndividualMonthlyExample();
    const result = system.engine.determine(example.request, example.facts);

    assert.equal(result.status, 'CALCULATED');
    assert.equal(result.taxReady, true);
    assert.deepEqual(result.taxableBase, { amountMinor: '50000000', currency: 'IDR' });
    assert.deepEqual(result.taxAmount, { amountMinor: '250000', currency: 'IDR' });
    assert.equal(result.packId, 'ID_UMKM_INDIVIDUAL_2025');
    assert.equal(result.appliedRules[0].ruleId, 'ID_UMKM_MONTHLY_INDIVIDUAL_2025');
    assert.equal(result.treatyResult.status, 'NOT_NEEDED');
  });
});
