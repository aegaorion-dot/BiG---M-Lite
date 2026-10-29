# Demo rehearsal

## Rehearsed evidence

The primary deterministic HTTP journey passes: Indonesian profile, correction, human confirmation, receipt, SGD historical conversion, tax-readiness and result explanation, language switch and restart. Real Chrome checked all seven primary areas at 1440x900 and 1280x800 without page overflow, visible raw JSON, untranslated product keys or console exceptions. The native computer-use tool was unavailable; the browser rehearsal used installed Chrome in headless mode and screenshots were visually inspected.

The separate live Meta run passed five requests in 15,579 ms: profile extraction, selected-language follow-up, receipt interpretation, tax-readiness explanation and report explanation. It used synthetic data, zero retries and no new live FX request. See [live evidence](../research/phase9-demo/live-acceptance.json) and [browser evidence](../research/phase9-demo/browser-rehearsal.json).

## Preparation and reset

1. Install dependencies with `npm ci` on Node >=20.19. Keep Meta settings only in the ignored `.env`.
2. Stop any running demo server before reset. `npm run demo:reset` creates a fresh Indonesian demo workspace; `npm run demo:prepare` creates the prepared tour instead.
3. Reset targets only the owned `data/demo/store.json`. It refuses an unmarked snapshot, directory redirects or a running demo. `BIGM_DATA_PATH` does not change this target. A dead process marker is recovered on the next command.
4. Start offline with `npm run demo`, or set `BIGM_DEMO_LIVE=1` in the process and then run `npm run demo` for live Muse. Default port is 3109; the normal application uses a separate snapshot and port 3100.
5. Open http://localhost:3109. Confirm the synthetic-demo banner and language. Prepared data is not presented as live Meta output. A successful live interpretation alone earns the Muse provenance label.

## Primary fresh journey checklist

Use the fixture story in `demo/journey.json`. Every person/business/document is synthetic. The complete live tour should fit within twelve requests when each step is performed once; navigation and language switching do not call Meta.

| Step | Action | Expected result |
| --- | --- | --- |
| Clean startup | Reset, start, open the local app | Indonesian greeting, language selector, no fabricated KPI data |
| Onboarding | Click the Bali story button, then Send | Muse understands Australian nationality, Bali work and Singapore customers; candidate facts appear |
| Follow-up | Answer `Saya menggunakan IDR untuk pembukuan.` | Functional currency is an explicit answer, not an inference; canonical facts remain AU/ID/SG |
| Correction | Say `Koreksi, nama usaha saya adalah Bali Design Demo.` before final confirmation | Corrected business name; stale setup proposal invalidated |
| Confirmation | Check each semantic role, then Use this setup | Human-confirmed workspace opens in IDR; registration/residence remain unknown unless explicitly supplied |
| Local transaction | Transactions: send the local-payment fixture with date 2026-06-01 | Proposed IDR 1,500,000 revenue, no posting yet |
| Review | Check date, amount, category, counterparty and bank account; save corrections, then confirm | One journal; unsaved visible changes cannot confirm an older candidate |
| Document | Documents: upload `demo/receipt-id.txt` or use the receipt sample button | Original -> extracted -> interpreted -> candidate; source/provenance visible |
| Receipt review | Confirm date 2026-06-01, expense, IDR 125,000 and bank; save and confirm | Real expense posting; original file still downloadable; no automatic posting from model output |
| Foreign activity | Use the SGD-payment conversation fixture OR the Singapore invoice, once | Original SGD 2,000; functional IDR remains unchanged; candidate needs FX review |
| Historical FX | Get the dated quote, inspect source/date/original/functional values, approve, then separately confirm transaction | Clearly labelled recorded demo rate 13,973 IDR/SGD on 2026-06-01; functional IDR 27,946,000 |
| Tax readiness | Tax readiness: show the demo tax-review requirements if not already prepared | Explicit candidate scope for 2026 Indonesian ordinary individual income; eight actual missing governed facts; no residence/eligibility/rule approval implied |
| Tax explanation | Explain tax readiness | Muse explains actual missing facts and candidate governance/treaty state; no invented zero tax |
| Report | Reports | Recorded revenue IDR 29,446,000; expenses IDR 125,000; net IDR 29,321,000 before tax |
| Report explanation | Explain these results | Indonesian grounded explanation; amounts come from the engine |
| Multilingual | Change to English and back while viewing Reports | Same route, ledger, profile and currency; only language/format changes |
| Restart | Stop/restart without reset | Same journals, original SGD and stored historical rate; no repricing |

