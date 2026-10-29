# Phase 7: live Muse cognitive runtime

Branch: `hackathon/live-muse-runtime`. Parent: accepted Phase 6 checkpoint `ecae4066783f78489c6fb1e3cebab2d0b56d8396`. Local checkpoint only; no push, merge, history rewrite or change to `main`.

## Runtime and authority

One `MetaModelAdapter` per web store supplies profiling, requirement phrasing, document/chat interpretation, governed catalog discovery and contextual assistance. The HTTP application and explicit live scripts use the same store/runtime. No dependencies, engines, jurisdictions or FX services were added.

| Role | Muse output | Existing authority |
|---|---|---|
| Profiling | Typed, quoted, confidence-bearing candidate facts | Profile validation, revisions, proposal validation and human confirmation |
| Next question | Natural wording for exactly one supplied requirement | Configuration planner / scoped CountryPack and TreatyPack readiness |
| Discovery | Known catalog IDs, reasons, supporting fact IDs, declared missing facts | Existing domestic/treaty resolvers; suggestions never approve applicability |
| Chat/document | Evidenced semantic candidates, optional known accounts | Intake validation, review, canonical command, human confirmation, PostingService |
| Assistant | Selection and organization of supplied facts/explanations | Current state, accounting reports and scoped determinations |

Tax/accounting engines, governance and content sources are unchanged from Phase 6. Nationality, work, registration, tax residence, customers and bank location remain separate roles. No calculation, approval, activation or posting tool is exposed to Muse.

The assistant uses structured narrative sections. Muse selects/orders facts; a deterministic renderer supplies their wording and exact amounts. Arbitrary model-authored financial/legal prose is not rendered. Sections distinguish FACT, INFERENCE, MISSING INFORMATION, GOVERNED RULE and CALCULATED RESULT. Free text or unknown IDs cannot insert amounts or application state.

## Configuration and use

Configure the ignored project `.env` with `BIGM_META_API_URL`, `BIGM_META_MODEL` and `BIGM_META_API_KEY`. The real client accepts only `https://api.meta.ai/v1/responses`. Verified model: `muse-spark-1.3`. Never put keys in arguments, transcripts or tracked files.

`npm start` loads `.env`. Complete configuration enables the shared primary profile and chat/document semantic provider. `BIGM_MUSE_ENABLED=0` enables offline operation. `BIGM_MUSE_MAX_REQUESTS` sets the positive integer process-level ceiling (default 100). `BIGM_MUSE_TRACE=1` enables the developer/demo trace.

Open **BiG-M assistant** from setup, intake or active workspace tabs. Ask about tax readiness, selected packs, missing facts or recorded business results. Muse intake candidates retain model/request/response provenance and a visible badge. Setup and intake retain their explicit review/confirmation steps.

| Endpoint | Behavior |
|---|---|
| `GET /api/muse/status` | Safe configuration/model/metrics; no paid call |
| `POST /api/muse/assistant` | `{question, topic?, candidateId?, determinationId?}`; PROFILE, INTAKE, TAX or REPORT |
| `POST /api/muse/discovery` | Advisory governed catalog suggestions only |
| `GET /api/muse/trace` | Safe events and deterministic checkpoints; requires trace mode |
| `POST /api/tax/review/start` | `{request}` with explicit existing scope/basis; plans facts only |
| `POST /api/tax/review/answer` | Existing declared, quoted candidate answers |
| `POST /api/tax/review/propose` | Existing review proposal; no confirmation/execution |

Muse endpoints use existing optional `BIGM_API_TOKEN` authentication. Server binds to loopback by default. Tax scope must match the organization; determination access also uses the active review's subject. Refreshes make no paid calls. Natural questions are persisted against profile revision and deterministic requirement hash. Completed setup asks nothing extra. Material corrections invalidate dependent proposals/validation/confirmation. Tax questions need an explicit current review scope, avoiding generic questionnaires.

## Context, contracts and failure

Lazy topic readers minimize context. Reports supply actual totals. Intake supplies at most five statuses/conflicts without original files/OCR dumps. Profile assistance excludes address/tax registration number. Tax context carries actual readiness/missing facts and, when selected, determination status/reason, Money amounts, applied rule IDs/versions, bounded calculation trace, treaty status and evidence. Full execution snapshots/registries are excluded.

Discovery receives metadata-only existing pack/version/rule identities; treaty dossiers without articles are explicitly metadata-only. No rates/formulas are invented. Suggestions go through existing resolvers when a current explicit tax scope is present. They never confirm candidate facts or legal applicability.

User/document content is untrusted data. Strict local validation rejects extra fields, unknown roles/currencies/accounts/rules/facts, unsupported authority, fabricated quotes, invalid dates, malformed money and invented numeric legal claims. JSON mode alone never grants authority.

