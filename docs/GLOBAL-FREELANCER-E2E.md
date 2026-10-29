# Global Freelancer End-to-End Acceptance

**PASS on the final Phase 9 product.** Accepted baseline: branch `hackathon/demo-submission`, commit `72469ecb68af37bcd7c700eabff8b9fbcb51ddf4`, 402 tests passed before implementation. The earlier Phase 8 baseline in the original brief is superseded.

Checkpoint branch: `hackathon/global-freelancer-e2e`. Final commit is the commit containing this report: resolve it with `git log -1 --format=%H -- docs/GLOBAL-FREELANCER-E2E.md`; the final handoff also reports its literal SHA. Public Git identity remains BiG-M Lite Hackathon with the configured GitHub noreply address. Local checkpoint only: no push, merge, amend, branch deletion or history rewrite.

## Actual product coverage

Installed Chrome exercised the Phase 9 DOM controls for onboarding, profile correction, activation, representative wage/hotel/card-repayment review, CSV file upload, account mapping, duplicate review, all 12 English questions, Indonesian switching and reports. Other transaction reviews used the same public HTTP contracts. No direct ledger insertion, replacement UI, private posting endpoint or test-specific posting bypass was used.

The routine Muse transport is mocked; the production shared adapter, structured contracts, evidence validator, deterministic question planner and grounded renderer are used. Historical FX uses explicit dated synthetic fixtures. Text receipts/invoices exercise the real document upload/extraction/interpretation path. Image/PDF OCR is additionally covered by the complete existing suite; this journey does not claim to OCR its text invoices.

The original Phase 9 prepared demo separately passed Chrome checks of all seven primary routes, the unchanged three-journal prepared totals and the report explanation during Meta unavailability. See [phase9-compatibility.json](../research/global-freelancer/phase9-compatibility.json). The README demo fast path remains intact.

## Reruns and blockers

The standalone runner launched **10 times**: one onboarding-only probe, nine scenario attempts (initial attempt plus **eight reruns**), three interrupted attempts and six completed journeys. Four completed runs used Chrome. Runs 4 and 6 initially restored a store in-process; runs 7–10 close the first server and start a genuinely fresh application/server process. Five focused/full regression invocations also completed the public-HTTP journey, giving **14 scenario attempts and 11 completed journeys** across these recorded invocations. The onboarding probe is excluded. See [reruns.json](../research/global-freelancer/reruns.json) and [verification-history.json](../research/global-freelancer/verification-history.json).

