'use strict';
// A shorthand correction may refer to the last explicitly discussed currency role.
// Payments, reporting and purchase currencies never supply bookkeeping context.
function isFunctionalCorrection(text,previousCurrencyRole){
 return previousCurrencyRole==='currency.functional'&&/^(?:actually|correction)[:,]?\s+(?:use|choose)\s+(?:IDR|SGD|USD|AUD|GBP|EUR|MYR)[.!]?$/i.test(String(text).trim());
}
function isDirectCurrencyAnswer(text,pendingQuestion,value){
 if(pendingQuestion!=='currency.functional')return false;
 const answer=String(text).trim().replace(/[.!]$/,'');
 const code=/^[A-Z]{3}$/i.test(answer)?answer.toUpperCase():/^rupiah$/i.test(answer)?'IDR':/^Singapore dollars?$/i.test(answer)?'SGD':/^US dollars?$/i.test(answer)?'USD':/^Australian dollars?$/i.test(answer)?'AUD':/^pounds?$/i.test(answer)?'GBP':null;
 return code!==null&&code===value;
}
function currencyMentionMatches(quote,value){
 if(typeof quote!=='string'||!/^[A-Z]{3}$/.test(value??''))return false;
 const aliases={IDR:/\brupiah\b/i,SGD:/\bSingapore dollars?\b/i,USD:/\bUS dollars?\b/i,AUD:/\bAustralian dollars?\b/i,GBP:/\bpounds?(?: sterling)?\b/i,EUR:/\beuros?\b/i,MYR:/\bMalaysian ringgit\b/i};
 return new RegExp('\\b'+value+'\\b','i').test(quote)||Boolean(aliases[value]?.test(quote));
}
module.exports={isFunctionalCorrection,isDirectCurrencyAnswer,currencyMentionMatches};
