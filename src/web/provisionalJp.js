'use strict';
// Provisional tax estimate for a single individual business taxpayer.
// It reuses the ONE tax DSL (evaluateAst) and an evidence-bound CountryPack
// candidate. It never registers or approves legal content: the result is
// labelled provisional, every assumption is printed, and the ledger is only read.

const { fingerprint } = require('../onboarding/canonical');
const dsl = require('../tax/dsl');

const PACK = require('../../research/nikos-jp/jp-income-tax-pack.json');
const RULE = PACK.rules[0];
const PARAMETERS = dsl.typedParameters(RULE);
const param = (code) => String(RULE.parameters[code].value);

const FACT_SPEC = Object.freeze({
  taxYear: { values: null, numeric: true },
  residence: { values: ['JP', 'OTHER'] },
  incomeScope: { values: ['BUSINESS_ONLY', 'ALL_RECORDED'] },
  expenseTreatment: { values: ['DEDUCTIBLE_BUSINESS', 'NONE'] },
});

const DEFAULT_FACTS = Object.freeze({ taxYear: 2026, residence: 'JP', incomeScope: 'BUSINESS_ONLY', expenseTreatment: 'DEDUCTIBLE_BUSINESS' });

const BASES = Object.freeze({
  POSTED_YEAR_TO_DATE: 'Posted ledger activity for the tax year to date. No projection or annualisation is applied.',
});

function minor(position, key) {
  const value = position?.[key];
  return value && typeof value.amountMinor === 'string' ? BigInt(value.amountMinor) : 0n;
}

function evaluate(facts, position) {
  const currency = position?.currency ?? PACK.currency;
  const incomeMinor = minor(position, 'recognizedBusinessIncome');
  const recordedExpenseMinor = minor(position, 'confirmedBusinessExpenses');
  const expenseMinor = facts.expenseTreatment === 'DEDUCTIBLE_BUSINESS' ? recordedExpenseMinor : 0n;
  const netMinor = incomeMinor - expenseMinor;
  const basicDeduction = BigInt(param('BASIC_DEDUCTION'));
  const taxableBaseMinor = netMinor - basicDeduction;
  const inputs = {
    ANNUAL_NET_BUSINESS_INCOME: dsl.numberValue(netMinor.toString()),
    TAX_BASE: dsl.numberValue(taxableBaseMinor.toString()),
  };
  const coverage = {
    bracketLow: param('BRACKET_LOW'),
    bracketHigh: param('BRACKET_HIGH'),
    rate: param('RATE'),
    basicDeduction: param('BASIC_DEDUCTION'),
    incomeFloor: param('DEDUCTION_INCOME_LOW'),
    minimumAnnualNetRequired: (BigInt(param('DEDUCTION_INCOME_LOW')) + 1n).toString(),
    proven: String(dsl.evaluateAst(RULE.applicabilityPredicate, { inputs, parameters: PARAMETERS })) === 'true',
  };
  const blockers = [];
  if (facts.residence !== 'JP') blockers.push({ code: 'TAX_RESIDENCE_OUTSIDE_JP', detail: 'The only available candidate rule applies to Japan-source individual business income with JP residence assumed by the taxpayer.' });
  if (!coverage.proven) blockers.push({
    code: 'RULE_BRACKET_NOT_COVERED',
    detail: `The available candidate covers annual net business income above ${coverage.incomeFloor} ${currency} with taxable income ${coverage.bracketLow}-${coverage.bracketHigh} ${currency} at rate ${coverage.rate}. This workspace shows ${netMinor} ${currency} net and ${taxableBaseMinor} ${currency} taxable, so no available rule computes it.`,
  });
  if (PACK.applicability.warning) blockers.push({ code: PACK.applicability.warning, detail: 'Effective window of the source rule is not verified for the requested year.' });
  const calculated = coverage.proven && facts.residence === 'JP'
    ? dsl.toMoney(dsl.evaluateAst(RULE.amountFormula, { inputs, parameters: PARAMETERS }), currency, { mode: 'DOWN', precision: 0 })
    : null;
  const status = calculated ? 'PROVISIONAL_ESTIMATE' : 'INFORMATION_REQUIRED';
  const evaluationHash = fingerprint({ status, facts, incomeMinor: incomeMinor.toString(), expenseMinor: expenseMinor.toString(), journalCount: position?.accounting?.journalCount ?? 0, pack: PACK.contentHash });
  return {
    status,
    provisionalOnly: true,
    approvalStatus: 'CANDIDATE_NOT_APPROVED_LAW',
    taxYear: facts.taxYear,
    currency,
    basis: 'POSTED_YEAR_TO_DATE',
    basisNote: BASES.POSTED_YEAR_TO_DATE,
    facts: { ...facts },
    figures: {
      incomeMinor: incomeMinor.toString(),
      recordedExpenseMinor: recordedExpenseMinor.toString(),
      usedExpenseMinor: expenseMinor.toString(),
      netMinor: netMinor.toString(),
      basicDeductionMinor: basicDeduction.toString(),
      taxableBaseMinor: taxableBaseMinor.toString(),
      journalCount: position?.accounting?.journalCount ?? 0,
      period: position?.period ?? null,
    },
    coverage,
    blockers,
    estimate: calculated ? { amountMinor: String(calculated.amountMinor), currency: calculated.currency } : null,
    assumptions: [
      'Amounts come from posted journals only; personal or unposted items are excluded.',
      `Residence for this estimate: ${facts.residence === 'JP' ? 'Japan (declared by the taxpayer)' : 'not Japan'}.`,
      facts.expenseTreatment === 'DEDUCTIBLE_BUSINESS' ? 'Recorded business expenses are deducted.' : 'No expenses are deducted (conservative).',
      `Candidate rule parameters: basic deduction ${coverage.basicDeduction}, rate ${coverage.rate}, surtax ${param('SURTAX_RATE')}, fixed deduction ${param('FIXED_DEDUCTION')}.`,
      'The rule is a candidate produced from official National Tax Agency sources; it is not approved law and this is not a filing.',
    ],
    evidence: PACK.evidence.map((e) => ({ sourceUrl: e.sourceUrl, rawContentHash: e.rawContentHash })),
    pack: { packId: PACK.packId, version: PACK.version, candidateId: PACK.candidateId, applicability: PACK.applicability.status, uncertainty: PACK.applicability.uncertainty },
    evaluationHash,
  };
}

