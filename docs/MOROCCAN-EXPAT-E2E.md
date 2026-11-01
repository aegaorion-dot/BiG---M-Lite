# Youssef: final Moroccan expat checkpoint

The supported example is **October 2025 Indonesian company final turnover tax: IDR 750,000 payable**, executed by the existing Universal Tax Engine. This is the company's liability, not Youssef's worldwide personal tax total.

## Supported calculation

2025 was selected because preserved official PP 55/2022 contains the complete rate, base, eligibility, duration and payment provisions. It avoids applying the 2026 amendment backwards or depending on unresolved personal residence. Every transaction, presence interval, receipt and synthetic FX quote in the final demonstration is consistently dated to 2025. The original 2026 regression journey and frozen research remain separate and preserved.

| Field | Supported result |
| --- | --- |
| taxPeriod | 2025-10-01 through 2025-10-31; monthly, not annual |
| incomeScope | All declared scopes of the synthetic Indonesian PT: cafe and pre-opening gym |
| grossIncome | IDR 150,000,000: cafe 150,000,000; gym turnover 0 |
| supportedDeductions | IDR 0 against this final gross-turnover base |
| taxableBase | IDR 150,000,000 before discounts |
| applicableRateOrFormula | Monthly gross turnover x 0.005 (0.5%) |
| grossTax | IDR 750,000 |
| withholdingOrCredits | IDR 0, under explicit no-withholding/no-prepayment fixture facts |
| netTaxPayable | **IDR 750,000** |
| currency | IDR; no FX in this company tax base |
| ruleIds | ID_PP55_PT_MONTHLY_2025 |
| effectivePeriod | Supported subset 2025-01-01 through 2025-12-31, not a statutory repeal date |
| calculationVersion | universal-lite-tax/1;ID_PP55_PT_2025/1 |
| status | **CALCULATED** |

Exact rational arithmetic: 150,000,000 x 1/200 = 750,000. No unsupported rounding changes the amount. Cafe bookkeeping expenses of 68,200,000 remain recorded but do not reduce this gross final-tax base. Gym capital of 500,000,000 is documented equity, not turnover. The individual 500-million exemption is not applied to a PT.

Explicit synthetic eligibility: ordinary PT registered 2024-01-15; domestic taxpayer status supplied by a simulated competent-authority certificate, not inferred from Youssef's nationality/presence; complete 2024 entity turnover 1.2 billion; 2025 within the three-year window; all branches included; no ordinary-tax election, excluded facility, permanent establishment, foreign/separately-final/exempt business income, designated withholding customer or advance tax payment. These inspectable assumptions require review and cannot silently become real-user facts.

## Official evidence and governance

