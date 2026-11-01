'use strict';
const {extractJurisdictionCandidates}=require('./jurisdictions');
const {planQuestion}=require('./profiler');
const {isFunctionalCorrection,nameToCode}=require('./currencyContext');
// Fallback is deliberately bounded and is always labeled. Muse Spark handles semantics when configured.
function detectSignals(text,{pendingQuestion=null,previousCurrencyRole=null}={}){
 const t=String(text??''),facts=[],jurisdictionFacts=extractJurisdictionCandidates(t);
 const correction=/\b(?:actually|correction|correcting|instead|sebenarnya|koreksi|ganti|ubah)\b/i.test(t);
 const add=(slot,value,quote,operation=correction?'REPLACE':'SET')=>facts.push({slot,value,semanticRole:slot,source:'USER',supportingQuote:quote.slice(0,200),confidence:1,status:'CANDIDATE',operation});
 const uncertain=/^(?:not sure|unsure|maybe|perhaps|tidak yakin|belum tahu|mungkin)\b/i.test(t.trim());
 if(uncertain)return {facts:[],jurisdictionFacts:[]};
 const language=t.match(/(?:app|application|display|ui|bahasa|pakai|prefer|use|want|ingin|speak|talk|μιλ|προτιμ)[^.]{0,60}?(English|Indonesian|Indonesia|Inggris|Greek|ελληνικά)/i);
 if(language&&/(?:app|language|bahasa|display|ui|prefer|use|pakai|ingin|speak|talk|μιλ|προτιμ)/i.test(language[0]))add('user.language',/Greek|ελληνικά/i.test(language[1])?'el-GR':/Indonesian|Indonesia/i.test(language[1])?'id':'en',language[0]);
 const nationality=t.match(/\b(?:I am|I'm|saya(?: adalah)?|nationality(?: is)?)\s+(?:an?\s+)?(Australian|Indonesian|British|American|Greek|Japanese)\b/i)??t.match(/(Έλληνας|Ελληνίδα|Ιάπωνας|Έλληνα)/i);
 if(nationality)add('user.nationality',({australian:'AU',indonesian:'ID',british:'GB',american:'US',greek:'GR',japanese:'JP',έλληνας:'GR',ελληνίδα:'GR',έλληνα:'GR',ιάπωνας:'JP'})[nationality[1].toLowerCase()],nationality[0]);
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
 const currencyPattern=/\b(?:IDR|SGD|USD|AUD|GBP|EUR|JPY|MYR|AED|MAD|TRY)\b|\b(?:rupiah|Singapore dollars?|US dollars?|Australian dollars?|pounds?(?: sterling)?|euros?|Japanese yen|yen|ringgit|dirhams?|lira)\b|γιεν|γιέν|ευρώ(?!πη)|δολάρια|δολάριο|λίρες?|λίρα|ρουπία|円/gi;
 for(const clause of t.split(/(?<=[.!?;])\s+|,\s*|\s+(?:and|but|dan|tetapi)\s+/i)){
  if(/\b(?:maybe|perhaps|unsure|mungkin|belum tahu)\b/i.test(clause))continue;
  const matches=[...clause.matchAll(currencyPattern)];currencyPattern.lastIndex=0;
  for(const m of matches){
   const value=nameToCode(m[0]);
   if(!value)continue;
   const before=clause.slice(0,m.index).toLowerCase();
   let slot=null;
   if(/report|laporan/.test(before))slot='currency.reporting';
   else if(/book|pembukuan|functional|fungsional/.test(before))slot='currency.functional';
   else if(/buy|purchas|import|beli|membeli/.test(before))slot='currency.foreignPurchases';
   else if(/paid|pay|bill|receiv|invoice|bayar|tagih|terima/.test(before))slot='currency.transactions';
   else if(pendingQuestion==='currency.functional'&&t.trim().toLowerCase()===m[0].toLowerCase())slot='currency.functional';
   else if(isFunctionalCorrection(t,previousCurrencyRole))slot='currency.functional';
   if(slot){
    const negative=/\b(?:not|never|no longer|tidak|bukan|belum)\b/i.test(before);
    add(slot,slot==='currency.transactions'||slot==='currency.foreignPurchases'?[value]:value,clause.trim(),negative?'REMOVE':slot==='currency.transactions'||slot==='currency.foreignPurchases'?(correction?'REPLACE':'ADD'):(correction?'REPLACE':'SET'));
   }
  }
 }
 if(pendingQuestion==='currency.functional'&&!facts.some(f=>f.slot.startsWith('currency.'))){
  const distinct=[...new Set([...t.matchAll(currencyPattern)].map(m=>nameToCode(m[0])).filter(Boolean))];currencyPattern.lastIndex=0;
  if(distinct.length===1){const at=t.search(currencyPattern),start=Math.max(0,t.lastIndexOf('.',at)+1),stop=t.indexOf('.',at);const quote=(t.slice(start,stop>0?stop+1:t.length).trim()||distinct[0]).slice(0,200);add('currency.functional',distinct[0],quote);}
 }
 const dates=t.match(/\b(?:period|periode)\s+(\d{4}-\d{2}-\d{2})\s+(?:to|through|sampai|hingga)\s+(\d{4}-\d{2}-\d{2})/i);
 if(dates){add('accounting.periodStart',dates[1],dates[0]);add('accounting.periodEnd',dates[2],dates[0]);}
 // Work location stated in English or Greek becomes a bounded jurisdiction candidate, never tax residence.
 const workSentence=t.split(/(?<=[.!?])\s+/).find((sentence)=>/(Τ[οό]κι|Ιαπων|Tokio|Tokyo|Japan)/i.test(sentence)&&/(εργαζ|ζω|μέν|live|work|based)/i.test(sentence));
 if(workSentence)jurisdictionFacts.push({basis:'BUSINESS_WORK_LOCATION',countryCode:/(Ελλ[αά]δ|Greece)/i.test(workSentence)?'GR':'JP',source:'USER',supportingQuote:workSentence.trim().slice(0,200),confidence:1,status:'CANDIDATE'});
 return {facts,jurisdictionFacts:jurisdictionFacts.map(f=>({...f,operation:correction?'REPLACE':f.status==='REJECTED'?'REMOVE':'SET'}))};
}
function turn(state,text){const signals=detectSignals(text,{pendingQuestion:state.pendingQuestion,previousCurrencyRole:state.lastCurrencyRole});const {applyFacts}=require('./profiler');const next=applyFacts(state,signals.facts,'USER',{jurisdictionFacts:signals.jurisdictionFacts});const question=planQuestion(next,next.slots['user.language'].value);return {profileState:next,signals,question,complete:question.key==='done'};}
module.exports={detectSignals,turn,nextQuestion:planQuestion};
