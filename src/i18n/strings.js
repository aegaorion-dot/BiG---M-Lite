'use strict';
const STRINGS=Object.freeze({en:Object.freeze(require('../../public/i18n/en.json')),id:Object.freeze(require('../../public/i18n/id.json'))});
function translate(lang,key){const l=/^id(?:-|$)/i.test(lang)?'id':'en';return {text:STRINGS[l][key]??STRINGS.en[key]??key,fallback:STRINGS[l][key]===undefined};}
function t(lang,key){return translate(lang,key).text;}
function interpolate(text,values={}){return text.replace(/\{([A-Za-z][\w.]*)\}/g,(_all,key)=>{if(!Object.hasOwn(values,key))throw Error('Missing translation placeholder: '+key);return String(values[key]);});}
module.exports={STRINGS,translate,t,interpolate};
