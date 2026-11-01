# BiG-M Lite

## One-line pitch

A multilingual financial workspace that turns everyday business evidence into reviewed books and inspectable tax calculations.

## Problem

A person can be an employee, a household spender, a rental operator, a cafe owner and an investor at the same time. Documents arrive in different formats and currencies. Mixing those roles can turn a personal purchase into a business deduction or count a card repayment twice.

## What we built

BiG-M Lite ships **one interface**. Business setup, documents, reviewed transactions, FX approval, reports and tax readiness live in a single application served at `/`; there is no legacy mode, no second UI and no fallback screen. `/v2/` redirects to `/` for old bookmarks and `/legacy/` returns 404.

BiG-M Lite uses Meta Muse Spark to interpret context, propose facts and select grounded explanations. Users review the candidates. One Accounting Engine posts balanced journals. CountryPack evidence, independent review and one Universal Tax Engine produce deterministic results.

Two synthetic journeys are evidenced. The primary persona, Nikos, is a Greek-speaking freelance consultant in Tokyo working in JPY: Muse profiled him from a Greek conversation, two documents produced seventeen candidates, all seventeen posted as balanced journals (5,627,290 JPY income, 780,632 JPY expenses, 4,846,658 JPY profit), and tax readiness correctly stays `REVIEW_REQUIRED`. The second journey, Youssef, is a Moroccan Darija persona with five economic scopes, GBP employment income, household spending, two installments, mixed-use villa costs, cafe sales, gym investment, documents, foreign currencies and shared card/bank flows; restart and replays preserve authoritative state.

## Spreadsheet intake at client scale

The third evidenced workspace is Sakura Digital Studio, a Japanese business with 3,000 unique economic events spread over 7,649 rows in four original client spreadsheets. The files were uploaded byte-for-byte as received; their headers (`posting_date`, `money_in_jpy`, `tax_category`, `source_transaction_id`) match no internal schema.

- Muse is called with purpose `csv-schema-discovery` over the header and a bounded row sample and proposes a column mapping; the evidence records `mapping source: MUSE` and `fallbackUsed: false`.
- The engine validates the proposal deterministically — date parseability, amount and currency, direction of money, source identifier uniqueness — and reports `Source rows`, `Rows ready`, `Duplicate rows` and `Rows needing correction` per file.
- The user corrects columns in the UI and approves. Approval is hash-guarded and a mapping is immutable afterwards.
- Bank file: 3,225 rows → 3,150 candidates with 75 duplicate rows suppressed by source-id idempotency. Receipts: 1,700 rows. Payment processor: 224 rows. Invoices: 2,500 rows, mapping deliberately left at review because supplier invoices carry no direction column and the product refuses to guess revenue against expense.

Posting is deterministic and idempotent: 920 journals posted out of 5,074 candidates, every journal balanced, audit chain intact, income 92,318,974 JPY and expenses 739,555 JPY. The unposted candidates stay visible with their reasons — possible duplicate, internal transfer, refund origin, owner use, missing supporting document, FX required. Reports compute July 31,275,403, August 30,216,707 and September 30,087,309 JPY, and the provisional Japanese estimate is **36,912,966 JPY** on a taxable base of 90,999,419 JPY using `JP_IT_BUS_39999K_UP_45PCT`, flagged as a candidate rule with two open assumptions rather than presented as final tax.

## Concrete tax proof

A qualifying synthetic Indonesian PT has IDR 150,000,000 monthly gross turnover. Governed PP 55/2022 rules apply 0.5%, producing **IDR 750,000 payable**, with zero supported deductions against the final gross base and explicitly evidenced zero withholding/prepayments. Facts, rule, period, exact official source quotations, formula and engine trace are inspectable. This is a company component, not Youssef's worldwide personal tax total.

One controlled live Muse request explains that result in Darija with zero retries and unchanged state. The broader deterministic journey uses mocked model responses. The 20-request live residence pilot remains frozen and unresolved. We do not claim that Muse solved residence law, that all-country tax works, or that a model approved its own rules.

## Evidence

Final regression state on this working tree: **509 tests, 502 passed, 6 failed, 1 skipped** as measured by `npm test`. Five of the six failures also fail at the pre-change baseline commit `410f6cc` and are environment artifacts, not product regressions: the journey suites assert `providerUsed === 'meta'` while `scripts/test.js` deliberately strips every Muse credential, and one Moroccan fixture sets `currency.functional` without the bookkeeping evidence the validator requires. The sixth was a real gap in the new tax-screen strings: the Greek dictionary was missing 18 keys, which is now fixed and verified by re-running `test/ui-locale-consistency.test.js` (5/5). Intake and provisional-tax suites pass 75/75 (`document-intake` 41, `universal-intake` 28, `provisional-jp` 6).

Honest limitation: the **full suite was not re-run end to end after that Greek dictionary fix** — the second run was stopped to free the machine. What is measured after the fix is the locale suite (5/5) and the intake/provisional suites (75/75); the five remaining failures are the same five that fail at the baseline commit. The single skip is the opt-in live-Muse proof.

Nikos workspace, re-verified after the intake work: 17 journals, `balanced: true`, reports reconcile to the ledger to the yen, four FX quotes (USD 154.07, EUR 177.54, USD 158.35, EUR 177.64) each approved by a human, and eight successful Muse requests (`muse-spark-1.3` via `meta`) with provider cost status not reported. Onboarding, Reports, Tax readiness, **Correct information** and **Recalculate** were replayed on that workspace after the intake changes: the provisional estimate stays at 434,773 JPY (`JP_IT_BUS_3300K_6949K_20PCT`, base 4,266,658 JPY) and Recalculate records a new revision without changing the amount. No regression was found; the only state change is that extra revision.

- [Single-UI screenshots](screenshots-single-ui) — real captures of `/` at 1440×900
- [Recording plan and narration](VIDEO-SCRIPT.md) — three-minute Sakura script, English narration
- [Earlier Nikos/Tokyo recording plan](VIDEO-SCRIPT-NIKOS-TOKYO.md)
- [Nikos persona report](../MOROCCAN-EXPAT-E2E.md)
- [Financial state and Q&A](../../research/moroccan-expat/deterministic-result.json)
- [Live explanation](../../research/moroccan-expat/tax-live-explanation.json)
- [Governed rule and citations](../../research/moroccan-tax/historical-company-catalog.json)
- [Work disclosure](WORK-DISCLOSURE.md)

Official event criteria, submission fields and eligibility dates were not provided. This is submission copy for the owner to adapt to the actual form. No external submission has been made.

## Language

Every piece of submission copy, narration, caption and slide text in this folder is English only. The product itself is multilingual and is exercised in English, Indonesian, Greek and Darija; the `el-` screenshots in [screenshots-single-ui](screenshots-single-ui) are kept only as proof that the interface switches language and can be dropped if the event requires strictly English visuals.

## Submission assets

- [Architecture presentation](BiG-M-Lite-Architecture.pptx) — slide text still to be reviewed against the single-UI build
- [Three-minute video](BiG-M-Lite-3-minute-demo.mp4) — **outdated: recorded against the removed V1 interface, must be re-recorded** using [VIDEO-SCRIPT.md](VIDEO-SCRIPT.md)
- [Slide previews](slides-preview.png)
- [Automated demo instructions](DEMO.md)
- [Pitch](PITCH.md)
