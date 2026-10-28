# Phase 4 review workflow

All normal commands are offline and never approve content automatically:

~~~powershell
npm test
npm run packs:demo
node scripts/tax-engine.js verify-sources
node scripts/tax-engine.js catalog --out=data/tax/catalog.json
node scripts/tax-engine.js inspect <candidate-id> --out=data/tax/review.json
~~~

SOURCE_VERIFIED proves official-origin bytes/citation integrity; STRUCTURE_VALIDATED proves schema/DSL; READY_FOR_REVIEW is unapproved. APPROVED_EXECUTABLE is computed from current governance after explicit human review.

Review actual legal force, subject, dates, exclusions and every source hash. An undated table does not resolve current law automatically. Changed rules/evidence require a new immutable pack version. Do not overwrite a registered packId/version or delete a store to hide a version conflict.

Only after actual human review:

~~~powershell
node scripts/tax-engine.js review <candidate-id> "--actor=Actual reviewer name" "--content-hash=<exact inspected hash>" "--source-hashes=<all distinct hashes,comma-separated>" "--reason=Concrete scope and temporal review decision"
~~~

This trusted local admin operation is not an identity provider. Never give it to runtime AI or invent a reviewer. No real legal approval was performed in this delivery. Incomplete treaty/source dossiers stay non-executable after source review.

Create a dossier with scopeId, subjectId, profile revision, period, economicDate, currency and typed/evidenced facts. Keep legal subject, business, owner and capacity distinct.

~~~powershell
node scripts/tax-engine.js candidate-facts dossier.json --out=data/tax/facts-candidate.json
node scripts/tax-engine.js questions request.json data/tax/facts-candidate.json --out=data/tax/questions.json
~~~

Ask returned missing questions only. Unknown residence remains missing; nationality/customer/bank do not establish it. Questions are candidate-only previews, including unapproved rules. Research VAT/credit cannot create an amount rule.

After independent human review of exact facts and requested period:

~~~powershell
node scripts/tax-engine.js confirm-facts data/tax/facts-candidate.json "--actor=Actual fact reviewer" "--snapshot-hash=<exact hash>" --out=data/tax/facts-confirmed.json
node scripts/tax-engine.js determine request.json data/tax/facts-confirmed.json --out=data/tax/result.json
node scripts/tax-engine.js replay <determination-id> --scope=<scope-id> --subject=<subject-id>
~~~

Changed inputs/new calculations need a new requestKey. Existing scoped keys pin originals; changed inputs give IDEMPOTENCY_CONFLICT. Replay uses historical snapshots.

Web-store library: beginTaxReview(request), answerTaxReview({answers,userText}), taxReadiness(), proposeTaxReview(). Dynamic requirements enter the existing semantic schema; answers remain candidates. planQuestion(state,lang,{taxReadiness}) uses the same planner. No new frontend or approval HTTP route. Tax review never gates bookkeeping. Proposals do not confer readiness; corrections/governance changes stale them. No determination posts directly to accounting.

## Explicit source research

~~~powershell
npm run packs:probe -- --live --id=<comma-separated target IDs>
~~~

Targets: research/phase4-packs/targets.json. Existing registry, 3 workers, 10 MiB cap, 20-second timeout. Logs failures, rejects unregistered redirects/test contexts, no retry loop.

Offline rebuild using optional pypdf==6.12.2 and PyMuPDF==1.26.5 under ignored .tools/pdf:

~~~powershell
& 'C:\Users\EGA TARUNA\AppData\Local\Programs\Python\Python313\python.exe' scripts/phase4-extract-pdfs.py
node scripts/phase4-normalize.js
& 'C:\Users\EGA TARUNA\AppData\Local\Programs\Python\Python313\python.exe' scripts/phase4-render-previews.py
npm run packs:build
node scripts/phase4-acquisition-report.js
npm run packs:demo
~~~

Unchanged inputs compile deterministically. New captures/editorial changes may need new versions before registration. Raw blobs/Original snapshots preserve bytes; extraction JSON uses LF. PDF previews are read-only visual QA, not OCR or legal approval. Python/PDF packages are research tools, not runtime dependencies.