Failures are visible as `MUSE_UNAVAILABLE` in assistant responses or semantic intake errors. Onboarding retains validated deterministic fallback. Failed documents retain original/extraction for review or retry. Native structured entry, current configuration, accounting and governed offline tax paths continue working. Assistant/discovery persistence contains only advisory state and safe trace data.

## Spending and observability

Routine `npm test` strips credentials/live flags and installs a network guard. The client independently refuses live calls from routine test processes. All regression responses are injected mocks.

Default retries are zero. Optional retries are capped at one HTTP 429; auth, server, timeout, parse and schema failures never retry. Timeouts cover fetch and JSON consumption. OCR context is capped at 80 blocks/14000 characters; assistant context at 20000 characters; complete request context at 50000 characters. Successful validated results have five-minute caching (50 entries) and in-flight deduplication. Failed responses are uncached.

Requests use `store:false`, JSON mode and `reasoning.effort=minimal`. Role output caps: questions 768, assistant 1536, discovery 2048, profile/document 3072 tokens, including reasoning. Safe metrics retain purpose/model, request/response IDs, timestamp, latency, attempts, parse/schema/cache/fallback status and API token/ reasoning usage. Credentials, hidden prompts and reasoning text are excluded. Monetary cost is `null / NOT_REPORTED`; the API supplied usage, not a charge. The ceiling resets on restart and is not an account-wide billing cap.

See Meta's [Responses schema](https://dev.meta.ai/docs/api-reference/responses/schemas) and [reasoning guide](https://dev.meta.ai/docs/reasoning). Reasoning consumes the same output budget as visible text; the initial reachable attempt exhausted its limits, prompting the minimal-reasoning adjustment.

## Explicit live commands and evidence

After mocked regression passes, in PowerShell:

```powershell
$env:BIGM_META_LIVE_TEST='1'
npm run test:meta:acceptance
```

Individual commands: `test:meta:profiling`, `test:meta:document`, `test:meta:assistant`. They skip before loading `.env` without explicit enablement. Individual ceiling: four requests; combined ceiling: eight. They use synthetic in-memory workspaces/fixtures, never the user's persisted ledger. No automatic retry loop.

The successful combined run on 2026-10-29 used six real `muse-spark-1.3` requests. [Sanitized structured results/metrics](../research/phase7-muse/live-acceptance.json) preserve five journeys:

1. AU nationality, coffee business `kuliner`, ID work location (candidate inference) and SG customers; no unsupported registration, tax residence or source. Default UI language in the profile is not a Muse extraction.
2. Muse asked the current currency requirement. After explicit synthetic currency selection, live registration correction added ID and invalidated pending proposal/validation. Completion added no unnecessary question.
3. PNG receipt passed bundled local OCR and live interpretation: IDR 850000, exact quotes and model provenance. Missing classification/settlement stayed null; REQUIRES_REVIEW, no confirmation or posting.
4. Tax explanation used actual OUT_OF_PERIOD resolution, no selected pack and no active scoped review, with no invented rate or eligibility.
5. Report selected exact IDR revenue 80000000, expenses 30000000 and net bookkeeping income 50000000. Underlying postings were explicit synthetic fixture submissions, never Muse actions.

Successful run: 4073 input + 2873 output = 6946 tokens; output includes 2003 reasoning tokens. Per-call latency: 1411-4685 ms. Two earlier sandbox attempts failed before API usage ([evidence](../research/phase7-muse/live-network-restricted.json)). Two subsequent reachable requests exhausted output limits ([evidence](../research/phase7-muse/live-output-limit.json)): 1031 input + 2432 output = 3463 tokens. Total observed reachable calls: eight, six successful; total reported tokens: 10409. No automatic retries or monetary cost claims.

## Verification, files and remaining limits

The accepted 309-test baseline passed before branching. Added regression covers profiling/evidence/corrections, scoped pack questions, minimum questioning, known-rule discovery and adversarial selection, document/chat candidates, actual-state and numeric grounding, tax trace contracts, unavailable state, injection, failures/schema/timeout/retry/cache/budget, persistence, authenticated HTTP and real SPA interaction. Full results and file groups: [verification manifest](../research/phase7-muse/verification.json).

Changed areas: shared client plus new `museRuntime`, `museContracts`, `museContext`, `museCatalog`; web store/API/server; intake provenance/account context; assistant UI and existing-language labels; guarded live runner/test scripts; runtime/HTTP/SPA tests; configuration example and documentation/evidence. No core tax/accounting sources or legal content changed.

Live coverage is the five acceptance journeys. Live rule discovery and a completed governed tax calculation were not exercised to save credits; mocks and existing tax regression cover those contracts. Scoped tax-pack questioning is mocked; the live question covered the current workspace currency requirement. No tax-review wizard was added: CLI/API remains the review surface. Missing FX, account ambiguity, unreviewed content and temporal gaps still need human review. Assistant wording is intentionally constrained to grounded structured summaries. This phase does not certify legal content or broaden tax coverage.