| Reproduction / blocker | Root cause | Fix and regression |
| --- | --- | --- |
| Run 1 profile fell back | Missing home/current/travel/legal-form/activity slots, JP/EG/KE/AE metadata and JPY/AED intake support | Independent evidenced candidate roles, bounded activity enum, metadata-only countries and currencies. One-shot profile and country metadata regressions preserve authority checks. |
| Income/card dataset could not use old cash-only treatment | Generic revenue and cash expenses could not preserve wage/advance/personal/mixed/liability roles | Extended existing universal canonical intake with human-reviewed event metadata. Reused Money, JournalEntry and PostingService; added standard advance/wage/card/clearing/drawings accounts and generic labelled-document/CSV fields. |
| Hotel/fuel/software/equipment needed separate review | No financial treatment controls or purpose/policy reasons | Generic review form, mixed-use questions and saved human reasons. Unallocated mixed/unknown and asset-policy purchases remain in clearing; no invented allocation or tax deduction. Negative recognition tests and actual hotel UI review pass. |
| Financial Q&A and client balances unavailable | Old assistant/report context exposed only generic business income/expense/net | Read-only projection of confirmed commands and real journal lineage, with contract balances separate from cash/recognized A/R. Existing Muse fact selection/renderer and product dashboard/reports consume that projection. |
| Run 5 Chrome failed onboarding | New profile roles missing from product presentation | Display home/current/travel/entity roles and confirmation status. Run 6 and subsequent fresh browser journeys passed. |
| Conflicting contracts / overpayments (negative regression) | Per-receipt total check did not validate aggregate engagement history | Pre-confirm checks for consistent original currency, payer, category, contract total and aggregate paid amount, including reversals. Rejection leaves journals unchanged. |
| Legacy cash omitted beside rich events (compatibility reproduction) | Initial projection considered financialReview commands only | Include existing native/cash transaction commands through actual posted bank lineage, with an explicit unclassified receipt category. Native legacy-sale regression passes. |
| Reversal amount/review drift (negative regression) | POSTED status alone is insufficient after append-only reversals | Signed journal-lineage projection handles descendant reversals; reversed mixed items stop contributing active allocation reviews. Foreign advance, hotel and repayment reversal tests pass. |
| Readiness could reflect fixture constants (review reproduction) | Coverage, withholding and confirmation must come from actual persisted state | Derive gaps from persisted profile, governed catalog, scoped readiness and activation revision. Profile correction test verifies stale scope; no tax determination is invented. |
| Broad question containing tax lost other financial facts | Single-topic keywords took precedence over entire-position intent | Entire-position intent keeps the full bounded context; composite-question regression includes hotel, card, income, countries and tax. Explicit determination IDs retain the existing tax-engine result path. |
| Initial restart verification was insufficient | Reloading an object did not test application-process restart | Close the first HTTP server, fork a new server from the same user, navigate Chrome to its new loopback URL and compare every English answer exactly. Replay and language invariant checks pass. |
| First full regression: one metadata assertion failed | Old exact-list assertion encoded five countries | Extend expected registry list while preserving every original metadata assertion; explicitly assert no approved coverage/legal-source list for new metadata. No existing test removed. |
| Initial live profile rejected | Exact rejected field was discarded by the original adapter and cannot be reconstructed. A concrete schema mismatch was found: advertised confidence allowed null, while strict Muse validation requires a number; string/quote limits also needed clearer instructions | Align advertised confidence/quote constraints and provide explicit value formats without relaxing validation. Add typed-value regression. Full 414-test suite and browser journey passed before the separately authorized single recheck, which passed strict validation. Preserve failed evidence and private diagnostics; no validator bypass. |
| Harness-only failures | Decimal display comparison, missing await, hard-coded native jurisdiction and an output-cap expectation above the adapter maximum | Compare exact Money JSON, await serialized edits, use actual active jurisdiction, and assert the existing 4096 cap. No financial result/authority rule weakened. |

No unresolved technical blocker remains in the final tested journey. The exact invalid field in the original live response is not guessed; the rejected attempt is retained beside the successful authorized recheck.

## Final persisted state

Synthetic Alex Morgan: US citizenship and Miami home; physically in Dubai on a 30-day vacation while working remotely; individual/sole-proprietor candidate and no UAE company declared. USD books, fixed October 2026 dates. Home, citizenship, physical/work location, registration, tax residence, payer and source remain separate semantic roles.

| Measure | Recorded result |
| --- | --- |
| Cash actually received | USD 32051.10; includes wages/advances, excludes opening funds and unpaid balances |
| Clients contractually owe | JPY 300000 + USD 1800.00; original currency, not automatically recognized ledger A/R |
| Bank balance | USD 44051.10 |
| Advances liability | USD 3210.00 |
| Recognized business income | USD 24941.10 |
| Personal employment wages | USD 3900.00 |
| Total card purchases | USD 6001.47 |
| Business-classified purchases | USD 1345.14 |
| Recognized business expense | USD 355.00; not a tax deductibility conclusion |
| Business purchase policy review | USD 990.14 |
| Personal purchases | USD 1579.34 |
| Mixed purchases / allocation pending | USD 3076.99 |
| Review-clearing asset balance | USD 4067.13 |
| Card repayment | USD 8000.00; bank-to-liability settlement only |
| Closing card liability | USD 501.47 |
| Provisional recorded business net | USD 24586.10 |
| Final business profit / final tax | Unknown / unknown |
| Integrity | 31 balanced journals using existing immutable posting/ledger/audit path |

Opening balances were explicitly supplied through reviewed external journal import: bank DR USD 20000, card liability CR USD 2500, equity CR USD 17500. These synthetic opening facts are not income. Reconciliation: 20000 + 32051.10 - 8000 = 44051.10 bank; 2500 + 6001.47 - 8000 = 501.47 card liability. No repayment expense was posted.

## Income, spending and FX

| Income category | Engagements | Received USD equivalent |
| --- | --- | --- |
| ADVANCE_PAYMENT | 2 | USD 3210.00 |
| AFFILIATE_COMMISSION | 3 | USD 3980.00 |
| EMPLOYMENT_WAGE | 1 | USD 3900.00 |
| PROJECT_SERVICE | 7 | USD 16301.10 |
| SOFTWARE_LICENCE | 2 | USD 4660.00 |

