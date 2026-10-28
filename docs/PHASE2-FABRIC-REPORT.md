# Phase 2: Country Pack Fabric foundation

## Result and boundaries

The accepted baseline `8d63a32420ab3a50fa302945a990433efe74823d` remains intact. Work is on `codex/country-pack-fabric-rnd`. The initial baseline repair is local commit `5f1cd7d`; see [acceptance gate](PHASE2-ACCEPTANCE.md). Fabric has no imports into accounting, posting, ledger, runtime tax resolution or the UI. Existing accounting remains unchanged. No push or paid AI call was performed.

Implemented: OfficialSourceRegistry -> SourceConnector -> RawArtifact -> CanonicalLegalSource -> EvidenceCandidate -> CountryPackCandidate. The registry, discovered documents and candidate content remain separate. Every candidate is non-executable in this foundation. Workspace readiness remains distinct from tax readiness.

## Direct Original seed

Read `aegaorion-dot/big-m-/jurisdiction.ts` directly through the GitHub connector on 28 October 2026. Git blob: `c83a253f6bf5246e1386d8692306d62efd000264`. Full source and retrieval provenance are in `research/country-pack-fabric/original-jurisdiction.ts` and `original-provenance.json`. The registry retains the 26 Original domain families across ID/SG/AU/US/GB and adds Treasury Australia explicitly from the user's Phase 2 request. Dispute procedures, screening deadlines and country-default fallback from Original were not imported into Fabric.

Registry implementation: `src/fabric/registry.js`. There are 27 immutable source entries, separated by jurisdiction and authority, with authority names, collection roles, exact hosts, base URLs, access priorities, documented API references, structured feed links, supported MIME types, language, trust scope and seed provenance. A source's collection role does not establish the legal force of every document it hosts. Guidance, legislation, administrative services, ministries and courts are distinguished; document legal force still requires review.

## Actual access discovery

170 bounded read-only requests were recorded, including repeated checks of unstable endpoints. Every source family was probed for its home page, robots.txt and sitemap.xml. Captured HTML/XML links were inspected separately for API/documentation, JSON, XML, RSS/Atom, PDF, ZIP, search and pagination. A link observation is explicitly different from a successful request. An empty category means not observed, not that the source lacks the feature.

Evidence:

- [Access matrix and document matrix](../research/country-pack-fabric/ACCESS-MATRIX.md).
- `access-matrix.json`: per-family request results, actual HTTP errors/redirects, format observations, metadata and citation capability.
- `access-link-discovery.json`: eight access categories for each of the 27 families, including unregistered/unofficial link classification. Search/pagination links are discovery observations, not claims of tested search semantics.
- `observations.jsonl`: timestamped request history and artifact metadata, including failures.
- `sample-manifest.json`: 24 selected raw response fixtures with observed structures; 23 successful responses and one SSO 403 response. These are not 24 validated legal documents.
- `fixtures/blobs/` and `fixtures/artifacts/`: complete selected response bodies and their immutable retrieval metadata. Normal tests replay these offline and verify hashes.
- Full capture corpus is retained locally under ignored `captures/`; successful bodies, HTTP error bodies and MIME mismatch bodies are preserved before normalization. Oversized bodies are refused, not silently truncated into valid artifacts.

### Working APIs and structured access verified in this run

| Source | Verified endpoint/representation | Observed result |
|---|---|---|
| GOV.UK | `https://www.gov.uk/api/content/income-tax-rates` | 200 JSON: content_id, publication/update metadata, structured parts with HTML bodies |
| GOV.UK | `https://www.gov.uk/api/content/self-assessment-tax-returns` | 200 JSON with structured guide parts |
| legislation.gov.uk | `https://www.legislation.gov.uk/ukpga/2024/3/data.xml` | 200 CLML XML, Finance Act 2024: identifier, version relationships, enactment and version-start assertions |
| legislation.gov.uk | `https://www.legislation.gov.uk/ukpga/data.feed` | 200 Atom XML; discovery feed, not a law |
| eCFR | `https://www.ecfr.gov/api/versioner/v1/titles.json` | 200 JSON: titles, latest amendment/issue and up-to-date dates |
| eCFR | `https://www.ecfr.gov/api/versioner/v1/full/2026-10-26/title-26.xml?section=1.61-1` | 200 section XML with section identifier and paragraphs |
| JDIH Kemenkeu | `https://jdih.kemenkeu.go.id/feed.json` | 200 application/feed+json: document URLs, titles, content_html, date_modified |
| JDIH Kemenkeu | `https://jdih.kemenkeu.go.id/rss.xml` | 200 XML feed |
| Australian Federal Register | `https://api.prod.legislation.gov.au/swagger/v1/swagger.json` | OpenAPI JSON downloaded once; documents OData title/version/content/search endpoints. This verifies documentation access, not working data API calls. |

