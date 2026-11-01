# Build / inspection log

This is an observable operational log, not hidden chain-of-thought.

## Repository inspection

Repository: `aegaorion-dot/BiG---M-Lite`
Branch inspected: `hackathon/moroccan-expat-e2e`

Inspected runtime contracts:

- `src/countrypack/registry.js`
- `src/countrypack/resolver.js`
- `src/fabric/candidates.js`
- `src/fabric/normalizer.js`
- `src/fabric/governanceStore.js`
- `src/tax/index.js`
- `src/tax/taxEngine.js`
- `src/tax/contentRegistry.js`
- `src/tax/contracts.js`
- `src/tax/dsl.js`
- `src/tax/facts.js`
- `src/tax/treatyResolver.js`
- `src/tax/phase4Catalog.js`
- `src/tax/referenceCandidates.js`
- `src/tax/content/phase4-catalog.json`

## Important architecture finding

The current executable tax path is **not** the early standalone `CountryPackRegistry`.

The final runtime path is:

`Fabric candidate -> TaxContentRegistry -> FabricGovernanceStore -> UniversalTaxEngine`

Therefore the first standalone package was insufficient for BiG-M runtime use.

## Existing Indonesia 2025 evidence-backed candidates found

### ID_INDIVIDUAL_ORDINARY_2025
- subject: INDIVIDUAL
- tax type: INCOME_TAX
- event: ANNUAL_ORDINARY_INDIVIDUAL_INCOME
- governed input: independently reviewed PKP
- Article 17 brackets
- raw-source hashes and exact source passages already preserved in Phase 4 research
- not self-approved

### ID_UMKM_INDIVIDUAL_2025
- subject: INDIVIDUAL
- tax type: SIMPLIFIED_INCOME
- event: MONTHLY_ELIGIBLE_DOMESTIC_BUSINESS
- PP 55/2022 0.5%
- annual cumulative first IDR 500m individual gross exclusion
- prior-year turnover and statutory eligibility gates
- raw-source hashes and exact PP55 passages already preserved
- not self-approved

### Existing company CIT
`createTaxSystem()` also registers the existing `originalCompanyCandidate()` bridge.
It remains a separately reviewed company/CIT subset.

## Adapter decision

Do not duplicate those legal rules or evidence.
Create a thin runtime adapter that:
- selects only Indonesia 2025 candidates;
- registers them if missing;
- exposes exact review hashes/source URLs;
- preserves mandatory HUMAN governance;
- leaves calculation to `UniversalTaxEngine`.

## Acceptance examples

### Ordinary individual
Reviewed PKP: IDR 134,621,000

Engine result expected:
- tax base: IDR 134,621,000
- tax: IDR 14,193,150
- pack: ID_INDIVIDUAL_ORDINARY_2025
- rule: ID_ART17_REVIEWED_PKP_2025

This proves arithmetic/execution on reviewed PKP. It does not claim BiG-M derived PKP automatically.

### Individual UMKM
- YTD gross before October: IDR 450,000,000
- October gross: IDR 100,000,000
- cumulative exemption: first IDR 500,000,000
- October governed taxable gross: IDR 50,000,000
- rate: 0.5%
- expected tax: IDR 250,000

Residence and source are both ID, so treaty resolution should return `NOT_NEEDED`.

## Still fail-closed

This adapter intentionally does not fabricate runtime rules for legal areas that do not yet have a complete bound candidate in the inspected catalog.
