'use strict';
// A shorthand correction may refer to the last explicitly discussed currency role.
// Payments, reporting and purchase currencies never supply bookkeeping context.
const {listCurrencies}=require('../global/currencies');
const CODES=new Set(listCurrencies().map(c=>c.code));
// Bounded natural-language aliases, including the Greek words a user may answer with.
const ALIASES=Object.freeze({
 IDR:/\brupiah\b|ρουπία/i,
 SGD:/\bSingapore dollars?\b|δολάρια Σιγκαπούρης/i,
 USD:/\b(?:US dollars?|american dollars?|dollars?)\b|δολάρια|δολάριο/i,
 AUD:/\bAustralian dollars?\b/i,
 GBP:/\bpounds?(?: sterling)?\b|λίρες?|λίρα/i,
 EUR:/ευρώ(?!πη)|\beuros?\b/i,
 JPY:/\b(?:Japanese yen|yen)\b|γιεν|γιέν|円/i,
 MYR:/\b(?:Malaysian ringgit|ringgit)\b/i,
 AED:/\b(?:UAE|emirati) dirhams?\b|ντιρχάμ/i,
 MAD:/\bMoroccan dirhams?\b|درهم/i,
 TRY:/\b(?:Turkish lira|lira)\b/i,
});
function nameToCode(text){
 const value=String(text??'').trim();
 if(/^[A-Za-z]{3}$/.test(value)&&CODES.has(value.toUpperCase()))return value.toUpperCase();
 for(const [code,pattern] of Object.entries(ALIASES))if(pattern.test(value))return code;
 return null;
}
function isFunctionalCorrection(text,previousCurrencyRole){
 if(previousCurrencyRole!=='currency.functional')return false;
 const match=String(text).trim().match(/^(?:actually|correction)[:,]?\s+(?:use|choose)\s+(.+?)[.!]?$/i);
 return Boolean(match&&nameToCode(match[1]));
}
function isDirectCurrencyAnswer(text,pendingQuestion,value){
 if(pendingQuestion!=='currency.functional')return false;
 const answer=String(text).trim().replace(/[.!]$/,'');
 const code=/^[A-Za-z]{3}$/.test(answer)?answer.toUpperCase():nameToCode(answer);
 return code!==null&&code===value;
}
function currencyMentionMatches(quote,value){
 if(typeof quote!=='string'||!CODES.has(value??''))return false;
 return new RegExp('\\b'+value+'\\b','i').test(quote)||Boolean(ALIASES[value]?.test(quote));
}
module.exports={isFunctionalCorrection,isDirectCurrencyAnswer,currencyMentionMatches,nameToCode,ALIASES,CODES};
