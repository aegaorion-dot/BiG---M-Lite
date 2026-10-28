'use strict';
// A shorthand correction may refer to the last explicitly discussed currency role.
// Payments, reporting and purchase currencies never supply bookkeeping context.
function isFunctionalCorrection(text,previousCurrencyRole){
 return previousCurrencyRole==='currency.functional'&&/^(?:actually|correction)[:,]?\s+(?:use|choose)\s+(?:IDR|SGD|USD|AUD|GBP|EUR|MYR)[.!]?$/i.test(String(text).trim());
}
module.exports={isFunctionalCorrection};
