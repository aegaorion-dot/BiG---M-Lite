# Universal Lite Tax contracts and offline CLI

Runtime schema authority: `src/tax/contracts.js` and `src/tax/dsl.js`. These are strict executable validators, not permissive JSON loading. Pack registration and every execution-eligibility check revalidate the content. Approval is a separate Fabric decision over the exact immutable version/hash.

## Calculation request

Every request requires these fields, with no unknown fields:

| Field | Contract |
|---|---|
| scopeId, subjectId | Nonempty local organisation/subject scope |
| requestKey | Nonempty key, maximum 160 characters; pins the first request/result |
| taxType | INCOME_TAX, CIT, SIMPLIFIED_INCOME, VAT, GST, SALES_TAX or WHT, FOREIGN_TAX_CREDIT; other types produce UNSUPPORTED_TAX_TYPE |
| jurisdictionCode | Explicit two-letter code; no country inference |
| jurisdictionBasis | TAX_RESIDENCE, REGISTRATION, SOURCE or WITHHOLDING; matching confirmed semantic fact is required |
| incomeOrEventType | Explicit event/income classification matching confirmed INCOME_TYPE |
| currency | Supported existing currency metadata; no implicit FX |
| period | periodStart and periodEnd, valid ISO dates, ordered |
| economicDate | Valid ISO date inside the requested period |

Scope, subject, period, economic date and currency must also match the human-confirmed fact snapshot exactly. Registration is not tax residence. Selecting a registration basis never manufactures the tax-residence/source facts needed for income/treaty analysis.

## Candidate and confirmed tax facts

`candidateTaxFacts` accepts scopeId, subjectId, nonnegative integer revision, period, economicDate, currency and facts. Each fact has name, type, value and evidenceReference. Names are bounded uppercase identifiers. Types:

| Type | Value |
|---|---|
| MONEY | Existing Money JSON: amountMinor integer string and currency |
| NUMBER | Exact decimal string, or numerator/denominator integer strings |
| BOOLEAN | Explicit true or false; missing is not false |
| STRING | Explicit string |
| COUNTRY | Explicit two-letter uppercase code with its semantic fact name |

The candidate is frozen and hashed; status remains CANDIDATE. `confirmTaxFacts` requires decisionSource HUMAN, an explicit human actor and the exact reviewedSnapshotHash. A changed snapshot cannot reuse its confirmation. The profile bridge proposes candidates only; it excludes rejected/unknown jurisdiction facts and conflicted subject slots. Nationality, customer, bank, work and registration remain distinct semantic roles.

The local command boundary is trusted. Actor/source fields are not an identity-provider implementation. Runtime AI profile extraction cannot call this confirmation or the law-approval command.

## CountryPack and executable rule

A CountryPack requires packId, positive integer version, jurisdictionCode, currency, effectiveFrom/effectiveTo, evidenceRefs, nonempty rules and testOnly. Optional metadata includes label, originalSource, supersedes and supersededBy. A version cannot be replaced with different content. TEST ONLY evidence cannot be disguised as a production pack.

Every rule requires:

- ruleId, taxType, subjectTypes, incomeOrEventType;
- requiredFacts (name to type), optional requiredTrueFacts (explicit boolean review prerequisites);
- applicabilityPredicate (BOOLEAN), taxBaseFormula (NUMBER), amountFormula (NUMBER);
- rateDefinition: EXPRESSION plus an expression, or FORMULA_DERIVED with trace/parameters;
- declared typed parameters;
- finalRounding: mode DOWN/UP/HALF_UP and precision between zero and the currency's existing minor precision;
- explicit effectiveFrom/effectiveTo inside the pack window;
- evidenceRefs bound to the pack/Fabric source candidate;
- treatyRelevant hint, optional supersession and explanatory threshold/exemption/relief metadata.

The whole requested period and economic date must fit. Rules may reference only declared inputs and parameters. TAX_BASE is an engine-supplied value available only to amount/rate formulas. Missing facts block execution; contradictory confirmed facts produce CONFLICT. False supported predicates produce NOT_APPLICABLE with no invented zero amount. Two simultaneously applicable liability rules are rejected as CONFLICT, not summed arbitrarily.

## Safe AST

Node shapes:

    { "op": "INPUT", "name": "AMOUNT" }
    { "op": "PARAMETER", "code": "TEST_RATE" }
    { "op": "LITERAL", "valueType": "NUMBER", "value": "0.137" }
    { "op": "LITERAL", "valueType": "BOOLEAN", "value": true }
    { "op": "LITERAL", "valueType": "STRING", "value": "TEST ONLY" }
    { "op": "MULTIPLY", "args": [ ... ] }
    { "op": "ROUND", "args": [ ... ], "rule": { "mode": "DOWN", "precision": 0 } }

The numeric example is fictional TEST ONLY arithmetic, not a rate of law. LITERAL numeric values cannot be JavaScript floating-point numbers. Operators: ADD/SUBTRACT/MULTIPLY/DIVIDE/MIN/MAX; GT/GTE/LT/LTE/EQ; AND/OR/NOT; IF; bounded ROUND. IF has three typed arguments and selects only one branch. AND/OR short-circuit. Division by zero is unresolved. No arbitrary property access, script text, custom function, filesystem operation or network operation exists in the vocabulary.