Exactly 15 engagements survive. Two advances retain earning uncertainty; two licences retain IP facts; genuine employment wages are separate personal income. Japan/Egypt advance-contract balances are disclosed without presuming earned revenue or ledger A/R recognition.

| Purchase category | USD equivalent |
| --- | --- |
| CARD_FEES | USD 95.00 |
| CLOTHING | USD 272.30 |
| ENTERTAINMENT | USD 353.99 |
| EQUIPMENT | USD 490.14 |
| FUEL_TRANSPORT | USD 517.37 |
| GROCERIES | USD 408.45 |
| HOTEL | USD 2450.70 |
| MEALS | USD 544.60 |
| PHONE_DATA | USD 108.92 |
| SOFTWARE_LICENCE_PURCHASE | USD 500.00 |
| SUBSCRIPTION | USD 260.00 |

Hotel AED 9000 / USD 2450.70 remains mixed: the saved answer says vacation plus work/meetings. Fuel AED 700, rideshare AED 1200 and phone/data AED 400 also retain mixed-use reasons. No business percentage is invented. Restaurants were explicitly confirmed personal vacation meals. USD 500 software and AED 1800 camera accessory retain business purpose with expense/capital review. The USD 95 fee was explicitly declared wholly attributable to business foreign purchases.

Original receipts by currency: AED 7000.00; AUD 10000.00; GBP 6100.00; JPY 1450000; USD 5900.00. Dated synthetic fixtures: JPY/USD 0.0067, GBP/USD 1.30, AUD/USD 0.66, AED/USD 0.2723. Original amounts/currencies, rate/date, human-approved conversion and functional amounts persist in canonical commands. These are synthetic test FX, not actual-market or legal-rate claims. No receivable FX valuation is fabricated.

## Governance and unresolved items

Tax readiness is REVIEW_REQUIRED and finalTax is null. Country coverage gaps: US, AE, AU, EG, GB, JP, KE. US citizenship/home and UAE presence/work are review contexts, never automatic tax residence. Payers JP, EG, GB, KE, AU, AE never automatically become SOURCE. Registration/tax residence remain unconfirmed. Withholding certificates are declared missing; no zero amount is inferred.

Potential research pairs: US / AE; US / AU; US / EG; US / GB; US / JP; US / KE. Every context is TREATY_REVIEW_REQUIRED with applicabilityConfirmed false. These labels do not assert that a treaty exists, is in force or applies. No claim that Dubai is tax free, worldwide-income conclusion, royalty classification, withholding rate, treaty benefit or deduction was taken from model memory. The Universal Tax Engine and governed rule catalog remain unchanged.

| Persisted unresolved item | Count |
| --- | --- |
| EARNING_REVIEW_REQUIRED | 2 |
| IP_TAX_CLASSIFICATION_REVIEW_REQUIRED | 2 |
| ALLOCATION_REVIEW_REQUIRED | 4 |
| EXPENSE_OR_ASSET_REVIEW_REQUIRED | 2 |

## Actual grounded English Q&A

These are rendered authoritative facts selected through the shared Muse contract in the final deterministic journey. Complete fact values, IDs and context hashes are in [deterministic-result.json](../research/global-freelancer/deterministic-result.json). Every English answer was repeated after the new process loaded the same user and its rendered sections compared exactly.

### 1. How much money did I actually receive this month?

- Cash actually received: USD 32,051.10. Outstanding contract balances and opening funds are excluded.
- Clients contractually still owe: JPY 300,000; USD 1,800.00. These are original-currency contract balances, not cash or automatically recognized accounts receivable; no new FX valuation was invented.
- Received by category: Advances received: USD 3,210.00; Affiliate commissions: USD 3,980.00; Employment wages: USD 3,900.00; Projects and services: USD 16,301.10; Software licences: USD 4,660.00. Advances of USD 3,210.00 remain a liability; employment wages of USD 3,900.00 are separate from business income. Licence receipts retain their licence/IP facts and require tax classification review.

### 2. How much do clients still owe me?

- Cash actually received: USD 32,051.10. Outstanding contract balances and opening funds are excluded.
- Clients contractually still owe: JPY 300,000; USD 1,800.00. These are original-currency contract balances, not cash or automatically recognized accounts receivable; no new FX valuation was invented.

### 3. How much did I spend?

