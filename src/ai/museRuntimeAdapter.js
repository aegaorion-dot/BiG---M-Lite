'use strict';
// Minimal runtime adapter: governed Muse candidate -> TaxContentRegistry -> UniversalTaxEngine.
// No calculation logic here. The engine remains the only deterministic executor.
const {executableApproval}=require('../fabric/candidates');
const {fingerprint}=require('../onboarding/canonical');

function museReviewChecklist(candidate){
 if(!candidate?.candidateId)throw Error('Candidate required');
 const p=candidate.executableContent??{};
 const provenance=Array.isArray(candidate.provenance)?candidate.provenance:[];
 const hashes=[...new Set(provenance.map(x=>x.rawContentHash).filter(Boolean))].sort();
 const urls=[...new Set(provenance.map(x=>x.sourceUrl).filter(Boolean))].sort();
 return {
  candidateId:candidate.candidateId,
  packId:p.packId??p.treatyPackId??null,
  version:p.version??null,
  contentHash:candidate.contentHash??null,
  rawSourceHashes:hashes,
  sourceUrls:urls,
  evidenceRefs:Array.isArray(p.evidenceRefs)?p.evidenceRefs.map(e=>({evidenceId:e.evidenceId,rawContentHash:e.rawContentHash,sourceUrl:e.sourceUrl,locator:e.locator})):[],
  scope:{jurisdictionCode:p.jurisdictionCode??null,effectiveFrom:p.effectiveFrom??null,effectiveTo:p.effectiveTo??null,currency:p.currency??null},
  governance:{status:candidate.status??null,executable:executableApproval(candidate),lastReview:candidate.reviewHistory?.at(-1)??null},
 };
}

function registerMuseCandidate({registry,candidate}){
 if(!registry||typeof registry.register!=='function')throw Error('TaxContentRegistry required');
 if(!candidate?.candidateId)throw Error('Candidate required');
 return registry.register(candidate);
}

function determineWithMuseCandidate({engine,request,facts}){
 if(!engine||typeof engine.determine!=='function')throw Error('UniversalTaxEngine required');
 return engine.determine(request,facts);
}

function musePipelineFingerprint(candidate){
 return fingerprint({candidateId:candidate?.candidateId,contentHash:candidate?.contentHash,provenance:(candidate?.provenance??[]).map(p=>p.rawContentHash)});
}

module.exports={museReviewChecklist,registerMuseCandidate,determineWithMuseCandidate,musePipelineFingerprint};
