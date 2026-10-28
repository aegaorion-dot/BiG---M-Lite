'use strict';
// Evidence checking is shared. All state application lives in profiler.applyFacts.
function normalizeText(text){return String(text??'').normalize('NFC').trim().replace(/\s+/g,' ');}
function verifyQuote(quote,userText){const q=normalizeText(quote);return Boolean(q&&q.length<=200&&normalizeText(userText).includes(q));}
module.exports={verifyQuote};