- Card liability: USD 501.47. Card repayments of USD 8,000.00 debit the card liability and credit bank; the purchase was recorded separately, so repayment is not another expense.
- Purchases total USD 6,001.47: business-classified spending USD 1,345.14, personal USD 1,579.34, mixed USD 3,076.99. Recognized business expenses are USD 355.00; another USD 990.14 of business purchases needs expense-versus-asset review. Card repayments are excluded. Business classification does not establish tax deductibility.
- There are 10 accounting/tax review items: mixed-use allocation, licence/IP treatment, advances and expense-versus-asset policy. Confirmed purchases and payments remain recorded; uncertain treatment is not silently approved.

### 4. How much of that was business versus personal?

- Card liability: USD 501.47. Card repayments of USD 8,000.00 debit the card liability and credit bank; the purchase was recorded separately, so repayment is not another expense.
- Purchases total USD 6,001.47: business-classified spending USD 1,345.14, personal USD 1,579.34, mixed USD 3,076.99. Recognized business expenses are USD 355.00; another USD 990.14 of business purchases needs expense-versus-asset review. Card repayments are excluded. Business classification does not establish tax deductibility.
- There are 10 accounting/tax review items: mixed-use allocation, licence/IP treatment, advances and expense-versus-asset policy. Confirmed purchases and payments remain recorded; uncertain treatment is not silently approved.

### 5. How much profit did I make?

- Purchases total USD 6,001.47: business-classified spending USD 1,345.14, personal USD 1,579.34, mixed USD 3,076.99. Recognized business expenses are USD 355.00; another USD 990.14 of business purchases needs expense-versus-asset review. Card repayments are excluded. Business classification does not establish tax deductibility.
- Received by category: Advances received: USD 3,210.00; Affiliate commissions: USD 3,980.00; Employment wages: USD 3,900.00; Projects and services: USD 16,301.10; Software licences: USD 4,660.00. Advances of USD 3,210.00 remain a liability; employment wages of USD 3,900.00 are separate from business income. Licence receipts retain their licence/IP facts and require tax classification review.
- Recorded business income USD 24,941.10, recognized business expenses USD 355.00, provisional recorded net USD 24,586.10. Final business profit is not reliable while mixed purchases of USD 3,076.99 and business asset/expense review of USD 990.14 remain unresolved. Advances and personal wages are separate.

### 6. Why is the hotel not fully counted as a business expense?

- Purchases total USD 6,001.47: business-classified spending USD 1,345.14, personal USD 1,579.34, mixed USD 3,076.99. Recognized business expenses are USD 355.00; another USD 990.14 of business purchases needs expense-versus-asset review. Card repayments are excluded. Business classification does not establish tax deductibility.
- Hotel remains mixed-purpose pending allocation review. Your recorded reason: Mixed. I was on vacation for 30 days but worked and had meetings during part of the stay.. No business percentage, full business expense or tax deduction was invented.
- There are 10 accounting/tax review items: mixed-use allocation, licence/IP treatment, advances and expense-versus-asset policy. Confirmed purchases and payments remain recorded; uncertain treatment is not silently approved.

### 7. Why did my Mastercard payment not increase my expenses?

- Card liability: USD 501.47. Card repayments of USD 8,000.00 debit the card liability and credit bank; the purchase was recorded separately, so repayment is not another expense.
- Purchases total USD 6,001.47: business-classified spending USD 1,345.14, personal USD 1,579.34, mixed USD 3,076.99. Recognized business expenses are USD 355.00; another USD 990.14 of business purchases needs expense-versus-asset review. Card repayments are excluded. Business classification does not establish tax deductibility.

### 8. What kinds of income did I earn?

- Received by category: Advances received: USD 3,210.00; Affiliate commissions: USD 3,980.00; Employment wages: USD 3,900.00; Projects and services: USD 16,301.10; Software licences: USD 4,660.00. Advances of USD 3,210.00 remain a liability; employment wages of USD 3,900.00 are separate from business income. Licence receipts retain their licence/IP facts and require tax classification review.

### 9. Which countries matter for my tax situation?

