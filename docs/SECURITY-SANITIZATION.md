# Security history sanitization

This is an explicitly authorized rewrite of the inherited Phase 2 research URL across Phase 2-7 history. The external Google Maps value was not a BiG-M credential. It was not printed, tested or used in any request.

## Historical correction

Affected original paths:

- `research/country-pack-fabric/access-link-discovery.json`
- `research/country-pack-fabric/access-matrix.json`

The URL is now `https://maps.googleapis.com/maps/api/js?libraries=places`. Its object retains the original REJECTED_SOURCE classification or LINK_OBSERVED_NOT_REQUESTED status, and adds `credentialQueryParameterRedacted: true`, `redactionReason: THIRD_PARTY_CREDENTIAL_SHAPED_QUERY_PARAMETER`, and the one-way `originalUrlSha256`. No original value or reversible encoding is retained.

Only those two file contents changed in each rewritten historical checkpoint. Commit messages, dates, order/topology and all unrelated contents were verified against the originals. Rewritten public checkpoint author/committer identity uses the explicitly requested BiG-M Lite Hackathon name and established GitHub noreply address. Main was excluded and unchanged. Fourteen affected local refs, including inherited backup/tool snapshots, were moved atomically so they would not retain the original blobs.

[Complete original-to-sanitized-equivalent mapping](../research/security-sanitization/checkpoint-map.json):

| Phase | Original checkpoint | Sanitized equivalent |
|---|---|---|
| 2 | 920b2c0e40e545960b8ea1b9f279e420efc9b1ca | 729e6317c627d0c152573fec5131733fc34506f2 |
| 3 | 0bf99a61a0f86aad80822fea532a9cb1ef5743ad | 9b6ef031f231de3c8cdfcf62f79bfc8848dbf0de |
| 4 | 91669534a1c1e94bfeea1ab57e5063ca31493fc0 | 4bd0096d2395f0dc81b0dbbfca578bf38967fd69 |
| 5 | 98d229ecab34cd0e87d16615178a31dac681cdff | d5672109b4ba6010bc62473bfe0ca36e4e3f79d7 |
| 6 | ecae4066783f78489c6fb1e3cebab2d0b56d8396 | a850eb107cd41ecf17dab865a3bfe4725fc351c8 |
| 7 | 0cd37232ed88ec00e7519ad934c20d9ca5697dde | 110bbc8b253fc126410e7698ca65dd03c0ba8447 |

Phase 7 additionally receives the follow-up security-hardening commit containing the guard/tests/report. The final published branch head is therefore newer than its sanitized historical equivalent above. The final verification report records that exact head.

One ignored US Courts raw HTML capture also contained the value. Its sanitized bytes are stored at their new SHA-256 content address. Local artifact metadata and its single observations.jsonl row were updated, retaining the original content hash as one-way provenance. The old plaintext capture was removed. No other observation row or raw fixture was changed.

## Recurrence prevention

`src/fabric/researchSanitizer.js` provides deterministic URL, record, text and raw-byte sanitization. It removes sensitive query values for key, api_key, apikey, token, access_token, secret, client_secret and additional session/auth names; ordinary parameters are preserved. URL objects retain redaction metadata and a one-way original URL digest. Userinfo and secret URL fragments are removed. JSON credential fields, bearer tokens, recognized provider shapes and private-key blocks are redacted.

RawArtifactStore applies this before persistence and hashes the sanitized bytes truthfully. Changed artifacts retain `securityRedaction.originalContentSha256`. Binary material needing credential redaction fails closed for offline treatment. Credential-bearing source or redirect URLs are rejected before a network request. Research probe/discovery/report writers sanitize their records before writing. Security overrides raw-source fidelity for credential-shaped material.

`npm run security:scan` scans reachable Git blobs and commit metadata across all local refs. It compares the configured Meta credential privately in memory, checks Google/provider/private-key/bearer/literal/query patterns, and detects tracked private environment files. Output contains categories/locations/hashes only, never matched values. Reviewed synthetic fixture strings are distinguished from unresolved credentials. The command performs no network or model calls.

## Verification and publication

The rewritten historical Phase 7 checkpoint passed the unchanged full 347-test baseline. The final full suite passed 359 tests, zero failures, including twelve sanitizer/security tests. No paid Meta calls were made.

Before publication, scan all reachable history and current files, confirm .env remains ignored/untracked and confirm public metadata. For each already-published Phase 2-4 branch, fetch, require the exact captured old head and push only with an explicit force-with-lease. Stop any branch with an unexpected remote head. Phase 5-7 use ordinary pushes with upstream tracking. Verify each final remote SHA equals its local sanitized branch head; keep main absent remotely and unchanged locally. Finally remove obsolete local reflog/object retention so the original blobs are not retained in the local repository.

GitHub can retain unreachable objects/caches outside published branch reachability; branch verification establishes sanitized reachable history, not deletion of provider-managed caches. No unrelated branch, legal content, engine, report amount or runtime semantic behavior was changed by this security operation.
