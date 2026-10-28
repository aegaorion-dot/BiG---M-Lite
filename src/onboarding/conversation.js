'use strict';

/**
 * Conversation — ekstraksi sinyal deterministik dari teks pengguna (ID/EN).
 *
 * Kontrak:
 * - 100% deterministik, tanpa jaringan, tanpa klaim AI.
 * - detectSignals() hanya mengembalikan fakta yang eksplisit di teks.
 * - TIDAK mengarang tarif/hukum; hanya bahasa, yurisdiksi, mata uang,
 *   bidang usaha, nama organisasi bila eksplisit.
 * - nextQuestion() hanya menanyakan slot yang masih kosong.
 */

const JURISDICTIONS = [
  { code: 'SG', aliases: ['singapura', 'singapore', 'sg'] },
  { code: 'ID', aliases: ['indonesia', 'indonesian', 'id'] },
  { code: 'MY', aliases: ['malaysia', 'my'] },
  { code: 'US', aliases: ['amerika', 'united states', 'usa', 'us'] },
];

const CURRENCIES = ['SGD', 'IDR', 'USD', 'MYR', 'EUR'];

const FIELDS = [
  { key: 'perdagangan', aliases: ['perdagangan', 'trading', 'dagang', 'retail', 'niaga'] },
  { key: 'jasa', aliases: ['jasa', 'services', 'service', 'konsultasi', 'consulting'] },
  { key: 'manufaktur', aliases: ['manufaktur', 'manufacturing', 'pabrik'] },
  { key: 'kuliner', aliases: ['kuliner', 'fnb', 'food', 'restoran', 'cafe'] },
];

function lower(t) {
  return String(t ?? '').toLowerCase();
}

