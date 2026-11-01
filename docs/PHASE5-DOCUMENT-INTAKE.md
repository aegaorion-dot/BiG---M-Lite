# Phase 5 — chat, documents and local OCR

Branch: `hackathon/document-intake-ocr`.
Parent checkpoint: `91669534a1c1e94bfeea1ab57e5063ca31493fc0`.
Baseline verified clean, with all 230 tests passing before branch creation.
The checkpoint is committed locally only. No push, main merge, amendment or history rewrite is part of Phase 5.

## Product flow and accounting boundary

Open **Chat & documents** from Setup before activation, or from active workspace navigation. Upload a document or describe a transaction. Review the evidence, save corrections, then explicitly Confirm & post or Reject. Unsaved visible edits block confirmation.

Original bytes → extraction/OCR → semantic interpretation → candidate → deterministic validation → human confirmation → canonical transaction → existing runTransactionPipeline → existing PostingService → journal/ledger.

Chat and document input use one candidate model. Extraction and semantics have no posting capability or model tools. One Accounting Engine and one Universal Tax Engine remain authoritative. Money, PostingService, ledger and tax executor source remain unchanged. The existing journal builder accepts optional confirmed accounts and validates them against the existing Chart of Accounts; no second journal builder was added.

## Original inspection

Direct GitHub reads inspected `aegaorion-dot/big-m-` at `4d0da9a6acafc24f7db3778f66b4df6d7cf4764c` before designing the intake architecture. Exact blob SHAs and read ranges are in [original-inspection.json](../research/phase5-intake/original-inspection.json).

| Inspected Original source | Concepts adapted |
| --- | --- |
| intakeUpload.ts, intakeFileReader.ts | bounded bytes/parsing, unsafe filename rejection, exact observed values |
| intakeByteRetention.ts | immutable retained bytes identified by SHA256 |
| nativeIntakeContract.ts, intakeAiContract.ts | typed candidates, source provenance, strict advisory-only AI validation |
| companionDocumentExtract.ts (1–200) | evidence per field, explicit missing/ambiguous values and candidate status; Original explicitly has no OCR |
| companionOrchestrator.ts (1–105) | untrusted document data and no model mutation authority |
| accountingReceiptFacts.ts, canonicalBusinessEventFacts.ts (latter 1–105) | document/row references and separate date roles |
| nativeIntakeServer.ts (1–105) | inspected native intake scope/settlement boundary |

Original PostgreSQL jobs, enterprise workflows, XLS/XLSX, external-GL/direct-tax lanes, AP/AR masters and reconciliation were intentionally not ported. Original floating-point amount parsing and ambiguous-date defaults were not reused. Concepts were adapted; Original source was not copied or modified. Lite adds separate local PDF/OCR extraction.

## Supported documents and formats

| Input | Phase 5 behavior |
| --- | --- |
| Purchase receipts | labeled total/date/counterparty/currency/payment, expense proposal and evidence |
| Supplier/customer invoices | invoice/payment date separation; unpaid or unclear invoices remain review-only |
| Simple bank statements | CSV rows become separate candidates sharing one original and extraction |
| Payment/transfer evidence | observed facts; classification requires review; no transfer or reconciliation workflow |
| Registration/tax/general profile documents | labeled name, jurisdiction, tax number, address and registration status join profileState |
| PDF | PDF.js text extraction; image-only pages render locally and use OCR |
| PNG/JPG/JPEG | decoded image and local English/Indonesian Tesseract OCR |
| UTF-8 text/CSV | bounded direct text/table extraction |

Deterministic semantics support simple labeled documents and a limited set of English/Indonesian transaction descriptions. Arbitrary layouts, handwriting, universal translation and enterprise workflows are outside scope. Explicit Meta opt-in can provide broader semantics; all output remains candidates.

Statement headers require date, description, and amount or debit/credit. Currency, reference and counterparty are optional observations; missing values require review. Direction never establishes revenue/expense. Each row needs explicit classification, accounts and paid-settlement review.

