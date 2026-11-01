# Install into BiG-M Lite

Target inspected: `hackathon/moroccan-expat-e2e`.

This adapter deliberately reuses the existing governed Phase 4 evidence chain and Universal Tax Engine.
It does **not** introduce a second CountryPack format.

## Copy

Copy:

- `src/indonesia2025Runtime.js` -> `src/tax/indonesia2025Runtime.js`
- `src/indonesia2025Examples.js` -> `src/tax/indonesia2025Examples.js`
- `test/indonesia-2025-runtime.test.js` -> `test/indonesia-2025-runtime.test.js`

No existing file has to be replaced for the acceptance test.

## Run

```powershell
node --test test/indonesia-2025-runtime.test.js
```

The test intentionally checks four things:

1. Existing hash-bound Indonesia candidates can be selected.
2. Before human review, the engine fails closed.
3. After exact-source-hash human approval, Article 17 executes through `UniversalTaxEngine`.
4. After exact-source-hash human approval, the 2025 individual UMKM rule executes through `UniversalTaxEngine`.

## Production boundary

Do **not** call `approveIndonesiaPack()` automatically from startup.

A UI / review workflow should:

1. display `reviewChecklist(registry)`;
2. show source URLs, content hash and every raw source hash;
3. require an identified human reviewer;
4. submit the exact source hashes reviewed;
5. then call `approveIndonesiaPack()`.

Muse may prepare the candidate and explain it.
Muse must never supply the HUMAN approval itself.

## Why this is a usable CountryPack

Execution path is:

`phase4 raw artifact -> normalized evidence -> governed candidate -> TaxContentRegistry -> HUMAN review -> UniversalTaxEngine -> determination`

The acceptance examples use the same engine and fact contracts as the application.