- Citizenship US; home US; current physical location AE; work AE. Temporary travel: 30 days. Entity declaration: No UAE company. Tax residence: Not confirmed; registration: Not confirmed. Payer countries: AE, AU, EG, GB, JP, KE. Payer country is not automatically an income source or proof of taxation.
- Final tax cannot yet be reliably determined. Blockers: approved CountryPack coverage is missing or unestablished; tax residence is not confirmed; income source is not established from payer country; TreatyPack applicability requires review; withholding certificates are missing; amounts remain unknown; advance earning recognition needs review; software licence/IP tax classification is unresolved; mixed costs have no approved allocation; expense-versus-asset policy needs review. No zero tax, withholding rate or treaty benefit is assumed.
- Potential research contexts: US / AE; US / AU; US / EG; US / GB; US / JP; US / KE. Treaty applicability is not established by citizenship, home or payer alone. Missing approved coverage remains review-required.

### 10. How much tax do I owe?

- Cash actually received: USD 32,051.10. Outstanding contract balances and opening funds are excluded.
- Clients contractually still owe: JPY 300,000; USD 1,800.00. These are original-currency contract balances, not cash or automatically recognized accounts receivable; no new FX valuation was invented.

### 11. What do you know for sure, and what are you still unsure about?

- Citizenship US; home US; current physical location AE; work AE. Temporary travel: 30 days. Entity declaration: No UAE company. Tax residence: Not confirmed; registration: Not confirmed. Payer countries: AE, AU, EG, GB, JP, KE. Payer country is not automatically an income source or proof of taxation.
- The recorded data contains 15 income engagements and balanced journals: true. Human-confirmed records are distinct from unapproved law, unknown withholding and unallocated costs.
- Final tax cannot yet be reliably determined. Blockers: approved CountryPack coverage is missing or unestablished; tax residence is not confirmed; income source is not established from payer country; TreatyPack applicability requires review; withholding certificates are missing; amounts remain unknown; advance earning recognition needs review; software licence/IP tax classification is unresolved; mixed costs have no approved allocation; expense-versus-asset policy needs review. No zero tax, withholding rate or treaty benefit is assumed.
- Recorded business income USD 24,941.10, recognized business expenses USD 355.00, provisional recorded net USD 24,586.10. Final business profit is not reliable while mixed purchases of USD 3,076.99 and business asset/expense review of USD 990.14 remain unresolved. Advances and personal wages are separate.
- There are 10 accounting/tax review items: mixed-use allocation, licence/IP treatment, advances and expense-versus-asset policy. Confirmed purchases and payments remain recorded; uncertain treatment is not silently approved.

### 12. Explain my financial position in simple language.

- Cash actually received: USD 32,051.10. Outstanding contract balances and opening funds are excluded.
- Clients contractually still owe: JPY 300,000; USD 1,800.00. These are original-currency contract balances, not cash or automatically recognized accounts receivable; no new FX valuation was invented.
- Card liability: USD 501.47. Card repayments of USD 8,000.00 debit the card liability and credit bank; the purchase was recorded separately, so repayment is not another expense.
- Purchases total USD 6,001.47: business-classified spending USD 1,345.14, personal USD 1,579.34, mixed USD 3,076.99. Recognized business expenses are USD 355.00; another USD 990.14 of business purchases needs expense-versus-asset review. Card repayments are excluded. Business classification does not establish tax deductibility.
- Received by category: Advances received: USD 3,210.00; Affiliate commissions: USD 3,980.00; Employment wages: USD 3,900.00; Projects and services: USD 16,301.10; Software licences: USD 4,660.00. Advances of USD 3,210.00 remain a liability; employment wages of USD 3,900.00 are separate from business income. Licence receipts retain their licence/IP facts and require tax classification review.
- Recorded bank balance: USD 44,051.10. This includes opening funds and is different from cash received during the recorded period.
- Citizenship US; home US; current physical location AE; work AE. Temporary travel: 30 days. Entity declaration: No UAE company. Tax residence: Not confirmed; registration: Not confirmed. Payer countries: AE, AU, EG, GB, JP, KE. Payer country is not automatically an income source or proof of taxation.
- The recorded data contains 15 income engagements and balanced journals: true. Human-confirmed records are distinct from unapproved law, unknown withholding and unallocated costs.
- Final tax cannot yet be reliably determined. Blockers: approved CountryPack coverage is missing or unestablished; tax residence is not confirmed; income source is not established from payer country; TreatyPack applicability requires review; withholding certificates are missing; amounts remain unknown; advance earning recognition needs review; software licence/IP tax classification is unresolved; mixed costs have no approved allocation; expense-versus-asset policy needs review. No zero tax, withholding rate or treaty benefit is assumed.
- Recorded business income USD 24,941.10, recognized business expenses USD 355.00, provisional recorded net USD 24,586.10. Final business profit is not reliable while mixed purchases of USD 3,076.99 and business asset/expense review of USD 990.14 remain unresolved. Advances and personal wages are separate.
- Hotel remains mixed-purpose pending allocation review. Your recorded reason: Mixed. I was on vacation for 30 days but worked and had meetings during part of the stay.. No business percentage, full business expense or tax deduction was invented.
- There are 10 accounting/tax review items: mixed-use allocation, licence/IP treatment, advances and expense-versus-asset policy. Confirmed purchases and payments remain recorded; uncertain treatment is not silently approved.
- Potential research contexts: US / AE; US / AU; US / EG; US / GB; US / JP; US / KE. Treaty applicability is not established by citizenship, home or payer alone. Missing approved coverage remains review-required.

