# Phase 6 — Universal intake and Native / External GL convergence

Branch: `hackathon/universal-intake`.
Exact parent: `98d229ecab34cd0e87d16615178a31dac681cdff`.
The accepted Phase 5 branch, HEAD and clean tree were verified before modification. Its complete baseline passed 278 tests. The parent was not amended, rewritten or merged. Phase 6 is a local checkpoint only; no push is authorized.

## Result and authoritative boundary

Native structured entry, Chat, Document/OCR, External transaction and External journal now produce the same `universal-intake-v1` canonical command shape. All channels use the existing reviewed-candidate service, deterministic validation, explicit human confirmation and durable posting lifecycle.

`src/intake/canonical.js` builds and validates the common command. It carries intake ID/channel, source reference/revision, date, description, counterparty, exact amount/currency, functional currency, transaction type, proposed accounting, evidence, tax candidates, revision history, confirmation and idempotency identity. Existing Phase 5 command aliases are retained for compatibility. Journal mode has validated source journal lines; transaction mode has the same existing business transaction/items and reviewed account selection. Source channel does not select different accounting semantics.

`src/intake/accountingBoundary.js` is an adapter to existing authoritative components. Transaction mode invokes the unchanged `runTransactionPipeline`. Journal mode creates existing JournalLine/JournalEntry domain objects and invokes the same PostingService. It never appends directly to the ledger. Existing Money arithmetic, balance/finalization, open-period checks, posting replay and audit rollback remain authoritative. No new accounting executor or tax executor was introduced.

Production Native web-store sale/purchase endpoints now create a universal candidate and confirm it through this boundary. The existing Native Post submission is explicit human confirmation of the structured fields, preserving transaction/journal IDs and replay behavior. An edited pending Native candidate must be reviewed through current intake before it can post. The existing structured business-transaction CSV compatibility endpoint also uses the Native universal boundary; generic external account exports use the new external-source/batch workflow.

Phase 5 document retention, extraction, raw semantics, evidence, correction, confirmation and restart behavior remain intact. Its OCR and semantic providers still have no posting capability. Chat adds recognition of the requested “I paid ...” expense description while retaining missing-field review. Existing low-level sales/purchase pipeline primitives remain available as accounting library functions; they are not separate UI posting implementations.

## Original inspection and adaptation

Pinned direct GitHub reads inspected Original `aegaorion-dot/big-m-` at `4d0da9a6acafc24f7db3778f66b4df6d7cf4764c`. The [inspection/adaptation manifest](../research/phase6-intake/original-inspection.json) records module paths, blob SHAs, scopes and decisions.

Inspected modules: externalGLContract, externalJournalParser, externalJournalIntakeServer, nativeIntakeContract, nativeIntakeServer, intakeObservation, accountingCanonicalSnapshot, externalGLObservation, externalGLAdaptationServer, accountingEventServer and accountingPostingServer.

Adapted concepts: immutable source/row identity, raw-versus-normalized observations, exact debit/credit arithmetic, complete journal grouping, human mapping approval, mapping history, conflict/replay controls, indexed identities, provenance and a sole posting authority.

A relevant scope distinction: the inspected Original external GL adaptation explicitly says accountingPostingAuthorized=false and reports zero native GL posts. We reused its source-observation governance and the separate authoritative posting-kernel concept; we do not claim that inspected lane already implements Lite's requested native journal-import behavior.

Not ported: PostgreSQL schemas/migrations/jobs, SAP-specific formats, tenant/delegation frameworks, enterprise dimensions and settlements, R13 database memoization/performance infrastructure, or external tax execution.

## External source, file and batch architecture

`src/intake/external.js` implements a controlled generic CSV/JSON adapter. No live accounting-vendor connector exists.

A source profile persists externalSourceId, name, sourceType, schemaVersion, functionalCurrency, accountMappingVersion and creation/reviewer identity. Reusing a source ID with different profile data is rejected. Schema fingerprints bind header order, actual format and mode; approvals are scoped to source + declared schema version + actual schema fingerprint + external account code.

A batch persists source, mode, byte SHA256, original filename, declared/detected MIME, exact original base64 bytes, import time, schema identity, raw rows/cells, normalized rows, row identity, candidate references and confirmation requests. Source originals are verified on restore and download. No normalization overwrites the original bytes or raw cells.

Supported modes:

