'use strict';
// Provisional tax estimate for a single individual business taxpayer.
// Reuses the ONE tax DSL and an evidence-bound CountryPack candidate. It never
// registers or approves legal content: results stay provisional and every
// assumption is printed.

const { fingerprint } = require('../onboarding/canonical');
const dsl = require('../tax/dsl');

const PACK = require('../../research/nikos-jp/jp-income-tax-pack.json');
const RULE_GENERIC = PACK.rules[0];
const DEFAULT_FACTS = Object.freeze({ taxYear: 2026, residence: 'JP', incomeScope: 'BUSINESS_ONLY', expenseTreatment: 'DEDUCTIBLE_BUSINESS', basicDeduction: ruleParam(RULE_GENERIC, 'BASIC_DEDUCTION') });
const FACT_SPEC = Object.freeze({
  taxYear: { numeric: true },
  residence: { values: ['JP', 'OTHER'] },
  incomeScope: { values: ['BUSINESS_ONLY', 'ALL_RECORDED'] },
  expenseTreatment: { values: ['DEDUCTIBLE_BUSINESS', 'NONE'] },
  basicDeduction: { numeric: true },
});
const BASIS_NOTE = 'Posted ledger activity for the tax year to date. No projection or annualisation is applied.';

function ruleParam(rule, code) { return String(rule.parameters[code].value); }
function minorOf(position, key) { const v = position?.[key]; return v && typeof v.amountMinor === 'string' ? BigInt(v.amountMinor) : 0n; }

function evaluate(facts, position) {
  const currency = position?.currency ?? PACK.currency;
  const incomeMinor = minorOf(position, 'recognizedBusinessIncome');
  const recordedExpenseMinor = minorOf(position, 'confirmedBusinessExpenses');
  const usedExpenseMinor = facts.expenseTreatment === 'DEDUCTIBLE_BUSINESS' ? recordedExpenseMinor : 0n;
  const netMinor = incomeMinor - usedExpenseMinor;
  const basicDeduction = BigInt(facts.basicDeduction ?? ruleParam(RULE_GENERIC, 'BASIC_DEDUCTION'));
  const taxableBaseMinor = netMinor - basicDeduction;
  const inputs = { ANNUAL_NET_BUSINESS_INCOME: dsl.numberValue(netMinor.toString()), TAX_BASE: dsl.numberValue(taxableBaseMinor.toString()) };
  const checked = PACK.rules.map((rule) => {
    const parameters = dsl.typedParameters(rule);
    const applies = String(dsl.evaluateAst(rule.applicabilityPredicate, { inputs, parameters })) === 'true';
    return { rule, parameters, applies };
  });
  const match = checked.find((c) => c.applies) ?? null;
  const computed = match && facts.residence === 'JP'
    ? dsl.toMoney(dsl.evaluateAst(match.rule.amountFormula, { inputs, parameters: match.parameters }), currency, { mode: 'DOWN', precision: 0 })
    : null;
  const blockers = [];
  if (facts.residence !== 'JP') blockers.push({ code: 'TAX_RESIDENCE_OUTSIDE_JP', detail: 'The available candidate rules assume Japan residence declared by the taxpayer.' });
  if (!match) blockers.push({
    code: 'RULE_BRACKET_NOT_COVERED',
    detail: 'No available candidate rule covers taxable income ' + taxableBaseMinor + ' ' + currency + '. Covered brackets: ' + checked.map((c) => ruleParam(c.rule, 'BRACKET_LOW') + '-' + ruleParam(c.rule, 'BRACKET_HIGH') + ' @ ' + ruleParam(c.rule, 'RATE')).join(', ') + '.',
  });
  blockers.push({ code: 'BASIC_DEDUCTION_NOT_VERIFIED_FOR_TAX_YEAR', detail: 'Basic deduction used is ' + basicDeduction + ' ' + currency + '; the 2026 reform change could not be verified automatically, so confirm it before relying on the figure.' });
  if (PACK.applicability.warning) blockers.push({ code: PACK.applicability.warning, detail: 'Effective window of the source rule is not verified for the requested year.' });
  const coverage = match ? {
    ruleId: match.rule.ruleId ?? null,
    bracketLow: ruleParam(match.rule, 'BRACKET_LOW'),
    bracketHigh: ruleParam(match.rule, 'BRACKET_HIGH'),
    rate: ruleParam(match.rule, 'RATE'),
    fixedDeduction: ruleParam(match.rule, 'FIXED_DEDUCTION'),
    surtaxRate: ruleParam(match.rule, 'SURTAX_RATE'),
  } : { rate: null, bracketLow: null, bracketHigh: null, surtaxRate: null, fixedDeduction: null, ruleId: null };
  const status = computed ? 'PROVISIONAL_ESTIMATE' : 'INFORMATION_REQUIRED';
  return {
    status,
    provisionalOnly: true,
    approvalStatus: 'CANDIDATE_NOT_APPROVED_LAW',
    taxYear: facts.taxYear,
    currency,
    basis: 'POSTED_YEAR_TO_DATE',
    basisNote: BASIS_NOTE,
    facts: { ...facts },
    figures: {
      incomeMinor: incomeMinor.toString(), recordedExpenseMinor: recordedExpenseMinor.toString(), usedExpenseMinor: usedExpenseMinor.toString(),
      netMinor: netMinor.toString(), basicDeductionMinor: basicDeduction.toString(), taxableBaseMinor: taxableBaseMinor.toString(),
      journalCount: position?.accounting?.journalCount ?? 0, period: position?.period ?? null,
    },
    coverage,
    blockers,
    estimate: computed ? { amountMinor: String(computed.amountMinor), currency: computed.currency } : null,
    assumptions: [
      'Amounts come from posted journals only; personal or unposted items are excluded.',
      'Residence for this estimate: ' + (facts.residence === 'JP' ? 'Japan (declared by the taxpayer)' : 'not Japan') + '.',
      facts.expenseTreatment === 'DEDUCTIBLE_BUSINESS' ? 'Recorded business expenses are deducted.' : 'No expenses are deducted (conservative).',
      match ? 'Applied bracket ' + coverage.ruleId + ': rate ' + coverage.rate + ', deduction ' + coverage.fixedDeduction + ', reconstruction surtax ' + coverage.surtaxRate + '.' : 'No bracket matched, so no amount is produced.',
      'Basic deduction ' + basicDeduction + ' is a confirmable assumption, not an approved 2026 figure.',
      'Candidate rules come from official National Tax Agency sources; they are not approved law and this is not a filing.',
    ],
    evidence: PACK.evidence.map((e) => ({ sourceUrl: e.sourceUrl, rawContentHash: e.rawContentHash })),
    sources: PACK.sources ?? null,
    pack: { packId: PACK.packId, version: PACK.version, candidateId: PACK.candidateId, applicability: PACK.applicability.status, uncertainty: PACK.applicability.uncertainty },
    evaluationHash: fingerprint({ status, facts, netMinor: netMinor.toString(), journalCount: position?.accounting?.journalCount ?? 0, pack: PACK.contentHash }),
  };
}

