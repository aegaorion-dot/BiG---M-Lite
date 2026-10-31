'use strict';

// Provisional tax estimate: engine reuse, fact correction, deterministic
// recalculation, audit trail and isolation from approved legal rules.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, createProvisionalJp, PACK } = require('../src/web/provisionalJp');

const position = (income, expense, journalCount = 17) => ({
  currency: 'JPY',
  period: { periodStart: '2026-01-01', periodEnd: '2026-12-31' },
  recognizedBusinessIncome: { amountMinor: String(income), currency: 'JPY' },
  confirmedBusinessExpenses: { amountMinor: String(expense), currency: 'JPY' },
  accounting: { journalCount },
});
const facts = { taxYear: 2026, residence: 'JP', incomeScope: 'BUSINESS_ONLY', expenseTreatment: 'DEDUCTIBLE_BUSINESS' };

describe('provisional Japan estimate', () => {
  it('refuses to invent a number when the candidate rule does not cover the bracket', () => {
    const result = evaluate(facts, position(5627290, 780632));
    assert.equal(result.status, 'INFORMATION_REQUIRED');
    assert.equal(result.estimate, null);
    const codes = result.blockers.map((b) => b.code);
    assert.ok(codes.includes('RULE_BRACKET_NOT_COVERED'));
    assert.ok(codes.includes(PACK.applicability.warning));
    assert.equal(result.figures.netMinor, '4846658');
    assert.equal(result.figures.taxableBaseMinor, '4266658');
    assert.equal(result.figures.journalCount, 17);
  });

  it('computes with the pack AST when the taxable base falls inside the covered bracket', () => {
    const result = evaluate({ ...facts, expenseTreatment: 'NONE' }, position(19053000, 780632));
    assert.equal(result.status, 'PROVISIONAL_ESTIMATE');
    assert.deepEqual(result.estimate, { amountMinor: '4689657', currency: 'JPY' });
    assert.equal(result.provisionalOnly, true);
    assert.equal(result.approvalStatus, 'CANDIDATE_NOT_APPROVED_LAW');
  });

  it('is deterministic for the same facts and journals', () => {
    const a = evaluate(facts, position(5627290, 780632));
    const b = evaluate(facts, position(5627290, 780632));
    assert.equal(a.evaluationHash, b.evaluationHash);
    const changed = evaluate(facts, position(5627290, 780632, 18));
    assert.notEqual(a.evaluationHash, changed.evaluationHash);
  });

  it('records a correction in an audit trail without touching journals', () => {
    const state = { provisionalJp: null };
    let persisted = 0;
    const service = createProvisionalJp({ state, financial: () => position(5627290, 780632), persist: () => { persisted += 1; }, now: () => '2026-11-01T00:00:00.000Z' });
    const before = service.view();
    const after = service.correct({ changes: { expenseTreatment: 'NONE' }, actor: 'user' });
    assert.equal(after.facts.expenseTreatment, 'NONE');
    assert.equal(after.figures.usedExpenseMinor, '0');
    assert.equal(after.figures.incomeMinor, before.figures.incomeMinor, 'income must come from the same posted journals');
    assert.equal(after.figures.journalCount, 17, 'corrections never change posted journals');
    assert.equal(state.provisionalJp.revisions.length, 1);
    assert.equal(state.provisionalJp.revisions[0].actor, 'user');
    assert.ok(state.provisionalJp.revisions[0].factHash);
    assert.ok(persisted >= 1);
  });

  it('recalculates after a correction and keeps the previous revision for audit', () => {
    const state = { provisionalJp: null };
    const service = createProvisionalJp({ state, financial: () => position(5627290, 780632), persist: () => {} });
    service.correct({ changes: { residence: 'OTHER' } });
    const blocked = service.recalculate({ actor: 'user' });
    assert.equal(blocked.status, 'INFORMATION_REQUIRED');
    assert.ok(blocked.blockers.some((b) => b.code === 'TAX_RESIDENCE_OUTSIDE_JP'));
    service.correct({ changes: { residence: 'JP' } });
    const back = service.recalculate({ actor: 'user' });
    assert.equal(back.status, 'INFORMATION_REQUIRED');
    const types = state.provisionalJp.revisions.map((r) => r.type ?? 'CORRECTION');
    assert.deepEqual(types, ['CORRECTION', 'RECALCULATE', 'CORRECTION', 'RECALCULATE']);
    assert.ok(back.revisions.length >= 4);
  });

  it('rejects unknown facts and never registers or approves the pack', () => {
    const state = { provisionalJp: null };
    const service = createProvisionalJp({ state, financial: () => position(5627290, 780632), persist: () => {} });
    assert.throws(() => service.correct({ changes: { inventedRate: '0.1' } }), /Unsupported fact/);
    assert.throws(() => service.correct({ changes: { residence: 'MARS' } }), /Unsupported value/);
    const view = service.view();
    assert.equal(view.approvalStatus, 'CANDIDATE_NOT_APPROVED_LAW');
    assert.equal(view.provisionalOnly, true);
    assert.ok(!JSON.stringify(view).includes('APPROVED_EXECUTABLE'));
    const source = require('node:fs').readFileSync('src/web/provisionalJp.js', 'utf8');
    assert.doesNotMatch(source, /autoApproveDemo|governanceStore|approveContent/, 'the provisional path must not approve legal content');
  });
});