The connector supports explicit API-first selection among verified access options. It never guesses that an API works because a URL contains `/api`. For example, the sampled ATO `/api/public/content/...` endpoint returned PDF, not JSON. Search/pagination and version relationships remain source-specific; there is no pretend universal legal API.

Primary technical references: [UK legislation API](https://www.legislation.gov.uk/developer), [UK OpenAPI modules](https://www.legislation.gov.uk/openapi), [eCFR API documentation](https://www.ecfr.gov/developers/documentation/api/v1), [Federal Register Swagger](https://api.prod.legislation.gov.au/swagger/index.html), [Congress API](https://api.congress.gov/), and [US Code downloads](https://uscode.house.gov/download.html). Documentation availability does not override the recorded probe failures.

### HTML/PDF/OCR observations

| Jurisdiction | Representative captured source material | Observation |
|---|---|---|
| ID | UU 7/2021 official DJPP PDF, DJP tax page and individual-income guidance, BPK document index, JDIH feeds | HTML plus PDF; all 114 pages of the DJPP PDF yielded text. BPK index includes PDF and judicial-review links. No general structured legal-text API verified. |
| SG | IRAS small-business record-keeping e-Tax Guide PDF and corporate-tax page; MOF legislative consultation | IRAS PDF has text on all 19 pages. SSO Income Tax Act attempts returned 403. MOF consultation is a proposal, not enacted legislation and not a substitute for inaccessible Act text. |
| US | IRS Publication 334 HTML, self-employed tax-center HTML, eCFR section XML, US Code download index | IRS HTML usable as candidate text; eCFR structured regulation available. US Code index advertises XML/XHTML/PDF/ZIP releases, but tested legacy page and named ZIP targets returned 404. |
| AU | Federal Register F2024N00110 official notifiable instrument HTML, ATO tax page and TR 2024/1 PDF, public API schema | HTML/PDF available. The ATO ruling PDF has text on all 22 pages. Another ATO content PDF has text on all 42 pages. Large consolidated Act/ATO sitemap exceed limits; title data API attempts timed out. |
| GB | Finance Act 2024 CLML, GOV.UK guide JSON, legislation Atom | Structured content preferred; no HTML scraping needed for sampled documents. |

Court/ministry families with accessible home pages and/or sitemaps are listed individually in the matrix. This does not establish judgment retrieval or court API support. MA Indonesia and Federal Court Australia home-page requests returned 403. Coretax's public shell was captured; no authentication or taxpayer data was accessed. No real sampled PDF was classified as requiring OCR after pypdf extraction. A synthetic image-only PDF fixture exercises OCR_REQUIRED triage. Mixed scans and reading-order/table correctness remain review work.

`pdf-observations.json` binds four actual PDF assessments and extracted text to raw SHA-256 hashes. Optional read-only tooling: pypdf 6.12.2, installed locally under ignored `.tools/pdf`. `pdf-text/` retains complete extraction output. PDF creation/modification was not performed. Runtime normalization conservatively stops at PDF extraction/OCR triage; it does not invent PDF passages or run a general OCR subsystem.

## Contracts and design after observation

`src/fabric/raw-artifact.schema.json` defines the raw contract; `contracts.js` enforces core provenance fields at storage. Every raw record retains original/final URLs, redirects, retrieval method/time, status, declared MIME, detected type, nullable source metadata, content hash, storage reference, parser version, byte length and duplicate status. ETag and Last-Modified remain retrieval metadata, never legal effective dates.

Bodies use content-addressed SHA-256 blob storage; duplicate content reuses a blob while preserving independent retrieval records. Corrupt bytes or changed provenance records fail verification. Normalization requires the recorded artifact and registered source identity; it cannot consume an arbitrary AI-supplied envelope.

`canonical-legal-source.schema.json` describes the initial envelope. Observed differences drove its design:

- GOV.UK has content IDs, first publication times, organisation links and parts. Parts retain JSON-pointer anchors, not fabricated statutory section numbers.
- UK CLML has identifiers, enactment dates, version-start dates and replaces/hasVersion relationships. These remain typed source assertions; no document-wide tax commencement date is inferred.
- eCFR sections expose section identifiers and paragraphs. A requested snapshot date is not automatically a regulation's effective date.
- JDIH feeds are discovery documents with per-item links and dates. Feed metadata and OpenAPI schemas cannot become CountryPack content.
- HTML and PDF retain their original payload and source-specific metadata. HTML normalization is conservative inert text; tables and citation structure require review. PDF extraction is separately hash-bound research.

Each envelope separates metadata, provenance, authority, temporal validity, raw reference, normalized text/blocks, citation anchors, discovered links and source-specific metadata. Complete payload is always available through its raw reference. Publication is extracted only from a recognized field; effectiveFrom/effectiveTo remain null for these unreviewed samples. Strict ISO date parsing is tested, but missing legal applicability is never filled from the accounting period or title year.

## Candidate governance and security

Evidence requires an exact, nonempty contiguous passage within a verified anchor, with offset, raw hash, envelope ID and quote hash. A CountryPackCandidate requires matching source envelopes and a single jurisdiction. `candidate-examples.json` contains 14 non-executable research examples, not approved tax content. AI authority is always CANDIDATE_ONLY.

The state vocabulary includes DISCOVERED, CANDIDATE, REVIEW_REQUIRED, APPROVED, SUPERSEDED, RETIRED, OUT_OF_PERIOD, MISSING_COUNTRY_PACK and CONFLICT. Human review requires an explicit human actor/decision/reason and all source hashes for approval. That is a trusted local caller contract, not a new identity/authentication service. Approval here reviews research content; it does not establish unknown temporal scope, add an executor or activate tax law. Retired/superseded versions are terminal. Unknown dates stay REVIEW_REQUIRED; known 2025 scope is OUT_OF_PERIOD for a 2026 request. Even an in-period reviewed candidate has no tax executor in this phase.

Network controls: HTTPS, exact registered hosts, jurisdiction/authority isolation, no credentials/nonstandard ports, manual bounded redirects, final URL logging, shared timeout, declared and streamed byte limits, MIME sniffing, raw hash checks and duplicate detection. Every redirect target is checked before requesting it. New official-looking government hosts are marked UNREGISTERED_OFFICIAL_SOURCE_CANDIDATE; commercial hosts are rejected. Redirects to a different authority also require review. No fetched scripts are executed. HTML instructions remain untrusted quoted data and cannot approve or activate anything. XML external entities are rejected. ZIP bodies remain preserved but unpacking is unsupported.

## Blockers and remaining work

- SSO returned 403 on all attempted home/document/section requests. Singapore enacted-law full text is not captured; the 403 body is retained as evidence of failure. IRAS guidance and MOF proposals do not fill that gap.
- US Code's temporary-format notice and 404 document/download responses prevent validating the advertised release ZIPs in this run. No ZIP success is claimed. eCFR sample is secondary regulation, not a substitute for the Code.
- Australian OpenAPI was captured, but title list/key lookups repeatedly timed out. A large Income Tax Act HTML body and an ATO sitemap were rejected by the size cap. Smaller official instrument HTML was captured. No working Australian OData data API is claimed.
- eCFR documentation/home requests redirected to unregistered unblock.federalregister.gov and were stopped; specific API calls still worked. The registry was not expanded to bypass the block.
- Some endpoint guesses returned 404, and some sites vary between 200 and 403. All attempts remain in observations; latest success is not a permanence guarantee.
- No exhaustive search, pagination, amendment graph, parser completeness or legal coverage claim. Citation granularity varies by source. Plain-text robots files are stored but unsupported for legal normalization.
- OCR, PDF runtime extraction, table-preserving HTML parsing, source-specific legal commencement review, deterministic material tax consumers and authenticated review UI are future work. No missing legal text, date or citation was invented.

## Run and verify

Normal regression is offline (including real saved samples):

    npm test

Explicit live R&D, never called by normal regression:

    npm run fabric:probe -- --live
    npm run fabric:probe -- --live --set=samples --source=ID-JDIH

Offline report rebuilding from the local capture corpus:

    npm run fabric:report
    node scripts/fabric-access-links.js

The complete capture corpus is local and ignored; the selected fixture corpus is committed for reproducible normal tests. Reprobing populates a new local corpus; it cannot guarantee the same server responses. Reports retain historical observations rather than silently overwriting failures.

Final regression: **168 passed, 0 failed**, 24 suites. Includes 20 deterministic Fabric tests, 11 independent acceptance checks, actual process restart with CLOSED periods, and the original 137 tests. No external network is required by normal tests. No accounting engine, tax calculator, ERP, payroll, inventory, external GL or UI redesign was added.




Complete regenerated envelopes are in research/country-pack-fabric/canonical-envelopes.json; normal tests compare them against raw replay. The separate envelope-summaries.json is explicitly marked summaryOnly. The initial repair (5f1cd7d) and final baseline validation/restart hardening (841a1ce) are separate local commits before the Fabric commit.
