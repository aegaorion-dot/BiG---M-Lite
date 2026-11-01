# Three-minute demo — AI-first intake at scale (Sakura workspace)

**Status of the recording:** this is the recording plan, not a finished video. The
existing `BiG-M-Lite-3-minute-demo.mp4` in this folder was captured against the
removed V1 interface and must be replaced. Automated screen recording is not
available in this environment (no `ffmpeg`, no browser video capture), so the
capture has to be done with a normal desktop recorder while this script is
followed. The earlier Nikos/Tokyo plan is kept as
[VIDEO-SCRIPT-NIKOS-TOKYO.md](VIDEO-SCRIPT-NIKOS-TOKYO.md).

Everything on screen is synthetic demo data. Every number below was produced by
the accounting and provisional-tax engines and read back from the workspace
store; nothing is computed by the narrator or by the model.

## What the audience must see

1. One product shell — no second app, no spreadsheet cleaning outside BiG-M Lite.
2. Muse discovering the schema of **four unmodified client CSVs** whose headers
   the product does not know (`posting_date`, `money_in_jpy`, …).
3. The mapping review card where the user (not the model) approves the mapping.
4. Deterministic validation: duplicate rows held back, rows needing correction
   listed, every posted journal balanced.
5. Reports and a provisional tax estimate read from the same journal set.

## Workspace to record

The recorded state is the Sakura acceptance store (26.7 MB, 4 documents,
5,074 candidates, 920 balanced journals):

```powershell
$env:BIGM_PORT='3125'
$env:BIGM_DATA_PATH="$env:USERPROFILE\.copilot\session-state\b190b7d4-818d-4164-8a0c-d9c07d9d1f9f\files\sakura\store-accept2\store.json"
node src/web/server.js
```

Open `http://127.0.0.1:3125/` at 1440×900. Record the browser window only.
Target **2 min 50 s**, hard cap 3 min.

Do **not** re-upload, re-analyse or re-post while recording. The workspace already
holds the end state; a second run would create extra Muse requests and extra
candidates that would not match the narration.

## Storyboard

| Time | Page / control | Action | On-screen proof |
|---|---|---|---|
| 0:00–0:10 | Home | Land on `/` | One shell, `Sakura Digital Studio`, `JP · JPY`, income `92.318.974 JP¥`, expenses `739.555 JP¥`, profit `91.579.419 JP¥` |
| 0:10–0:35 | Documents | Scroll the document list | The four original client files with unchanged names: `01_bank_statements_RAW.csv` (394 KB), `02_customer_supplier_invoices_RAW.csv` (261 KB), `03_receipts_expense_claims_RAW.csv` (210 KB), `04_payment_processor_RAW.csv` (17 KB) |
| 0:35–1:05 | Documents → bank statement | Open the bank file | Card **Spreadsheet import review**, `Mapping source: Muse`, `Source rows 3225`, `Rows ready 3150`, `Duplicate rows 75`, nine source columns mapped |
| 1:05–1:20 | Same card, receipts | Point at the corrected column | `03_receipts_expense_claims_RAW.csv`: the expense-amount column re-pointed by the user before approval |
| 1:20–1:35 | Same card, invoices | Open the invoice file | `02_…invoices_RAW.csv` still at review: 2,500 rows, mapping not approved — the honest "user decision still pending" state |
| 1:35–2:05 | Transactions | Show the queue, then **Post all ready rows** | 5,074 candidates: 920 posted, 1 confirmed, 2,453 ready, 1,700 needing review; review reasons visible (duplicates, internal transfers, refunds, owner use, missing supporting documents) |
| 2:05–2:30 | Reports | Open Reports | Monthly results July `31.275.403`, August `30.216.707`, September `30.087.309`, plus the combined period total |
| 2:30–2:55 | Tax readiness | Open Tax readiness | Status `PROVISIONAL_ESTIMATE`, amount `36.912.966 JP¥`, rule `JP_IT_BUS_39999K_UP_45PCT` at 45%, taxable base `90.999.419 JP¥`, basic deduction `580.000 JP¥`, two open assumptions, law status *candidate, not approved law* |
| 2:55–3:00 | Any page | Stop recording | Closing line only |

