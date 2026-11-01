# Phase 8: international runtime

This checkpoint adds independent UI/conversation locale preferences and reviewed historical FX conversion around the existing universal intake boundary. Language, nationality, business jurisdiction, tax residence and currency remain separate facts. The accounting and universal tax engines are unchanged.

## Checkpoint and verification

- Branch: `hackathon/international-runtime`; commit locally only. No push is authorized for Phase 8.
- Parent and preserved Phase 7 checkpoint: `1567627c93f9198f6d759bd2eed10f0fd26ebc9c`.
- The first baseline run found 358 passing tests and one obsolete historical test anchor. `test/universal-intake.test.js` referenced pre-sanitization Phase 5 SHA `98d229...`, which is intentionally absent after security history sanitization. Only this test anchor was updated to the equivalent accepted sanitized Phase 5 SHA `d5672109b4ba6010bc62473bfe0ca36e4e3f79d7`; the recovered baseline passed all 359 tests. Previous checkpoints were not changed.
- Final regression: 396 tests, including all 359 baseline tests and 37 Phase 8 checks; final counts are recorded in [verification.json](../research/phase8-international/verification.json).
- Core integrity checks compare `src/domain`, `src/accounting`, `src/tax` and `src/app/verticalSlice.js` against the accepted Phase 7 checkpoint byte for byte.
- Routine tests use fixtures, strip live configuration and enforce a network guard. No live translation, FX or paid Meta calls run in the regression suite.
- Live verification was separate: one public FX request and one Indonesian conversation using two existing Meta runtime requests. Sanitized evidence is linked below.

## Language architecture

Supported UI locales are `en`, `id-ID`, `en-AU`, `en-SG` and `en-GB`. English is the canonical source dictionary and stable keys remain the lookup interface. Indonesian has a reviewed local dictionary; English regional variants use the English dictionary with their own Intl formatting. A German fixture proves extension through a new dictionary without application redesign; German is not advertised as a supported UI locale.

`TranslationProvider` has a default `LocalDictionaryProvider` and an explicitly injected `ExternalTranslationProvider` callback extension. No external translation service or paid Meta translation is mandatory. The UI fetches a validated pack on locale change, then renders from local string lookups.

Each pack records locale, source locale, version, provider, generation time, source hash, per-key source hashes, strings, validation status and fallback keys. Source-hash-derived pack versions preserve older cached packs. Persistent cache entries include source hash, locale, provider, translation and requested version. Changing one source string invalidates that entry. Concurrent requests for one pack share generation. The cache is stored in `language-packs.json` beside the workspace snapshot when persistence is configured.

Provider output has bounded size and must contain only requested keys. Validation preserves placeholder multiplicity and explicit structured status/currency tokens, rejecting invalid/empty/control/markup strings. Missing or invalid translations fall back to canonical English. Corrupt or oversized cache files are ignored and regenerated from validated local assets. Cache integrity hashes detect corruption; they are not signatures or a remote trust authority.

`public/locale.js` shares platform Intl formatting between Node and the browser: currency code placement, grouping/decimal separators, dates, language/country names and plural categories. Money formatting retains integer minor units using BigInt and string fractions. It does not convert the amount to binary floating point.

UI locale is a separate persisted preference. Switching it keeps the current page and does not revise profile facts, proposals, confirmation hashes, jurisdiction, currency, ledger or tax state. Conversation locale defaults to UI locale and can be overridden independently through the API. Legacy `user.language` remains compatible and does not become a financial configuration mutation on UI language change.

## Muse behavior

The existing shared Meta adapter receives the selected conversation locale for profile extraction and question phrasing. Structured fields still pass the existing canonical schemas. Translated enums are rejected. Grounded assistant explanations and deterministic facts use stable localized templates; canonical status codes, IDs and rule references remain unchanged. A schema or language-contract failure degrades to the selected-language deterministic question.

