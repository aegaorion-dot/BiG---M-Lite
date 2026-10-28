# Implementasi BiG-M Lite — 28 Oktober 2026

Branch lokal: codex/universal-profiling-country-packs. Tidak ada push.

## Pekerjaan dan sumber yang dipertahankan

HEAD awal Lite: d6ce3b0c586761cd9221c613c569fdc2644c504a. Dua perubahan lokal awal disimpan utuh sebagai docs/reference/preexisting-muse-work.patch. Commit lama dan branch main tidak di-reset.

Original dibaca langsung pada commit 4d0da9a6acafc24f7db3778f66b4df6d7cf4764c. Pemetaan sepuluh berkas sumber dan lima belas berkas tes referensi tersedia di ORIGINAL-PORT.md.

Metadata ID/SG/US/AU/GB diadaptasi dari jurisdiction.ts. Dua ekspor Indonesia diproyeksikan menjadi JSON tanpa mengganti kode pack, versi, subject, tax type, window, sumber, formula atau rule identity:
- ID_CIT_REFERENCE @2: COMPANY/CIT, 2025, 18 rules.
- ID_CIT_DETERMINATION_2025 @2: COMPANY/CIT, 2025, 3 rules.

Keduanya tetap konten referensi substantif, bukan executable pack dalam Lite. M3/M5 tidak dipindahkan. Status VERIFIED_AUTHORITATIVE berasal dari Original; port ini tidak mengklaim verifikasi hukum baru. SG/US/AU/GB tidak memiliki pack substantif executable di registry produksi. Tidak ada aturan Indonesia 2026 yang dibuat.

## Berkas implementasi

Baru:
- src/global/jurisdiction-metadata.json
- src/countrypack/content/indonesia-cit-reference-2025.json
- src/countrypack/content/indonesia-cit-determination-2025.json
- src/countrypack/resolver.js
- src/onboarding/canonical.js
- src/web/environment.js
- scripts/test.js, scripts/test-network-guard.cjs, scripts/meta-smoke.js
- test/country-pack-lite.test.js, test/http-onboarding.test.js, test/web-ui-contract.test.js, test/workspace-fixture.js
- Dokumentasi provenance dan laporan ini.

Diubah:
- src/onboarding/{slots,evidence,profiler,jurisdictions,conversation,configurator,readiness}.js
- src/web/{store,api,server}.js
- src/ai/aiAdapter.js
- src/global/{jurisdictions,currencies}.js
- src/i18n/strings.js
- public/app.js, styles.css, i18n/en.json, i18n/id.json
- Tes onboarding/adapter/web/foundation yang sebelumnya bergantung pada perilaku keliru.
- README.md, package.json, .env.example, .gitignore.

Berkas Money, journal, ledger, PostingService, reversal, business service, TaxEngine dan verticalSlice tidak diubah.

## Perilaku akhir

profileState adalah satu state kandidat. Setiap fakta menyimpan nilai, peran, source, quote, confidence dan status. Quote harus cocok dengan pesan; tipe, ISO subset dan capability diperiksa. AI hanya menghasilkan kandidat. Perubahan relevan menaikkan revision; koreksi mengganti nilai, kontradiksi meminta klarifikasi.

Sembilan basis yurisdiksi terpisah dari nationality dan bahasa. Currency functional, transaksi, reporting dan pembelian asing tidak diratakan. FX source tidak dikarang.

Resolver memeriksa basis, subject, tax type, tanggal evaluasi dan seluruh periode, review sumber, consumer capability, versi, retirement/succession dan konflik komposisi. Approval sumber berbeda dari pemilihan pack. Pemilihan material membutuhkan packIds eksplisit, terikat profileRevision/proposalHash/pack hash/periode/actor/timestamp. Membuka pembukuan tidak menyetujui aturan pajak.

Proposal, validasi dan konfirmasi harus menunjuk revisi/hash yang sama. Tidak ada auto-confirm. applyActiveConfiguration membangun runtime immutable baru pada aktivasi dan restore. Kegagalan apply/save tidak dilaporkan sebagai sukses. Posting sebelum aktif ditolak. Mata uang/jurisdiksi historis dan periode overlap tidak dimigrasikan diam-diam.

