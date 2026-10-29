# Phase 9: product completion and demo hardening

Phase 9 makes the existing financial architecture understandable and repeatable as a local hackathon product. It adds product presentation, isolated demo orchestration, synthetic fixtures, acceptance evidence and submission documentation. No new accounting/tax/FX/OCR/intake/translation architecture, jurisdiction or legal rule was introduced. No push or public submission is performed.

## Protected checkpoint

- Accepted Phase 8 branch was clean at `a1e2d402fb42f5d94c677f81ccfdedf03d4bf40d` before changes.
- Its baseline passed all 396 tests with no failure or skip.
- New branch: `hackathon/demo-submission`; parent remains that exact Phase 8 commit. Prior checkpoints are not rewritten.
- Local commit identity remains `BiG-M Lite Hackathon` and the established GitHub noreply email. Final commit SHA and clean status are reported after committing.

## Product experience completed

Seven primary areas are visible: Home / Business, Assistant, Transactions, Documents, Tax readiness, Reports and Settings. Existing direct-entry, journal, reversal and import tools remain available in explicit More/details controls. The home screen uses actual recorded amounts, business identity, functional currency, business location, tax-readiness blockers, cash/bank balance and recent transactions. Empty workspaces show a useful empty state rather than example KPI values.

Business facts retain separate nationality, work location, registration, tax residence, customer countries and currency roles. Active confirmed facts are separate from candidate/unknown information. Pending corrections are not presented as active confirmation. Existing profile review and activation controls retain authority.

The tax view distinguishes missing information, missing approved rule, review, out-of-period and treaty review; Ready is explained as a distinct state rather than claimed for this unresolved persona. Tax amount is unset, never a zero estimate. Expandable configuration details show candidate pack identity, version, dates, governance and source status. Related catalogue entries are explicitly not an approval/applicability decision.

The demo tax review explicitly selects the existing Indonesian ordinary-individual income candidate scope for 2026. It exposes eight actual missing facts from the existing readiness planner, including taxpayer type, residence, source, business capacity, regime, reviewed taxable income and human fiscal/period review. This request does not itself assert residence or eligibility. The full governed fact/rule approval and calculation workflows are not replaced with a fake tax-compliance screen.

Documents show Original -> Extracted -> Interpreted -> Candidate -> Reviewed -> Posted from actual state. Successful Meta provenance is visible only when present; prepared local interpretation is labelled separately. Candidate review shows date, original amount/currency, description, source, functional currency, proposed accounts, status and separate confirm/edit/reject actions. Posted details and raw technical evidence are collapsed by default.

Foreign candidates display original and functional amounts, explicit economic date, rate and provider; the recorded demo quote is labelled as captured data. Quote approval remains separate from transaction confirmation. Language switching preserves the current page and financial state. Operation-specific loading and readable provider/FX/document/posting error states replace raw technical presentation. Technical trace stays optional and never adds keys or system prompts to the UI.

## Repeatable primary journey and reset

The primary persona is an Australian freelancer working in Bali with Singapore clients. The journey covers Indonesian profiling, correction, necessary bookkeeping-currency follow-up, profile confirmation, local income, receipt, foreign payment, historical FX review, missing tax requirements and report explanation. Semantic enums remain canonical and independent.

Commands:

- `npm run demo:reset`: fresh Indonesian synthetic workspace.
- `npm run demo:prepare`: prepared profile, actual three-journal result and unresolved scoped tax review.
- `npm run demo`: offline demo by default at localhost:3109.
- `BIGM_DEMO_LIVE=1` in the process before starting: explicit live Muse, twelve-request ceiling, zero retries.

Only the owned `data/demo/store.json` is replaced on reset; normal `BIGM_DATA_PATH` and `data/store.json` are not used by this command. Ownership, path-redirection and running-process checks prevent accidental overwrite. A stale demo process marker can be recovered without manual recursive deletion. Tests preserve a separate normal-data sentinel. Actual CLI reset -> prepare -> loopback startup was also checked; the verification process was stopped afterward and its marker recovered.

Fixtures in `demo/` contain only synthetic business/persona context, Indonesian receipt and Singapore invoice/payment data. The reset/prepared journey uses existing local interpretation and existing engines, not model-branded fabricated results. A secondary domestic UMKM tour was not added; the primary cross-border journey remains the tested demonstration.

## Deterministic verification

Full `npm test`: **402 passed, 0 failed, 0 skipped**, 29 suites. All 396 accepted Phase 8 tests remain green. Six new checks cover:

1. Real HTTP primary journey with a mocked shared Muse adapter, profile correction, human activation, local transaction, document, foreign FX approval/confirmation, actual scoped tax requirements, grounded explanations, locale switch and restart.
2. Reset repeatability, isolated normal-data sentinel, active-process refusal and unmarked-store refusal.
3. Demo-only allowlisted sample documents and existing API authentication.
4. Meta outage with real recorded results, no invented tax and no retry loop.
5. Empty home, meaningful navigation and explicit unresolved tax blockers.
6. Actual document stages, prepared-data provenance, original/functional FX values and tax explanation interaction.