The controlled live input was `Saya orang Australia dan menjalankan coffee shop di Bali.` Muse responded `Mata uang apa yang Anda gunakan untuk pembukuan?` and extracted canonical nationality `AU` and work-location country `ID`, both as candidates. Functional currency remained unset rather than being inferred from language or country.

[Live multilingual evidence](../research/phase8-international/live-multilingual.json): two requests, 4,409 ms conversation elapsed, 1,280 input tokens and 775 output tokens, 2,055 total tokens. Reasoning tokens were 500 within the reported output usage. No price estimate was invented. No credentials are included in the evidence.

## Independent currency roles

- Functional currency belongs to the reviewed active workspace and is the currency used by the existing posting engine.
- Transaction currency and original amount remain on the canonical intake command and source candidate.
- Document currency retains the document interpretation's original currency even if a reviewer corrects the proposed transaction currency.
- Reporting currency remains independently configurable through normal profile review. Functional reports remain available; a different reporting currency produces `REPORTING_CONVERSION_REQUIRED`, with no fabricated converted totals/months.

CountryPack resolution continues to use the existing governed requirements; it cannot silently change the functional currency. UI locale never selects a country or currency.

## FX architecture and precision

`FxRateProvider` has a deterministic fixture implementation and a public `FrankfurterProvider`. `FxService` caches by provider, base currency, quote currency and explicit economic date, deduplicates concurrent lookups, persists successful rate records, and returns `FX_REQUIRED` when a requested rate is unavailable or invalid. No rate lookup is performed merely to render or report.