Unpaid invoices never silently become cash entries. Transaction currency stays distinct from functional/reporting currency. Different currencies block posting with FX_UNAVAILABLE because this checkpoint does not invent conversion or add FX architecture.

## Extraction, semantics and candidates

`src/intake/files.js` sniffs real byte/content type, validates declared MIME, rejects unsafe filenames, hashes bytes and parses bounded CSV. Extensions do not establish type. Generic MIME is sniffed. Empty, unsupported, malformed UTF-8, suspicious path/Windows device names and oversized files fail explicitly. Binary decode failures retain the original with visible FAILED status and no candidates/posting.

`extraction.js` and `extract-worker.js` define ExtractionProvider and the local provider. Extraction includes IDs, extractor/version, method, pages, blocks, tables, language, confidence, warnings and creation time. PDF/OCR run in a child with a 256 MiB V8 heap and 60-second timeout, without application credentials. PDF JavaScript evaluation is disabled; JavaScript actions and attachments are rejected. Bundled English/Indonesian npm language data is copied to a private temporary directory. OCR needs no runtime download or paid API. The parent verifies cleanup paths before removing its own temporary directory. The child is a resource boundary, not an OS sandbox or an absolute native/WASM memory cap.

Limits: 8 MiB/file, 64 MiB retained bytes/workspace, 20 pages, 16 million pixels/image or rendered page, 200,000 extracted characters, 500 statement rows, 30 CSV columns, 2,000 characters/cell, 10,000 characters/chat.

`semantics.js` defines SemanticDocumentProvider, deterministic and explicit Meta providers, and strict output validation. Unknown commands/authority, CONFIRMED output, invalid confidence and fabricated block/quote references are rejected. Document blocks are untrusted JSON data in the user envelope, separate from system instructions. No tools or posting capability are supplied. Provider failures are visible; no hidden paid fallback exists.

`service.js` owns one candidate model: stable source/document/extraction/interpretation IDs; candidate type; current financial fields; evidence; confidence; revisions; missing fields/conflicts; status; confirmation; canonical command; posting result; last error. Original extraction, raw semantic proposal, user revisions and confirmed command are separate records.

Editable fields: date, amount, currency, counterparty, description, classification, accounts, payment method, reference and paid status. Confirmation requires a human actor, latest revision, current review hash and stable idempotency key. Confirmed/posted candidates cannot be edited. Rejected candidates cannot post. Existing reversals remain available for posted corrections.

Validation checks real dates, exact Money values, open periods, activated modules, known currencies, currency compatibility, account existence/type, cash/bank boundary, and subtotal/tax arithmetic. Missing or ambiguous facts remain unresolved. Relative dates such as yesterday are proposals only and require an explicit transaction-date edit to resolve timezone ambiguity. Text/CSV preserve line/row evidence; PDF/OCR preserve page/block/bounding boxes.

## Profile and tax integration

Facts enter existing profileState slots, jurisdictionFacts and history. DOCUMENT provenance carries document/extraction ID, quote, evidence location, confidence and CANDIDATE status. Matching established values retain their source and gain document evidence. Contradictions retain established slot values and alternatives with CONFLICT status. Documents do not silently activate or replace business configuration. The existing setup review workflow resolves profile conflicts. Three string slots add tax registration number, address and registration status to the same profile architecture.

Observed tax/subtotal amounts are attached to the canonical command as REQUIRES_GOVERNED_TAX_REVIEW. They never create automatic tax splits, rates, jurisdiction conclusions or final liabilities. CountryPack/Tax Engine remains authoritative.

## Persistence, idempotency and audit

The existing atomic JSON snapshot now retains original base64 bytes, artifact metadata, extraction, raw/validated semantics, candidate revisions, confirmation, canonical command, events and posting references. Original hashes are verified on restore/download. Reads return copies. No extraction/edit overwrites original bytes.

SHA256 identifies exact duplicate files, including renamed uploads. Chat requestId rejects changed-text replays. Candidate IDs are deterministic per source/row. Confirmation keys bind candidate/revision; posting keys are stable per candidate. Mutations are serialized.

