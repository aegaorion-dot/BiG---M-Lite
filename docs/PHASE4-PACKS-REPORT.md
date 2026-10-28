# Phase 4: real small-business packs and tax-readiness questions

Branch: codex/real-freelancer-umkm-packs. Parent: 1be08511ff21079e6c2c8cc24fa953a94426561a. Research date: 29 October 2026, Asia/Jakarta. Branch/HEAD/clean state were checked before creating this branch from that exact commit. No amend, reset, history rewrite, push or paid Meta call.

Delivered: **8 structured CountryPack candidates, 2 official treaty dossiers and 6 research candidates. Zero new legal approvals; zero production-executable new packs.** READY_FOR_REVIEW means structurally valid and evidence-bound, awaiting human legal/temporal review.

## Architecture and files

Accounting engine, Money, posting, UniversalTaxEngine, DSL, contracts, domestic/treaty resolvers, fact confirmation, determination persistence and accounting boundary are unchanged. No changes to src/domain/, src/accounting/, src/business/ or src/dashboard/. Legal formulas/rates/thresholds are data.

| Files | Purpose |
| --- | --- |
| src/tax/content/phase4-catalog.json | Unapproved content, exact citations, review scope and matrix |
| src/tax/phase4Catalog.js | Offline artifact/extraction/citation verification and existing-Fabric registration |
| src/tax/subjects.js | Distinct tax subject, business, owner, legal form and capacity |
| src/tax/readiness.js | Pack-driven questions, typed candidate answers and proposal freshness; no amount formula |
| src/tax/index.js | Loads verified candidates; includePhase4:false retains prior reference-only catalog |
| src/fabric/normalizer.js | Generic offline PDF-text bridge, per-page anchors; no OCR/legal-effect inference |
| src/onboarding/profiler.js, src/web/store.js | Optional tax review, dynamic semantic-AI requirements, persisted questions/candidates |
| scripts/phase4-*, scripts/lib/phase4-fixtures.js | Explicit research, offline processing, visual QA, compilation, reporting and TEST ONLY demos |
| scripts/tax-engine.js, package.json | Inspect, verification, questions and review-proposal commands |
| test/phase4-packs.test.js | 33 new deterministic tests |
| research/phase4-packs/ | Raw artifacts/errors, metadata, text, envelopes, previews, Original inspection, matrix and demos |
| .gitattributes, .gitignore, README.md, Phase 4 docs | Exact-byte preservation and workflow |

Full path inventory: [file-changes.json](../research/phase4-packs/file-changes.json).

## Official sources actually acquired

[Acquisition findings](../research/phase4-packs/acquisition-findings.json): **40 attempts, 35 raw artifacts, 7 failures, 1 HTTP-200 soft failure**. Observations retain timestamp, URL, status, resolved URL, content type, retrieval method, authority, success/failure, hash and reason. Accepted error bodies remain raw; pre-body/oversize failures have explicit null hashes. Initial three method-validation failures were corrected to PDF_TEXT and remain logged.