Optional 3-second frame if time allows: **Correct information** on the tax page
opening its fact editor (period, residency, income scope), without saving.

## Narration (verbatim, English only)

**0:00–0:10 — One interface, client-scale books.**
"One interface, one accounting engine. This workspace belongs to Sakura Digital
Studio: September-end income of 92,318,974 yen, 739,555 yen of expenses, and 920
posted journals behind those numbers."

**0:10–0:35 — The client files arrive untouched.**
"These four spreadsheets are the client's originals. The headers are their own:
posting date, money in yen, tax category, source id. BiG-M Lite was not told what
those columns mean, and nothing was reformatted before upload."

**0:35–1:05 — Muse discovers the schema, the engine checks it.**
"Muse reads the header and a bounded sample of rows and proposes a mapping to the
internal journal fields. The engine then validates every row deterministically:
dates, amounts, currency, direction of money, and source identifiers. 3,225 bank
rows in, 3,150 ready, 75 recognised as duplicate rows."

**1:05–1:35 — A human approves the mapping.**
"The mapping is a proposal, not an action. Here the user corrected one receipt
column, then approved. Only approved mappings create transactions. The invoice
file is still waiting for a decision, and the product says so instead of guessing."

**1:35–2:05 — Posting is idempotent.**
"5,074 candidates come out of this intake. 920 are posted; the rest stay visible:
duplicates, internal transfers, refunds, owner use, and rows missing supporting
documents. Every posted journal is balanced, and a candidate can never post twice."

**2:05–2:30 — Reports from the ledger, not from the spreadsheet.**
"Reports are computed from posted journals. July, 31.3 million; August, 30.2
million; September, 30.1 million — plus the combined quarter."

**2:30–2:55 — Tax readiness, with its own limits printed.**
"Tax readiness evaluates a provisional Japanese income tax and says so: a
provisional estimate of 36,912,966 yen on a taxable base of 90,999,419, using the
45 percent bracket. The two remaining assumptions and the fact that the rule is a
candidate, not approved law, are shown on the same screen."

**2:55–3:00 — Close.**
"Interpretation is proposed by Muse, calculated by the engine, and approved by a
person."

Total spoken words ≈ 370, which fits three minutes with short pauses.

## Recording checklist

- [ ] Server started on port 3125 with the store above; `/api/intake` responds.
- [ ] Browser at 1440×900, zoom 100%, bookmarks bar hidden.
- [ ] Home shows the three Sakura figures before recording starts.
- [ ] Documents list shows all four original filenames.
- [ ] Bank card shows `Mapping source: Muse` and 3,225 / 3,150 / 75.
- [ ] Reports and Tax readiness open in under two seconds each (no spinner on camera).
- [ ] Narration recorded separately and aligned to the timings above.
- [ ] Subtitle/caption file, if produced, is English only.
- [ ] Final file ≤ 3:00 and under the event's size limit.

## Fallback lines

| If this happens | Say this instead |
|---|---|
| Muse badge shows a heuristic source on one file | "For this file the deterministic heuristic proposed the mapping; Muse is used when the headers are unknown." |
| Tax page shows `INFORMATION_REQUIRED` | "The engine refuses to estimate until the missing facts are supplied — that is the intended behaviour." |
| The queue renders slowly | Skip straight to **Post all ready rows**; the posted count is the proof. |
| Reports has fewer months than expected | Show the combined total and the September row only. |

## Evidence behind the numbers

- Demo end-to-end evidence: `evidence/demo-end-to-end-20261101.json` in the
  session workspace (`files/sakura/evidence/`).
- Schema acceptance run: `evidence/acceptance-schema-discovery.json`.
- Unit suites covering this flow: `test/document-intake.test.js` (41),
  `test/universal-intake.test.js` (28), `test/provisional-jp.test.js` (6).
- The Nikos regression check (17 journals, `balanced: true`, provisional
  434,773 yen) is recorded in [SUBMISSION.md](SUBMISSION.md).
