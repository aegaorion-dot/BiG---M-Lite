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

These artifacts require M3/M5 consumers that Lite intentionally does not implement. They are not executable in Lite, including after source-content review. No 2026 rules or executable SG/US/AU/GB packs are invented.

The resolver checks semantic basis, subject, tax type, complete accounting period, evaluation date, content review, explicit confirmation and consumer capability. Missing content, expired windows, incompatible subjects, retired versions, ambiguous overlaps and composition conflicts stay unresolved. Customer, bank and work location alone never select a tax pack.

workspaceReady and taxReady are independent. An IDR bookkeeping workspace for a Bali coffee shop may activate while registration or tax settings need review. A 2026 period never runs the imported 2025 rules.

Legacy JSON packs under src/countrypack/packs remain foundation test/examples. They are not presented as substantive law by the new resolver. The web posting path uses an explicitly neutral bookkeeping template and records no final tax liability.

## Persistence and recovery

Snapshots include candidate facts/revision, CountryPack review state, proposal, validation, human confirmation, active profile snapshot, activation history/idempotency, journals, audit, transaction idempotency and period state.

Writes use a temporary snapshot followed by rename. Save errors are surfaced; activation/posting roll back their in-memory changes on failure. Restore validates the audit and active confirmation and uses the same runtime application path. Closed periods remain closed.

Version-1 snapshots retain journals and periods but require setup review and reconfirmation; old auto-confirmed configuration is not silently promoted.

The UI resumes the saved pending question after refresh. It does not claim to recover an unsaved full chat transcript. Reports keep other currencies separate without invented FX conversions.

## Verification

See docs/IMPLEMENTATION-REPORT.md for completed checks and limitations, and docs/ORIGINAL-PORT.md for source provenance and deliberately excluded enterprise scope.
