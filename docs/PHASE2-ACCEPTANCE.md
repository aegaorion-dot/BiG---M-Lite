# Baseline acceptance gate

Baseline `8d63a32420ab3a50fa302945a990433efe74823d` is preserved intact. Branch: `codex/country-pack-fabric-rnd`. Initial working tree clean.

The exact correction `I keep my books in IDR.` then `Actually use SGD.` failed the independent gate. Fallback ignored the shorthand and retained the old confirmation. Repaired before Fabric: only a bounded explicit correction with the last explicitly discussed bookkeeping currency role is accepted. Payment/reporting discussions cannot supply that context. Changes invalidate proposal, validation and confirmation through the existing revision path.

Two initial gate assertions used incorrect field names (`amount` instead of `money`, and `.months` instead of the report array); correcting those required no accounting changes.

## One engine inspection

Exactly one production class each: Money, JournalEntry, Ledger, PostingService, FinancialPeriod and PeriodRegistry. See src/domain and src/accounting/postingService.js. Vertical slice and reversal use the same PostingService; its ledger.append is the authoritative posting mutation. The other append in web/store.js deserializes persisted journals; it is not a parallel engine.

Summary and monthly report are projections of the same scoped ledger. No country-specific accounting engine or duplicate accounting store was found. Five gate cases activate ID/SG/AU/US/GB, post sales, assert shared class identities and reconcile reports. Country templates configure accounts and have no executable tax rules.

## Executable evidence

- test/phase2-gate.test.js: implementation scan, five-country posting/runtime/report checks, exact correction invalidation, negative currency context, exact adversarial jurisdiction examples.
- test/p1-final.test.js: freelancer/UMKM, semantics, profile/confirmation restore, CLOSED rejection, history/idempotency, disk rollback.
- test/http-onboarding.test.js: real HTTP journeys and separate Node server stop/restart with persisted activation/replay.
- CountryPack regression: 2025 references cannot execute in 2026; basic bookkeeping remains usable.
- Existing sales/purchase/import/reversal/period/scope regression retained.

Before Fabric: npm test: **146 passed, 0 failed** (137 original plus 9 independent gate tests). No paid AI calls. External fetch blocked in normal tests. No accounting expansion or UI changes.
