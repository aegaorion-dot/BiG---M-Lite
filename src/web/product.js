'use strict';
// Presentation of existing state only. This module never approves rules or calculates tax.
function productState(store, catalog=[]) {
 const ob=store.onboardingState(),ws=store.workspaceProfile(),review=store.taxReadiness(),active=ob.active?.profileSnapshot;
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),facts=[];
 for(const key of ['org.name','org.businessType','user.nationality','currency.functional','currency.reporting']){
  const f=ob.slots[key];if(!f)continue;const confirmed=Boolean(active&&ob.active.profileRevision===ob.profileRevision&&same(active.slots[key]?.value,f.value));
  facts.push({role:key,value:f.value,status:f.value==null?'UNKNOWN':confirmed?'CONFIRMED':f.status==='CONFLICT'?'CONFLICT':'CANDIDATE'});
 }
 for(const basis of ['BUSINESS_WORK_LOCATION','REGISTRATION','TAX_RESIDENCE','CUSTOMER_LOCATION']){
  const values=ob.jurisdictionCandidates.filter(f=>f.basis===basis&&f.status!=='REJECTED');
  if(!values.length)facts.push({role:basis,value:null,status:'UNKNOWN'});
  for(const f of values)facts.push({role:basis,value:f.countryCode,status:active&&ob.active.profileRevision===ob.profileRevision&&active.jurisdictionFacts.some(a=>a.basis===basis&&a.countryCode===f.countryCode)?'CONFIRMED':f.status==='CONFLICT'?'CONFLICT':'CANDIDATE'});
 }
 const contextCountries=new Set(ob.jurisdictionCandidates.filter(f=>f.status!=='REJECTED'&&['BUSINESS_WORK_LOCATION','REGISTRATION','TAX_RESIDENCE','CUSTOMER_LOCATION'].includes(f.basis)).map(f=>f.countryCode));
 const packs=catalog.filter(c=>c.kind==='TREATY_PACK'?c.jurisdictions.every(j=>contextCountries.has(j)):c.jurisdictions.some(j=>contextCountries.has(j))).map(c=>({...c,selected:ws.countryPackResolution?.selectedPackIds?.includes(c.packId+'@'+c.version)??false}));
 const resolution=ws.countryPackResolution??ob.countryPackResolution,reasons=[];
 if(!ws.activated||!review||review.requiredMissingFacts?.length)reasons.push({status:'MISSING_INFORMATION',code:!review?'TAX_SCOPE_REQUIRED':review.status,missing:review?.requiredMissingFacts??[]});
 if(resolution?.status==='OUT_OF_PERIOD'||review?.status==='OUT_OF_PERIOD')reasons.push({status:'OUT_OF_PERIOD',code:'OUT_OF_PERIOD'});
 if(!packs.some(p=>p.kind==='COUNTRY_PACK'&&p.governance==='APPROVED_EXECUTABLE'))reasons.push({status:'MISSING_APPROVED_RULE',code:'NO_APPROVED_EXECUTABLE_RULE'});
 if(contextCountries.size>1&&packs.some(p=>p.kind==='TREATY_PACK'))reasons.push({status:'TREATY_REVIEW_REQUIRED',code:'APPLICABILITY_NOT_ESTABLISHED'});
 if(review?.authoritativeDetermination&&review.taxReady)reasons.push({status:'READY',code:review.status});
 else reasons.push({status:'REVIEW_REQUIRED',code:review?.status??resolution?.reason??'EXPLICIT_TAX_REVIEW_REQUIRED'});
 const cash=ws.activated?store.summary().balances.filter(b=>b.code==='101'):[];
 return {facts,tax:{status:reasons.some(r=>r.status==='READY')?'READY':reasons[0].status,reasons,amount:null,reviewStatus:review?.status??null,resolutionStatus:resolution?.status??null,packs,treatyApplicabilityConfirmed:false},cash};
}
module.exports={productState};
