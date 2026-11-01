'use strict';
// Jurisdiction-neutral configuration taxonomy.
// Nothing here is a rate, threshold, deadline or legal conclusion: the taxonomy
// only names the questions that a business profile creates. Answers come from
// governed CountryPack content or from Muse research, never from this module.

const ACCOUNTING_DOMAINS = Object.freeze(['FILING_CALENDAR', 'ACCOUNTING_OBLIGATIONS']);

const DOMAINS = Object.freeze([
  {
    code: 'INCOME_TAX',
    kind: 'TAX',
    taxTypes: Object.freeze(['INCOME_TAX', 'SIMPLIFIED_INCOME']),
    subjectTypes: Object.freeze(['INDIVIDUAL', 'PARTNERSHIP']),
    applies: (context) => context.hasBusinessActivity || context.hasEmploymentIncome,
  },
  {
    code: 'CIT',
    kind: 'TAX',
    taxTypes: Object.freeze(['CIT', 'SIMPLIFIED_INCOME']),
    subjectTypes: Object.freeze(['COMPANY']),
    applies: (context) => context.hasBusinessActivity,
  },
  {
    code: 'CONSUMPTION_TAX',
    kind: 'TAX',
    taxTypes: Object.freeze(['VAT', 'GST', 'SALES_TAX']),
    subjectTypes: Object.freeze(['INDIVIDUAL', 'COMPANY', 'PARTNERSHIP']),
    applies: (context) => context.hasSalesActivity,
  },
  {
    code: 'WITHHOLDING_TAX',
    kind: 'TAX',
    taxTypes: Object.freeze(['WHT']),
    subjectTypes: Object.freeze(['INDIVIDUAL', 'COMPANY', 'PARTNERSHIP']),
    applies: (context) => context.hasEmploymentIncome || context.crossBorderPayments,
  },
  {
    code: 'TREATY_RELIEF',
    kind: 'TREATY',
    taxTypes: Object.freeze(['INCOME_TAX', 'CIT', 'WHT', 'FOREIGN_TAX_CREDIT']),
    subjectTypes: Object.freeze(['INDIVIDUAL', 'COMPANY', 'PARTNERSHIP']),
    applies: (context) => context.hasCrossBorderScope,
  },
  { code: 'FILING_CALENDAR', kind: 'ACCOUNTING', taxTypes: Object.freeze([]), subjectTypes: Object.freeze([]), applies: () => true },
  { code: 'ACCOUNTING_OBLIGATIONS', kind: 'ACCOUNTING', taxTypes: Object.freeze([]), subjectTypes: Object.freeze([]), applies: () => true },
]);

function domain(code) {
  return DOMAINS.find((entry) => entry.code === code) ?? null;
}

function domainsFor(context, subjectType) {
  return DOMAINS.filter((entry) => entry.applies(context)
    && (entry.kind !== 'TAX' || entry.subjectTypes.length === 0 || subjectType === 'UNKNOWN' || entry.subjectTypes.includes(subjectType)));
}

/**
 * One bounded research question per configuration domain. The wording is
 * jurisdiction-neutral; local terminology and source guidance are added from
 * registered jurisdiction metadata, never hardcoded here.
 */