- [DJP full PP 55/2022](https://www.pajak.go.id/id/peraturan/penyesuaian-pengaturan-di-bidang-pajak-penghasilan): articles 56 (domestic final business tax, rate, exclusions), 57 (subjects/exclusions), 58 (preceding-year aggregate turnover), 59 (PT duration/count), 60(1),(4),(5)(a) (monthly gross base before discounts and formula), 62 (payment/withholding), 74 and promulgation (20 December 2022 commencement).
- [DJP UU 7/2021](https://www.pajak.go.id/id/peraturan/harmonisasi-peraturan-perpajakan): Income Tax Act article 4(3)(c), documented capital contributions as excluded income.
- [Historical governed catalog](../research/moroccan-tax/historical-company-catalog.json) binds preserved raw bytes, normalized envelopes, exact quotes, rule AST and source hashes. Every citation, including commencement, is revalidated before registration.
- Evidence IDs: 3ba9897eab82c494d0099d22d06e415236f5d8ac3c830b01dacb9c39332ec0e7; 8ff72e204874c3fd53625aa378d5ef9988a03e496651ca3af8ffcf9359c00746; c59d03b7b9f0827927d5418143841d609361cc464b3f1e810a1f41912a29cd7c.

The candidate starts unapproved. The demo records explicit **simulated human review**, exact source/content hashes, then separate fact confirmation. This is not professional legal sign-off. Muse cannot approve or activate law. The historical slice uses preserved official engineering evidence under the historical-period instruction; it does not claim the frozen live residence research succeeded.

Tax UI inspection: facts -> classification -> rule -> effective period -> official URL/hash/quotation -> rate/formula -> engine trace -> final amount. Supported calculation and remaining review scopes appear separately. Existing API contracts: /api/tax/scoped and /api/tax/scoped/law. Saved presentation is compared with the persisted engine determination and deterministic replay. Altered amounts, changed financial/profile state or withdrawn governance cannot remain authoritative.

## Financial state and full journey

Darija onboarding/correction, five scopes, documents, external imports, explicit FX approval, card/bank, grounded explanation, fresh-process restart, duplicate replay and language invariance use the actual product contracts. There are 129 balanced journals. Synthetic FX quotes have October 2025 dates and fixture labels; they are not claimed to be historical market observations.

| Scope/item | Persisted state, IDR unless indicated |
| --- | --- |
| Employment | GBP 8,500 received; 178,500,000 at the reviewed synthetic FX quote |
| Personal/household scope | 38,245,500 spending including personal card purchases, separate from business expenses |
| Vehicle installment | Monthly 3,000,000; remaining principal 81,000,000 |
| Consumer installment | Monthly 1,000,000; remaining principal 23,000,000 |
| Salary less personal-scope spending/installments | 136,254,500; budgeting comparison, not available cash or taxable income |
| Villa | Earned rental receipts 52,100,000; refundable advance 2,000,000; contractual outstanding USD 300 |
| Villa economic costs | 20,200,000: 8,300,000 recorded business expense, 11,500,000 mixed/review, 400,000 personal |
| Cafe | Turnover 150,000,000; booked costs 68,200,000; recorded difference 81,800,000 before tax |
| Gym | Capital 500,000,000; no turnover; purchases 401,400,000, including asset/mixed review 348,000,000 and deposits 33,000,000 |
| Shared bank/cash | 869,830,000, including funding; not profit |
| Card | Liability 19,275,500 after repayment 18,000,000; repayment is not another expense |
| Two installments | Principal liability 104,000,000, separate from card |

Villa costs: staff/housekeeper 5,000,000; gardener/security 1,800,000; cleaning 2,200,000 (400,000 personal); management 3,000,000; utilities 1,200,000; maintenance 3,500,000; platform 2,500,000; guest supplies 1,000,000. Total staff is 6,800,000. Occupancy evidence records 12 rental, 8 personal and 11 vacant nights. No allocation percentage is invented. Economic cost, bookkeeping recognition, personal/mixed amount, source/journal lineage and unresolved tax treatment stay distinct. Full costs are not subtracted to claim a supported taxable rental result.

## Remaining review areas

Personal residence in Morocco/Indonesia; GB/AE/ID/MA employment taxation; treaty entitlement; salary withholding/foreign credits; serviced short-stay mixed-use villa classification, allocation/deductions; other/local business taxes; payroll obligations; gym asset/depreciation policy; distributions. No consolidated worldwide personal tax total is claimed. These gaps do not erase the independently supported company calculation.

## Muse evidence and research freeze

The frozen residence pilot stays at 20 paid requests, zero retries, unresolved gates and no executable activation. Its original nine-artifact manifest is preserved. No further live regulatory request was made. Adaptive Intelligence, post-training and Fireworks work is stopped and retained inactive.

[One-request live financial explanation](../research/moroccan-expat/tax-live-explanation.json) passed: Muse selected the authoritative calculated tax fact in Darija, covering base, rate, amount, credits, remaining payable, rule and official URLs. Zero retries, no research tools, state unchanged. The renderer supplies monetary/legal claims from persisted state. Full deterministic journey profiling/document/question responses are mocked and are not claimed as a new live profiling acceptance.

## Blockers and fixes

- Incomplete residence law: selected independently supportable historical company scope; kept personal gaps explicit.
- Period consistency: parameterized existing journey, source quotes, receipts, FX, presence and restart worker; preserved original 2026 regression path.
- Reference-only catalog: registered a separate historical official candidate without weakening the live research acceptance boundary.
- Scoped legal review was hardcoded to 2026: allowlisted the historical pack through the same review adapter.
- Multiple citations per raw source: validate every citation rather than the first only.
- Saved summary could be edited: verify it against engine record and deterministic replay.
- Added cost detail exceeded assistant context limit: compact authoritative fields while preserving full source lineage in product state.
- Staff explanation omitted gardener/security: include both categories without approving deductions.
- Browser initialization timed out in sandbox: permitted real headless browser verification outside sandbox.
- Browser navigation could see prior DOM: unique navigation URL and complete-document wait.
- Tax screen used an out-of-scope formatter: call existing canonical money formatter directly.
- New test expectation corrections: exclude villa personal-use cleaning from PERSONAL scope; give a mismatched-period negative request a matching economic date to reach the intended workspace guard.

## Verification and checkpoint

Run npm run test:moroccan or npm run test:moroccan:browser for the 2025 scenario. Full rerun ledger, including failures: [reruns.json](../research/moroccan-expat/reruns.json). Diagnostic/API regression attempts are additional to that ledger. Final financial state, grounded Q&A and runtime: [deterministic-result.json](../research/moroccan-expat/deterministic-result.json). Final regression/security and checkpoint status are appended after verification. The checkpoint commit is the Git commit containing this report; resolve it with git log -1 -- docs/MOROCCAN-EXPAT-E2E.md.

Final verification: **453 tests passed, 0 failed, 0 skipped**, 29 suites, 258534.5268 ms. The original 449-test baseline is preserved. The protected domain/accounting/tax directories and vertical slice are byte-identical to the accepted Phase 7 reference; the scoped adapters live in web and official-source helper in Fabric. No preservation assertion was weakened.

The recorded full-run ledger now contains 14 attempts; final browser run 14 passed in 195839 ms (wall including browser orchestration 200687 ms). Successful pre-final historical HTTP run 9 took 52657 ms. New focused historical regressions additionally run the full journey in temporary isolated workspaces.

Credential scan of all refs and proposed Git tree passed: 878 blobs, 78 commits, zero configured-key matches, zero unresolved credential findings, zero tracked environment files and zero committed logs. A final scan is repeated against the exact committed tree before push. The real .env remains ignored and untracked. Public identity remains BiG-M Lite Hackathon with the established GitHub noreply address. Main and all prior remote checkpoint refs must remain unchanged.

Product engineering is frozen after this successful checkpoint. Remaining work is submission packaging only. The final commit SHA, remote equality and clean working tree are reported after commit/push; no self-referential commit hash is fabricated inside this report.
