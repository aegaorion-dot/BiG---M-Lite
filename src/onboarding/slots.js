'use strict';
const DEFS = {
  'user.language':'language', 'user.nationality':'country', 'user.displayName':'string',
  'org.name':'string', 'org.businessType':'businessType', 'org.subjectType':'subjectType',
  'currency.functional':'currency', 'currency.transactions':'currencies',
  'currency.reporting':'currency', 'currency.foreignPurchases':'currencies', 'currency.fxSource':'string',
  'accounting.periodStart':'date', 'accounting.periodEnd':'date', 'modules.enabled':'modules',
};
const SLOT_GROUPS = Object.freeze(['A','B','C','D','E','F','G','H','I']);
const SLOT_DEFS = Object.freeze(Object.entries(DEFS).map(([key,type])=>({key,type,semanticRole:key,requiresConfirmation:true,dependencies:[]})));
function blankSlots() { return Object.fromEntries(SLOT_DEFS.map(d=>[d.key,{...d,value:d.type==='currencies'||d.type==='modules'?[]:null,status:'UNKNOWN',evidenceStatus:'UNKNOWN',source:null,supportingQuote:null,confidence:null,validation:null}])); }
function slotSummary(slots) { return JSON.parse(JSON.stringify(slots)); }
module.exports={SLOT_GROUPS,SLOT_DEFS,blankSlots,slotSummary};
