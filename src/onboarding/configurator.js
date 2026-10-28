'use strict';
// Pure configuration functions. Runtime activation is owned by the web store,
// which requires validation + human confirmation of the exact revision/hash.
const {planConfiguration,validateConfiguration,gapAnalysis}=require('./profiler');
const {hashProposal}=require('./readiness');
function proposeConfiguration(state,{organizationId,version=1,countryPackResolution}={}){
 if(gapAnalysis(state).length)return {ok:false,errors:['Bookkeeping currency needs your answer']};
 if(Object.values(state.slots).some(s=>s.status==='CONFLICT'))return {ok:false,errors:['Conflicting answers need clarification']};
 const plan=planConfiguration(state,{organizationId}),valid=validateConfiguration(plan);
 if(!valid.ok)return valid;
 const proposal={...valid.validated,profileFingerprint:require('./canonical').fingerprint({slots:state.slots,jurisdictionFacts:state.jurisdictionFacts}),
 jurisdictions:plan.domicile?[plan.domicile]:[],entities:plan.entityJurisdiction?[{id:'ent-1',jurisdiction:plan.entityJurisdiction}]:[],
 otherCurrencies:plan.transactionCurrencies.filter(c=>c!==plan.functionalCurrency),countryPackResolution,taxStatus:'requires_review',source:'profile-driven',version};
 proposal.hash=hashProposal(proposal);return {ok:true,proposal};
}
function validateProposal(proposal){
 const valid=validateConfiguration(proposal);if(!valid.ok)return valid;
 if(!proposal.countryPackResolution||!proposal.profileFingerprint)return {ok:false,errors:['Profile and country-pack evaluation required']};
 if(proposal.hash!==hashProposal(proposal))return {ok:false,errors:['Proposal hash mismatch']};
 return {ok:true,validated:{...valid.validated,validatedAt:new Date().toISOString()}};
}
module.exports={proposeConfiguration,validateProposal};
