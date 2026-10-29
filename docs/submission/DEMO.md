# Automated final demo

Use Node 20.19+ and npm ci. Routine demo verification uses mocks and has no paid model calls.

1. Run npm run test:moroccan:browser. It creates a new isolated synthetic workspace and exercises the real product DOM and HTTP contracts from Darija onboarding through supported tax calculation, explanation, restart and replay. Installed Chrome/Edge is required.
2. Open research/moroccan-expat/deterministic-result.json and reruns.json. Confirm the final run is successful and taxYear is 2025. The result must show IDR 750,000 netTaxPayable and 129 journals.
3. To tour the saved workspace, set BIGM_DATA_PATH to data/moroccan/run-N/store.json, where N is the successful run number. Set BIGM_MUSE_ENABLED=0 and run npm start. Open http://127.0.0.1:3100/?lang=ar-MA.
4. Visit Tax. Inspect facts, 2025 period, PP55 rule, official source quote/hash, formula and deterministic trace. Remaining personal scopes stay REVIEW_REQUIRED.
5. Visit Reports, Documents and Assistant. Card repayment does not add expense. Personal spending and installments remain separate from business costs. The offline assistant is labeled deterministic; the separately saved tax-live-explanation.json is the actual live Muse evidence.

The full automated journey is the demo automation. The MP4 is an edited narrated walkthrough using actual captured product screenshots, not a continuous screen recording or a new live model session. Architecture slide text is explanatory presentation material, not a product screen.

No need to regenerate law, rerun regulatory research, train a model or make a paid call for submission rehearsal. Do not rerun moroccan-tax-explanation.js --live: the durable one-call check is already complete.
