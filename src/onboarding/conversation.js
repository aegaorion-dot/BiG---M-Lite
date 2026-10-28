'use strict';
const {extractJurisdictionCandidates}=require('./jurisdictions');
const {planQuestion}=require('./profiler');
// Fallback is deliberately bounded and is always labeled. Muse Spark handles semantics when configured.
function detectSignals(text,{pendingQuestion=null}={}){
 const t=String(text??''),facts=[],jurisdictionFacts=extractJurisdictionCandidates(t);
 const correction=/\b(?:actually|correction|correcting|instead|sebenarnya|koreksi|ganti|ubah)\b/i.test(t);
 const add=(slot,value,quote,operation=correction?'REPLACE':'SET')=>facts.push({slot,value,semanticRole:slot,source:'USER',supportingQuote:quote.slice(0,200),confidence:1,status:'CANDIDATE',operation});
 const uncertain=/^(?:not sure|unsure|maybe|perhaps|tidak yakin|belum tahu|mungkin)\b/i.test(t.trim());
 if(uncertain)return {facts:[],jurisdictionFacts:[]};
 const language=t.match(/\b(?:app|application|display|ui|bahasa|pakai|prefer|use|want|ingin)\b[^.]{0,45}\b(English|Indonesian|Indonesia|Inggris)\b/i);
 if(language&&/(?:app|language|bahasa|display|ui|prefer|use|pakai|ingin)/i.test(language[0]))add('user.language',/Indonesian|Indonesia/i.test(language[1])?'id':'en',language[0]);
 const nationality=t.match(/\b(?:I am|I'm|saya(?: adalah)?|nationality(?: is)?)\s+(?:an?\s+)?(Australian|Indonesian|British|American)\b/i);
 if(nationality)add('user.nationality',({australian:'AU',indonesian:'ID',british:'GB',american:'US'})[nationality[1].toLowerCase()],nationality[0]);
 let name=t.match(/\b(?:business (?:name is|is called)|company (?:name is|is called)|nama (?:usaha|bisnis|perusahaan)(?: saya)?(?: adalah)?|(?:usaha|bisnis|toko|perusahaan) (?:saya )?bernama)\s+["']?([^,;.\n"']{2,80})/i);
 if(!name)name=t.match(/^(?:(?:actually|correction)[:,]?\s*)?(?:Company|PT|CV)\s+([^,;.\n]{2,80})/i);
 if(name)add('org.name',name[1].trim(),name[0]);
 if(/\b(?:freelance|freelancer|freelencer|pekerja lepas)\b/i.test(t)){const m=t.match(/\b(?:freelance|freelancer|freelencer|pekerja lepas)\b/i);add('org.businessType','freelancer',m[0]);add('org.subjectType','INDIVIDUAL',m[0]);}
 else {
  const m=t.match(/\b(coffee shop|warung kopi|kedai kopi|cafe|kuliner|food|restoran|restaurant|perdagangan|trading|retail|dagang|consulting|services?|jasa|konsultasi|manufacturing|manufaktur|umkm)\b/i);
  if(m)add('org.businessType',/coffee|kopi|cafe|kuliner|food|restoran|restaurant/i.test(m[0])?'kuliner':/trading|retail|dagang/i.test(m[0])?'perdagangan':/manufact|manufaktur/i.test(m[0])?'manufaktur':/umkm/i.test(m[0])?'umkm':'jasa',m[0]);
 }
 const subject=t.match(/\b(sole proprietor|individual|perorangan|company|corporation|perseroan|PT|partnership|kemitraan)\b/i);
 if(subject)add('org.subjectType',/sole|individual|perorangan/i.test(subject[0])?'INDIVIDUAL':/partnership|kemitraan/i.test(subject[0])?'PARTNERSHIP':'COMPANY',subject[0]);
 const currencyPattern=/\b(IDR|SGD|USD|AUD|GBP|EUR|MYR|rupiah|Singapore dollars?|US dollars?|Australian dollars?|pounds?)\b/gi;
 for(const clause of t.split(/(?<=[.!?;])\s+|,\s*|\s+(?:and|but|dan|tetapi)\s+/i)){
  if(/\b(?:maybe|perhaps|unsure|mungkin|belum tahu)\b/i.test(clause))continue;
  const matches=[...clause.matchAll(currencyPattern)];currencyPattern.lastIndex=0;
  for(const m of matches){
   const value=/rupiah/i.test(m[0])?'IDR':/Singapore dollars?/i.test(m[0])?'SGD':/US dollars?/i.test(m[0])?'USD':/Australian dollars?/i.test(m[0])?'AUD':/pounds?/i.test(m[0])?'GBP':m[0].toUpperCase();
   const before=clause.slice(0,m.index).toLowerCase();
   let slot=null;
   if(/report|laporan/.test(before))slot='currency.reporting';
   else if(/book|pembukuan|functional|fungsional/.test(before))slot='currency.functional';
   else if(/buy|purchas|import|beli|membeli/.test(before))slot='currency.foreignPurchases';
   else if(/paid|pay|bill|receiv|invoice|bayar|tagih|terima/.test(before))slot='currency.transactions';
   else if(pendingQuestion==='currency.functional'&&t.trim().toLowerCase()===m[0].toLowerCase())slot='currency.functional';
   if(slot){
    const negative=/\b(?:not|never|no longer|tidak|bukan|belum)\b/i.test(before);
    add(slot,slot==='currency.transactions'||slot==='currency.foreignPurchases'?[value]:value,clause.trim(),negative?'REMOVE':slot==='currency.transactions'||slot==='currency.foreignPurchases'?(correction?'REPLACE':'ADD'):(correction?'REPLACE':'SET'));
   }
  }
 }
 const dates=t.match(/\b(?:period|periode)\s+(\d{4}-\d{2}-\d{2})\s+(?:to|through|sampai|hingga)\s+(\d{4}-\d{2}-\d{2})/i);
 if(dates){add('accounting.periodStart',dates[1],dates[0]);add('accounting.periodEnd',dates[2],dates[0]);}
 return {facts,jurisdictionFacts:jurisdictionFacts.map(f=>({...f,operation:correction?'REPLACE':f.status==='REJECTED'?'REMOVE':'SET'}))};
}
function turn(state,text){const signals=detectSignals(text,{pendingQuestion:state.pendingQuestion});const {applyFacts}=require('./profiler');const next=applyFacts(state,signals.facts,'USER',{jurisdictionFacts:signals.jurisdictionFacts});const question=planQuestion(next,next.slots['user.language'].value);return {profileState:next,signals,question,complete:question.key==='done'};}
module.exports={detectSignals,turn,nextQuestion:planQuestion};
