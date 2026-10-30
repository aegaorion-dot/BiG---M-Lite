'use strict';
const {assertDate}=require('../domain/organization');
const {isKnownJurisdiction}=require('../global/jurisdictions'),{isKnownCurrency}=require('../global/currencies');
const KINDS=['PERSONAL','EMPLOYMENT','RENTAL','OPERATING_BUSINESS','INVESTMENT_PROJECT'];
function validateScopes(value){
 if(!Array.isArray(value)||!value.length||value.length>10)throw Error('Bounded economic scopes required');
 const ids=new Set();for(const s of value){if(!s||Object.keys(s).some(k=>!['scopeId','kind','name','countryCode','legalStructure','entityName','usage','bookkeepingCurrency','reportingCurrency'].includes(k))||!/^[-A-Z0-9_]{1,40}$/.test(s.scopeId)||ids.has(s.scopeId)||!KINDS.includes(s.kind)||typeof s.name!=='string'||!s.name.trim()||s.name.length>120)throw Error('Invalid economic scope');ids.add(s.scopeId);
  if(s.countryCode!=null&&!isKnownJurisdiction(s.countryCode))throw Error('Invalid scope location');
  for(const k of ['bookkeepingCurrency','reportingCurrency'])if(s[k]!=null&&!isKnownCurrency(s[k]))throw Error('Invalid scope currency');
  for(const k of ['legalStructure','entityName','usage'])if(s[k]!=null&&(typeof s[k]!=='string'||s[k].length>120))throw Error('Invalid declared scope details');
 }return value;
}
function validatePresence(value){
 if(!Array.isArray(value)||value.length>30)throw Error('Bounded presence intervals required');
 const rows=value.map(r=>{if(!r||Object.keys(r).some(k=>!['countryCode','entryDate','exitDate'].includes(k))||!isKnownJurisdiction(r.countryCode))throw Error('Invalid physical presence');assertDate(r.entryDate,'entry');assertDate(r.exitDate,'exit');if(r.entryDate>=r.exitDate)throw Error('Positive half-open presence interval required');return r;}).sort((a,b)=>a.entryDate.localeCompare(b.entryDate));
 for(let i=1;i<rows.length;i++)if(rows[i].entryDate<rows[i-1].exitDate)throw Error('Overlapping physical presence requires correction');return value;
}
function presenceDays(intervals,{start,endExclusive}){assertDate(start,'window start');assertDate(endExclusive,'window end');if(start>=endExclusive)throw Error('Invalid presence window');validatePresence(intervals);const byCountry={};
 for(const r of intervals){const a=r.entryDate>start?r.entryDate:start,b=r.exitDate<endExclusive?r.exitDate:endExclusive;if(a<b)byCountry[r.countryCode]=(byCountry[r.countryCode]??0)+(Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000;}
 return {start,endExclusive,convention:'ENTRY_INCLUSIVE_EXIT_EXCLUSIVE_CALENDAR_DAYS_NOT_LEGAL_RESIDENCE_TEST',byCountry,taxResidence:null,status:'REVIEW_REQUIRED'};
}
function groupedRequirement(state,locale){const scopes=state.slots['org.economicScopes']?.value;if(!scopes?.length)return null;
 const missing=[];if(!state.slots['presence.intervals']?.value?.length)missing.push('presence.intervals');if(!state.slots['currency.functional']?.value)missing.push('currency.functional');if(scopes.some(s=>!s.legalStructure||s.legalStructure==='UNKNOWN'||!s.usage||s.usage==='UNKNOWN'))missing.push('org.economicScopes');
 if(!missing.length)return null;
 const prompts={
  'presence.intervals':{
   ar:'شنو هي تواريخ الدخول والخروج ديالك فكل بلاد، وفين كنتي كتخدم فعلياً؟',
   id:'Apa tanggal masuk dan keluar Anda di setiap negara, dan di mana Anda bekerja secara fisik?',
   en:'What were your entry and exit dates in each country, and where did you work physically?'
  },
  'org.economicScopes':{
   ar:'شنو الشكل القانوني والاستعمال اللي نسجلو لكل نشاط؟ إلا ما عارفش، قول ما عارفش.',
   id:'Struktur hukum dan penggunaan apa yang perlu dicatat untuk tiap kegiatan? Jika tidak tahu, katakan saja.',
   en:'What legal structure and usage should we record for each activity? If you do not know, say so.'
  },
  'currency.functional':{
   ar:'بأي عملة بغيتي نسجلو الدفاتر؟',
   id:'Mata uang apa yang ingin Anda gunakan untuk pembukuan?',
   en:'Which currency should BiG-M use for bookkeeping?'
  }
 };
 const language=/^ar(?:-|$)/i.test(locale)?'ar':/^id(?:-|$)/i.test(locale)?'id':'en';
 const text=missing.map(key=>prompts[key][language]).join(' ');
 return {key:'context.economicScopes',text,requiredFactIds:missing,authority:'CANDIDATE_ONLY',purpose:'ECONOMIC_SCOPE_AND_GOVERNED_REVIEW',legalThresholdApplied:false};
}
module.exports={KINDS,validateScopes,validatePresence,presenceDays,groupedRequirement};
