# Muse-driven configuration architecture

This is the permanent product architecture for configuring BiG-M Lite for any
user, jurisdiction, currency and language. It is not a demo scenario and it
contains no jurisdiction-specific shortcut.

```
User (business facts + material confirmation)
  -> Meta Muse (interview, research, interpretation, configuration intelligence)
  -> Country Pack Fabric (structured legal knowledge + provenance)
  -> One Engine (deterministic accounting and tax calculation)
```

The four responsibilities never collapse into each other:

| Layer | Owns | Never does |
| --- | --- | --- |
| Muse | profiling, question choice, bounded regulatory research, interpretation, configuration proposals | approve law, invent rates or amounts, post entries |
| Fabric | candidate content, evidence bindings, provenance, human review history | execute or calculate |
| One Engine | validation and deterministic accounting/tax execution from governed data | choose legal meaning |
| User | business facts and material confirmations | research tax rules or choose technical settings |

## Runtime path

`src/configuration/` is the integration seam:

1. **`requirements.js`** derives the configuration surface from the confirmed
   profile: subject type, jurisdictions, currencies, period, business activity
   and cross-border facts. Every requirement is classified as one of
   `GOVERNED_EXECUTABLE`, `GOVERNANCE_REVIEW_REQUIRED`, `OUT_OF_PERIOD`,
   `RESEARCH_REQUIRED`, `RESEARCH_UNSUPPORTED` or `USER_FACT_REQUIRED`.
   The taxonomy in `taxonomy.js` names questions only; it contains no rate,
   threshold or deadline. A profile without a functional currency keeps English
   as the fallback language and asks for the currency instead of guessing.
2. **`research.js`** converts the open requirements into bounded research work
   orders through the existing `buildResearchBrief` / `createResearchNeed`
   contracts. Jurisdictions without a registered official source stay explicit
   `RESEARCH_UNSUPPORTED` items; they are never silently dropped and never
   filled from model memory. Local terminology and authority guidance come from
   `src/global/jurisdiction-metadata.json`, not from code branches.
3. **`service.js` → `runResearch`** executes each work order with the existing
   procedural `RegulatoryResearchWorker` and the existing `ResearchRetriever`
   (official domains only, exact anchored quotations, bounded pages/bytes/time).
   Muse is allowed to search, retrieve, read, refine, backtrack and propose.
   The orchestrator only executes tools and validates output. Research is
   scheduled automatically after a workspace is activated when open requirements
   exist, and can be triggered explicitly at any time. Set
   `BIGM_CONFIGURATION_AUTO_RESEARCH=0` to require an explicit trigger.
4. **`candidates.js`** validates Muse output deterministically: every pack and
   rule must bind exact anchored evidence that was actually read, must match the
   researched jurisdiction, and must pass `validateCountryPack`. Valid content is
   registered **candidate-only**. Approval is a separate human action with the
   exact reviewed content hash.
5. **`estimates.js`** calculates from posted financial records with the One
   Engine. Legal classification facts come from the confirmed profile; monetary
   facts are derived only from recorded accounting aggregates through an explicit
   alias table. Posted records stay authoritative: an externally supplied money
   fact never overrides a mapped accounting aggregate. Anything unmapped,
   unconfirmed or out of period is reported as an unresolved item with the
   required fact names - never approximated.
6. **`service.js`** also builds a hash-bound configuration proposal, records
   human confirmation of the exact configuration, and exposes estimate
   confirmations so that strict processing can re-run with human-reviewed facts.

## Configuration lifecycle

```
empty configuration, English fallback
  -> natural Muse interview produces profile candidates
  -> requirements: what must be configured and what is already governed
  -> research work orders (bounded) for missing law
  -> evidence-bound CountryPack candidates (candidate-only)
  -> human review of exact source hashes (approval), or explicit unresolved state
  -> engine executes with approved rules and confirmed facts
  -> posted transactions produce estimates with base, rate, amount, rule and source
```

Research never blocks bookkeeping. The same run that cannot resolve VAT still
preserves the approved income-tax candidate; the unresolved VAT requirement stays
visible with its reason.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/configuration` | configuration profile, plans, research state, candidates, proposal, estimates |
| POST | `/api/configuration/research` | run bounded Muse research for the open requirements |
| GET | `/api/configuration/research/evidence` | retrieved official sources, read passages and unresolved gaps |
| POST | `/api/configuration/propose` | rebuild the current hash-bound proposal |
| POST | `/api/configuration/confirm` | human confirmation of the exact proposal hash |
| POST | `/api/configuration/candidate/review` | human approval/rejection of exact governed content |
| GET | `/api/tax/estimates` | last prepared/calculated estimate view |
| POST | `/api/tax/estimates/refresh` | recalculate from current posted records |
| POST | `/api/tax/estimates/confirm` | confirm one exact estimate fact snapshot |

`GET /api/product` includes a `configuration` summary so the UI can show what is
governed, what needs research and what still needs a human decision.

## Explicit non-goals

- No country branch, rate literal or threshold appears in `src/configuration/`.
- DeepSeek is not used for tax research; Meta Muse Spark remains the research
  intelligence.
- Muse cannot approve its own content, supply a tax amount, or mutate confirmed
  facts.
- A generated configuration never becomes authoritative filing advice; estimates
  are labelled as estimates and contain their legal sources.
