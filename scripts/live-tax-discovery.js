'use strict';
// LIVE qualification: one real Muse tax discovery per persona. Not imported by
// the application. Refuses to run unless BIGM_META_LIVE_TEST=1 is set explicitly.
// The pipeline is persona-agnostic: only the taxpayer facts, the jurisdiction and
// the recorded postings change. Muse still has to discover the law itself.
const fs = require('node:fs');
const path = require('node:path');
const {createWebStore} = require('../src/web/store');

const PERIOD = {periodStart: '2026-01-01', periodEnd: '2026-12-31'};

const PERSONAS = Object.freeze({
  maya: {
    displayName: 'Maya', language: 'id', orgName: 'Maya Bakery', businessType: 'kuliner',
    subjectType: 'INDIVIDUAL', activities: ['CAFE_OPERATOR'], jurisdiction: 'ID', currency: 'IDR',
    orgId: 'org-maya-bakery', customer: 'Bakery counter sales', supplier: 'Baking ingredients supplier',
    saleDescription: 'Bakery and pastry sales', purchaseDescription: 'Ingredients and packaging',
    referencePrefix: 'MAYA',
    // Official document already discovered and read in an earlier live run: reuse
    // the discovery instead of paying for the same search twice.
    initialOfficialUrls: ['https://peraturan.bpk.go.id/Download/284096/PP%20Nomor%2055%20Tahun%202022.pdf'],
    sales: [
      ['2026-01-15', '55000000'], ['2026-02-15', '52000000'], ['2026-03-15', '61000000'],
      ['2026-04-15', '58000000'], ['2026-05-15', '63000000'], ['2026-06-15', '59000000'],
      ['2026-07-15', '47000000'], ['2026-08-15', '54000000'], ['2026-09-15', '56000000'],
    ],
    purchases: [
      ['2026-01-20', '22000000'], ['2026-02-20', '21000000'], ['2026-03-20', '24000000'],
      ['2026-04-20', '23000000'], ['2026-05-20', '25000000'], ['2026-06-20', '23500000'],
      ['2026-07-20', '19500000'], ['2026-08-20', '21500000'], ['2026-09-20', '22500000'],
    ],
  },
  nikos: {
    displayName: 'Nikos', language: 'en', orgName: 'Nikos Consulting', businessType: 'freelancer',
    subjectType: 'INDIVIDUAL', activities: ['FREELANCER'], jurisdiction: 'US', currency: 'USD',
    orgId: 'org-nikos-consulting', customer: 'Advisory clients', supplier: 'Software and subcontractors',
    saleDescription: 'Consulting services invoiced', purchaseDescription: 'Software subscriptions and subcontractor fees',
    referencePrefix: 'NIKOS',
    // Material fact only the taxpayer can supply: it scopes which statutory
    // schedule applies. It never changes a legal number.
    materialFacts: [{factId: 'FILING_STATUS', value: 'SINGLE', statement: 'I file as a single (unmarried) individual for US federal tax year 2026.'}],
    initialOfficialUrls: [],
    sales: [
      ['2026-01-20', '12000'], ['2026-02-20', '11000'], ['2026-03-20', '13500'],
      ['2026-04-20', '12500'], ['2026-05-20', '14000'], ['2026-06-20', '13000'],
      ['2026-07-20', '9000'], ['2026-08-20', '11500'], ['2026-09-20', '12400'],
    ],
    purchases: [
      ['2026-01-25', '4000'], ['2026-02-25', '3800'], ['2026-03-25', '4500'],
      ['2026-04-25', '4200'], ['2026-05-25', '4600'], ['2026-06-25', '4400'],
      ['2026-07-25', '3500'], ['2026-08-25', '3900'], ['2026-09-25', '4100'],
    ],
  },
  haruto: {
    displayName: 'Haruto', language: 'ja', orgName: 'Haruto Shoten', businessType: 'small-business',
    subjectType: 'INDIVIDUAL', activities: ['CAFE_OPERATOR'], jurisdiction: 'JP', currency: 'JPY',
    orgId: 'org-haruto-shoten', customer: 'Store counter sales', supplier: 'Wholesale goods supplier',
    saleDescription: 'Retail goods sold', purchaseDescription: 'Wholesale goods purchased',
    referencePrefix: 'HARUTO',
    initialOfficialUrls: [],
    sales: [
      ['2026-01-25', '3100000'], ['2026-02-25', '2900000'], ['2026-03-25', '3300000'],
      ['2026-04-25', '3050000'], ['2026-05-25', '3400000'], ['2026-06-25', '3200000'],
      ['2026-07-25', '3000000'], ['2026-08-25', '3150000'], ['2026-09-25', '3250000'],
    ],
    purchases: [
      ['2026-01-28', '1850000'], ['2026-02-28', '1750000'], ['2026-03-28', '1950000'],
      ['2026-04-28', '1800000'], ['2026-05-28', '2050000'], ['2026-06-28', '1900000'],
      ['2026-07-28', '1700000'], ['2026-08-28', '1820000'], ['2026-09-28', '1880000'],
    ],
  },
});