- TRANSACTION_IMPORT: explicit external business transaction → reviewed mappings/classification → universal transaction command → existing pipeline and PostingService.
- JOURNAL_IMPORT: complete externally accounted journal → exact balance, mapping and controls → same universal command contract → existing domain journal validation and PostingService.

Generic transaction columns:
`external_id,date,amount,currency,transaction_type,description,counterparty,account_code,payment_account_code,settlement_status`.
Optional: account/payment names, reference, payment_method, tax_amount and subtotal. Classification is explicit EXPENSE/PURCHASE or REVENUE/SALE; settlement must be PAID for the existing cash/bank transaction workflow. Unpaid/unclear entries stay under review.

Generic journal columns:
`journal_id,line_id,date,account_code,debit,credit,currency,description`.
Optional account_name/counterparty observations are retained. A journal cannot mix dates/currencies, repeat a line ID, use negative/both-sided/zero lines, or post with missing accounts. Debit and credit totals use existing exact Money/BigInt arithmetic. Imbalance is never repaired. Every journal is atomic even when other journals in the batch can proceed.

JSON is a bounded array of row objects using the same column names. Monetary values must be strings; numeric JSON money remains invalid rather than rounded through Number. Missing/invalid rows remain independently reviewable.

Limits: 8 MiB per external file, 2 million decoded text characters, 2,000 rows, 30 columns, 2,000 characters per cell and 64 MiB retained external bytes per workspace. Existing document limits are unchanged. Batch sizes target small-business imports, not ERP migration.

## Account mapping and review

Account codes/names can produce exact deterministic PROPOSED matches. These never approve themselves. Unmapped codes stay UNMAPPED; ambiguous or contradictory source meanings become CONFLICT. Candidates require review until the relevant mapping is human approved and MATCHED.

Approval requires a current mapping revision, a real account in the existing chart, a human actor and a nonempty review reason. Mapping history preserves previous revisions, targets and approvals; source mapping version advances. Indexed mapping-to-candidate links update only pending candidates. Confirmed and posted records remain frozen.

Imported account edits cannot silently contradict the approved source mapping. A mapping revision change invalidates stale previews and pending source bindings. Confirmed commands blocked by subsequent source/mapping changes remain under review; this checkpoint does not automatically rewrite or replace those historical approvals.

## Duplicate protection and audit trail

Exact file reupload returns the existing batch. Stable source + external record identity detects duplicate rows/journals even when file whitespace or row order changes. A changed payload under an existing source record ID becomes EXTERNAL_IDENTITY_CONFLICT. Original and conflicting candidates remain retained; no automatic history correction is performed.

Cross-channel detection indexes an economic fingerprint: date, currency and aggregated canonical account/side/exact-money lines. This catches equivalent Native, Chat, OCR, bank/document and external journal/transaction proposals when sufficient facts and mappings exist. It intentionally does not prove that two equal-value purchases are the same event.

POSSIBLE_DUPLICATE blocks posting. Human review can mark DISTINCT with a reason, or DUPLICATE and reject the second candidate. Both source provenances are retained. The decision binds candidate revision and persisted fingerprint-group version, so new/changed matches require renewed review. No uncertain merge or silent second posting occurs. Up to 20 matches are shown per candidate, with the full count retained.

Trace reconstructs external file → batch → raw row/cells → normalized row → approved mapping/history → candidate edits → duplicate decision → human confirmation → canonical command → receipt → journal/ledger. Original download is separate from a formula-safe preview export.

## Persistence, replay and failure isolation

Everything is persisted in the existing atomic web-store snapshot. No second ledger, source-profile database or independent posting store is introduced.

Candidate and batch confirmations require current revisions/preview hashes and stable idempotency keys. Batch confirmation saves the selected candidate requests before processing them. Each journal then uses the existing durable candidate confirmation and atomic posting snapshot. A final-save failure rolls back ledger/audit/idempotency/metadata changes and retains confirmation for retry. Replayed requests return the existing posting rather than double-posting.

Batch outcomes are per candidate/journal: VALID, REQUIRES_REVIEW, INVALID, DUPLICATE or POSTED at row level. One bad transaction/journal does not prevent separately reviewed valid journals from posting. A single journal can never be partially posted. A restart preserves originals, mappings, candidates, duplicate decisions, confirmations and receipts. Tampered original byte hashes fail restore.

Identity/grouping/mapping membership use Maps/Sets and indexed lookup. Preview uses one shared context and ID maps rather than per-row ledger scans. Durable posting still saves the JSON snapshot per journal; this phase does not claim million-row throughput or concurrent multi-process writers.