Snapshot menyimpan state kandidat, revision, evaluasi/review pack, proposal, validation, confirmation, active profile snapshot, history/idempotency aktivasi, jurnal/audit/idempotency transaksi dan status periode. Replay setelah restart tidak membuat audit aktivasi baru; CLOSED tetap tertutup. Data v1 mempertahankan jurnal/periode dan meminta review ulang.

Frontend memakai response.workspace, memuat kamus sebelum sapaan, menampilkan provider/fallback, melanjutkan pending question setelah refresh, dan membuka dashboard setelah aktivasi/restart. Form transaksi mengikuti scope/currency/jurisdiksi aktif. Formatting memakai string/BigInt dan metadata minor units. Laporan tidak menggabungkan currency tanpa FX. Kewajiban pajak final dikembalikan null, bukan nol final.

## Verifikasi

Regresi penuh: npm test — 137 tests, 24 suites, seluruhnya lulus.

Cakupan penting:
- Schema/evidence/provenance dan penolakan self-approval AI.
- Negara pelanggan/rekening/lokasi kerja/registrasi/nationality terpisah.
- Pembayaran USD, books IDR, pembelian SGD dan koreksi.
- Subject/tax/date/window incompatibility, missing pack, review, retirement, version overlap dan komposisi.
- Workspace readiness terpisah dari tax readiness.
- Validasi/approval stale, perubahan nested hash, replay aktivasi dan runtime failure rollback.
- Save failure rollback untuk aktivasi dan posting.
- Persistensi mid-onboarding, setelah confirm, setelah activation, pending edits dan CLOSED period.
- Empat perjalanan melalui server HTTP nyata: expat Bali, freelancer dengan US clients, UMKM Bandung, dan company SG yang beroperasi di Bali.
- HTTP describe → propose → validate → explicit confirm → activate → post → summary/monthly.
- Stop/start proses server Node terpisah, lalu pengecekan runtime/history/replay.
- Kode SPA aktual dieksekusi dengan DOM host minimal: sapaan, editor currency, klik konfirmasi, navigasi, reload dan submit transaksi SGD.
- Nilai SGD 10.50 menghasilkan 1050 minor pada jurnal, summary dan monthly.
- Foundation accounting regression tetap berjalan.

Pemeriksaan syntax Node lulus. Pemeriksaan whitespace source mengecualikan patch referensi awal, karena spasi konteks patch dipertahankan sebagai bukti asli.

## Meta dan batas verifikasi

Adapter sudah membaca output[].content[].output_text, menolak incomplete/refusal/JSON invalid dan menerapkan validasi kandidat. Prompt menyertakan schema dan capability registry. Per turn tersedia providerConfigured/providerUsed/model/fallbackReason.

Tes rutin menghapus credentials, memblokir external fetch dan menolak automatic live provider dalam Node test context. Satu smoke live opt-in tersedia melalui npm run smoke:meta dengan BIGM_LIVE_SMOKE=1, maksimum satu request tanpa retry.

Endpoint/key/model live tidak tersedia dalam lingkungan implementasi. Smoke tanpa opt-in menghasilkan SKIPPED; tidak ada request Meta berbayar. Keberhasilan pemahaman Muse Spark live belum dapat dinyatakan sampai smoke satu request dijalankan dengan konfigurasi akun yang valid.

Browser/native computer surface juga tidak tersedia (inventory kosong; native pipe unavailable). Tes SPA di atas membuktikan kontrak interaksi, bukan layout visual, ukuran viewport, accessibility atau browser compatibility. Verifikasi visual desktop/mobile masih perlu dilakukan pada browser terhubung.

Implementasi pembukuan dan kontrak HTTP/UI siap diperiksa secara lokal. Demo dengan klaim AI live tetap memerlukan smoke Meta dan pemeriksaan visual tersebut.