function selectPersona(argv) {
  const flag = argv.find((arg) => arg.startsWith('--persona='));
  const id = flag ? flag.slice('--persona='.length) : 'maya';
  const persona = PERSONAS[id];
  if (!persona) throw Error(`Unknown persona ${id}; known: ${Object.keys(PERSONAS).join(', ')}`);
  // A document already discovered and read in an earlier run can be re-used so a
  // corrective run does not pay for the same discovery twice.
  const seed = argv.find((arg) => arg.startsWith('--seed='));
  if (seed) persona.initialOfficialUrls = seed.slice('--seed='.length).split(',').map((url) => url.trim()).filter(Boolean);
  return {id, persona};
}

function log(step, detail = '') {
  process.stdout.write(`[${new Date().toISOString()}] ${step}${detail ? ': ' + detail : ''}\n`);
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

const RESEARCH_ROOT = path.join(__dirname, '..', 'research', 'live-tax-discovery');

function normalizeUrl(url) {
  return String(url ?? '').replace(/%20/gi, ' ').trim().toLowerCase().replace(/\/+$/, '');
}

function readArtifacts(runDir) {
  const dir = path.join(runDir, 'workspace', 'configuration-research', 'raw', 'artifacts');
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  const artifacts = [];
  for (const name of names) {
    try { artifacts.push({runDir, artifact: JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))}); } catch { /* skip unreadable artifact */ }
  }
  return artifacts;
}

function findArtifact(runDir, url) {
  const target = normalizeUrl(url);
  const hit = readArtifacts(runDir).find(({artifact}) => normalizeUrl(artifact.sourceUrl) === target);
  return hit ? hit.artifact : null;
}

// A seeded URL is never reported as a discovery of the current run. The earlier run
// that actually retrieved it supplies the original URL, retrieval timestamp, content
// hash and effective period; this run has to retrieve it again to use it as evidence.
function seedProvenance(urls, currentRoot) {
  if (!urls.length) return [];
  let priorDirs = [];
  try {
    priorDirs = fs.readdirSync(RESEARCH_ROOT, {withFileTypes: true})
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(RESEARCH_ROOT, entry.name))
      .filter((dir) => path.resolve(dir) !== path.resolve(currentRoot))
      .sort();
  } catch { priorDirs = []; }
  return urls.map((url) => {
    const record = {url, label: 'REUSED_PRIOR_DISCOVERY', discoveredByThisRun: false, priorDiscovery: null, retrievalThisRun: null, evidenceBoundThisRun: false};
    for (const dir of priorDirs) {
      const artifact = findArtifact(dir, url);
      if (!artifact) continue;
      record.priorDiscovery = {
        runId: path.basename(dir),
        artifactId: artifact.artifactId,
        sourceUrl: artifact.sourceUrl,
        finalUrl: artifact.finalUrl,
        retrievedAt: artifact.retrievedAt,
        rawContentHash: artifact.rawContentHash,
        byteLength: artifact.byteLength,
        httpStatus: artifact.httpStatus,
        sourceType: artifact.sourceType,
        effectiveFrom: artifact.effectiveFrom,
        effectiveTo: artifact.effectiveTo,
        etag: artifact.etag,
        lastModified: artifact.lastModified,
        museEvidence: path.join(dir, 'evidence.json'),
        museTraffic: path.join(dir, 'research.json'),
      };
      break;
    }
    return record;
  });
}


