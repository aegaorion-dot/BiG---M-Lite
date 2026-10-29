'use strict';
const {blankSlots}=require('./slots');
const {isKnownCurrency}=require('../global/currencies');
const {isKnownJurisdiction}=require('../global/jurisdictions');
const {BASES}=require('./jurisdictions');
const {verifyQuote}=require('./evidence');
const {assertDate}=require('../domain/organization');
const {isFunctionalCorrection,isDirectCurrencyAnswer,currencyMentionMatches}=require('./currencyContext');
const ALLOWED_BUSINESS_TYPES=Object.freeze(['freelancer','small-business','umkm','perdagangan','jasa','kuliner','manufaktur']);
const ALLOWED_MODULES=Object.freeze(['sales','purchase','accounting','reports','import']);
const SUBJECT_TYPES=Object.freeze(['COMPANY','INDIVIDUAL','PARTNERSHIP']);
const ACTIVITIES=Object.freeze(['INFLUENCER','CREATOR','FREELANCER','SOFTWARE_LICENSOR','AFFILIATE_MARKETER']);
const ALLOWED_FACT_SLOTS=Object.freeze(Object.keys(blankSlots()));
const CRITICAL_SLOTS=Object.freeze(['currency.functional']);
const SYSTEM_PROMPT=[
 'You are BiG-M Lite business onboarding, a candidate-only semantic interpreter.',
 'Extract facts from the CURRENT USER MESSAGE only. Previous candidates are context, never new evidence.',
 'Never invent missing business facts, jurisdiction, currency, tax laws, rates, FX sources, or approval.',
 'Each nonempty fact needs an exact contiguous supportingQuote from the current message.',
 'All extracted assertions remain CANDIDATE. Never return APPROVED or CONFIRMED.',
 'Preserve explicit home country (user.homeCountry), current physical location (user.physicalLocation), travel status/days, individual legal form and activities in separate slots. org.activities uses only the capability enum; retain multiple activities when evidenced. A vacation is not a tax-residence or registration assertion. Negated entity/residence statements are declarations, never positive jurisdiction facts.',
 'Keep nationality separate from work, registration, incorporation, tax residence, bank and customer location.',
 'Never infer jurisdiction solely from language, nationality, customers or bank location.',
 'Never infer functional currency solely from country, currency of payments or foreign purchases.',
 'Distinguish functional, transaction, reporting, foreign purchase currencies and unknown FX source.',
 'Use operation REPLACE for an explicit correction, REMOVE for a withdrawn fact; otherwise SET.',
 'Return only the supplied JSON shape. Use only capability registry slots/modules. Do not activate or post.',
].join('\n');
function blankProfileState(){
 const slots=blankSlots();slots['user.language']={...slots['user.language'],value:'en',status:'CANDIDATE',source:'DEFAULT'};
 return {slots,jurisdictionFacts:[],history:[],revision:0,turnCount:0,aiCalls:0,pendingQuestion:null};
}
function valueValid(key,value){
 const type=blankSlots()[key]?.type;
 if(type==='string')return typeof value==='string'&&value.trim().length>0&&value.length<=120;
 if(type==='language')return ['en','id'].includes(value);
 if(type==='country')return typeof value==='string'&&isKnownJurisdiction(value);
 if(type==='currency')return typeof value==='string'&&isKnownCurrency(value);
 if(type==='currencies')return Array.isArray(value)&&value.every(c=>typeof c==='string'&&isKnownCurrency(c));
 if(type==='activities')return Array.isArray(value)&&value.length<=10&&value.every(v=>ACTIVITIES.includes(v));
 if(type==='modules')return Array.isArray(value)&&value.length>0&&value.every(c=>ALLOWED_MODULES.includes(c));
 if(type==='businessType')return ALLOWED_BUSINESS_TYPES.includes(value);
 if(type==='subjectType')return SUBJECT_TYPES.includes(value);
 if(type==='date'){try{assertDate(value,key);return true;}catch{return false;}}
 return false;
}
function normalizeValue(key,value){
 const type=blankSlots()[key]?.type;
 if(typeof value==='string'){
  if(['currency','country','subjectType'].includes(type))return value.trim().toUpperCase();
  if(['language','businessType'].includes(type))return value.trim().toLowerCase();
  return value.trim();
 }
 if(Array.isArray(value)&&value.every(v=>typeof v==='string'))return [...new Set(value.map(v=>['currencies','activities'].includes(type)?v.trim().toUpperCase():v.trim().toLowerCase()))];
 return value;
}
function validateExtractorPayload(raw,{userText=null,pendingQuestion=null,previousCurrencyRole=null}={}){
 const errors=[],out={facts:[],jurisdictionFacts:[],detectedLanguage:raw?.detectedLanguage??null};
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Array.isArray(raw.facts))return {ok:false,errors:['facts must be an array']};
 if(raw.approval||raw.activeConfiguration||raw.selectedPackIds)errors.push('AI cannot grant authority');
 function metadata(f,label){
  if(!f||typeof f!=='object'){errors.push(label+': object required');return false;}
  if(f.status&&!['CANDIDATE','UNKNOWN','REJECTED'].includes(f.status))errors.push(label+': AI may return candidates only');
  if(f.source&&!['USER','AI_INFERENCE'].includes(f.source))errors.push(label+': invalid source');
  if(f.confidence!=null&&(typeof f.confidence!=='number'||!Number.isFinite(f.confidence)||f.confidence<0||f.confidence>1))errors.push(label+': confidence must be 0..1');
  if(f.operation&&!['SET','ADD','REPLACE','REMOVE'].includes(f.operation))errors.push(label+': invalid operation');
  const quote=f.supportingQuote??f.evidence;
  if(typeof quote!=='string'||!quote.trim()||quote.length>200)errors.push(label+': supportingQuote required (max 200)');
  else if(userText!==null&&!verifyQuote(quote,userText))errors.push(label+': quote not in current message');
  return true;
 }
 for(const f of raw.facts){
  if(!metadata(f,'fact'))continue;
  if(!ALLOWED_FACT_SLOTS.includes(f.slot)){errors.push('unknown slot: '+f.slot);continue;}
  const value=normalizeValue(f.slot,f.value);
  if(f.semanticRole&&f.semanticRole!==f.slot)errors.push(f.slot+': semantic role mismatch');
  if(value==null){if(f.status!=='UNKNOWN'&&f.operation!=='REMOVE')errors.push(f.slot+': null requires UNKNOWN');}
  else if(f.status==='UNKNOWN'||!valueValid(f.slot,value))errors.push(f.slot+': unsupported value/type/status');
  const quote=f.supportingQuote??f.evidence;
  if(f.slot==='currency.functional'&&f.value!=null&&userText!==null&&!isDirectCurrencyAnswer(userText,pendingQuestion,value)&&!/book|pembukuan|fungsional|functional/i.test(quote??'')&&!isFunctionalCorrection(userText,previousCurrencyRole))errors.push('functional currency requires bookkeeping evidence');
  if(f.slot==='currency.functional'&&f.value!=null&&userText!==null&&!currencyMentionMatches(quote,value))errors.push('functional currency value must match the quoted currency');
  out.facts.push({...f,value,semanticRole:f.slot,source:f.source??'USER',supportingQuote:quote,confidence:f.confidence??null,status:f.status??'CANDIDATE',operation:f.operation??'SET'});
 }
 if(raw.jurisdictionFacts!==undefined&&!Array.isArray(raw.jurisdictionFacts))errors.push('jurisdictionFacts must be an array');
 for(const f of raw.jurisdictionFacts??[]){
  if(!metadata(f,'jurisdiction'))continue;
  if(!BASES.includes(f.basis))errors.push('unknown jurisdiction basis');
  if(f.countryCode!=null&&(typeof f.countryCode!=='string'||!isKnownJurisdiction(f.countryCode)))errors.push('unsupported jurisdiction');
  if(f.countryCode==null&&f.status!=='UNKNOWN')errors.push('null jurisdiction must be UNKNOWN');
  if(f.countryCode!=null&&f.status==='UNKNOWN')errors.push('UNKNOWN jurisdiction cannot contain country');
  out.jurisdictionFacts.push({...f,countryCode:typeof f.countryCode==='string'?f.countryCode.trim().toUpperCase():null,semanticRole:f.basis,source:f.source??'USER',supportingQuote:f.supportingQuote??f.evidence,confidence:f.confidence??null,status:f.status??'CANDIDATE',operation:f.operation??'SET'});
 }
 if(out.facts.length+out.jurisdictionFacts.length>40)errors.push('too many facts');
 return errors.length?{ok:false,errors}:{ok:true,extracted:out};
}
function applyFacts(state,facts,source='USER',{jurisdictionFacts=[],correction=false}={}){
 const next=JSON.parse(JSON.stringify(state));
 function changed(prev,record){return JSON.stringify(prev)!==JSON.stringify(record);}
 let dirty=false;
 for(const f of facts??[]){
  const prev=next.slots[f.slot];if(!prev)continue;
  if(f.operation==='REMOVE'&&prev.value!=null&&!Array.isArray(prev.value)&&f.value!=null&&prev.value!==f.value)continue;
  let value=f.value;
  const replace=correction||f.operation==='REPLACE';
  if(Array.isArray(value)&&Array.isArray(prev.value)&&!replace)value=[...new Set([...prev.value,...value])];
  let status=(f.operation==='REMOVE'||f.status==='UNKNOWN'||f.status==='REJECTED')?'UNKNOWN':'CANDIDATE';
  if(status==='UNKNOWN'){
   value=Array.isArray(prev.value)?(f.operation==='REMOVE'&&Array.isArray(f.value)?prev.value.filter(v=>!f.value.includes(v)):[]):null;
   if(Array.isArray(value)&&value.length)status='CANDIDATE';
  }
  const nonempty=prev.value!=null&&prev.value!==''&&(!Array.isArray(prev.value)||prev.value.length);
  if(nonempty&&!Array.isArray(value)&&value!=null&&prev.value!==value&&!replace&&prev.source!=='DEFAULT')status='CONFLICT';
  const record={...prev,value,status,evidenceStatus:status,source:f.source??source,supportingQuote:f.supportingQuote??f.evidence??null,confidence:f.confidence??null,semanticRole:f.slot,validation:'schema-valid'};
  if(status==='CONFLICT')record.alternatives=[...new Set([prev.value,value])];
  else delete record.alternatives;
  if(changed(prev,record)){next.history.push({revision:state.revision,slot:f.slot,previous:prev});dirty=true;}
  next.slots[f.slot]=record;
  if(f.slot.startsWith('currency.')&&value!=null)next.lastCurrencyRole=f.slot;
 }
 for(const f of jurisdictionFacts){
  const current=next.jurisdictionFacts.filter(j=>j.basis===f.basis&&j.status!=='REJECTED');
  const existing=current.find(j=>j.countryCode===f.countryCode);
  const withdraw=f.operation==='REMOVE'||f.status==='REJECTED'||f.status==='UNKNOWN';
  if(existing&&!withdraw&&!correction&&f.operation!=='REPLACE')continue;
  const multi=['ACCOUNT_LOCATION','CUSTOMER_LOCATION','SOURCE','WITHHOLDING','POSSIBLE_PE'].includes(f.basis);
  if(withdraw){
   const removed=current.filter(j=>f.countryCode==null||j.countryCode===f.countryCode);
   next.history.push(...removed.map(previous=>({revision:state.revision,slot:'jurisdiction.'+f.basis,previous})));
   next.jurisdictionFacts=next.jurisdictionFacts.filter(j=>j.basis!==f.basis||(f.countryCode!=null&&j.countryCode!==f.countryCode));
   next.jurisdictionFacts.push({...f,semanticRole:f.basis,status:'REJECTED',source:f.source??source});dirty=true;continue;
  }
  if(correction||f.operation==='REPLACE'){
   next.history.push(...current.map(previous=>({revision:state.revision,slot:'jurisdiction.'+f.basis,previous})));
   next.jurisdictionFacts=next.jurisdictionFacts.filter(j=>j.basis!==f.basis);
  }
  const status=withdraw?'REJECTED':(!multi&&current.length&&!correction&&f.operation!=='REPLACE'?'CONFLICT':'CANDIDATE');
  if(status==='CONFLICT')next.jurisdictionFacts.filter(j=>j.basis===f.basis).forEach(j=>j.status='CONFLICT');
  next.jurisdictionFacts.push({...f,semanticRole:f.basis,status,source:f.source??source});dirty=true;
 }
 if(dirty)next.revision+=1;
 next.history=next.history.slice(-100);
 return next;
}
function slotValue(state,key){const s=state.slots[key];return s&&s.status!=='CONFLICT'&&s.status!=='UNKNOWN'?s.value:null;}
function jurisdictionValue(state,basis){return state.jurisdictionFacts.find(f=>f.basis===basis&&['CANDIDATE','CONFIRMED'].includes(f.status))?.countryCode??null;}
function gapAnalysis(state){return CRITICAL_SLOTS.filter(k=>!slotValue(state,k));}
function planQuestion(state,lang='en',{taxReadiness=null}={}){
 const conflict=Object.entries(state.slots).find(([,s])=>s.status==='CONFLICT');
 const jurisdictionConflict=state.jurisdictionFacts.find(f=>f.status==='CONFLICT');
 if(conflict)return {key:conflict[0],text:lang==='id'?'Ada jawaban yang berbeda. Tolong nyatakan koreksi untuk pengaturan yang ingin Anda gunakan.':'Those answers differ. Please state a correction for the setup you want to use.'};
 if(jurisdictionConflict)return {key:'jurisdiction.'+jurisdictionConflict.basis,text:lang==='id'?'Lokasi tersebut berbeda. Tolong jelaskan lokasi pendaftaran dan lokasi kerja secara terpisah.':'Those locations differ. Please clarify registration and work location separately.'};
 if(gapAnalysis(state).length)return {key:'currency.functional',text:lang==='id'?'Mata uang apa yang Anda gunakan untuk pembukuan? Pembayaran pelanggan bisa berbeda.':'Which currency do you want to keep your books in? Customer payments can use another currency.'};
 const taxQuestion=require('../tax/readiness').taxQuestion(taxReadiness);if(taxQuestion)return taxQuestion;
 return {key:'done',text:lang==='id'?'Silakan tinjau pengaturan. Pengaturan pajak dapat ditinjau nanti.':'Please review your setup. Tax settings can be reviewed later.'};
}
function planConfiguration(state,{year=new Date().getUTCFullYear(),organizationId='org-contoh'}={}){
 const v=k=>slotValue(state,k);
 const registration=jurisdictionValue(state,'REGISTRATION'),incorporation=jurisdictionValue(state,'INCORPORATION'),work=jurisdictionValue(state,'BUSINESS_WORK_LOCATION');
 return {language:v('user.language')??'en',organizationId,organizationName:v('org.name')??(v('user.language')==='id'?'Usaha saya':'My business'),
  organizationNameSuggested:!v('org.name'),businessType:v('org.businessType')??'small-business',subjectType:v('org.subjectType')??'UNKNOWN',
  domicile:registration??incorporation??work,entityJurisdiction:registration??incorporation,
  jurisdictionBasis:registration?'REGISTRATION':incorporation?'INCORPORATION':work?'BUSINESS_WORK_LOCATION':null,
  functionalCurrency:v('currency.functional'),transactionCurrencies:v('currency.transactions')??[],
  foreignPurchaseCurrencies:v('currency.foreignPurchases')??[],reportingCurrency:v('currency.reporting')??v('currency.functional'),
  reportingCurrencySuggested:!v('currency.reporting'),fxSource:v('currency.fxSource'),
  modules:v('modules.enabled')??['sales','purchase','accounting','reports','import'],
  period:{periodStart:v('accounting.periodStart')??year+'-01-01',periodEnd:v('accounting.periodEnd')??year+'-12-31'},profileRevision:state.revision};
}
function validateConfiguration(plan){
 const errors=[];
 if(!plan.organizationName||typeof plan.organizationName!=='string')errors.push('organization name required');
 if(!isKnownCurrency(plan.functionalCurrency))errors.push('supported functional currency required');
 if(!['en','id'].includes(plan.language))errors.push('unsupported language');
 if(!Array.isArray(plan.modules)||!plan.modules.length||plan.modules.some(m=>!ALLOWED_MODULES.includes(m)))errors.push('unsupported modules');
 if(plan.domicile&&!isKnownJurisdiction(plan.domicile))errors.push('unsupported jurisdiction');
 try{assertDate(plan.period.periodStart,'period start');assertDate(plan.period.periodEnd,'period end');if(plan.period.periodStart>plan.period.periodEnd)errors.push('invalid period range');}catch(e){errors.push(e.message);}
 return errors.length?{ok:false,errors}:{ok:true,validated:JSON.parse(JSON.stringify(plan))};
}
const RESPONSE_SCHEMA={type:'object',required:['facts','jurisdictionFacts'],additionalProperties:false,properties:{
 facts:{type:'array',items:{type:'object',required:['slot','value','source','supportingQuote','confidence','status','operation'],properties:{slot:{enum:ALLOWED_FACT_SLOTS},value:{},source:{enum:['USER','AI_INFERENCE']},supportingQuote:{type:'string',minLength:1,maxLength:200},confidence:{type:'number',minimum:0,maximum:1},status:{enum:['CANDIDATE','UNKNOWN']},operation:{enum:['SET','ADD','REPLACE','REMOVE']}}}},
 jurisdictionFacts:{type:'array',items:{type:'object',required:['basis','countryCode','source','supportingQuote','confidence','status','operation'],properties:{basis:{enum:BASES},countryCode:{type:['string','null']},source:{enum:['USER','AI_INFERENCE']},supportingQuote:{type:'string',minLength:1,maxLength:200},confidence:{type:'number',minimum:0,maximum:1},status:{enum:['CANDIDATE','UNKNOWN','REJECTED']},operation:{enum:['SET','ADD','REPLACE','REMOVE']}}}}}};
module.exports={SYSTEM_PROMPT,RESPONSE_SCHEMA,ALLOWED_FACT_SLOTS,ALLOWED_BUSINESS_TYPES,ACTIVITIES,ALLOWED_MODULES,SUBJECT_TYPES,CRITICAL_SLOTS,blankProfileState,validateExtractorPayload,applyFacts,gapAnalysis,planQuestion,planConfiguration,validateConfiguration,slotValue,jurisdictionValue};