## Restart, replay and Indonesian

After genuine process restart and all English Q&A, the same invoice, statement, transaction confirmation and card repayment were replayed. Journal count stayed 31. Document-hash replay returns duplicate; the Adobe card row matching a separately uploaded receipt is explicitly reviewed/rejected. No silent double posting occurs.

The UI/conversation then switched to id-ID and asked “Jelaskan kondisi keuangan saya secara singkat.” The authoritative profile, candidate revisions/confirmations/commands, journals and full financial-position fingerprint remained identical. Existing restore validation checks original document hashes and journal/audit integrity; original-currency and approved FX lineage remain present.

- Uang yang benar-benar diterima: USD 32.051,10. Saldo kontrak yang belum dibayar dan saldo awal tidak termasuk.
- Saldo kontrak yang masih harus dibayar klien: JPY 300.000; USD 1.800,00. Ini adalah saldo kontrak dalam mata uang asli, bukan kas atau piutang yang otomatis diakui; penilaian FX baru tidak dibuat.
- Utang kartu: USD 501,47. Pembayaran kartu sebesar USD 8.000,00 mendebit utang kartu dan mengkredit bank; pembelian dicatat terpisah sehingga pembayaran kartu bukan beban baru.
- Total pembelian USD 6.001,47: pengeluaran berklasifikasi usaha USD 1.345,14, pribadi USD 1.579,34, campuran USD 3.076,99. Beban usaha yang diakui USD 355,00; pembelian usaha lain sebesar USD 990,14 memerlukan tinjauan beban atau aset. Pembayaran kartu tidak termasuk. Klasifikasi usaha tidak menetapkan pengurang pajak.
- Penerimaan per kategori: Uang muka diterima: USD 3.210,00; Komisi afiliasi: USD 3.980,00; Upah pekerjaan: USD 3.900,00; Proyek dan jasa: USD 16.301,10; Lisensi perangkat lunak: USD 4.660,00. Uang muka sebesar USD 3.210,00 tetap menjadi kewajiban; upah pekerjaan sebesar USD 3.900,00 terpisah dari penghasilan usaha. Penerimaan lisensi mempertahankan fakta lisensi/IP dan memerlukan tinjauan klasifikasi pajak.
- Saldo bank tercatat: USD 44.051,10. Ini mencakup saldo awal dan berbeda dari penerimaan kas selama periode tercatat.
- Kewarganegaraan US; tempat tinggal biasa US; lokasi fisik saat ini AE; lokasi kerja AE. Perjalanan sementara: 30 hari. Pernyataan entitas: No UAE company. Domisili pajak: Belum dikonfirmasi; pendaftaran: Belum dikonfirmasi. Negara pembayar: AE, AU, EG, GB, JP, KE. Negara pembayar bukan otomatis sumber penghasilan atau bukti kewajiban pajak.
- Data tercatat berisi 15 perikatan penghasilan dan jurnal seimbang: true. Catatan yang dikonfirmasi manusia terpisah dari hukum yang belum disetujui, pemotongan belum diketahui, dan biaya belum dialokasikan.
- Pajak akhir belum dapat ditentukan secara andal. Kendala: cakupan CountryPack disetujui belum tersedia atau belum ditetapkan; domisili pajak belum dikonfirmasi; sumber penghasilan tidak ditetapkan dari negara pembayar; penerapan TreatyPack perlu ditinjau; sertifikat pemotongan belum tersedia; nominal tetap belum diketahui; pengakuan uang muka sebagai penghasilan perlu ditinjau; klasifikasi pajak lisensi perangkat lunak/IP belum terselesaikan; biaya campuran belum memiliki alokasi yang disetujui; kebijakan beban atau aset perlu ditinjau. Tidak diasumsikan pajak nol, tarif pemotongan, atau manfaat perjanjian.
- Penghasilan usaha tercatat USD 24.941,10, beban usaha diakui USD 355,00, hasil bersih tercatat sementara USD 24.586,10. Laba usaha akhir belum andal selama pembelian campuran USD 3.076,99 dan tinjauan aset/beban usaha USD 990,14 belum terselesaikan. Uang muka dan upah pribadi terpisah.
- Hotel tetap bertujuan campuran sambil menunggu tinjauan alokasi. Alasan Anda yang tercatat: Mixed. I was on vacation for 30 days but worked and had meetings during part of the stay.. Tidak dibuat persentase usaha, beban usaha penuh, atau pengurang pajak.
- Ada 10 item tinjauan akuntansi/pajak: alokasi penggunaan campuran, perlakuan lisensi/IP, uang muka, dan kebijakan beban atau aset. Pembelian dan pembayaran yang dikonfirmasi tetap tercatat; perlakuan yang belum pasti tidak diam-diam disetujui.
- Konteks riset potensial: US / AE; US / AU; US / EG; US / GB; US / JP; US / KE. Penerapan perjanjian tidak ditetapkan hanya oleh kewarganegaraan, tempat tinggal biasa, atau pembayar. Cakupan disetujui yang belum tersedia tetap perlu ditinjau.