Routine tests strip live flags/configuration and use the existing loopback-only network guard. No paid Meta or live FX request runs in regression. The opt-in live command was separately verified to skip without its explicit flag.

Byte-comparison checks against Phase 8 confirm no changes to `src/domain`, `src/accounting`, `src/tax`, `src/countrypack`, `src/fabric`, `src/fx`, `src/intake`, the language-pack framework or `src/app/verticalSlice.js`. Phase 9 changes wrap existing services with presentation/demo orchestration; no dependency was added.

## Browser and live rehearsal

[Browser evidence](../research/phase9-demo/browser-rehearsal.json) records fourteen view/viewport combinations: all seven primary areas at 1440x900 and 1280x800. No page overflow, console exceptions, visible raw JSON by default or untranslated product keys were found. Reports remained on the same route through English/Indonesian switching. The fallback report explanation matched the engine and journal count stayed three. Five screenshots are committed under `research/phase9-demo/screenshots/`; home, document and tax screens were visually inspected and a home-card contrast defect was fixed.

The native computer-use helper was unavailable (missing pipe; alternate runtime initialization also failed). Installed headless Chrome supplied real rendering/navigation evidence. The sandboxed renderer initially timed out; the authorized unsandboxed verification succeeded. This is disclosed rather than described as an interactive native browser rehearsal.

[Live Meta acceptance](../research/phase9-demo/live-acceptance.json) succeeded on 2026-10-29 using exactly **five requests**, zero retries, 15,579 ms elapsed. It used the existing Muse Spark adapter and synthetic in-memory state:

- Profile: canonical AU nationality, ID work location and SG customer location; functional currency stayed unset until an explicit operator answer. No residence/registration was inferred.
- Follow-up: `Mata uang apa yang Anda gunakan untuk pembukuan?`
- Document: live Meta interpreted the text receipt after existing local text extraction; a human/operator fixture reviewed it and the engine posted the expense. This run does not claim scanned-image OCR.
- FX: real engine conversion used the clearly labelled recorded historical fixture; no additional live Frankfurter request was made.
- Tax: Muse explained actual `MISSING_REQUIRED_FACT`, unresolved governance and missing facts in Indonesian. Selected catalogue metadata remained candidates, with explicit periods/status; no rule was approved/applied by the model.
- Report: Muse selected authoritative results and rendered Indonesian revenue IDR 29,446,000, expenses IDR 125,000 and net IDR 29,321,000 before tax.

Reported live usage: 4,989 input tokens, 2,397 output tokens, 7,386 total; reasoning tokens 1,501 are included within output usage. No cost estimate was invented. No additional paid calls were run to polish wording.

## Documentation and submission readiness

README now explains problem, solution, Meta's role, actual capabilities, setup/environment variable names, run/test/demo commands, governance and limits. [Technical summary](HACKATHON-TECHNICAL-SUMMARY.md), [maintainable diagram](architecture/phase9.mmd) and [rehearsal checklist](DEMO-REHEARSAL.md) support submission materials. The latter includes exact steps, expected totals and fragile behavior.

The supplied Stage One focus is addressed through observable Meta usage and concrete product evidence. The official theme, full judging criteria and submission form were not supplied; final eligibility/scoring claims and external submission remain pending. No unsupported all-country, AI-law or automatic-compliance claim is made.

## Security, final status and limits

The read-only reachable-history scanner passes before the checkpoint. Proposed source, fixtures, documentation, binary screenshots and sanitized live evidence are separately compared privately in memory against configured credential variants and secret patterns before staging. The real `.env` stays ignored/untracked; no key, raw provider header, prompt or secret-looking log is intended for the commit. `src/fabric/researchSanitizer.js` remains unchanged and active. A post-commit reachable-history scan verifies the resulting checkpoint again.

Remaining limits are explicit: candidate tax content still needs proper fact/legal/executable approval; catalogue visibility does not establish treaty relief; reporting-currency and foreign-journal conversion remain pending; unpaid accrual, revaluation, enterprise FX, consolidation, inventory and payroll are out of scope. The demo FX fixture is one historical pair/date. Normal live provider exact-date policy can reject carried weekend/holiday dates. Real OCR quality and Meta availability vary. The local prototype is not a deployed multi-user service. Some technical IDs remain canonical inside explicit details; Muse explanations deliberately render grounded selected facts rather than unconstrained financial prose.

The final file list and verification summary are in [verification.json](../research/phase9-demo/verification.json). After the local commit, the parent, preserved references, main, author identity, no tracked `.env`/logs, security scan and clean working tree are checked. No push is performed.