function createProvisionalJp({ state, financial, persist, now = () => new Date().toISOString() }) {
  state.provisionalJp ??= { facts: { ...DEFAULT_FACTS }, revisions: [], last: null };
  const saved = state.provisionalJp;
  const view = () => ({ ...evaluate(saved.facts, financial()), revisions: saved.revisions.slice(-20), lastCalculatedAt: saved.last?.at ?? null });
  function correct({ changes, actor }) {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes) || !Object.keys(changes).length) throw Error('Correction requires at least one fact change');
    const next = { ...saved.facts };
    for (const [key, value] of Object.entries(changes)) {
      const spec = FACT_SPEC[key];
      if (!spec) throw Error('Unsupported fact: ' + key);
      if (spec.numeric) {
        if (key === 'taxYear') { if (!/^\d{4}$/.test(String(value)) || Number(value) < 2000 || Number(value) > 2100) throw Error('Tax year must be a four digit year'); next.taxYear = Number(value); }
        else { if (!/^\d{1,12}$/.test(String(value))) throw Error('Numeric fact required: ' + key); next[key] = String(value); }
      } else { if (!spec.values.includes(value)) throw Error('Unsupported value for ' + key); next[key] = value; }
    }
    const before = { facts: { ...saved.facts }, length: saved.revisions.length };
    saved.facts = next;
    saved.revisions.push({ at: now(), actor: actor ?? 'user', changes, facts: { ...next }, factHash: fingerprint(next) });
    try { persist?.(); } catch (e) { saved.facts = before.facts; saved.revisions.length = before.length; throw e; }
    return view();
  }
  function recalculate({ actor } = {}) {
    const evaluation = evaluate(saved.facts, financial());
    const entry = { at: now(), actor: actor ?? 'user', status: evaluation.status, evaluationHash: evaluation.evaluationHash, estimate: evaluation.estimate };
    saved.last = entry;
    saved.revisions.push({ at: entry.at, actor: entry.actor, type: 'RECALCULATE', status: entry.status, evaluationHash: entry.evaluationHash });
    persist?.();
    return view();
  }
  return { view, correct, recalculate, evaluate: () => evaluate(saved.facts, financial()) };
}

module.exports = { createProvisionalJp, evaluate, PACK };