async function main() {
  const dry = process.argv.includes('--dry');
  const {id: personaId, persona} = selectPersona(process.argv);
  if (process.env.BIGM_META_LIVE_TEST !== '1' && !dry) {
    log('REFUSED', 'set BIGM_META_LIVE_TEST=1 explicitly to spend Meta Muse credits');
    process.exitCode = 2;
    return;
  }
  require('../src/web/environment').loadEnvironment(path.join(__dirname, '..', '.env'));
  process.env.BIGM_REGULATORY_POLICY = 'HACKATHON_DEMO';
  process.env.BIGM_META_LIVE_TEST = '1';
  process.env.BIGM_CONFIGURATION_AUTO_RESEARCH = '0';
  if (!process.env.BIGM_META_API_URL || !process.env.BIGM_META_API_KEY || !process.env.BIGM_META_MODEL) throw Error('Meta Muse configuration missing');

  const startedAt = new Date().toISOString();
  const stamp = startedAt.replace(/[:.]/g, '-');
  const root = path.join(__dirname, '..', 'research', 'live-tax-discovery', personaId + '-2026-' + stamp);
  fs.mkdirSync(root, {recursive: true});
  const persistPath = path.join(root, 'workspace', 'store.json');
  const provenance = seedProvenance(persona.initialOfficialUrls ?? [], root);
  log('PERSONA', personaId + ' ' + persona.jurisdiction + ' ' + persona.currency);
  log('RUN', root);
  log('MODEL', process.env.BIGM_META_MODEL);
  log('POLICY', process.env.BIGM_REGULATORY_POLICY);

  // Capture the actual provider traffic. Credentials are never written: only the
  // request/response JSON bodies and transport status are retained.
  const provider = {requests: 0, records: []};
  const rawFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url) !== String(process.env.BIGM_META_API_URL)) return rawFetch(url, init);
    const n = ++provider.requests;
    const requestBody = typeof init?.body === 'string' ? init.body : null;
    const response = await rawFetch(url, init);
    const clone = response.clone();
    let bodyText = null;
    try { bodyText = await clone.text(); } catch { bodyText = null; }
    let parsedRequest = null, parsedResponse = null;
    try { parsedRequest = requestBody ? JSON.parse(requestBody) : null; } catch { parsedRequest = null; }
    try { parsedResponse = bodyText ? JSON.parse(bodyText) : null; } catch { parsedResponse = bodyText ? String(bodyText).slice(0, 2000) : null; }
    const usage = parsedResponse?.usage ?? null;
    const record = {n, at: new Date().toISOString(), httpStatus: response.status, responseStatus: parsedResponse?.status ?? null, responseId: parsedResponse?.id ?? null, usage, requestBytes: requestBody?.length ?? 0, responseBytes: bodyText?.length ?? 0};
    writeJson(path.join(root, `provider-${n}.json`), {record, request: parsedRequest, response: parsedResponse});
    provider.records.push(record);
    log('MUSE_RESPONSE', `#${n} http=${record.httpStatus} status=${record.responseStatus} tokens=${usage ? JSON.stringify(usage) : 'not reported'}`);
    return response;
  };

  const store = createWebStore({persistPath, orgId: persona.orgId, demoTaxCatalogs: false});

  // Only material business facts the taxpayer knows about themselves.
  store.editProfile({slot: 'user.displayName', value: persona.displayName, actor: persona.displayName});
  store.editProfile({slot: 'user.language', value: persona.language, actor: persona.displayName});
  store.editProfile({slot: 'org.name', value: persona.orgName, actor: persona.displayName});
  store.editProfile({slot: 'org.businessType', value: persona.businessType, actor: persona.displayName});
  store.editProfile({slot: 'org.subjectType', value: persona.subjectType, actor: persona.displayName});
  store.editProfile({slot: 'org.activities', value: persona.activities, actor: persona.displayName});
  store.editProfile({slot: 'currency.functional', value: persona.currency, actor: persona.displayName});
  store.editProfile({slot: 'modules.enabled', value: ['sales', 'purchase', 'accounting', 'reports', 'import'], actor: persona.displayName});
  store.editProfile({slot: 'accounting.periodStart', value: PERIOD.periodStart, actor: persona.displayName});
  store.editProfile({slot: 'accounting.periodEnd', value: PERIOD.periodEnd, actor: persona.displayName});
  store.editProfile({basis: 'REGISTRATION', countryCode: persona.jurisdiction, actor: persona.displayName});
  store.editProfile({basis: 'BUSINESS_WORK_LOCATION', countryCode: persona.jurisdiction, actor: persona.displayName});
  store.editProfile({basis: 'TAX_RESIDENCE', countryCode: persona.jurisdiction, actor: persona.displayName});
  store.editProfile({basis: 'SOURCE', countryCode: persona.jurisdiction, actor: persona.displayName});
  log('PROFILE', 'revised');

  const proposal = store.onboardingPropose();
  if (!proposal.ok) throw Error('Proposal failed: ' + proposal.errors.join('; '));
  const validated = store.onboardingValidate();
  if (!validated.ok) throw Error('Validation failed: ' + validated.errors.join('; '));
  const workspaceState = store.workspaceProfile();
  if (!workspaceState.activated) throw Error('Workspace did not activate');
  log('WORKSPACE', `activated ${workspaceState.functionalCurrency} ${workspaceState.period.periodStart}..${workspaceState.period.periodEnd}`);

  for (const [date, amount] of persona.sales) {
    await store.createSale({id: `${personaId}-sale-${date}`, orgId: persona.orgId, date, jurisdiction: persona.jurisdiction, currency: persona.currency, customer: persona.customer, invoiceRef: `${persona.referencePrefix}-S-${date}`, description: persona.saleDescription, amountMajor: amount}, {actor: persona.displayName});
  }
  for (const [date, amount] of persona.purchases) {
    await store.createPurchase({id: `${personaId}-purchase-${date}`, orgId: persona.orgId, date, jurisdiction: persona.jurisdiction, currency: persona.currency, supplier: persona.supplier, billRef: `${persona.referencePrefix}-P-${date}`, description: persona.purchaseDescription, amountMajor: amount}, {actor: persona.displayName});
  }
  const financial = store.financialPosition();
  log('FINANCIAL', `income=${financial.recognizedBusinessIncome?.amountMinor} expenses=${financial.confirmedBusinessExpenses?.amountMinor} journals=${financial.accounting?.journalCount}`);

  const beforeConfiguration = store.configuration.configuration();
  writeJson(path.join(root, 'configuration-before.json'), beforeConfiguration);
  log('CONFIGURATION', `${beforeConfiguration.requirements.map((entry) => entry.id + ':' + entry.status).join(', ')}`);

  if (dry) {
    writeJson(path.join(root, 'dry-run.json'), {financial, configuration: beforeConfiguration, plans: store.configuration.plans(['INCOME_TAX']), profile: store.onboardingState().profileState});
    log('DRY', 'profile, workspace and postings prepared; live research skipped');
    globalThis.fetch = rawFetch;
    return;
  }

  log('RESEARCH', 'starting live Muse discovery for the individual income-tax regime');
  const researchStart = Date.now();
  const researchView = await store.configuration.runResearch({
    actor: persona.displayName,
    domains: ['INCOME_TAX'],
    initialOfficialUrls: persona.initialOfficialUrls,
  });
  const researchElapsedMs = Date.now() - researchStart;
  log('RESEARCH', `finished in ${researchElapsedMs} ms with state ${researchView.research.status}`);

  const telemetry = store.configuration.researchTelemetry();
  const evidence = store.configuration.researchEvidence();
  for (const record of provenance) {
    const artifact = findArtifact(root, record.url);
    record.retrievalThisRun = artifact ? {artifactId: artifact.artifactId, retrievedAt: artifact.retrievedAt, rawContentHash: artifact.rawContentHash, httpStatus: artifact.httpStatus, sourceType: artifact.sourceType, effectiveFrom: artifact.effectiveFrom, effectiveTo: artifact.effectiveTo} : null;
    record.evidenceBoundThisRun = Boolean(record.retrievalThisRun) && (evidence.sources ?? []).some((source) => normalizeUrl(source.url) === normalizeUrl(record.url));
  }
  if (provenance.length) {
    writeJson(path.join(root, 'seed-provenance.json'), {
      schemaVersion: 'seed-provenance/1',
      note: 'Seeded official URLs carry forward the provenance of the earlier live discovery. They are navigation hints only: a document becomes evidence in this run only after this run retrieves and cites it.',
      sources: provenance,
    });
    log('SEED', provenance.map((record) => `${record.url} prior=${record.priorDiscovery?.runId ?? 'UNKNOWN'} thisRun=${record.retrievalThisRun ? 'RETRIEVED' : 'NOT_RETRIEVED'}`).join(' | '));
  }
  const candidates = store.configuration.candidates().filter((candidate) => candidate.researchProduced);
  const estimates = store.configuration.refreshEstimates();
  const configurationAfter = store.configuration.configuration();
  const product = store.productState();

  writeJson(path.join(root, 'configuration-after.json'), configurationAfter);
  writeJson(path.join(root, 'candidates.json'), candidates);
  writeJson(path.join(root, 'evidence.json'), evidence);
  writeJson(path.join(root, 'estimates.json'), estimates);
  writeJson(path.join(root, 'research.json'), {view: researchView, telemetry, elapsedMs: researchElapsedMs, provider});
  writeJson(path.join(root, 'product.json'), product);

  const calculated = (estimates.estimates ?? []).filter((entry) => entry.status === 'CALCULATED');
  const blockers = [];
  if (!candidates.length) blockers.push('NO_COUNTRY_PACK_CANDIDATE');
  for (const result of researchView.research.results ?? []) {
    if (result.failure) blockers.push('RESEARCH_FAILURE:' + result.jurisdiction + ':' + result.failure);
    for (const item of result.unresolved ?? []) blockers.push('RESEARCH_UNRESOLVED:' + result.jurisdiction + ':' + (item.code ?? 'UNKNOWN'));
    for (const item of result.missingFacts ?? []) blockers.push('MISSING_FACT:' + result.jurisdiction + ':' + (item.factId ?? item.code ?? 'UNKNOWN'));
  }
  for (const item of estimates.unresolved ?? []) {
    if (item.code === 'FACT_CONFIRMATION_REQUIRED') continue;
    blockers.push('ESTIMATE:' + (item.taxType ?? 'GENERAL') + ':' + (item.code ?? 'UNKNOWN') + (item.requiredMissingFacts?.length ? ':' + item.requiredMissingFacts.join('|') : ''));
  }
  const pass = calculated.length > 0 && candidates.some((candidate) => candidate.runtimeExecutable);
  // An unresolved research item or an unanswered material fact is recorded, not
  // hidden; it only blocks when the pack cannot execute or no amount was produced.
  const unique = [...new Set(blockers)];
  const warnings = unique.filter((entry) => entry.startsWith('RESEARCH_UNRESOLVED:') || entry.startsWith('MISSING_FACT:') || entry.endsWith('FACT_CONFIRMATION_REQUIRED'));
  const fatal = unique.filter((entry) => !warnings.includes(entry));

  const report = {
    schemaVersion: 'live-tax-discovery-report/1',
    verdict: pass ? 'PASS' : 'FAIL',
    startedAt,
    finishedAt: new Date().toISOString(),
    policyMode: process.env.BIGM_REGULATORY_POLICY,
    governanceNote: 'HACKATHON_DEMO provisional acceptance is the sanctioned demo authority. Production requires explicit human review of the exact source hashes.',
    model: telemetry.model,
    museRequests: telemetry.requests,
    providerRequests: provider.requests,
    usage: telemetry.usage,
    costStatus: telemetry.costStatus,
    estimatedCost: telemetry.estimatedCost,
    providerRecords: provider.records,
    seedProvenance: provenance,
    research: {
      status: researchView.research.status,
      elapsedMs: researchElapsedMs,
      results: researchView.research.results ?? [],
      unsupported: researchView.research.unsupported ?? [],
    },
    configuration: {
      before: beforeConfiguration.requirements.map((entry) => ({id: entry.id, status: entry.status})),
      after: configurationAfter.requirements.map((entry) => ({id: entry.id, status: entry.status})),
      questions: configurationAfter.questions,
    },
    candidates,
    evidenceSummary: {sources: evidence.sources, readings: evidence.readings, unresolved: evidence.unresolved, conflicts: evidence.conflicts},
    estimates,
    blockers: fatal,
    warnings,
    taxpayerStatements: (persona.materialFacts ?? []).map((entry) => ({...entry, authority: 'USER_STATED_MATERIAL_FACT', note: 'Supplied by the taxpayer to scope applicability; never used to supply a legal number.'})),
    artifacts: root,
  };
  writeJson(path.join(root, 'report.json'), report);
  globalThis.fetch = rawFetch;

  log('VERDICT', report.verdict);
  log('MUSE', `requests=${telemetry.requests} usage=${JSON.stringify(telemetry.usage)} cost=${telemetry.costStatus}`);
  for (const candidate of candidates) {
    log('CANDIDATE', `${candidate.packId}@${candidate.version} rules=${candidate.ruleIds?.join(',')} governance=${candidate.governance} executable=${candidate.runtimeExecutable}`);
  }
  for (const item of estimates.estimates ?? []) {
    log('ESTIMATE', `${item.taxType} ${item.status} base=${item.taxableBase?.amountMinor ?? '-'} amount=${item.taxAmount?.amountMinor ?? '-'} ${estimates.currency}`);
  }
  for (const blocker of report.blockers) log('BLOCKER', blocker);
  for (const warning of report.warnings) log('WARNING', warning);
  log('REPORT', path.join(root, 'report.json'));
  if (!pass) process.exitCode = 1;
}

main().catch((error) => {
  log('ERROR', error.message);
  process.exitCode = 1;
});
