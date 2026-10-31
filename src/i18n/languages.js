'use strict';

/**
 * BCP 47 language registry. English (`en`) is canonical base.
 * English, Indonesian and Moroccan Arabic have validated local dictionaries.
 */

const LANGUAGES = Object.freeze([
  { tag: 'en', name: 'English', supported: true },
  { tag: 'id', name: 'Bahasa Indonesia', supported: true },
]);

function normalizeLanguageTag(tag) {
  const t = String(tag ?? '').trim().toLowerCase().replace('_', '-');
  if(t==='ar'||t==='ar-ma')return 'ar-MA';
  if(t==='el'||t==='el-gr')return 'el-GR';
  if (t === 'en' || t.startsWith('en-')) return 'en';
  if (t === 'id' || t === 'in' || t.startsWith('id-') || t.startsWith('in-')) return 'id';
  return 'en';
}

function supportedLanguages() {
  const Locale=require('../../public/locale');return Locale.SUPPORTED.map(tag=>({tag,name:Locale.language(tag,tag),supported:true}));
}

function isSupported(tag) {
  return require('../../public/locale').supported(tag);
}

module.exports = { LANGUAGES, normalizeLanguageTag, supportedLanguages, isSupported };
