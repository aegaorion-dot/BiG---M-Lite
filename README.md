# BiG-M Lite

Universal business profiling → semantic jurisdiction facts → CountryPack resolution → proposed setup → human confirmation → a personal bookkeeping workspace.

Lite uses Node >=20 and built-in modules. The Money/BigInt, double-entry journal, PostingService, ledger, reversal and audit foundations remain in place.

## Run

    npm start

Open http://localhost:3100. The server binds to loopback. Optional port: BIGM_PORT.

The CLI loads a local .env without overwriting existing environment variables. State defaults to data/store.json; override with BIGM_DATA_PATH. Runtime data and .env are ignored by Git. Library/test factories use persistPath:null unless a path is explicitly provided.

## Meta Muse Spark

Set these server-side values in .env or the process environment:

    BIGM_META_API_URL=https://api.meta.ai/v1/responses
    BIGM_META_API_KEY=your-local-key
    BIGM_META_MODEL=an-enabled-model-id

Use a model available to your Meta account. The adapter consumes the Responses output envelope, reads assistant output_text, parses JSON and passes candidate facts through deterministic validation. The request supplies the response schema and available capabilities as context.

Each turn reports providerConfigured, providerUsed, model and fallbackReason. Missing configuration, invalid output or provider failure uses a clearly labeled, limited deterministic fallback. A configured provider does not imply that its answer was used.

No key is sent to the browser. AI cannot approve source content, confirm a configuration, activate a workspace or post entries.

## Tests and one-request live smoke

    npm test

The routine runner removes inherited API credentials, sets test mode and blocks external fetch requests. Local HTTP tests are allowed. The adapter and automatic provider selection also guard Node test contexts. No paid request belongs in the regression suite.

The live smoke is a separate command. It is skipped without explicit opt-in:

    npm run smoke:meta

To authorize exactly one request in PowerShell, after configuring credentials:

    $env:BIGM_LIVE_SMOKE = '1'
    npm run smoke:meta
    Remove-Item Env:BIGM_LIVE_SMOKE

There is no automatic retry. The smoke validates candidate extraction; it never activates or posts. Live integration remains unverified until this opt-in check succeeds for the configured account/model.

## Profile and approval contract

profileState is the single candidate source of truth. Slots retain value, semanticRole, source, supportingQuote, confidence and status. Jurisdiction facts live inside that same state under nine separate bases:

ACCOUNT_LOCATION, INCORPORATION, TAX_RESIDENCE, SOURCE, REGISTRATION, BUSINESS_WORK_LOCATION, CUSTOMER_LOCATION, WITHHOLDING and POSSIBLE_PE.

Nationality is a user fact, not a tax jurisdiction. Functional, transaction, reporting and foreign purchase currencies are distinct. FX source remains unknown until supplied. Unknown data is not substituted with a legal or business fact.

Explicit corrections replace candidates; contradictions require clarification. A material change increments profileRevision and invalidates the proposal, validation and confirmation. The active workspace stays unchanged until another confirmation succeeds.

The proposal binds its profile fingerprint, revision, period and CountryPack evaluation to a recursive canonical SHA-256 hash. Activation requires validation and explicit human confirmation of that exact proposal. Optional material pack selection additionally requires explicit packIds; ordinary bookkeeping confirmation does not approve tax content.

One applyActiveConfiguration path builds new immutable runtime objects at activation and restore. Identity, scope, jurisdiction basis, currency, period and modules agree with the active configuration. Changes to currency/jurisdiction after posting require a reviewed migration; Lite does not silently rewrite historical entries.

## CountryPack scope

Jurisdiction metadata for ID, SG, US, AU and GB comes from Original. Metadata support does not mean that executable tax content exists.

Two substantive Original artifacts are retained as structured reference content:

| Pack | Version | Window | Subject | Tax | Rules |
|---|---:|---|---|---|---:|
| ID_CIT_REFERENCE | 2 | 2025-01-01 through 2025-12-31 | COMPANY | CIT | 18 |
| ID_CIT_DETERMINATION_2025 | 2 | 2025-01-01 through 2025-12-31 | COMPANY | CIT | 3 |

Rule identities, formulas, parameters, review conditions, legal references, version and dates are preserved. Original labels its source material verified; this port does not independently re-certify current law.

The original artifacts remain inert source snapshots. Phase 3 adapts the two existing COMPANY/CIT determination formulas into a governed declarative version consumed by one UniversalTaxEngine. Exact executable-version human approval and confirmed tax facts are required; source-content review alone does not enable execution. The complete M3/M5 systems are not recreated. No 2026 law or substantive SG/US/AU/GB rules are invented.