The sample chat text is deliberately explicit about date/currency. If a field remains uncertain, correct it in the existing review form; do not repeatedly call Meta just to change the wording. Do not post both the SGD chat and the identical invoice as separate revenue: the duplicate review is intentional.

## Short reliable judging tour

Use `npm run demo:prepare` while the server is stopped, then start the live demo. Show Home/business facts, Documents stages, the posted SGD candidate and its original/functional amounts, Tax readiness and Reports. Use only the two explanation buttons live if latency is a concern. Prepared postings still came through the real engines; their interpretation is labelled local. Use a fresh live story only to demonstrate onboarding; the sanitized live acceptance evidence also proves profiling and document understanding without replaying every paid call.

The exact source FX request was independently verified in Phase 8. The Phase 9 demo deliberately uses that captured historical response as a labelled deterministic fixture. It does not claim a fresh Frankfurter lookup. Normal application FX resolution remains a separate explicit action.

## Failure and fragile-step checklist

- Meta latency/failure: the run observed 1.2-4.9 seconds per request. Keep the prepared tour available. Unavailable interpretation is labelled; native entry and grounded deterministic report facts remain available. Retry explicitly, once only if needed; the process ceiling prevents loops.
- Receipt support: use the text fixture for the shortest reliable tour. Existing PNG/PDF OCR is covered by the full regression and earlier live verification; real image quality may require correction. Do not imply the Phase 9 live text receipt was scanned-image OCR.
- Missing date/payment/account: the transaction stays review-only. Set an explicit economic date and paid cash/bank state. Unpaid invoice/accrual workflows are outside this demo.
- FX: the recorded demo supports only SGD/IDR on 2026-06-01. Other pairs/dates return FX_REQUIRED without blocking local bookkeeping. The normal provider's strict exact-date policy can reject weekend/holiday carry dates.
- Confirmation: changing profile facts invalidates setup confirmation; changing candidate fields clears FX review. Reconfirm the current state rather than bypassing review.
- Duplicate: a receipt/invoice imported twice is not extra revenue/expense. Inspect the existing candidate or complete explicit duplicate review.
- Reset: stop the server first. Do not manually delete data folders or change the reset path. Normal `data/store.json` is not the demo workspace.
- Tax: candidate metadata may include older/out-of-period packs in the advanced context catalogue. Their dates/governance are visible; they are not selected, approved or applied by being displayed. Tax residence, taxable-income review and executable-rule governance remain unresolved in the persona.
- Reporting currency: reports use recorded functional amounts. A different reporting currency is explicitly pending conversion. No consolidation/revaluation is demonstrated.
- Browser verification: desktop and laptop were checked. A native interactive browser helper was unavailable here; headless Chrome provided real rendering and navigation evidence. This is not a claim of exhaustive mobile/accessibility certification.

## Submission checklist

Use the clean README, [technical summary](HACKATHON-TECHNICAL-SUMMARY.md), diagram source, screenshots and sanitized live evidence. Show the subtle successful-Muse provenance and explain that amounts/rules retain deterministic authority. Avoid claims of all-country support, AI-approved law or automatic compliance. Official theme/full judging criteria and the final submission form must still be checked when provided; no public submission or push has been made.