function createProvisionalJp({ state, financial, persist, now = () => new Date().toISOString() }) {
  state.provisionalJp ??= { facts: { ...DEFAULT_FACTS }, revisions: [], last: null };
  const saved = state.provisionalJp;
  function view() {
    const evaluation = evaluate(saved.facts, financial());
    return { ...evaluation, revisions: saved.revisions.slice(-20), lastCalculatedAt: saved.last?.at ?? null };
  }
  function correct({ changes, actor }) {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes) || !Object.keys(changes).length) throw Error('Correction requires at least one fact change');
    const next = { ...saved.facts };
    for (const [key, value] of Object.entries(changes)) {
      const spec = FACT_SPEC[key];
      if (!spec) throw Error('Unsupported fact: ' + key);
      if (key === 'taxYear') {
        if (!/^\d{4}$/.test(String(value)) || Number(value) < 2000 || Number(value) > 2100) throw Error('Tax year must be a four digit year');
        next.taxYear = Number(value);
      } else {
        if (!spec.values.includes(value)) throw Error('Unsupported value for ' + key);
        next[key] = value;
      }
    }
    const before = { facts: { ...saved.facts }, revisions: saved.revisions.length };
    saved.facts = next;
    saved.revisions.push({ at: now(), actor: actor ?? 'user', changes, facts: { ...next }, factHash: fingerprint(next) });
    try { persist?.(); } catch (error) { saved.facts = before.facts; saved.revisions.length = before.revisions; throw error; }
    return view();
  }
  function recalculate({ actor } = {}) {
    const evaluation = evaluate(saved.facts, financial());
    const entry = { at: now(), actor: actor ?? 'user', status: evaluation.status, evaluationHash: evaluation.evaluationHash, estimate: evaluation.estimate };
    saved.last = entry;
    saved.revisions.push({ at: entry.at, actor: entry.actor, type: 'RECALCULATE', status: entry.status, evaluationHash: entry.evaluationHash });
    try { persist?.(); } catch (error) { throw error; }
    return view();
  }
  return { view, correct, recalculate, evaluate: () => evaluate(saved.facts, financial()) };
}

module.exports = { createProvisionalJp, evaluate, PACK };
