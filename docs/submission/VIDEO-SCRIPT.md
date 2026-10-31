# Three-minute demo — single UI (Nikos workspace)

**Status of the recording:** the current `BiG-M-Lite-3-minute-demo.mp4` in this folder was captured against the removed V1 interface and must be replaced. Automated screen recording was unavailable in this environment (no ffmpeg; browser video capture was not enabled), so this file is the recording plan: a scene-by-scene storyboard plus verbatim narration. The screenshots in [screenshots-single-ui](screenshots-single-ui) are real captures of the running app at `http://127.0.0.1:3110/` taken 2026-11-01.

Everything here is synthetic demo data. Nothing is calculated by the narrator or by the model: every amount below was produced by the accounting/tax engines and read back from the product.

> `narration-01.txt` … `narration-06.txt` in this folder belong to the previous Youssef recording (now kept as `VIDEO-SCRIPT-YOUSSEF-2025.md`). Use the narration below for the new single-UI clip.

## Recording setup

1. Start the workspace that holds the verified state:

   ```powershell
   $env:BIGM_PORT='3110'
   $env:BIGM_DATA_PATH="$env:TEMP\bigm-nikos-live-202610312117\store.json"
   node src/web/server.js
   ```

2. Open `http://127.0.0.1:3110/` at 1440×900 (or 1280×800).
3. Record the browser window only. Target **2 min 50 s**, hard cap 3 min.
4. Do **not** re-run onboarding, re-upload documents or re-post transactions while recording: the workspace already holds the verified end state, and a second run creates new Muse cost.
5. If a live Muse call is wanted for scene 2, expect one request and ~3–6 s. The saved evidence already proves it (see "Muse evidence").

## Storyboard

| Time | Screen (screenshot) | Action | On-screen proof |
|---|---|---|---|
| 0:00–0:15 | [01-home.png](screenshots-single-ui/01-home.png) | Land on `/` | One product shell, `JP · JPY`, Total income 5.627.290 JP¥, Expenses 780.632 JP¥, Profit 4.846.658 JP¥, "From posted ledger activity"; Estimated tax says *No validated tax amount is available* |
| 0:15–0:55 | [02-setup-understood.png](screenshots-single-ui/02-setup-understood.png) → [03-setup-configuration.png](screenshots-single-ui/03-setup-configuration.png) | Click **Business setup**; scroll to *Configuration to approve* | "What BiG-M understood": freelancer, Greek role text, JPY, work location JP, nationality GR, Νίκος Παπαδόπουλος. Configuration: period 2026-01-01 → 2026-12-31, modules `accounting, import, sales, purchase`, button **Approve and activate** |
| 0:55–1:10 | [04-documents.png](screenshots-single-ui/04-documents.png) | Click **Documents** | Two synthetic sources (`incomes-2026.txt`, `expenses-2026.txt`) at stage **Posted**; "Items needing attention" empty |
| 1:10–1:25 | [05-transactions.png](screenshots-single-ui/05-transactions.png) | Click **Transactions** | Ledger rows with original USD/EUR amounts and recorded JPY conversions |
| 1:25–1:55 | [06-reports.png](screenshots-single-ui/06-reports.png) | Click **Reports** | Ten monthly rows Jan–Oct 2026; Sep 462.210 / 63.340 and Oct 355.080 / 53.292 show FX conversion; totals match Home exactly |
| 1:55–2:25 | [07-tax-readiness.png](screenshots-single-ui/07-tax-readiness.png) | Click **Tax readiness** | Status *Review required*, no final tax amount, three blockers: `TAX_SCOPE_REQUIRED`, `NO_APPROVED_EXECUTABLE_RULE`, `JURISDICTION_REQUIRES_REVIEW`; page states this is not a filing |
| 2:25–2:50 | [08-assistant.png](screenshots-single-ui/08-assistant.png) | Click **BiG-M Assistant** (the Greek answer is already in the session transcript) | Question in Greek, answer: Revenue 5.627.290 JPY · Expenses 780.632 JPY · Net bookkeeping income 4.846.658 JPY, plus the caveat that final tax treatment requires the governed tax review. Footer: **Muse connection available** |

Optional closing frame: [09-settings.png](screenshots-single-ui/09-settings.png) to show language/currency separation (UI language el-GR, functional currency JPY).

## Narration (verbatim)

**0:00–0:15 — One workspace, real numbers.**
"This is BiG-M Lite, and it has exactly one interface. Nikos is a freelance software consultant in Tokyo who works in Greek. The three numbers on this screen are not mock-ups: 5,627,290 yen of income, 780,632 yen of expenses and 4,846,658 yen of profit were posted by the accounting engine and read back from the ledger."

**0:15–0:55 — Muse profiles, the user only talks.**
"Nikos described his business in his own words — in Greek. Muse Spark read that, extracted candidate facts, and BiG-M validated every one against its own rules. Here is what the product understood: freelancer, bookkeeping currency Japanese yen, work location Japan, nationality Greece. The configuration on the right is what Nikos approves — the accounting period and the four modules that revenue and expense posting actually require. Nothing activates until he presses approve, and no tax rule is approved here."

**0:55–1:10 — Documents become reviewed proposals.**
"Two synthetic documents: seven incomes, ten expenses. Muse read both and proposed seventeen candidates. Each was reviewed in the app — including correcting the settlement status — and posted. Both sources now show Posted, and nothing is left needing attention."

**1:10–1:25 — Foreign currency is explicit, not guessed.**
"Four of those transactions were in US dollars and euros. BiG-M refused to post them without a dated FX quote. Each quote was requested, shown with its provider and date, and approved by a human before the journal was written."

**1:25–1:55 — One engine, one ledger, one report.**
"The reports page is a read-only view of those seventeen balanced journals. Every month ties to the home screen: September carries 462,210 yen of income from a 3,000-dollar invoice at 154.07, October carries 355,080 yen from a 2,000-euro invoice at 177.54. There is no second calculation path."

**1:55–2:25 — Tax stays honest.**
"Tax readiness for 2026 says review required. There is no final tax number, because there is no approved executable rule and the tax scope has not been confirmed. The product shows the three specific blockers instead of inventing an estimate. That is the guardrail: Muse can explain, it cannot approve law or post a number."

**2:25–2:50 — The AI explains, the engine computes.**
"Asked in Greek how much income and expense the business has, Muse selected the grounded facts and answered with the same figures the ledger produced — then added that final tax treatment still requires the governed review. Muse never calculates: it reads the engine's numbers and explains them. That is BiG-M Lite."

## Muse evidence (actual, this workspace)

- Model `muse-spark-1.3`, provider `meta`, Muse enabled.
- Eight recorded Muse requests in this workspace, all successful: 3 business-profiling, 2 document-understanding, 2 contextual-assistant, 1 pack-driven-question.
- Provider cost status: **not reported** by the API; no estimate is claimed.
- Assistant text is rendered from fact ids selected by Muse; every amount comes from `/api/summary` and the ledger.

## What the video must not claim

- No final or payable tax amount for Nikos; tax readiness is `REVIEW_REQUIRED` by design.
- No real customer data: all records are synthetic.
- Not one continuous live Muse session; the assistant exchange is a recorded real response.
- No OCR of photographed documents in this run — the two inputs are plain-text statements.
