# BiG-M Lite — Fondasi (Tahap 1–5)

Modular monolith sederhana untuk akuntansi + pajak multi-yurisdiksi.
Dibangun fondasi dulu: domain → country pack → integritas → satu alur nyata → adapter AI.

## Struktur

```
src/
  domain/        Money (BigInt, tanpa float), Organization, FinancialPeriod,
                 ChartOfAccounts, Transaction, SourceEvidence, Journal, Ledger,
                 AuditTrail (rantai hash), IdempotencyStore
  accounting/    PostingService (seimbang + idempoten + periode OPEN),
                 ReversalService (koreksi via jurnal baru, asli tak tersentuh)
  tax/           TaxEngine: evaluasi rule deklaratif; placeholder tak pernah final
  countrypack/   manifest + registry + validasi; packs/id = contoh kerja Indonesia
  ai/            AIProvider, MetaModelAdapter (key via env), validasi usulan AI
  app/           verticalSlice (input→klasifikasi→posting→ledger→laporan), report
  business/      SalesService (REVENUE), PurchaseService (EXPENSE) via pipeline fondasi
  import/        csvImporter (validasi ketat, anti-duplikasi, laporan baris gagal)
  dashboard/     ringkasan baca-saja: saldo, transaksi, total, status audit
test/            pengujian otomatis (node:test, tanpa dependensi)
```

## Kontrak antarmodul (ringkas)

- **Uang**: BigInt minor + kode ISO 4217. `fromMajor` hanya terima string desimal.
- **Jurnal**: satu mata uang, ≥2 baris, total debit == total kredit, finalize → frozen permanen.
- **Posting**: `idempotencyKey` wajib; replay kunci sama = receipt sama, tanpa posting ganda.
- **Periode**: posting hanya ke periode OPEN yang memuat tanggal transaksi.
- **Reversal**: jurnal baru bersisi terbalik + `reversalOf`; efek bersih nol.
- **Country Pack**: JSON murni; kunci `eval/code/require/...` ditolak; versi semver;
  pilih berdasar yurisdiksi + tanggal (versi tertinggi menang).
- **Pajak**: rule non-placeholder wajib `source` + aksi `rate|exempt`; placeholder →
  status `PLACEHOLDER`, amount null, dikecualikan dari total final.
- **AI**: output mentah wajib lewat `validateClassification`; tolak/gagal → fallback
  deterministik. Key hanya dari env (`BIGM_META_API_KEY`), tidak di repo.

## Tahap 7 — Aplikasi Web "Ledger Atelier"

SPA tanpa dependensi (`public/`) + backend Node http bawaan (`src/web/`).
Seluruh posting tetap lewat `PostingService`; frontend hanya menampilkan data.

```sh
node src/web/server.js        # http://localhost:3100  (BIGM_PORT=3100)
```

Fitur: Dashboard (saldo, aktivitas, grafik bulanan SVG), Sales, Purchase,
Accounting (jurnal/ledger/audit), Reports, CSV Import (pratinjau + laporan
gagal), Tax & CountryPack (placeholder eksplisit), Settings, tombol
**Muat data demo** (berlabel `[DEMO]`, bukan data nyata).

## Impor CSV & Dashboard (Tahap 6)

Format header: `type,id,orgId,date,jurisdiction,currency,description,amountMajor,counterparty,reference`
dengan `type` = `SALE|PURCHASE`. Baris gagal masuk `failures` (`{ row, id, error }`)
tanpa menghentikan baris lain; id duplikat (dalam file / sudah terposting) ditolak.
`getSummary()` + `renderDashboardText()` hanya membaca ledger/audit (read-only).

## Menjalankan

```sh
npm test
```

Tanpa dependensi; Node >= 20. Copy `.env.example` ke `.env` untuk konfigurasi Meta API
(lokal saja, tidak di-commit).

## Status jujur

- Framework + contoh kerja Indonesia: **lengkap dan teruji**.
- Tax Engine Indonesia: **framework saja** — seluruh aturan PPN/PPh masih
  `placeholder` tanpa sumber terverifikasi dan tidak menghasilkan kewajiban final.
- Berikutnya (Tahap 6): modul bisnis, dashboard, import CSV, optimasi terukur.
