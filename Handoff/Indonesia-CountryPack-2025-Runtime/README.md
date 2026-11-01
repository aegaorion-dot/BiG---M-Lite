# Indonesia CountryPack 2025 — BiG-M Lite Runtime Adapter

This is the **usable runtime layer**, not another tax engine.

It binds BiG-M Lite's existing Indonesia 2025 Phase 4 CountryPack candidates to an explicit human-review workflow and demonstrates execution through the existing `UniversalTaxEngine`.

## Runtime-supported 2025 subsets

- **Individual ordinary annual income tax** — Article 17 on independently reviewed PKP.
- **Individual UMKM monthly final income tax** — governed PP 55/2022 subset.
- **Existing company CIT candidate** remains available from the repository's `originalCompanyCandidate()` path.

Unsupported tax areas remain fail-closed instead of being guessed.

## Files

- `src/indonesia2025Runtime.js` — registration + review adapter
- `src/indonesia2025Examples.js` — confirmed-fact examples using the real tax fact contract
- `test/indonesia-2025-runtime.test.js` — runtime acceptance test
- `runtime-manifest.json` — explicit supported/unsupported coverage
- `INSTALL.md` — drop-in instructions
- `docs/BUILD-LOG.md` — operational research / architecture log

See `INSTALL.md`.
