# Muse regulatory research: final residence pilot

Status: **RESIDENCE_GATE_NOT_CLOSED**. Live calls are stopped. This is a partial research result, not a completed Moroccan expat tax result.

## Final budget and outcome

The user authorized one FINAL extension of at most four Muse requests after the first sixteen. Requests 17-20 were used, with zero automatic retries. The durable ceiling is 20 and the remaining live budget is zero. No further live calls will be made for this pilot.

The saved research state and verified raw artifacts were reused. No completed search was fetched again; equivalent query encodings reuse the saved artifact. Hosted search was disabled during the final extension, which used observed official-site forms and links. No salary, villa, cafe, treaty or credit research was added.

Final state: 12 retrieved sources, nine readings, one evidence-bound Morocco residence candidate, two user-circumstance questions and one legal question routed back to research. No rule was approved or activated. There is no supported current Morocco/Indonesia residence conclusion.

## Exactly where the final four requests failed

| Request | Observable action | Result / limitation |
| --- | --- | --- |
| 17 | Muse selected the observed DJP native search form and a new BPK query | DJP retrieval failed before a raw artifact was retained; the original retriever discarded low-level failure details, so its exact transport/redirect cause cannot be established retrospectively. BPK returned broad results. |
| 18 | Muse queried the Moroccan mirror portal and searched BPK for income-tax legislation | The Moroccan query targeted domicile terminology instead of establishing the 2026 edition or mirror fidelity. The plan/prompt did not force completion of those subtasks. BPK exposed relevant law references. |
| 19 | Muse retrieved BPK's official UU 36/2008 metadata page and requested another Morocco passage | The page exposed actual Read/Download PDF links, but Muse did not follow them. The Morocco literal used a straight apostrophe/spacing that did not match extracted typography, so the old reader returned no passage. |
| 20 | Muse proposed a structured candidate using existing citation identifiers | Deterministic validation accepted one non-executable Morocco research candidate, while retaining all unresolved period, mirror and independent cross-check requirements. No Indonesian residence candidate was fabricated. |

The source-selection/attachment-following step was a Muse workflow failure, not proof that the Indonesian law was unavailable. Search results and legislation metadata are not the controlling provision. No extra request was spent to repair the live result after the final four.

## Evidence obtained and unresolved gates

Muse actually selected, retrieved and read passages from a **2025 Moroccan tax-code mirror**, including the residence provision. Exact passages and hashes support a research candidate. The final extension also preserved additional official search pages and Indonesia's law-metadata page with actual PDF references. None of those new pages supplied a newly read controlling legal provision.

Remaining gates:

- Morocco: current applicability for October 2026, commencement/version evidence, verified mirror fidelity and independent cross-check.
- Indonesia: retrieval and anchored reading of the controlling residence provision, exceptions/amendments and effective-period evidence.
- User circumstances: permanent-home availability and economic ties. A request asking the user to supply Indonesia's legal provision was intercepted as a research gap.

The loop reached **Muse research -> exact evidence -> valid research candidate -> deterministic validation -> candidate-only Fabric governance**, but did not close the complete current residence question. Requirement 14 remains pending. Neither a residence conclusion nor a tax payable is claimed.

## Implemented controls

A hashed Research Brief records objective, confirmed facts, unknowns, tax period, jurisdictions, questions, preferred/allowed sources, required evidence, prohibited inferences and stop conditions before search. Facts and legal propositions remain separate.

Muse can search, inspect, retrieve/read, follow references, refine and backtrack. Prompts teach French/Arabic Moroccan terminology and Indonesian legal terminology. Official sources are preferred; commentary is discovery only. Mirrors are explicitly MIRROR_OF_OFFICIAL_SOURCE and are not executable without fidelity review. Snippets cannot become executable evidence.

Evidence bundles carry jurisdiction, tax year/effective period, issuer, title/URL/classification, legal locator, exact evidence, candidate logic/parameters, conditions/exceptions, confidence and research run ID. Citation identifiers resolve to actually-read, anchored source text. Operative fields require evidence bindings. Confidence never authorizes approval.

External pages/documents are DATA. Muse cannot approve or activate its own rule, modify confirmed facts, or post accounting entries. Missing user facts route as questions; missing law routes back to research. Conflicts and period problems stay explicit. Existing core tax contracts were restored after earlier draft-only enum additions; no core-engine validation standard was lowered.

The separate regulatory PDF reader verifies raw hashes, limits bytes/pages/time/memory, and receives no application credentials. Ordinary document-upload limits remain unchanged.

## Offline hardening after live calls stopped

- Typographic lookup tolerates accents, apostrophes and PDF whitespace while returning unchanged source text. Exact evidence validation remains strict.
- The actual failed final literal now finds a saved page offline. That result was not shown to live Muse and is not inserted into the live trace or used to upgrade acceptance.
- Empty reads return NO_MATCH guidance. Future retrieval failures retain typed stage/status/redirect diagnostics without arbitrary error strings.
- Exact citation identifiers, current-instruction ordering, compact replay and bounded whole citation options prevent quotation and context failures.
- Actual retrieval attempts and read selections are counted separately from rejected proposals and returned page blocks.
- Equivalent completed official searches reuse raw artifacts; no additional network request is made.
- Legal questions disguised as missing user facts route back to research.

## Preserved evaluation material

`research/moroccan-expat/residence-research/run-2/` contains:

- `brief.json`, `job.json`, `final-job.json`: work order, bounded amendments, original proposals, observable operations, validation and unresolved items.
- `raw/`: preserved hash-bound official/mirror source artifacts.
- `governance.json`: research candidates with no approval or activation.
- `replay.json`, `final-replay.json`: integrity-protected snapshots for offline regression.
- `final-result.json`: exact final-four budget, failures and unresolved result.
- `evaluation-cases.json`: all 20 observable model-output cases, tool results, prompt/response hashes, usage and the offline reader regression.

Historic complete request bodies were not retained; original prompt hashes and briefs are available. The export does not invent exact historical prompts. Cases are untrusted evaluation/failure-analysis data requiring curation, not approved-law labels or a claim that the specialist has been trained. Hidden reasoning, encrypted continuation content, credentials and authorization headers are excluded. Private provider envelopes remain only under ignored data/.

Development catalogs in research/moroccan-tax/reference/ were not supplied as the final Muse answers or substituted for live research.

## Validation and security

Focused adapter/research checks: **34 passed, 0 failed**. Complete regression: **449 passed, 0 failed, 0 skipped**, with the external-network guard enabled; runtime 160.458 seconds. Both the initial and final live artifacts replay offline with zero paid calls.

The Git-history scan found zero configured-credential matches, zero unresolved credentials, no tracked environment files and no committed logs. A separate scan of 599 tracked/unignored working files found zero configured Meta credential variants and zero log paths. `.env` is ignored and untracked. No credential or hidden reasoning was printed. No push, merge or history rewrite was performed; the working tree remains intentionally uncommitted.

Offline commands:

    node scripts/moroccan-residence-final.js --status
    node scripts/moroccan-residence-research.js --replay=research/moroccan-expat/residence-research/run-2/final-replay.json
    node scripts/export-residence-evaluation.js
    node --require ./scripts/test-network-guard.cjs --test test/regulatory-research.test.js
    npm test
    npm run security:scan
