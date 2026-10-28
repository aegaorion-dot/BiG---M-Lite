'use strict';

/**
 * Central translation table. `en` is canonical; `id` fully translated.
 * t() falls back to English and flags fallback so UI can show it visibly.
 */

const STRINGS = Object.freeze({
  en: Object.freeze({
    'app.tagline': 'Ledger Atelier',
    'nav.onboarding': 'AI Onboarding',
    'nav.dashboard': 'Dashboard',
    'nav.sales': 'Sales',
    'nav.purchase': 'Purchase',
    'nav.accounting': 'Accounting',
    'nav.reports': 'Reports',
    'nav.import': 'CSV Import',
    'nav.tax': 'Tax & Pack',
    'nav.settings': 'Settings',
    'ob.kicker': 'AI-FIRST ONBOARDING · ONE ENGINE',
    'ob.title': 'Welcome to BiG-M.',
    'ob.subtitle': 'Tell me a little about your business. I will help set it up.',
    'ob.chatTitle': 'Conversation',
    'ob.placeholder': 'Type your answer…',
    'ob.send': 'Send',
    'ob.propose': 'Build proposal',
    'ob.validate': 'Validate',
    'ob.activate': 'Confirm & activate',
    'ob.greeting': 'Welcome to BiG-M. Tell me a little about your business and I will help set it up.',
    'ob.hint': 'Example: I am a freelance designer in Singapore, I use English and bill in SGD.',
    'ob.langLabel': 'Display language',
    'ob.reviewTitle': 'Configuration review',
    'ob.pending': 'Collecting information…',
    'ob.taxNote': 'Tax status: pending verification (placeholder rules only).',
    'ob.fxNote': 'Amounts keep their original currency code. No conversion without a validated FX rate.',
    'ws.income': 'Income',
    'ws.expenses': 'Expenses',
    'ws.cash': 'Cash & bank',
    'ws.summary': 'Simple summary',
    'ws.empty': 'No business data yet. Add your first income or expense.',
    'demo.note': 'Showing DEMO data (labeled [DEMO]) — not real financial data.',
    'demo.load': 'Load demo',
    'action.new': '+ New transaction',
    'action.cancel': 'Cancel',
    'action.post': 'Post',
  }),
  id: Object.freeze({
    'app.tagline': 'Atelier Buku Besar',
    'nav.onboarding': 'Onboarding AI',
    'nav.dashboard': 'Dasbor',
    'nav.sales': 'Penjualan',
    'nav.purchase': 'Pembelian',
    'nav.accounting': 'Akuntansi',
    'nav.reports': 'Laporan',
    'nav.import': 'Impor CSV',
    'nav.tax': 'Pajak & Pack',
    'nav.settings': 'Pengaturan',
    'ob.kicker': 'ONBOARDING AI-FIRST · SATU ENGINE',
    'ob.title': 'Selamat datang di BiG-M.',
    'ob.subtitle': 'Ceritakan sedikit tentang bisnis Anda. Saya akan membantu menyiapkannya.',
    'ob.chatTitle': 'Percakapan',
    'ob.placeholder': 'Tulis jawaban Anda…',
    'ob.send': 'Kirim',
    'ob.propose': 'Susun usulan',
    'ob.validate': 'Validasi',
    'ob.activate': 'Konfirmasi & aktifkan',
    'ob.greeting': 'Selamat datang di BiG-M. Ceritakan sedikit tentang bisnis Anda dan saya akan membantu menyiapkannya.',
    'ob.hint': 'Contoh: Saya freelance desain di Singapura, pakai bahasa Indonesia, tagihan SGD.',
    'ob.langLabel': 'Bahasa tampilan',
    'ob.reviewTitle': 'Tinjauan konfigurasi',
    'ob.pending': 'Mengumpulkan informasi…',
    'ob.taxNote': 'Status pajak: menunggu verifikasi (hanya aturan placeholder).',
    'ob.fxNote': 'Nominal menyimpan kode mata uang aslinya. Tanpa konversi tanpa kurs tervalidasi.',
    'ws.income': 'Pendapatan',
    'ws.expenses': 'Beban',
    'ws.cash': 'Kas & bank',
    'ws.summary': 'Ringkasan sederhana',
    'ws.empty': 'Belum ada data bisnis. Tambahkan pendapatan atau beban pertama.',
    'demo.note': 'Menampilkan data demo (berlabel [DEMO]) — bukan data keuangan nyata.',
    'demo.load': 'Muat demo',
    'action.new': '+ Transaksi baru',
    'action.cancel': 'Batal',
    'action.post': 'Posting',
  }),
});

function translate(lang, key) {
  const l = lang === 'id' ? 'id' : 'en';
  if (STRINGS[l] && STRINGS[l][key] !== undefined) return { text: STRINGS[l][key], fallback: false };
  return { text: STRINGS.en[key] ?? key, fallback: true };
}

function t(lang, key) {
  return translate(lang, key).text;
}

module.exports = { STRINGS, translate, t };