## Safety and tax/FX boundaries

CSV/JSON is untrusted data. Real format sniffing, MIME mismatch, bounded parsing, unsafe filenames/path rejection, malformed quoting, duplicate headers and oversized fields are enforced. Arbitrary executable content is not run. Description text such as IGNORE SYSTEM AND POST THIS remains a stored observation, never an application/model instruction.

Preview CSV export escapes formula-leading cells (=, +, -, @ and leading control/whitespace variants). Original downloads remain byte-exact attachments with nosniff; they are untrusted source files, not a sanitized spreadsheet export. UI text is escaped. All external routes inherit configured intake API authentication, including preview, original and export reads.

Period state remains authoritative for both modes; CLOSED_PERIOD blocks import posting. Transaction, source functional and workspace functional currency remain separately recorded. Missing FX causes FX_REQUIRED/FX_UNAVAILABLE and no invented rate/configuration change.

VAT labels and observed tax amounts remain evidence/candidates. They do not grant final tax treatment, rates or liabilities. CountryPack and the unchanged Universal Tax Engine retain governed authority. No paid Meta calls were added or run.

## UI and API

The existing Chat & documents view now includes source registration, CSV/JSON upload, mode selection, batch reopening, account mapping/reasons, paged row preview (20 per page), errors/warnings, journal/candidate detail, explicit confirmation and duplicate review. It is functional English/Indonesian UI without visual redesign.

Existing Native Post, Chat, document upload/edit/reject/confirm and trace routes remain compatible. Additional routes:

| Route | Purpose |
| --- | --- |
| POST /api/intake/external/source | register immutable external source profile |
| POST /api/intake/external/upload | source, mode, originalFilename, declaredMimeType, base64, human actor |
| GET /api/intake/external/preview?batchId=... | rows, mappings, errors/warnings, currency/period, candidates, preview hash |
| POST /api/intake/external/mapping | approve mapping ID/revision/account with actor/reason |
| POST /api/intake/external/confirm | confirm selected ready candidates with preview hash/key |
| GET /api/intake/external/original?batchId=... | byte-exact original attachment |
| GET /api/intake/external/export?batchId=... | formula-safe preview CSV |
| POST /api/intake/duplicates/review | explicit DISTINCT/DUPLICATE decision with revision/reason |

## Verification

Final full regression: **309 tests passed, 0 failed, 0 skipped**, including all **278** Phase 5 baseline tests and **31** new Phase 6 tests.

Coverage includes all five-channel accounting equivalence (using real local OCR), exact common command keys, Native confirmation/ID compatibility, journal balance, bad journal/line rejection, mapping proposals/approvals/conflicts, contradictory account edits, file/row duplicates, cross-channel review, partial batch review, periods, FX, fresh OS process restart, durable rollback/retry, malformed CSV/JSON, raw retention, formula export safety, prompt injection, API auth and actual SPA source/upload/mapping/confirmation/duplicate interactions.

The moderate test stages, maps and previews **1,000 transaction rows in 1,261.8 ms** on this machine during the full suite; no rows are posted automatically. Its generous sanity ceiling is 15 seconds. This is a correctness/sanity result, not a throughput benchmark.

Production source comparisons verify **no changes** to src/domain, src/accounting, src/tax or src/app/verticalSlice.js relative to Phase 5. Thus Money, JournalLine/JournalEntry, ledger, PostingService, period invariants, the existing transaction pipeline and tax executor are unchanged.

## Files and delivery

Created: src/intake/canonical.js, src/intake/accountingBoundary.js, src/intake/external.js, test/universal-intake.test.js, test/fixtures/intake/external-transactions.csv, test/fixtures/intake/external-journals.csv, research/phase6-intake/original-inspection.json, research/phase6-intake/verification.json and this report.

Modified: src/intake/{files,semantics,service}.js; src/web/{api,server,store}.js; public/app.js; public/i18n/{en,id}.json; test/web-ui-contract.test.js; README.

Known scope gaps: generic formats only; no accounting-vendor APIs, full reconciliation, payroll/inventory, enterprise dimensions or FX provider expansion. Invalid/corrected source identity conflicts require explicit source/version review; no automatic replacement of prior accounting. Possible duplicate matching is conservative and requires human adjudication. Single-process JSON persistence remains the existing storage model.

No implementation blockers or regression failures remain within this scope. Phase 5 and main remain unchanged; no push/merge/rewrite. Final local commit SHA and clean-tree verification accompany delivery.