function researchQuestion(entry, context) {
  const parties = context.subjectType === 'UNKNOWN' ? 'the taxpayer' : context.subjectType.toLowerCase().replaceAll('_', ' ');
  const period = context.period ? `${context.period.periodStart}..${context.period.periodEnd}` : 'the requested accounting period';
  const activity = context.businessType ?? 'the stated activity';
  const currency = context.currency ?? 'the functional currency';
  switch (entry.code) {
    case 'INCOME_TAX':
      return `Determine the ${context.jurisdiction} personal or business income tax for ${period} for ${parties} with ${activity} activity, including any simplified or final turnover regime: rate, threshold, deductions, exemptions, eligibility, effective period. Encode every numeric amount, rate, threshold and period limit as an evidence-bound typed parameter; express the base computation, including any monthly allocation of a non-taxable amount, in taxBaseFormula; do not require a pre-declared base.`;
    case 'CIT':
      return `Determine whether a company with ${activity} activity is liable for corporate income tax in ${context.jurisdiction} for ${period}; return the taxable base, rate, reliefs, thresholds and their official-source evidence in ${currency}.`;
    case 'CONSUMPTION_TAX':
      return `Determine which consumption tax (value added, goods and services, or sales tax) applies in ${context.jurisdiction} to ${activity} supplies for ${period}, including registration thresholds, taxable base, rate or formula, exemptions, input-credit rules and official-source evidence.`;
    case 'WITHHOLDING_TAX':
      return `Determine the withholding tax obligations in ${context.jurisdiction} for ${period} on payments made or received by ${parties} with ${activity} activity, including rates, bases, documentation and deadline evidence from official sources.`;
    case 'TREATY_RELIEF':
      return `Determine whether a tax treaty or foreign tax credit affects ${context.jurisdiction} taxation for ${period} when residence and source countries differ; return eligibility conditions and official-source evidence.`;
    case 'FILING_CALENDAR':
      return `Return the official filing and payment deadlines in ${context.jurisdiction} for ${period} that apply to ${parties} with ${activity} activity, with the governing authority source for each deadline.`;
    default:
      return `Return the accounting and reporting obligations in ${context.jurisdiction} for ${period} that apply to ${parties} with ${activity} activity, with official-source evidence.`;
  }
}

// Financial-position keys that can supply a governed rule's money input. A rule
// fact that is absent here is never approximated: the estimate stays unresolved.
const ESTIMATE_INPUT_ALIASES = Object.freeze({
  ANNUAL_NET_BUSINESS_INCOME: 'netBusinessIncome',
  NET_BUSINESS_INCOME: 'netBusinessIncome',
  BUSINESS_NET_INCOME: 'netBusinessIncome',
  BUSINESS_PROFIT: 'netBusinessIncome',
  NET_PROFIT: 'netBusinessIncome',
  PROFIT_BEFORE_TAX: 'netBusinessIncome',
  TAXABLE_INCOME: 'netBusinessIncome',
  NET_TAXABLE_INCOME: 'netBusinessIncome',
  // Some packs declare the net base they assess under a jurisdiction-specific name.
  DECLARED_BASE: 'netBusinessIncome',
  DECLARED_NET_INCOME: 'netBusinessIncome',
  GROSS_TURNOVER: 'grossBusinessIncome',
  GROSS_TURNOVER_ANNUAL: 'grossBusinessIncome',
  ANNUAL_GROSS_TURNOVER: 'grossBusinessIncome',
  ANNUAL_TURNOVER: 'grossBusinessIncome',
  YEARLY_GROSS_TURNOVER: 'grossBusinessIncome',
  TURNOVER: 'grossBusinessIncome',
  GROSS_REVENUE: 'grossBusinessIncome',
  GROSS_RECEIPTS: 'grossBusinessIncome',
  GROSS_INCOME: 'grossBusinessIncome',
  GROSS_BUSINESS_INCOME: 'grossBusinessIncome',
  BUSINESS_GROSS_INCOME: 'grossBusinessIncome',
  REVENUE: 'grossBusinessIncome',
  SALES: 'grossBusinessIncome',
  SALES_AMOUNT: 'grossBusinessIncome',
  TAXABLE_SALES: 'grossBusinessIncome',
  SALES_BASE: 'grossBusinessIncome',
  EXPENSES: 'businessExpenses',
  BUSINESS_EXPENSES: 'businessExpenses',
  DEDUCTIBLE_EXPENSES: 'businessExpenses',
  PURCHASES: 'businessExpenses',
  PURCHASE_AMOUNT: 'businessExpenses',
  COST_OF_SALES: 'businessExpenses',
  INPUT_VAT_BASE: 'businessExpenses',
  TAXABLE_PURCHASES: 'businessExpenses',
  EMPLOYMENT_INCOME: 'employmentIncome',
  EMPLOYMENT_WAGE: 'employmentIncome',
  WAGE: 'employmentIncome',
  SALARY: 'employmentIncome',
});

module.exports = { ACCOUNTING_DOMAINS, DOMAINS, domain, domainsFor, researchQuestion, ESTIMATE_INPUT_ALIASES };
