'use strict';

const { candidateTaxFacts, confirmTaxFacts } = require('./facts');

function humanConfirm(snapshot, actor = 'Human Tax Reviewer') {
  return confirmTaxFacts(snapshot, {
    decisionSource: 'HUMAN',
    actor,
    reviewedSnapshotHash: snapshot.snapshotHash,
  });
}

function ordinaryIndividualExample({
  taxableIncome = '134621000',
  actor = 'Human Tax Reviewer',
} = {}) {
  const period = { periodStart: '2025-01-01', periodEnd: '2025-12-31' };
  const economicDate = '2025-12-31';
  const scopeId = 'demo:id:ordinary:2025';
  const subjectId = 'person:demo:id';

  const candidate = candidateTaxFacts({
    scopeId,
    subjectId,
    revision: 1,
    period,
    economicDate,
    currency: 'IDR',
    facts: [
      { name: 'SUBJECT_TYPE', type: 'STRING', value: 'INDIVIDUAL', evidenceReference: 'Synthetic demo identity' },
      { name: 'INCOME_TYPE', type: 'STRING', value: 'ANNUAL_ORDINARY_INDIVIDUAL_INCOME', evidenceReference: 'Reviewed demo income classification' },
      { name: 'TAX_RESIDENCE', type: 'COUNTRY', value: 'ID', evidenceReference: 'Synthetic confirmed Indonesia residence for this acceptance case' },
      { name: 'SOURCE', type: 'COUNTRY', value: 'ID', evidenceReference: 'Synthetic confirmed domestic income source for this acceptance case' },
      { name: 'BUSINESS_CAPACITY', type: 'STRING', value: 'INDIVIDUAL_FREELANCER', evidenceReference: 'Reviewed demo capacity' },
      { name: 'INCOME_REGIME', type: 'STRING', value: 'ORDINARY_ART17', evidenceReference: 'Reviewed demo tax regime' },
      { name: 'REVIEWED_TAXABLE_INCOME', type: 'MONEY', value: { amountMinor: taxableIncome, currency: 'IDR' }, evidenceReference: 'Independently reviewed PKP fixture' },
      { name: 'TAXABLE_INCOME_RECONCILIATION_APPROVED', type: 'BOOLEAN', value: true, evidenceReference: 'Simulated human review for acceptance test' },
      { name: 'ANNUAL_TAX_PERIOD_REVIEWED', type: 'BOOLEAN', value: true, evidenceReference: 'Simulated human review for acceptance test' },
    ],
  });

  return {
    request: {
      scopeId,
      subjectId,
      requestKey: 'id-ordinary-2025-acceptance',
      taxType: 'INCOME_TAX',
      jurisdictionCode: 'ID',
      jurisdictionBasis: 'TAX_RESIDENCE',
      incomeOrEventType: 'ANNUAL_ORDINARY_INDIVIDUAL_INCOME',
      currency: 'IDR',
      period,
      economicDate,
    },
    facts: humanConfirm(candidate, actor),
  };
}

function umkmIndividualMonthlyExample({
  monthGross = '100000000',
  ytdGrossBeforeMonth = '450000000',
  priorYearAggregateTurnover = '1200000000',
  firstRegimeTaxYear = '2024',
  actor = 'Human Tax Reviewer',
} = {}) {
  const period = { periodStart: '2025-10-01', periodEnd: '2025-10-31' };
  const economicDate = '2025-10-31';
  const scopeId = 'demo:id:umkm:2025-10';
  const subjectId = 'person:demo:id';

  const candidate = candidateTaxFacts({
    scopeId,
    subjectId,
    revision: 1,
    period,
    economicDate,
    currency: 'IDR',
    facts: [
      { name: 'SUBJECT_TYPE', type: 'STRING', value: 'INDIVIDUAL', evidenceReference: 'Synthetic demo identity' },
      { name: 'INCOME_TYPE', type: 'STRING', value: 'MONTHLY_ELIGIBLE_DOMESTIC_BUSINESS', evidenceReference: 'Reviewed demo income classification' },
      { name: 'TAX_RESIDENCE', type: 'COUNTRY', value: 'ID', evidenceReference: 'Synthetic confirmed Indonesia residence' },
      { name: 'SOURCE', type: 'COUNTRY', value: 'ID', evidenceReference: 'Synthetic confirmed Indonesia source' },
      { name: 'LEGAL_FORM', type: 'STRING', value: 'INDIVIDUAL', evidenceReference: 'Reviewed legal form' },
      { name: 'INCOME_CATEGORY', type: 'STRING', value: 'ELIGIBLE_NON_PROFESSIONAL_DOMESTIC_BUSINESS', evidenceReference: 'Reviewed PP55 category fixture' },
      { name: 'ELECTED_ORDINARY_REGIME', type: 'BOOLEAN', value: false, evidenceReference: 'Reviewed fixture' },
      { name: 'PREVIOUSLY_DISQUALIFIED_FROM_FINAL', type: 'BOOLEAN', value: false, evidenceReference: 'Reviewed fixture' },
      { name: 'PRIOR_YEAR_AGGREGATE_TURNOVER', type: 'MONEY', value: { amountMinor: priorYearAggregateTurnover, currency: 'IDR' }, evidenceReference: 'Reviewed prior-year turnover fixture' },
      { name: 'MONTH_GROSS_BUSINESS_TURNOVER', type: 'MONEY', value: { amountMinor: monthGross, currency: 'IDR' }, evidenceReference: 'Reviewed October gross-turnover fixture' },
      { name: 'YTD_GROSS_BEFORE_MONTH', type: 'MONEY', value: { amountMinor: ytdGrossBeforeMonth, currency: 'IDR' }, evidenceReference: 'Reviewed YTD turnover fixture' },
      { name: 'AGGREGATION_BASIS_REVIEWED', type: 'BOOLEAN', value: true, evidenceReference: 'Simulated human review for acceptance test' },
      { name: 'MONTH_PERIOD_REVIEWED', type: 'BOOLEAN', value: true, evidenceReference: 'Simulated human review for acceptance test' },
      { name: 'REGIME_FIRST_TAX_YEAR', type: 'NUMBER', value: firstRegimeTaxYear, evidenceReference: 'Reviewed regime-start fixture' },
    ],
  });

  return {
    request: {
      scopeId,
      subjectId,
      requestKey: 'id-umkm-2025-10-acceptance',
      taxType: 'SIMPLIFIED_INCOME',
      jurisdictionCode: 'ID',
      jurisdictionBasis: 'TAX_RESIDENCE',
      incomeOrEventType: 'MONTHLY_ELIGIBLE_DOMESTIC_BUSINESS',
      currency: 'IDR',
      period,
      economicDate,
    },
    facts: humanConfirm(candidate, actor),
  };
}

module.exports = {
  ordinaryIndividualExample,
  umkmIndividualMonthlyExample,
};
