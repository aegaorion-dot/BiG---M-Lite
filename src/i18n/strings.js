'use strict';
const STRINGS=Object.freeze({en:Object.freeze(require('../../public/i18n/en.json')),id:Object.freeze(require('../../public/i18n/id.json'))});
function translate(lang,key){const l=lang==='id'?'id':'en';return {text:STRINGS[l][key]??STRINGS.en[key]??key,fallback:STRINGS[l][key]===undefined};}
function t(lang,key){return translate(lang,key).text;}
module.exports={STRINGS,translate,t};