Maximum AST depth is 32, nodes per expression 1024, execution budget per expression 4096, aggregate trace entries 12000, and bounded rational digit/decimal sizes. Final currency conversion/rounding uses the existing Money implementation. Cross-currency amount facts are rejected.

## TreatyPack

A separate TreatyPack requires treatyPackId, treatyCode, jurisdictionA/B, version, effectiveFrom/effectiveTo, coveredTaxes, residenceRules, sourceRules, incomeArticles, permanentEstablishmentRules, withholdingLimits, reliefMethods, requiredFacts, evidenceRefs, testOnly and coverageStatus.

REVIEW_REQUIRED drafts may have unknown dates and no executable article. COMPLETE_SUBSET requires dates, legal/source evidence and an exact income article. A research draft remains non-executable after research review. Each executable article declares required facts, a typed eligibility predicate, parameters, evidence and effects. Eligibility references confirmed facts; effect formulas may additionally use TAX_BASE and DOMESTIC_TAX. Effects are WITHHOLDING_LIMIT, ALLOCATION, EXEMPTION and CREDIT, with an amount formula and explicit currency/rounding.

Confirmed source and residence determine the pair. Equal source/residence yields NOT_NEEDED. Unknown source does not become customer location. A matching approved pack, full-period coverage, exact article, complete typed facts and true eligibility are required for APPLICABLE. Otherwise the resolver returns REVIEW_REQUIRED, MISSING_TREATY, MISSING_FACT, OUT_OF_PERIOD or CONFLICT. Missing/false PE or eligibility facts are not inferred from nationality or work location.

Every monetary effect must stay between zero and the prior domestic amount before and after rounding. No missing treaty can silently finalize the domestic candidate as the treaty outcome.

## Fabric authority

`attachExecutableContent` creates a fresh candidate version, clearing prior approval. `TaxContentRegistry.register` validates the schema and source bindings, then establishes only whether an executor supports that content. `FabricGovernanceStore.review` delegates to the existing `reviewCandidate` function. APPROVED binds reviewedContentHash and all reviewed raw/source hashes to the explicit human decision. Execution requires that exact hash, supported capability, status and review history; changing content does not preserve authority.

Original port references and research-code provenance are marked as such. Their hashes bind the retained local source projection or research snapshot, not a newly downloaded legal text. Existing Original verification is not automatically Lite execution approval.

## Determination and accounting handoff

The canonical record includes determinationId, engineVersion, status/reason/taxReady, scopeId/subjectId, taxType/jurisdiction, period/date, currency, inputFacts snapshot, applied rules and exact version/content hashes, taxableBase, rate, taxAmount, reliefs, withholding, treatyResult, evidenceRefs, domesticCandidate, calculationTrace and createdAt. It also retains request identity, execution snapshots and integrity/calculation hashes for replay. Monetary values use existing Money JSON, not floats.

Unresolved states have taxAmount null: MISSING_APPROVED_RULE, MISSING_REQUIRED_FACT, OUT_OF_PERIOD, REVIEW_REQUIRED, CONFLICT, UNSUPPORTED_TAX_TYPE. CALCULATED carries the governed amount. NOT_APPLICABLE carries no fabricated zero and does not mark taxReady true. An explicitly governed zero calculation is a different result. A domestic intermediate is explicitly DOMESTIC_CANDIDATE.

Historical replay is marked non-authoritative and creates no new record. Exact request-key replay returns the original pinned result. A changed fact revision/context with the same key is IDEMPOTENCY_CONFLICT. New law versions require a new request key for a new calculation. Storage is local/single-process with atomic rename and integrity verification, not a distributed multi-writer database.

`accountingReviewPlan` verifies integrity/scope/currency, blocks unresolved and TEST ONLY results, and otherwise returns ACCOUNT_MAPPING_REVIEW_REQUIRED. It never creates journals or posts GL. The existing PostingService remains the only allowed future posting target.

## Offline commands

List the reviewable catalog (creates only CANDIDATE state in the local data directory):

    npm run tax -- catalog
    npm run tax -- catalog --out=research/phase3-tax/catalog.json

Reproduce the honest coverage-gap cases and a clearly isolated TEST ONLY positive formula:

    npm run tax:demo

Build a candidate fact snapshot from a JSON dossier, then explicitly confirm its exact hash:

    npm run tax -- candidate-facts dossier.json --out=candidate-facts.json
    npm run tax -- confirm-facts candidate-facts.json "--actor=Reviewer Name" --snapshot-hash=<exact-snapshot-hash> --out=confirmed-facts.json

Human review of a concrete candidate is a separate local operation. Do this only after reviewing the content/evidence; the implementation itself does not issue this approval:

    npm run tax -- review <candidate-id> "--actor=Reviewer Name" --content-hash=<exact-content-hash> --source-hashes=<comma-separated-reviewed-hashes> "--reason=Review record reference"

Calculate and replay with explicit scoped files:

    npm run tax -- determine request.json confirmed-facts.json --out=determination.json
    npm run tax -- replay <determination-id> --scope=<organisation-id> --subject=<subject-id>

Default state directory is ignored `data/tax/`. Every command accepts `--state=<directory>`. No command browses the web, invokes a model or posts accounting entries. JSON inputs are bounded. The committed `test-only-*` files are demonstration data, not a reviewed real business dossier. Routine `npm test` performs no live API calls.
