# Original → Lite provenance

Original repository: aegaorion-dot/big-m-, branch reference main, pinned commit 4d0da9a6acafc24f7db3778f66b4df6d7cf4764c. Source was fetched directly with the GitHub connector. No source repository was changed.

Lite started on main at d6ce3b0c586761cd9221c613c569fdc2644c504a. Two uncommitted Muse edits were present in onboarding/jurisdictions.js and onboarding/profiler.js. Their exact initial diff is preserved in reference/preexisting-muse-work.patch; the existing commits remain unchanged.

## Source contracts inspected and adapted

| Original source | Useful contract | Lite location |
|---|---|---|
| jurisdiction.ts | ID/SG/US/AU/GB identity, currency, locale, authority, official domains, terminology, research instruction, disclaimer | src/global/jurisdiction-metadata.json and jurisdictions.js |
| src/taxCountryPackContract.ts | Candidate/knowledge/executable distinction; source identity; subject applicability; explicit dates; review-required rather than zero; no implicit authority from coverage | src/countrypack/resolver.js and onboarding contracts |
| src/taxCoreServer.ts (pack definition, applicability, confirmation, resolution and execution guards) | Approved content separate from human subject selection; exact version/period/jurisdiction scope; fail-closed resolution; immutable lineage | ContentRegistry, approveContent, resolveCountryPacks, configuration confirmation |
| src/taxPackComposition.ts | Duplicate code, semantic target, execution role and parameter conflicts; unknown content fails closed | hasConflictingPackRules |
| src/configurationReadinessServer.ts | Account setup separate from governed tax/FX gaps; approved configuration is backend truth | readiness.js, workspaceProfile |
| src/taxAiConfiguratorServer.ts (onboarding schema/validation and governance boundaries) | Quote-backed CANDIDATE-only facts, nine bases, no self approval, progressive missing questions | profiler.js, conversation.js, jurisdictions.js, Meta adapter |
| src/taxCountryPackIndonesia.ts | ID_CIT_REFERENCE v2, COMPANY/CIT, 2025, 18 rules including professional-review branches | content/indonesia-cit-reference-2025.json |
| src/taxCountryPackIndonesiaM5.ts | ID_CIT_DETERMINATION_2025 v2, COMPANY/CIT, 2025, 1 discovery + 2 determination rules | content/indonesia-cit-determination-2025.json |
| src/countryPackResearch.ts | Official-source candidates are leads, not legal authority; bounded work and fallback diagnostics | Metadata/source-review boundary only; no research engine port |
| src/countryPackResearchContinuation.ts | Prepared candidates still require human review and source identity | Explicit unresolved/review states; no source acquisition port |

The two JSON artifacts are mechanical data projections of the actual TypeScript exports. Each records the Original commit, path and blob SHA. Full rule content, formula ASTs, governed parameters and source references are retained. Formula ASTs are inert data in Lite.

Original getJurisdiction's fallback to Indonesia was deliberately not carried over: unknown jurisdiction returns null. Metadata currencies/locales never populate user business facts.

## Behavioral test references inspected

- tests/tax-country-pack.test.mjs
- tests/tax-country-pack-period-jurisdiction.test.mjs
- tests/country-pack-period-scoped-readiness.test.mjs
- tests/country-pack-substantive-scope.test.mjs
- tests/tax-pack-composition.test.mjs
- tests/tax-readiness-period-country-pack-complete.test.mjs
- tests/tax-indonesia-2025-rules.test.mjs
- tests/tax-indonesia-first-real-e2e.test.mjs
- tests/tax-singapore-first-real-e2e.test.mjs
- tests/tax-id-sg-first-real-cross-border.test.mjs
- tests/tax-multinational-real-id-sg.test.mjs
- tests/tax-universal-ai-configurator-phase1-deterministic.test.mjs
- tests/tax-universal-ai-configurator-phase2-governance.test.mjs
- tests/tax-universal-ai-configurator-phase3-e2e.test.mjs
- tests/tax-universal-semantic-contract.test.mjs

Adapted invariants include: mounting or reading does not select a pack; period assignment is not residence; source approval is not subject confirmation; facts remain candidates; support/readiness does not grant execution; absent/unsupported law is not zero; subject/date/jurisdiction checks are conjunctive; overlap/composition fails closed; superseded content is not revived by retiring a successor; decisions retain version/hash/actor/evidence.

Original E2E tests can load governed Singapore and cross-border source manifests. Their existence does not authorize inventing or porting a new executable Singapore pack without the corresponding substantive source artifacts and Lite consumer. None was invented here.

## CountryPack capability in this phase

- Immutable content registry and content hash.
- Explicit subject/tax/effective-window compatibility.
- Separate candidate jurisdiction bases and multi-jurisdiction evaluation.
- Source-content human approval, independently from configuration/pack selection.
- Explicit selected pack IDs bound to revision/hash/period/actor/time.
- Review/missing/out-of-period/not-applicable states.
- Retired and explicit-successor handling; ambiguous version overlap rejected.
- Fail-closed composition checks.
- Workspace versus tax readiness.
- Audit and durable restart state.

Production registry has no executable M3/M5 consumer. Synthetic consumer registration appears only in isolated tests to exercise positive approval/resolution paths. No tax calculation endpoint was added.

## Excluded scope

No PostgreSQL, litigation/dispute workflows, enterprise tax process, withholding engine, legal research/ingestion pipeline, M3 reconciliation consumer, M5 CIT calculator, ERP or second accounting engine.

Money/BigInt, journal construction, PostingService, ledger and reversal implementation files were not rewritten.