Confirmation is saved before posting. Journal, ledger/audit/idempotency, transaction metadata and POSTED state are saved in one existing-store snapshot. A failed final save rolls back in-memory posting changes and retains the durable confirmation for retry. Fresh-process restart cannot produce a durable orphan journal. Interrupted document processing becomes visible FAILED state for explicit retry; stored extraction is reused.

Trace reconstructs original identity → extraction → semantic proposal → edits → confirmation → canonical command → receipt → journal/ledger. Different bytes/scans of one economic event still need human duplicate review. Multi-process writers to one state file, full reconciliation and semantic duplicate matching are outside the existing single-process model.

## API and UI

| Route | Purpose |
| --- | --- |
| GET /api/intake | document/chat/candidate review state |
| GET /api/intake/trace?candidateId=... | complete candidate audit lineage |
| GET /api/intake/original?documentId=... | exact original attachment |
| POST /api/intake/upload | originalFilename, declaredMimeType, base64 |
| POST /api/intake/chat | text, requestId |
| POST /api/intake/edit | candidateId, revision, changes, actor |
| POST /api/intake/reject | candidateId, revision, actor |
| POST /api/intake/confirm | candidateId, revision, reviewHash, idempotencyKey, actor |
| POST /api/intake/retry | documentId for failed processing |

All intake endpoints enforce configured API authentication, including reads/downloads. HTTP supports Bearer authentication and existing body/query token transport. Original downloads use attachment disposition and nosniff. The server remains localhost-bound. UI output is escaped. English/Indonesian UI exposes processing/failure state, chat/upload, candidate edits, evidence/history, confirm/reject, original download and posting result.

## Run, paid opt-in and tests

Node >=20.19. Run `npm ci`, `npm test`, then `npm start`.
Pinned PDF.js 5.5.207 replaced an initially resolved affected 5.6 release after npm audit; the final installed dependency tree audited with zero vulnerabilities.

`npm run smoke:document-meta` skips unless BIGM_META_LIVE_TEST=1 and endpoint/key/model are configured. With explicit opt-in it makes at most ONE synthetic semantic call and never posts. Runtime paid semantics independently require BIGM_META_DOCUMENT_LIVE=1. Routine tests remove opt-ins, use mock Meta transport, and block real calls even with inherited credentials. No paid live call was run; the default smoke cleanly skipped.

`npm run fixtures:intake` explicitly regenerates synthetic text-PDF/scanned-PDF/PNG/JPEG/malformed fixtures. Other fixtures include Indonesian receipt, supplier/customer/SGD invoices, statement, prompt injection, ambiguous date and profile conflict. No real personal data or credentials are included.

Final suite: **278 tests passed, 0 failed** — all 230 baseline tests plus 48 new Phase 5 tests. Coverage includes real offline OCR/PDF extraction, HTTP upload/download/confirmation, SPA chat/upload/edit/confirm/reject and unsaved edits, contracts, zero routine paid calls, currency/profile safety, malformed inputs, duplicate/replay, fresh-process persistence, interrupted processing, save-failure rollback and audit trace. No regression failures or implementation blockers remain within this scope.

## Files and delivery

Created: src/intake/{files,extraction,extract-worker,semantics,service}.js; scripts/{intake-fixtures,meta-document-smoke}.js; test/document-intake{,-http}.test.js; test/fixtures/intake/*; package-lock.json; this report; research/phase5-intake/original-inspection.json.

Modified: src/app/verticalSlice.js; src/onboarding/slots.js; src/web/{api,server,store}.js; public/{app.js,styles.css,i18n/en.json,i18n/id.json}; test/web-ui-contract.test.js; scripts/test.js; package.json; .env.example; .gitignore; .gitattributes; README.

Money/PostingService/ledger/tax executor files are unchanged. No push or main merge. Final local commit SHA and clean-tree verification accompany the checkpoint delivery.
