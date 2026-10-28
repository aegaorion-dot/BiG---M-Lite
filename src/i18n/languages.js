'use strict';

/**
 * BCP 47 language registry. English (`en`) is canonical base.
 * Only `en` + `id` claim full support. Others fall back to English visibly.
 */

const LANGUAGES = Object.freeze([
  { tag: 'en', name: 'English', supported: true },
  { tag: 'id', name: 'Bahasa Indonesia', supported: true },
]);

function normalizeLanguageTag(tag) {
  const t = String(tag ?? '').trim().toLowerCase().replace('_', '-');
  if (t === 'en' || t.startsWith('en-')) return 'en';
  if (t === 'id' || t === 'in' || t.startsWith('id-') || t.startsWith('in-')) return 'id';
  return 'en';
}

function supportedLanguages() {
  return LANGUAGES.map((l) => ({ ...l }));
}

function isSupported(tag) {
  return LANGUAGES.some((l) => l.tag === normalizeLanguageTag(tag) && l.supported);
}

module.exports = { LANGUAGES, normalizeLanguageTag, supportedLanguages, isSupported };
