# Automated final demo

Use Node 20.19+ and npm ci. Routine demo verification uses mocks and has no paid model calls.

The product serves one interface at `/`; `/v2/` redirects there and `/legacy/` returns 404.

1. Run npm run test:moroccan:browser. It creates a new isolated synthetic workspace and exercises the real product DOM and HTTP contracts from Darija onboarding through supported tax calculation, explanation, restart and replay. Installed Chrome/Edge is required.
2. Open research/moroccan-expat/deterministic-result.json and reruns.json. Confirm the final run is successful and taxYear is 2025. The result must show IDR 750,000 netTaxPayable and 129 journals.
3. To tour the saved workspace, set BIGM_DATA_PATH to data/moroccan/run-N/store.json, where N is the successful run number. Set BIGM_MUSE_ENABLED=0 and run npm start. Open http://127.0.0.1:3100/?lang=ar-MA.
4. Visit Tax. Inspect facts, 2025 period, PP55 rule, official source quote/hash, formula and deterministic trace. Remaining personal scopes stay REVIEW_REQUIRED.
5. Visit Reports, Documents and Assistant. Card repayment does not add expense. Personal spending and installments remain separate from business costs. The offline assistant is labeled deterministic; the separately saved tax-live-explanation.json is the actual live Muse evidence.

To tour the Nikos workspace with its live Muse transcript instead:

```powershell
$env:BIGM_PORT='3110'
$env:BIGM_DATA_PATH="$env:TEMP\bigm-nikos-live-202610312117\store.json"
node src/web/server.js
```

Open http://127.0.0.1:3110/ and use the sidebar: Business setup, Documents, Transactions, Reports, Tax readiness, BiG-M Assistant. The workspace holds 17 balanced journals and a live Muse answer in Greek. Do not re-run onboarding or re-upload the documents during a rehearsal; that spends Muse budget and creates duplicate state.

The full automated journey is the demo automation. The MP4 currently in this folder was captured against the removed V1 interface and must be re-recorded from the single UI using [VIDEO-SCRIPT.md](VIDEO-SCRIPT.md); architecture slide text is explanatory presentation material, not a product screen.

No need to regenerate law, rerun regulatory research, train a model or make a paid call for submission rehearsal. Do not rerun moroccan-tax-explanation.js --live: the durable one-call check is already complete.
