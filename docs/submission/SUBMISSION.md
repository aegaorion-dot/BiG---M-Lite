# BiG-M Lite

## One-line pitch

A multilingual financial workspace that turns everyday business evidence into reviewed books and inspectable tax calculations.

## Problem

A person can be an employee, a household spender, a rental operator, a cafe owner and an investor at the same time. Documents arrive in different formats and currencies. Mixing those roles can turn a personal purchase into a business deduction or count a card repayment twice.

## What we built

BiG-M Lite ships **one interface**. Business setup, documents, reviewed transactions, FX approval, reports and tax readiness live in a single application served at `/`; there is no legacy mode, no second UI and no fallback screen. `/v2/` redirects to `/` for old bookmarks and `/legacy/` returns 404.

BiG-M Lite uses Meta Muse Spark to interpret context, propose facts and select grounded explanations. Users review the candidates. One Accounting Engine posts balanced journals. CountryPack evidence, independent review and one Universal Tax Engine produce deterministic results.

Two synthetic journeys are evidenced. The primary persona, Nikos, is a Greek-speaking freelance consultant in Tokyo working in JPY: Muse profiled him from a Greek conversation, two documents produced seventeen candidates, all seventeen posted as balanced journals (5,627,290 JPY income, 780,632 JPY expenses, 4,846,658 JPY profit), and tax readiness correctly stays `REVIEW_REQUIRED`. The second journey, Youssef, is a Moroccan Darija persona with five economic scopes, GBP employment income, household spending, two installments, mixed-use villa costs, cafe sales, gym investment, documents, foreign currencies and shared card/bank flows; restart and replays preserve authoritative state.

## Concrete tax proof

A qualifying synthetic Indonesian PT has IDR 150,000,000 monthly gross turnover. Governed PP 55/2022 rules apply 0.5%, producing **IDR 750,000 payable**, with zero supported deductions against the final gross base and explicitly evidenced zero withholding/prepayments. Facts, rule, period, exact official source quotations, formula and engine trace are inspectable. This is a company component, not Youssef's worldwide personal tax total.

One controlled live Muse request explains that result in Darija with zero retries and unchanged state. The broader deterministic journey uses mocked model responses. The 20-request live residence pilot remains frozen and unresolved. We do not claim that Muse solved residence law, that all-country tax works, or that a model approved its own rules.

## Evidence

Final regression on the shipped commit: **498 tests, 493 passed, 4 failed, 1 skipped**. The four failures are test-environment artifacts, not product regressions: three journeys assert `providerUsed === 'meta'` while `scripts/test.js` deliberately strips every Muse credential (so they exercise the deterministic fallback), and one Moroccan fixture sets `currency.functional` without the bookkeeping evidence the validator requires. The single skip is the opt-in live-Muse proof. Assistant-layer tests pass 43/43.

Nikos workspace, verified after a fresh process restart: 17 journals, `balanced: true`, reports reconcile to the ledger to the yen, four FX quotes (USD 154.07, EUR 177.54, USD 158.35, EUR 177.64) each approved by a human, and eight successful Muse requests (`muse-spark-1.3` via `meta`) with provider cost status not reported.

- [Single-UI screenshots](screenshots-single-ui) — real captures of `/` at 1440×900
- [Recording plan and narration](VIDEO-SCRIPT.md)
- [Nikos persona report](../MOROCCAN-EXPAT-E2E.md)
- [Financial state and Q&A](../../research/moroccan-expat/deterministic-result.json)
- [Live explanation](../../research/moroccan-expat/tax-live-explanation.json)
- [Governed rule and citations](../../research/moroccan-tax/historical-company-catalog.json)
- [Work disclosure](WORK-DISCLOSURE.md)

Official event criteria, submission fields and eligibility dates were not provided. This is submission copy for the owner to adapt to the actual form. No external submission has been made.

## Submission assets

- [Architecture presentation](BiG-M-Lite-Architecture.pptx) — slide text still to be reviewed against the single-UI build
- [Three-minute video](BiG-M-Lite-3-minute-demo.mp4) — **outdated: recorded against the removed V1 interface, must be re-recorded** using [VIDEO-SCRIPT.md](VIDEO-SCRIPT.md)
- [Slide previews](slides-preview.png)
- [Automated demo instructions](DEMO.md)
- [Pitch](PITCH.md)
