'use strict';
// A metadata-only view of existing governed content. No model-generated law enters a registry.
function governedCatalog(registry){
 return registry.snapshot().flatMap(c=>{const p=c.executableContent,base={candidateId:c.candidateId,contentHash:c.contentHash,contentKind:c.contentKind,packId:p.packId??p.treatyPackId,version:p.version,governanceStatus:c.status,effectiveFrom:p.effectiveFrom,effectiveTo:p.effectiveTo,jurisdictions:p.jurisdictionCode?[p.jurisdictionCode]:[p.jurisdictionA,p.jurisdictionB]};
  const entries=p.rules??p.incomeArticles??[];
  return entries.length?entries.map(r=>({...base,ruleId:base.packId+'@'+p.version+'/'+(r.ruleId??r.articleId),localRuleId:r.ruleId??r.articleId,taxType:r.taxType??p.coveredTaxes,incomeOrEventType:r.incomeOrEventType,subjectTypes:r.subjectTypes??[],requiredFacts:Object.keys({...p.requiredFacts,...r.requiredFacts})})):[{...base,ruleId:base.packId+'@'+p.version,localRuleId:null,coverageStatus:p.coverageStatus,requiredFacts:Object.keys(p.requiredFacts??{}),packMetadataOnly:true}];
 });
}
function resolveSuggestion(entry,registry,review,readiness){
 if(!review||readiness?.status==='PROFILE_REVISION_CHANGED')return {status:'EXPLICIT_CURRENT_TAX_SCOPE_REQUIRED',applicabilityConfirmed:false};
 const request=review.request;
 if(entry.contentKind==='TREATY_PACK'){
  const checked=require('../tax/facts').inspectFacts(review.snapshot),facts=checked.status==='CONFIRMED'?checked.facts:new Map();
  const result=require('../tax/treatyResolver').resolveTreaty({registry,...request,facts});
  return {status:result.status,reason:result.reason,requiredMissingFacts:result.requiredMissingFacts,selectedTreatyPack:result.selectedTreatyPack,applicabilityConfirmed:false};
 }
 const subject=review.snapshot.facts.find(f=>f.name==='SUBJECT_TYPE');
 if(!subject)return {status:'SUBJECT_TYPE_REQUIRED',applicabilityConfirmed:false};
 const result=require('../tax/contentRegistry').resolveDomestic({registry,...request,subjectType:subject.value});
 return {status:result.status,selected:result.rules.some(b=>b.candidate.candidateId===entry.candidateId&&b.rule.ruleId===entry.localRuleId),applicabilityConfirmed:false,candidates:result.candidates};
}
module.exports={governedCatalog,resolveSuggestion};
