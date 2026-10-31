'use strict';
const {fingerprint,deepFreeze}=require('../onboarding/canonical');
const {assertJsonData,NAME,fromMoney,numberValue}=require('./dsl');
const {FACT_TYPES}=require('./contracts');
const {parseEffectiveDate}=require('../fabric/normalizer');
const MULTI_VALUE_FACT_BASES=new Set(['CUSTOMER_LOCATION','ACCOUNT_LOCATION','WITHHOLDING','POSSIBLE_PE']);
const DEMO_POLICY_FACTS=new Set(['TAX_RESIDENCE','SOURCE','SUBJECT_TYPE','INCOME_TYPE','HOUSEHOLD_PARTS']);
function candidateTaxFacts({scopeId,subjectId,revision,period,economicDate,currency,facts}){
 const data={scopeId,subjectId,revision,period,economicDate,currency,facts};assertJsonData(data);
 if(typeof scopeId!=='string'||!scopeId||typeof subjectId!=='string'||!subjectId||!Number.isInteger(revision)||revision<0||!parseEffectiveDate(economicDate)||!parseEffectiveDate(period?.periodStart)||!parseEffectiveDate(period?.periodEnd)||period.periodStart>period.periodEnd||economicDate<period.periodStart||economicDate>period.periodEnd||!Array.isArray(facts)||facts.length>100)throw Error('Valid scoped tax fact snapshot required');
 for(const f of facts){if(!NAME.test(f.name??'')||!FACT_TYPES.includes(f.type)||!Object.hasOwn(f,'value')||typeof f.evidenceReference!=='string'||!f.evidenceReference.trim())throw Error('Typed, evidenced semantic fact required');if(f.type==='MONEY')fromMoney(f.value,currency);else if(f.type==='NUMBER')numberValue(f.value);else if(f.type==='BOOLEAN'?typeof f.value!=='boolean':typeof f.value!=='string')throw Error('Invalid fact value type');if(f.type==='COUNTRY'&&!/^[A-Z]{2}$/.test(f.value))throw Error('Explicit ISO country code required');}
 return deepFreeze({...JSON.parse(JSON.stringify(data)),status:'CANDIDATE',aiAuthority:'CANDIDATE_ONLY',snapshotHash:fingerprint(data),confirmation:null});
}
function confirmTaxFacts(candidate,{decisionSource,actor,reviewedSnapshotHash,policyMode='STRICT'}={}){
 if(decisionSource==='BIGM_DEMO_POLICY'&&policyMode==='HACKATHON_DEMO'){
  if(reviewedSnapshotHash!==candidate.snapshotHash||!candidate.facts.length||candidate.facts.some(f=>f.confirmationAuthority!=='USER_INPUT'&&!(f.confirmationAuthority==='BIGM_DEMO_POLICY'&&f.provisional===true&&DEMO_POLICY_FACTS.has(f.name)&&typeof f.evidenceReference==='string'&&f.evidenceReference.trim())&&!(f.confirmationAuthority==='CALCULATION'&&f.provisional===true&&f.type==='MONEY'&&typeof f.evidenceReference==='string'&&f.evidenceReference.trim())))throw Error('Demo legal facts require explicit provisional policy provenance and evidence');
  const rebuilt=candidateTaxFacts(candidate);if(rebuilt.snapshotHash!==candidate.snapshotHash)throw Error('Tax facts changed');
  const provisionalFacts=rebuilt.facts.filter(f=>f.confirmationAuthority==='BIGM_DEMO_POLICY').map(f=>({name:f.name,evidenceReference:f.evidenceReference,provisional:true})),calculatedFacts=rebuilt.facts.filter(f=>f.confirmationAuthority==='CALCULATION').map(f=>({name:f.name,evidenceReference:f.evidenceReference,provisional:true}));
  return deepFreeze({...rebuilt,status:'CONFIRMED',confirmation:{decisionSource:'BIGM_DEMO_POLICY',confirmationAuthority:'BIGM_DEMO_POLICY',policyMode,actor:'BIGM_DEMO_POLICY',provisional:true,provisionalFacts,calculatedFacts,snapshotHash:rebuilt.snapshotHash,at:new Date().toISOString()}});
 }
 if(decisionSource==='USER_INPUT'&&policyMode==='HACKATHON_DEMO'){
  if(reviewedSnapshotHash!==candidate.snapshotHash||!candidate.facts.length||candidate.facts.some(f=>f.confirmationAuthority!=='USER_INPUT'))throw Error('Every demo-confirmed fact must have direct user-input provenance');
  const rebuilt=candidateTaxFacts(candidate);if(rebuilt.snapshotHash!==candidate.snapshotHash)throw Error('Tax facts changed');
  return deepFreeze({...rebuilt,status:'CONFIRMED',confirmation:{decisionSource:'USER_INPUT',confirmationAuthority:'USER_INPUT',policyMode,actor:'USER',snapshotHash:rebuilt.snapshotHash,at:new Date().toISOString()}});
 }
 if(decisionSource!=='HUMAN'||typeof actor!=='string'||!actor.trim()||/^(ai|model|meta|muse|system)(?:$|[: -])/i.test(actor)||reviewedSnapshotHash!==candidate.snapshotHash)throw Error('Explicit human confirmation of exact tax facts required');
 const rebuilt=candidateTaxFacts(candidate);if(rebuilt.snapshotHash!==candidate.snapshotHash)throw Error('Tax facts changed');
 return deepFreeze({...rebuilt,status:'CONFIRMED',confirmation:{decisionSource,actor,snapshotHash:rebuilt.snapshotHash,at:new Date().toISOString()}});
}
function inspectFacts(snapshot,{policyMode='STRICT'}={}){
 try{const rebuilt=candidateTaxFacts(snapshot);const userConfirmed=policyMode==='HACKATHON_DEMO'&&snapshot.confirmation?.decisionSource==='USER_INPUT'&&snapshot.confirmation?.policyMode==='HACKATHON_DEMO'&&snapshot.facts.every(f=>f.confirmationAuthority==='USER_INPUT');const demoPolicyConfirmed=policyMode==='HACKATHON_DEMO'&&snapshot.confirmation?.decisionSource==='BIGM_DEMO_POLICY'&&snapshot.confirmation?.confirmationAuthority==='BIGM_DEMO_POLICY'&&snapshot.confirmation?.policyMode==='HACKATHON_DEMO'&&snapshot.confirmation?.provisional===true&&snapshot.facts.every(f=>f.confirmationAuthority==='USER_INPUT'||(f.confirmationAuthority==='BIGM_DEMO_POLICY'&&f.provisional===true&&DEMO_POLICY_FACTS.has(f.name)&&typeof f.evidenceReference==='string'&&f.evidenceReference.trim())||(f.confirmationAuthority==='CALCULATION'&&f.provisional===true&&f.type==='MONEY'&&typeof f.evidenceReference==='string'&&f.evidenceReference.trim()))&&snapshot.confirmation.provisionalFacts?.length===snapshot.facts.filter(f=>f.confirmationAuthority==='BIGM_DEMO_POLICY').length&&snapshot.confirmation.calculatedFacts?.length===snapshot.facts.filter(f=>f.confirmationAuthority==='CALCULATION').length;if(rebuilt.snapshotHash!==snapshot.snapshotHash||snapshot.status!=='CONFIRMED'||snapshot.confirmation?.snapshotHash!==rebuilt.snapshotHash||(!userConfirmed&&!demoPolicyConfirmed&&(snapshot.confirmation?.decisionSource!=='HUMAN'||typeof snapshot.confirmation.actor!=='string'||!snapshot.confirmation.actor.trim()||/^(ai|model|meta|muse|system)(?:$|[: -])/i.test(snapshot.confirmation.actor))))return {status:'REVIEW_REQUIRED',reason:'CONFIRMED_TAX_FACTS_REQUIRED'};
  const facts=new Map();for(const f of snapshot.facts){
   if(!facts.has(f.name)){facts.set(f.name,f);continue;}
   if(fingerprint(facts.get(f.name))===fingerprint(f))continue;
   if(MULTI_VALUE_FACT_BASES.has(f.name))continue;
   const base=(f.name.match(/^([A-Z][A-Z0-9_]*)_[A-Z]{2}$/)||[])[1];
   if(base&&MULTI_VALUE_FACT_BASES.has(base))continue;
   return {status:'CONFLICT',reason:'CONFLICTING_TAX_FACTS'};
  }
  return {status:'CONFIRMED',facts};
 }catch(e){return {status:'REVIEW_REQUIRED',reason:'INVALID_TAX_FACT_SNAPSHOT'};}
}
function profileTaxFactCandidates(profileState,{scopeId,subjectId,period,economicDate,currency}={}){
 const facts=[];for(const f of profileState.jurisdictionFacts??[]){if(f.countryCode&&['CANDIDATE','CONFIRMED'].includes(f.status)&&['REGISTRATION','TAX_RESIDENCE','SOURCE','WITHHOLDING','BUSINESS_WORK_LOCATION','CUSTOMER_LOCATION','POSSIBLE_PE','ACCOUNT_LOCATION'].includes(f.basis)){
  const multi=MULTI_VALUE_FACT_BASES.has(f.basis);
  facts.push({name:multi?`${f.basis}_${f.countryCode}`:f.basis,type:'COUNTRY',value:f.countryCode,evidenceReference:f.supportingQuote??'Profile candidate: '+f.basis,...(f.source==='USER'&&f.supportingQuote?{confirmationAuthority:'USER_INPUT'}:{})});}}
 const subject=profileState.slots?.['org.subjectType'];if(subject?.value&&['CANDIDATE','CONFIRMED'].includes(subject.status))facts.push({name:'SUBJECT_TYPE',type:'STRING',value:subject.value,evidenceReference:subject.supportingQuote??'Profile candidate subject type',...(subject.source==='USER'&&subject.supportingQuote?{confirmationAuthority:'USER_INPUT'}:{})});
 const nationality=profileState.slots?.['user.nationality'];if(nationality?.value)facts.push({name:'NATIONALITY',type:'COUNTRY',value:nationality.value,evidenceReference:nationality.supportingQuote??'Profile candidate nationality',...(nationality.source==='USER'&&nationality.supportingQuote?{confirmationAuthority:'USER_INPUT'}:{})});
 return candidateTaxFacts({scopeId,subjectId,revision:profileState.revision,period,economicDate,currency,facts});
}
module.exports={candidateTaxFacts,confirmTaxFacts,inspectFacts,profileTaxFactCandidates,MULTI_VALUE_FACT_BASES};