The resolver checks semantic basis, subject, tax type, complete accounting period, evaluation date, content review, explicit confirmation and consumer capability. Missing content, expired windows, incompatible subjects, retired versions, ambiguous overlaps and composition conflicts stay unresolved. Customer, bank and work location alone never select a tax pack.

workspaceReady and taxReady are independent. An IDR bookkeeping workspace for a Bali coffee shop may activate while registration or tax settings need review. A 2026 period never runs the imported 2025 rules.

Legacy JSON packs under src/countrypack/packs remain foundation test/examples. They are not presented as substantive law by the new resolver. The web posting path uses an explicitly neutral bookkeeping template and records no final tax liability.

## Persistence and recovery

Snapshots include candidate facts/revision, CountryPack review state, proposal, validation, human confirmation, active profile snapshot, activation history/idempotency, journals, audit, transaction idempotency and period state.

Writes use a temporary snapshot followed by rename. Save errors are surfaced; activation/posting roll back their in-memory changes on failure. Restore validates the audit and active confirmation and uses the same runtime application path. Closed periods remain closed.

Version-1 snapshots retain journals and periods but require setup review and reconfirmation; old auto-confirmed configuration is not silently promoted.

The UI resumes the saved pending question after refresh. It does not claim to recover an unsaved full chat transcript. Reports keep other currencies separate without invented FX conversions.

## Verification

See docs/IMPLEMENTATION-REPORT.md for the profiling baseline and docs/ORIGINAL-PORT.md for Original provenance. Engine architecture is documented in the [Phase 3 report](docs/PHASE3-TAX-REPORT.md) and [tax contracts/CLI](docs/PHASE3-TAX-CONTRACTS.md). Current source acquisition, candidate coverage, temporal limits and validation are in the [Phase 4 report](docs/PHASE4-PACKS-REPORT.md).

## Offline tax engine

    npm run tax -- catalog
    npm run tax:demo

The catalog contains candidates, not automatically approved law. Phase 4 adds eight structured real-source CountryPack candidates, two treaty evidence dossiers and six research candidates. No new legal content is approved by default. The earlier COMPANY/CIT2025 reference remains separate and cannot extend into 2026.

    npm run packs:demo
    npm run tax -- verify-sources
    npm run tax -- inspect <candidate-id>
    npm run tax -- questions request.json facts-candidate.json

Indonesia includes review-ready individual PKP, monthly UMKM and narrow withholding subsets. Singapore has a narrow YA2026 company subset with income basis2025. VAT, foreign credit, ID–SG/ID–AU treaty effects and executable AU/US/UK domestic coverage remain unresolved. Coverage windows, eligibility facts and exact-arithmetic restrictions are explicit.

Selected packs drive tax-readiness questions through the existing profiler and optional web-store tax-review context. AI answers remain candidates. Human fact confirmation and legal approval are separate; profile corrections invalidate tax proposals. Bookkeeping remains available while tax is unresolved.

Use the [Phase 4 review workflow](docs/PHASE4-REVIEW-WORKFLOW.md) to inspect evidence and perform explicit human review. Tax calculations never browse, invoke a model or post GL. The existing accounting boundary still requires mapping review and rejects TEST ONLY amounts.
# Phase 5 document intake

Chat and document uploads converge on reviewed transaction candidates. PDF text, scanned PDF, PNG/JPEG OCR, UTF-8 text and simple statement CSV work locally. Review evidence, save corrections, then explicitly confirm before the existing accounting pipeline posts. Foreign-currency/FX gaps and unpaid invoices stay review-only.

Run `npm ci` (Node >=20.19), `npm test`, and `npm start`. See [Phase 5 architecture, limits, API, verification and Original inspection](docs/PHASE5-DOCUMENT-INTAKE.md). Paid document semantics are opt-in; `npm run smoke:document-meta` skips by default.
# Phase 6 universal intake

Native entry, Chat, Document/OCR, external transactions and external journals now converge on `universal-intake-v1` before the existing PostingService. In **Chat & documents**, register a source, upload generic CSV/JSON, approve account mappings, review rows and possible duplicates, then explicitly confirm. Closed periods, imbalance and missing FX remain blocked.

See the [Phase 6 report](docs/PHASE6-UNIVERSAL-INTAKE.md) for generic schemas, APIs, Original inspection, replay/persistence, limits and the complete 309-test verification. This checkpoint is local only; it has not been pushed.
