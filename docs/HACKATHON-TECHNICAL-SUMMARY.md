# Hackathon technical summary

BiG-M Lite turns natural business context and financial source evidence into reviewed candidates around an existing deterministic financial backbone. The primary demonstration is an Australian freelancer operating in Bali with Singapore clients, using Indonesian UI, IDR books and SGD receipts. Nationality, residence, work, registration, customer country, language and currency remain independent.

## What Meta actually does

One shared Meta Model API adapter powers Muse Spark business profiling, correction, missing-requirement phrasing, document/transaction interpretation, advisory governed-rule discovery and contextual explanations. Responses are structured JSON with schema checks and exact source evidence. Successful interpretation is labelled in the UI. Configuration or failure does not create a successful-Meta badge. Local/static translation does not require paid model calls.

For grounded explanations Muse selects fact IDs and approved explanation codes. Existing deterministic state supplies every amount and rule/status claim. The local renderer produces the selected-language text; this intentionally bounds free-form output. A five-request live synthetic acceptance passed, including profiling, follow-up, receipt interpretation and tax/report explanations. Evidence: [live-acceptance.json](../research/phase9-demo/live-acceptance.json).

## Existing financial and content boundaries

| Component | Responsibility and boundary |
| --- | --- |
| ONE Accounting Engine | Exact Money/BigInt, balanced journal, posting, reversals, periods, ledger, audit and idempotency. No Phase 9 engine change. |
| ONE Universal Tax Engine | Generic governed expression/contracts, scoped facts, applicability, determination and evidence. No per-country engine and no Phase 9 tax rule change. |
| CountryPack Fabric | Captures/sanitizes source evidence, binds hashes and creates reviewable candidate envelopes. It does not turn a web page or model statement into approved executable law. |
| CountryPack / TreatyPack | Jurisdiction-, event-, subject- and period-scoped content. Candidate, source verification and executable approval are distinct stages. Treaty research is not established relief. |
| Deterministic resolvers | Decide requirements and applicability from governed content and independently typed facts. Nationality/customer location cannot establish residence. |
| Universal Intake | Native, Chat, Document/OCR and generic external transactions/journals retain source provenance and converge on the existing canonical posting boundary. |
| OCR / extraction | Existing local PDF text, image/scanned-PDF OCR and simple text/statement extraction. Originals and review evidence remain available. |
| Multilingual runtime | English canonical keys; versioned validated local language packs, cache, English fallback and Intl formatting. Locale preferences do not revise financial semantics. |
| FX provider | Existing explicit-date provider abstraction/cache, exact conversion and persisted approved historical rate. The demo uses a clearly labelled recorded Frankfurter fixture; normal explicit resolution remains available separately. |
| Governance / human confirmation | Muse cannot approve content, activate a workspace or post. Rule review, profile confirmation, mapping review, FX approval and transaction confirmation remain separate. |

The maintainable [architecture source](architecture/phase9.mmd) represents these existing systems. Tax determination is a separately scoped review/calculation path; it is not silently inserted as an AI tax number in ordinary bookkeeping.

## Product and demonstration

Seven primary areas expose business facts, assistant context, transaction review, document progress, readiness reasons, reports and settings. Technical history/import/journals live in explicit details/advanced controls. Confirmed business facts are separate from unknown/candidate facts. Readiness distinguishes missing information, missing approved rules, review, out-of-period and treaty review; unresolved tax is never zero.

The prepared demo posts real synthetic records through the existing engine: revenue IDR 29,446,000, expenses IDR 125,000 and net IDR 29,321,000 before tax. SGD 2,000 and its original evidence remain beside IDR 27,946,000 functional conversion at 13,973 on 2026-06-01. The ordinary-individual tax review exposes the existing pack's eight missing facts without assuming the user qualifies or is an Indonesian tax resident.

Demo state is owned and isolated under `data/demo`; reset never targets the normal workspace path. Default demo is offline; live Muse requires explicit opt-in and has a twelve-request process ceiling with zero retries. A prepared tour minimizes live sequential calls. Routine regression is fixture-only.

## Verification and claims

402 tests pass, including the 396-test accepted baseline, primary deterministic HTTP journey, restart, reset isolation, sample security, outage and SPA contracts. Real Chrome rehearsal covers fourteen primary-view/viewport combinations at 1440x900 and 1280x800, plus language switching and grounded fallback explanation. Live acceptance uses five requests; no uncontrolled live loop or extra FX request is part of the demo.

No claim of all-country coverage, automatic tax compliance, enterprise FX, inventory/payroll or deployed multi-user production service is made. Official theme and full judging criteria were not supplied; technical evidence supports the supplied requirement to make Meta Model API integration observable, without claiming unverified eligibility or submitting anything.