## Controlled live Muse evidence

The original two-request run had zero retries: initial profile rejected safely by strict schema validation; final grounded financial explanation passed with authoritative state unchanged. No extra paid request occurred until the user explicitly authorized one profiling recheck. That recheck used one request, zero retries, and passed. **Total: 3 paid requests, including the separately approved recheck; no loops.** Original failure evidence was preserved.

| Live check | Result | Time |
| --- | --- | --- |
| Original profile | Rejected schema; safely fell back | 10133 ms |
| Final financial explanation | PASS; persisted state unchanged | 2820 ms |
| Explicitly approved profile recheck | PASS; strict roles/activity/payer assertions | 7490 ms |

Evidence: [live-evidence.json](../research/global-freelancer/live-evidence.json), [live-profile-recheck.json](../research/global-freelancer/live-profile-recheck.json). Public records contain allowlisted synthetic facts, safe metrics and grounded displays. No headers, environment values, keys or raw live envelopes were logged/committed. Optional private candidate diagnostics remain under ignored data/.

## Performance, regression and security

| Check | Result |
| --- | --- |
| Latest complete Chrome journey | 56961 ms |
| Chrome onboarding | 6062 ms |
| 15-income normalization | 3496 ms |
| Card import/review | 19091 ms |
| Public HTTP journey / real process restart | 7571 ms (run 7) |
| Final complete regression | 414/414 pass; 0 failures; 0 skips; 29 suites; 126357.0492 ms |
| Security | PASS; working files and all reachable Git history scanned privately against configured credential variants and credential-shaped patterns; no unresolved credential |
| Environment | .env ignored/untracked; Meta API key not printed or committed |
| Core integrity | src/domain, src/accounting, src/tax, verticalSlice and research sanitizer unchanged from accepted baseline |

Evidence: [security-result.json](../research/global-freelancer/security-result.json), [regression-result.json](../research/global-freelancer/regression-result.json), [dashboard](../research/global-freelancer/screenshots/dashboard.png), [reports](../research/global-freelancer/screenshots/reports.png), [tax](../research/global-freelancer/screenshots/tax.png). Timings include explicit reviews, persistence, restart and browser navigation. No pathological behavior was observed at this dataset size.

## Reproduce / final checkpoint

```powershell
npm test
npm run test:global:freelancer
npm run test:global:browser
npm run security:scan
```

The browser uses installed Chromium and Node 20 experimental WebSocket support. Routine commands do not load .env or make paid calls. Recorded live evidence deliberately blocks accidental repeat execution. data/ contains ignored isolated users; research/ contains sanitized synthetic evidence.

Final working tree: clean after the local checkpoint commit, verified with its literal SHA in the final handoff. main remains `d6ce3b0c586761cd9221c613c569fdc2644c504a`; Phase 9 remains `72469ecb68af37bcd7c700eabff8b9fbcb51ddf4`; Phase 8 and all earlier checkpoints are preserved. No remote operation was performed.
