'use strict';
const DEFS = {
  'user.language':'language', 'user.nationality':'country', 'user.displayName':'string',
  'user.homeCountry':'country','user.physicalLocation':'country','user.travelStatus':'string','user.travelDays':'string',
  'user.taxResidenceDeclaration':'string','user.withholdingDocumentation':'string',
  'org.legalForm':'string','org.activities':'activities','org.entityDeclarations':'string',
  'user.englishAbility':'string','presence.intervals':'presence','org.economicScopes':'scopes',
  'employment.relationship':'string','employment.employerName':'string','employment.employerCountry':'country','employment.workCountry':'country','employment.salaryCurrency':'currency',
  'org.name':'string', 'org.businessType':'businessType', 'org.subjectType':'subjectType',
  'org.taxRegistrationNumber':'string', 'org.address':'string', 'org.registrationStatus':'string',
  'currency.functional':'currency', 'currency.transactions':'currencies',
  'currency.reporting':'currency', 'currency.foreignPurchases':'currencies', 'currency.fxSource':'string',
  'accounting.periodStart':'date', 'accounting.periodEnd':'date', 'modules.enabled':'modules',
};
const SLOT_GROUPS = Object.freeze(['A','B','C','D','E','F','G','H','I']);
const SLOT_DEFS = Object.freeze(Object.entries(DEFS).map(([key,type])=>({key,type,semanticRole:key,requiresConfirmation:true,dependencies:[]})));
function blankSlots() { return Object.fromEntries(SLOT_DEFS.map(d=>[d.key,{...d,value:d.type==='currencies'||d.type==='modules'?[]:null,status:'UNKNOWN',evidenceStatus:'UNKNOWN',source:null,supportingQuote:null,confidence:null,validation:null}])); }
function slotSummary(slots) { return JSON.parse(JSON.stringify(slots)); }
module.exports={SLOT_GROUPS,SLOT_DEFS,blankSlots,slotSummary};