function detectSignals(text) {
  const t = lower(text);
  const signals = {};
  for (const j of JURISDICTIONS) {
    const hit = j.aliases.some((a) => {
      const alias = String(a).toLowerCase();
      if (alias.length <= 2) return new RegExp(`\\b${alias}\\b`, 'i').test(t);
      return t.includes(alias);
    });
    if (hit) { signals.jurisdiction = j.code; break; }
  }
  for (const c of CURRENCIES) {
    if (t.includes(c.toLowerCase())) { signals.currency = c; break; }
  }
  for (const f of FIELDS) {
    if (f.aliases.some((a) => t.includes(a))) { signals.businessField = f.key; break; }
  }
  if (/(bahasa indonesia|pakai indonesia|indonesian language|use indonesian)/.test(t)) signals.language = 'id';
  else if (/(english|bahasa inggris|use english)/.test(t)) signals.language = 'en';
  else if (/\bindonesia\b/.test(t) && /nyaman|ingin|pakai|gunakan/.test(t)) signals.language = 'id';

  const rawText = String(text ?? '');
  const firstChunk = rawText.split(/[,;\n]/)[0] ?? rawText;
  const orgMatch = firstChunk.match(/(?:\bpt\b|\bcv\b|\bcompany\b)\s+([A-Za-z0-9 .&'-]{2,60})/i);
  if (orgMatch) {
    let name = orgMatch[1].trim().replace(/\s+(di|di\s+singapura|singapura)$/i, '').trim();
    name = name.slice(0, 60).trim();
    if (name) signals.orgName = name;
  }
  return signals;
}

function applySignalsToDraft(draft, signals) {
  const next = JSON.parse(JSON.stringify(draft));
  if (signals.language) {
    next.userProfile.preferredLanguage = signals.language;
    next.languageProfile.ui = signals.language;
  }
  if (signals.jurisdiction) {
    if (!next.organizationProfile.domicile) next.organizationProfile.domicile = signals.jurisdiction;
    if (next.entityProfiles.length === 0) {
      next.entityProfiles.push({
        id: 'ent-1',
        name: next.organizationProfile.name || 'Entitas Utama',
        jurisdiction: signals.jurisdiction,
      });
    } else if (!next.entityProfiles[0].jurisdiction) {
      next.entityProfiles[0].jurisdiction = signals.jurisdiction;
    }
    if (!next.jurisdictionProfiles.some((j) => j.code === signals.jurisdiction)) {
      next.jurisdictionProfiles.push({ code: signals.jurisdiction, packStatus: 'pending-validation', taxStatus: 'pending-verification' });
    }
  }
  if (signals.currency) {
    if (!next.currencyProfile.functional) next.currencyProfile.functional = signals.currency;
    else if (next.currencyProfile.functional !== signals.currency
      && !next.currencyProfile.otherCurrencies.includes(signals.currency)) {
      next.currencyProfile.otherCurrencies.push(signals.currency);
    }
  }
  if (signals.businessField && !next.organizationProfile.businessField) {
    next.organizationProfile.businessField = signals.businessField;
  }
  if (signals.orgName && !next.organizationProfile.name) {
    next.organizationProfile.name = signals.orgName;
    if (next.entityProfiles[0] && next.entityProfiles[0].name === 'Entitas Utama') {
      next.entityProfiles[0].name = signals.orgName;
    }
  }
  if (next.organizationProfile.name && !next.organizationProfile.id) {
    const slug = next.organizationProfile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'org';
    next.organizationProfile.id = `org-${slug}`;
  }
  return next;
}

const QUESTIONS = {
  id: {
    orgName: 'Siapa nama organisasi/perusahaan Anda?',
    domicile: 'Organisasi berdomisili di negara mana? (contoh: Singapura / Indonesia)',
    businessField: 'Bisnis Anda bergerak di bidang apa? (contoh: perdagangan, jasa)',
    currency: 'Mata uang fungsional apa yang dipakai? (contoh: SGD, IDR, USD)',
    language: 'Bahasa tampilan yang diinginkan? (Indonesia / English)',
    done: 'Informasi sudah cukup. Silakan tinjau usulan konfigurasi lalu konfirmasi.',
  },
  en: {
    orgName: 'What is your organization name?',
    domicile: 'Which country is the organization domiciled in? (e.g. Singapore / Indonesia)',
    businessField: 'What line of business? (e.g. trading, services)',
    currency: 'What functional currency? (e.g. SGD, IDR, USD)',
    language: 'Preferred UI language? (Indonesia / English)',
    done: 'Enough info collected. Please review the proposed configuration, then confirm.',
  },
};

function nextQuestion(draft) {
  const lang = draft?.languageProfile?.ui === 'en' ? 'en' : 'id';
  const q = QUESTIONS[lang];
  if (!draft?.organizationProfile?.name) return { key: 'orgName', text: q.orgName };
  if (!draft?.organizationProfile?.domicile) return { key: 'domicile', text: q.domicile };
  if (!draft?.organizationProfile?.businessField) return { key: 'businessField', text: q.businessField };
  if (!draft?.currencyProfile?.functional) return { key: 'currency', text: q.currency };
  if (!draft?.userProfile?.displayName) return { key: 'displayName', text: lang === 'en' ? 'What should I call you?' : 'Siapa nama Anda untuk sapaan?' };
  return { key: 'done', text: q.done };
}

function turn(draft, userText) {
  const signals = detectSignals(userText);
  let next = applySignalsToDraft(draft, signals);
  const t = String(userText ?? '').trim();
  const q0 = nextQuestion(next);
  // Isi slot yang sedang ditanya dari jawaban bebas bila deteksi tidak menangkapnya.
  if (t && q0.key === 'currency' && !signals.currency) {
    const m = t.toUpperCase().match(/\b(SGD|IDR|USD|MYR|EUR)\b/);
    if (m) next = applySignalsToDraft(next, { currency: m[1] });
    else if (/^rupiah$/i.test(t)) next = applySignalsToDraft(next, { currency: 'IDR' });
    else if (/^dolar( singapura)?$/i.test(t)) next = applySignalsToDraft(next, { currency: 'SGD' });
  }
  if (t && q0.key === 'orgName' && !signals.orgName && t.length <= 60 && !/singapura|indonesia|perdagangan|jasa|bahasa/i.test(t)) {
    next = JSON.parse(JSON.stringify(next));
    if (!next.organizationProfile.name) {
      next.organizationProfile.name = t.slice(0, 60);
      if (next.entityProfiles[0] && (!next.entityProfiles[0].name || next.entityProfiles[0].name === 'Entitas Utama')) {
        next.entityProfiles[0].name = t.slice(0, 60);
      }
    }
  }
  // Nama sapaan: bila draft belum punya displayName dan teks pendek tanpa kata kunci, pakai sebagai nama.
  if (!next.userProfile.displayName) {
    if (t && t.length <= 40 && Object.keys(signals).length === 0) {
      next = JSON.parse(JSON.stringify(next));
      next.userProfile.displayName = t.slice(0, 40);
    }
  }
  const question = nextQuestion(next);
  return { draft: next, signals, question, complete: question.key === 'done' };
}

module.exports = { detectSignals, applySignalsToDraft, nextQuestion, turn };