| Sources | Acquired evidence/findings |
| --- | --- |
| [JDIH PP20/2026](https://jdih.kemenkeu.go.id/dok/pp-20-tahun-2026), official PDF | Actual 2026 UMKM amendment, promulgated 22 April 2026; revised subjects/aggregation/exclusions/transitions |
| [DJP PP55/2022 full text](https://www.pajak.go.id/id/peraturan/penyesuaian-pengaturan-di-bidang-pajak-penghasilan), JDIH relationship page | Original Articles56–63 and unchanged monthly base/exclusion. JDIH/BPK PDFs exceed cap; complete official HTML retained instead |
| [DJPP UU7/2021 PDF](https://www.peraturan.go.id/files/uu7-2021bt.pdf), [current DJP individual guide](https://www.pajak.go.id/id/mekanisme-penghitungan-pajak-penghasilan-orang-pribadi) | Five bands, PKP floor and commencement; PDF table pages62–63 visually checked. Old example elsewhere on guide excluded |
| [DJP PPh23/26](https://www.pajak.go.id/id/pph-pasal-2326), [DJP PPh26](https://www.pajak.go.id/id/pph-pasal-26) | Narrow rate-table candidates; stale administration instructions excluded. Current legal/temporal approval still requires human review |
| JDIH PMK164/2023 and PMK131/2024, full PDFs | VAT registration/supply evidence, no VAT amount rule |
| JDIH PMK112/2025 PDF and page25 preview | Article29 commences on promulgation. Visual page25 shows **31 December 2025, BN1205**; extraction placeholders/conflicting abstract cannot set dates automatically |
| [DJP ID–SG](https://www.pajak.go.id/id/p3b/mli-singapura), [DJP ID–AU](https://www.pajak.go.id/id/p3b/mli-australia), official linked PDFs, IRAS ID–SG PDF | Residence, PE/fixed base, business profits, independent services, relief, benefit/PPT and differentiated commencement |
| [DJP PMK192/2018](https://www.pajak.go.id/id/peraturan/pelaksanaan-pengkreditan-pajak-atas-penghasilan-dari-luar-negeri) | Foreign credit investigation only |
| [IRAS CIT/PTE/rebates](https://www.iras.gov.sg/taxes/corporate-income-tax/basics-of-corporate-income-tax/corporate-income-tax-rate-rebates-and-tax-exemption-schemes), self-employed/rate pages | Representative company subset despite SSO403; enhanced YA2026 rebate replaces earlier announcement on same page |
| AU Federal Register documented OData API | Bounded $top=1 retry succeeds, HTTP200 JSON. Proves API access, not complete tax-law retrieval; discovery is not governing content |
| ATO residence, corrected business-structure page and printable PDF | Subject/residence context. Initial structures page returned HTTP200 unavailable content and is rejected as evidence |
| [IRS Publication334 (2025)](https://www.irs.gov/publications/p334) | Complete small-business HTML; 2025 edition never implies 2026 law |
| [GOVUK sole-trader Content API](https://www.gov.uk/api/content/become-sole-trader) | API first; original path's structured redirect explicitly followed |

Existing registry only; no host expansion, private endpoints, circumvention or unofficial/commercial governing sources. Probe limits: 3 workers, 10 MiB, 20 seconds; no uncontrolled retries. Live research is excluded from regression.

## Rules, subjects and periods

[Capability matrix](../research/phase4-packs/capability-matrix.json) distinguishes jurisdiction, type, subject, period, evidence, governance, executable state and gaps.

| Pack | Scope | Temporal status |
| --- | --- | --- |
| ID_INDIVIDUAL_ORDINARY_2025 | Resident individual freelancer/sole proprietor/micro/small capacity; annual tax on independently reviewed PKP | 2025 only |
| ID_INDIVIDUAL_ORDINARY_2026 | Same narrow PKP scope; HPP text reconciled with current DJP five-band table | Separate 2026 candidate |
| ID_UMKM_INDIVIDUAL_2025 | Eligible domestic non-professional individual business; monthly tax and cumulative IDR500m exclusion | 2025 seven-year subset; retrospective PP20 transition beneficiaries excluded |
| ID_UMKM_INDIVIDUAL_2026 | Amended scope, statutory prior-year aggregate, election/disqualification/excluded-income facts | 22 April–31 December 2026; whole month must fit; Jan–Apr split/transition unresolved |
| ID_UMKM_PT_PERORANGAN_2026 | One-founder company; professional-service vehicle/special-facility exclusions | Same 2026 window; no individual IDR500m exemption/YTD question |
| ID_WHT23_MANAGEMENT_2026 | Resident company payee, non-final management fee; explicit withholding-agent role/exclusions | Current official rate-table candidate, 2026 review bound; temporal/legal approval required |
| ID_WHT26_SERVICE_2026 | Nonresident individual independent-service preliminary withholding; explicit payee residence/source/withholding | Current rate-table candidate; treaty never skipped |
| SG_CIT_YA2026_PTE_NO_CASH_GRANT | Reconciled normal chargeable income, PTE, enhanced rebate; no SUTE/credits/special income/cash-grant eligibility | **YA2026, calendar basis2025**; calendar income2026/YA2027 out of scope |

All eight have executable DSL structure, **none has production approval**. The coverage end is a review boundary, not a repeal date. Undated authority pages retain null publication dates. No automatic 2027 continuation or extension of the 2025 COMPANY/CIT reference.

Individual annual calculation requires independently reconciled PKP and an annual-period attestation. Net income, NPPN, deductions/PTKP and fiscal reconciliation are not generated. Withholding, instalments, actual tax paid, credit and annual settlement remain separate.

UMKM is not revenue-only: legal form, income category, election, previous disqualification, reviewed aggregation and complete month/YTD context matter. Professional services and other Article56 exclusions cannot automatically receive 0.5%. Spouse/branch/group aggregation and expanded 2026 professional/foreign turnover must be reviewed.

No fractional rounding law is invented. Narrow product subsets require taxable monthly gross divisible by IDR200, PPh23 gross by IDR50, PPh26 gross by IDR5, SG NCI by SGD800. These are **product restrictions, not statutory eligibility rules**. Outside values return no authoritative amount: NOT_APPLICABLE to this candidate, taxReady:false; this never establishes no legal obligation. The final rounding setting cannot alter an amount inside these exact subsets. PKP flooring is directly sourced from Article17(4).

Capacity names include INDIVIDUAL_FREELANCER, SOLE_PROPRIETOR, MICRO_BUSINESS, SMALL_BUSINESS and COMPANY. The legal tax subject stays separately identified as INDIVIDUAL/COMPANY/PARTNERSHIP, distinct from a business and its owner. New simple-company coverage is the PT-perorangan simplified subset; general-company2026 CIT/31E remains unresolved.

## Treaty, VAT and relief

ID_SG_SMALL_BUSINESS_RESEARCH_2026 and ID_AU_SMALL_BUSINESS_RESEARCH_2026 retain official evidence, facts and governance. Both are REVIEW_REQUIRED, with null executable windows and no executable income article. Even simulated human source approval cannot execute them. New legal subsets need reviewed eligibility, temporal effect and formulas in a new content version.

ID–SG distinguishes Indonesian withholding/other tax periods and Singapore assessment years. ID–AU distinguishes base treaty versus MLI effect. Source-header dates are not one universal commencement. Confirmed residence/source differences select the correct dossier; nationality and customer/bank location never select tax law.

Original manifests were fetched directly at pinned commit 4d0da9a6acafc24f7db3778f66b4df6d7cf4764c. Both cover COMPANY/ordinary interest2025, not freelancer services. New IRAS PDF hash exactly matches their reported original PDF hash. Their residence locator claims Article4 but captures page5 (Article3 continuation); actual Article4 begins page6. They are archived separately as research, never substituted for new official evidence or extended into 2026. See [Original inspection](../research/phase4-packs/original-inspection.json).

VAT research exposes PKP status, turnover, transaction category and effective registration date. No amount rule or automatic registration/no-registration decision. PMK11/2025/53/2025 interaction, special supplies and invoice rounding remain gaps. UMKM income review does not receive irrelevant VAT questions.

Foreign credit has PMK192/treaty evidence but no executable domestic rule. Foreign tax paid alone does not authorize a generic MIN credit or arbitrary limit. No universal relief method or implicit FX.

## Questions, governance and provenance

Tax review is optional. beginTaxReview(request) supplies subject/event/period; planTaxReadiness reads in-period rules and scoped dossiers. Applicability preview is only for question relevance; amount formulas never execute there.

Existing profiler conflict/bookkeeping-currency priority remains. Active tax requirements feed planQuestion and the semantic adapter's declared name/type schema. Only exact-current-message, typed CANDIDATE answers are accepted; answerTaxReview offers the same deterministic contract. AI cannot confirm facts or approve law.

Answers reset previous fact confirmation. Profile revision/fingerprint corrections stale the context and clear proposals. Proposals bind fact hash, profile, request and governed requirements; changed answers/governance invalidate them. Context/questions persist across restart. No new frontend, tax-approval HTTP route or ledger posting.

The chain is: scoped fact evidence/revision → exact content/hash → rule/version → official artifact/URL/hash → reconstructed envelope/PDF extraction → exact page/quote/offset → trace → immutable result/replay. Raw, extraction, citation and cached source-binding mutations are rejected. Loader re-verifies evidence before registration. Source verification, schema validation, review readiness and approved execution are distinct.

Period grain is an explicit human attestation: MONTH_PERIOD_REVIEWED, ANNUAL_TAX_PERIOD_REVIEWED and SG calendar basis. No automated statutory calendar validator was added to the frozen executor. Reviewers must establish the exact requested month/year, not merely dates fitting the pack window.

## Verification and remaining blockers

**230 tests pass, zero fail: 197 existing + 33 Phase 4.** Tests cover real band boundary oracles, PKP flooring, IDR500m crossing, subject/eligibility distinctions, missing turnover/dynamic questions, AI candidate-only answers, 2025/2026/2027 boundaries, semantic jurisdictions, VAT/credit unresolved states, withholding separation, both treaty paths, incomplete evidence, hashes, correction invalidation, fresh-process restart/replay, idempotency, supersession and bookkeeping.

[Offline demos](../research/phase4-packs/demo/results.json) cover all four requested scenarios plus variants. Production legal approvals remain zero. TEST ONLY simulations produce IDR250,000 UMKM at the annual-exclusion crossing and IDR44,000,000 ordinary tax on reviewed PKP, stop domestic preliminary amounts for treaty review, replay exactly, and demonstrate bookkeeping while tax stays unresolved. A full TEST ONLY UMKM result/request/facts is retained.

Remaining: actual human legal approval; executable treaty classification/benefits/MLI/dates; domestic credit method; full VAT; fiscal/net-income methods; wider legal forms/transitions/precision; general-company2026 CIT; SG statutory access/other bases/reliefs; executable AU/US/UK domestic coverage. No OCR, payroll, FX, ERP or enterprise-tax expansion.

See [review workflow](PHASE4-REVIEW-WORKFLOW.md). Exact local commit and clean-tree verification are recorded in the final handoff; nothing is pushed.