The live provider uses the official Frankfurter v2 single-pair historical endpoint, with no API credential. Its default provider blend is a reference data source, not a newly governed tax-rate rule. See the [official API documentation](https://frankfurter.dev/) and [official v2 schema](https://api.frankfurter.dev/v2/openapi.json).

The provider enforces HTTPS at its fixed endpoint, explicit date, known currency codes, exact response fields, unique keys, JSON MIME type, an 8 KiB body limit, timeout, no redirect and a bounded request budget. Rates must be finite, positive bounded decimal strings with at most 12 fractional digits. The numeric JSON field is schema-checked but authoritative conversion uses its raw decimal lexeme, then exact BigInt numerator/denominator arithmetic through existing Money operations.

Rounding occurs once at the target functional-currency minor unit using existing `HALF_UP`. No country-specific rounding rule is introduced. A positive original amount rounding to zero is blocked for review. Unsupported currency, scientific-notation rates, absent dates, invalid schema and unavailable pairs remain review-required rather than being invented.

Historical date policy is strict: returned rate date must equal the requested economic date. A weekend/holiday response carrying a prior date is rejected as `FX_REQUIRED`; there is no silent use of today's rate, latest rate or prior-business-day rate. This deliberately limits availability until a reviewed carry-date policy is implemented.

## Human review and posting

Foreign chat, document and external transaction candidates preserve their original values and provenance. A reviewer explicitly requests a dated quote, inspects original amount, functional amount, rate/date/provider, and approves the exact quote hash as a human. Normal transaction confirmation is still required afterward. Quote approval alone never posts.

FX approval binds candidate ID, amount, transaction currency, economic date, workspace functional currency and organization. Candidate edits clear the quote/approval. Recomputed conversions and exact review hashes are checked again at the canonical posting boundary. The adapter supplies functional amounts to the existing engine while persisting the original canonical command, approved FX record, approval provenance and converted amount. Restart, retry and report views reuse stored historical accounting values without re-fetching rates. Existing closed-period, duplicate, account mapping, idempotency and human confirmation controls remain in force.

Provider failure blocks only the affected foreign transaction; native same-currency bookkeeping remains operational. External original files and mapping provenance remain unchanged. Paid foreign invoice conversion is supported through review; unpaid invoice/accrual behavior remains outside the existing cash/bank posting scope.

## Controlled live FX result

[Live FX evidence](../research/phase8-international/live-fx.json): `SGD -> IDR`, date `2026-06-01`, rate **13973 IDR per SGD**, provider `frankfurter-v2`, 785 ms, exactly one request. The rate is a historical provider response, not a hard-coded accounting fixture. The transaction/replay tests use separate deterministic rates.

## APIs and commands

- `GET /api/i18n/pack?locale=id-ID`: validated versioned pack.
- `GET /api/i18n`: selected UI/base/conversation locale preferences.
- `POST /api/onboarding/language` with `language`: select UI preference without profile mutation.
- `POST /api/i18n/conversation` with `locale`: select conversation preference.
- `POST /api/intake/fx/resolve` with candidate ID/revision: resolve explicit historical quote.
- `POST /api/intake/fx/approve` with candidate ID/revision/quote hash/human actor: approve quote before ordinary confirmation.
- `GET /api/reports/reporting-status`: distinguish functional and configured reporting roles.
- `GET /api/summary?currency=USD` and `/api/reports/monthly?currency=USD`: explicit pending-conversion response when different from functional currency.

Existing configured API authentication applies to mutations and intake. No credential belongs in command output or source files.

Routine regression: `npm test`. Read-only reachable-history security check: `npm run security:scan`.

Opt-in live commands in PowerShell (each script skips without its explicit flag):

```powershell
$env:BIGM_FX_LIVE_TEST='1'
npm run test:fx:live
Remove-Item Env:BIGM_FX_LIVE_TEST

$env:BIGM_META_LIVE_TEST='1'
npm run test:meta:multilingual
Remove-Item Env:BIGM_META_LIVE_TEST
```

The Meta smoke script loads the ignored project `.env` only after opt-in. Its request ceiling is two with no retries. The FX smoke ceiling is one. Both write allowlisted result/provenance metrics rather than raw provider payloads or headers. These live checks have already been run for this checkpoint; repeating them is not needed to run regression.

## Test coverage

The new deterministic checks cover all 28 requested categories: language/jurisdiction/currency independence; canonical keys; Indonesian pack; English fallback; placeholder/token preservation; translation cache and invalidation; selected-language Muse and unchanged enums; four independent currency roles; FX contract, historical date, cache, failures, malformed rates and unsupported currencies; persisted accounting conversion, restart/replay; foreign external transaction, foreign document and foreign chat; UI language switch preserving state; unchanged accounting/tax engines; and the full repaired 359-test regression.

Additional checks cover huge exact-money Intl display, locale persistence, local-cache corruption recovery, HTTP timeout/bounds, API authentication, live opt-in skipping, foreign invoice posting, stale FX invalidation and SPA quote/approval/confirmation plus reporting-currency visibility.

## Changed files and remaining limits

The complete proposed file list is in [verification.json](../research/phase8-international/verification.json). Main groups are `src/i18n`, `public/locale.js` and local dictionaries; `src/fx`; intake canonical boundary/service; Muse language/context contracts; web store/API/server; SPA locale/FX review controls; opt-in smoke/test scripts; Phase 8 tests, report and sanitized evidence. No dependency or accounting/tax engine was added or rewritten.

Reporting-currency conversion is explicitly pending. Foreign-currency multi-line journal imports retain original evidence and remain blocked for review; no balancing, revaluation or consolidation engine is claimed. Only currencies already supported by the project's registry are eligible. The provider's process request ceiling is finite and rates unavailable for an exact date cannot be posted until a governed date-policy extension exists. English variants share English text. Additional external translation services require an intentionally configured provider; that optional extension does not replace the default reviewed local dictionaries. Some technical validation/status IDs remain canonical rather than translated prose. No new tax rules, crypto, hedging or enterprise FX accounting were introduced.

Security verification checks the configured credential privately in memory against proposed files, sanitized evidence and reachable Git history, plus token/private-key patterns and committed environment/log files. The real `.env` stays ignored/untracked. Final scan summaries, unchanged reference SHAs and commit/working-tree status are checked after the local commit. No Phase 8 push is performed.
