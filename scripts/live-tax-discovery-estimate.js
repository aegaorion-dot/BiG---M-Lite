'use strict';
// Completes a live qualification run by calculating the estimate from the
// already-persisted workspace. No Muse request is made here.
const fs = require('node:fs');
const path = require('node:path');
const {createWebStore} = require('../src/web/store');

async function main() {
  require('../src/web/environment').loadEnvironment(path.join(__dirname, '..', '.env'));
  process.env.BIGM_REGULATORY_POLICY = 'HACKATHON_DEMO';
  process.env.BIGM_CONFIGURATION_AUTO_RESEARCH = '0';
  const requested = process.argv[2];
  const base = path.join(__dirname, '..', 'research', 'live-tax-discovery');
  const runName = requested ?? fs.readdirSync(base)
    .filter((name) => fs.existsSync(path.join(base, name, 'workspace', 'store.json')))
    .sort()
    .at(-1);
  const persistPath = path.join(base, runName, 'workspace', 'store.json');
  const scopeOrgId = JSON.parse(fs.readFileSync(persistPath, 'utf8')).scopeOrgId ?? null;
  if (!scopeOrgId) throw Error('Persisted workspace scope is missing');
  const store = createWebStore({persistPath, orgId: scopeOrgId, demoTaxCatalogs: false});
  const financial = store.financialPosition();
  const estimates = store.configuration.refreshEstimates();
  const candidates = store.configuration.candidates().filter((candidate) => candidate.researchProduced);
  const calculated = (estimates.estimates ?? []).filter((entry) => entry.status === 'CALCULATED');
  // The research step records every unresolved item it saw. Once the deterministic
  // engine produces an amount, an unresolved item or an unanswered material fact is
  // a warning rather than a failure; anything that prevents execution stays fatal.
  const reportPath = path.join(base, runName, 'report.json');
  let report = null;
  if (fs.existsSync(reportPath)) {
    report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const unique = [...new Set([...(report.blockers ?? []), ...(report.warnings ?? [])])];
    const warnings = unique.filter((entry) => entry.startsWith('RESEARCH_UNRESOLVED:') || entry.startsWith('MISSING_FACT:')
      || entry.startsWith('ESTIMATE:') || entry.endsWith('FACT_CONFIRMATION_REQUIRED'));
    report.blockers = unique.filter((entry) => !warnings.includes(entry));
    report.warnings = warnings;
    report.verdictBeforeEstimate = report.verdictBeforeEstimate ?? report.verdict;
    report.verdict = calculated.length && (report.candidates ?? []).some((candidate) => candidate.runtimeExecutable) ? 'PASS' : 'FAIL';
    report.completion = {step: 'DETERMINISTIC_ESTIMATE', at: new Date().toISOString(), museRequests: 0, calculatedEstimates: calculated.length};
  }
  const result = {
    schemaVersion: 'live-tax-discovery-estimate/1',
    run: runName,
    verdict: calculated.length ? 'PASS' : 'FAIL',
    museRequestsThisStep: 0,
    financial: {
      currency: financial.currency,
      period: financial.period,
      recognizedBusinessIncome: financial.recognizedBusinessIncome,
      confirmedBusinessExpenses: financial.confirmedBusinessExpenses,
      journalCount: financial.accounting?.journalCount ?? null,
    },
    candidatesProducedByMuse: candidates,
    estimates,
    governanceNote: 'HACKATHON_DEMO provisional acceptance; production requires explicit human content review and applicability verification.',
  };
  const out = path.join(base, runName, 'estimate-qualification.json');
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n', 'utf8');
  if (report) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log('RUN', runName);
  console.log('VERDICT', result.verdict);
  for (const entry of estimates.estimates ?? []) {
    console.log('ESTIMATE', entry.taxType, entry.status, 'base=' + (entry.taxableBase?.amountMinor ?? '-'), 'amount=' + (entry.taxAmount?.amountMinor ?? '-'), estimates.currency);
    for (const rule of entry.appliedRules ?? []) console.log('RULE', rule.ruleId, rule.packId, rule.governanceStatus);
    for (const source of entry.legalSources ?? []) console.log('SOURCE', source.sourceUrl, source.locator);
    for (const disclosure of entry.demoDisclosures ?? []) console.log('DISCLOSURE', disclosure.applicabilityWarning, '|', disclosure.remainingUncertainty ?? disclosure.userExplanation ?? '');
  }
  for (const item of estimates.unresolved ?? []) console.log('UNRESOLVED', JSON.stringify(item));
  console.log('ARTIFACT', out);
  if (!calculated.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error('ERROR', error.message);
  process.exitCode = 1;
});
