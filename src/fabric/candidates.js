'use strict';
const {hash}=require('./artifacts');
const {deepFreeze}=require('../onboarding/canonical');
const {parseEffectiveDate,assertVerifiedEnvelope}=require('./normalizer');
const STATES=Object.freeze(['DISCOVERED','CANDIDATE','REVIEW_REQUIRED','APPROVED','SUPERSEDED','RETIRED','OUT_OF_PERIOD','MISSING_COUNTRY_PACK','CONFLICT']);
function evidenceCandidate(envelope,{anchorId,start,end,quote,proposedBy='DETERMINISTIC'}={}){
 assertVerifiedEnvelope(envelope);
 if(envelope.processingState!=='NORMALIZED')throw Error('Source has no normalized evidence');
 const anchor=envelope.citationAnchors.find(a=>a.anchorId===anchorId);
 if(!anchor||!Number.isInteger(start)||!Number.isInteger(end)||start<anchor.start||end>anchor.end||end<=start||typeof quote!=='string'||!quote.trim()||envelope.normalizedContent.text.slice(start,end)!==quote)throw Error('Citation must match an exact anchored source passage');
 const data={jurisdictionCode:envelope.jurisdictionCode,sourceId:envelope.sourceId,envelopeId:envelope.envelopeId,
  provenance:{...envelope.provenance,anchorId,locator:anchor.locator,start,end,quote,quoteHash:hash(quote)},
  authority:envelope.authority,temporal:envelope.temporal,status:'CANDIDATE',aiAuthority:'CANDIDATE_ONLY',proposedBy};
 return deepFreeze({...data,evidenceId:hash(JSON.stringify(data))});
}
function countryPackCandidate(envelopes,evidence,{label='Research candidate'}={}){
 if(!Array.isArray(evidence)||!evidence.length)throw Error('Evidence required');
 const jurisdiction=evidence[0].jurisdictionCode;if(evidence.some(e=>e.jurisdictionCode!==jurisdiction))throw Error('Mixed jurisdiction candidate');
 for(const e of evidence){const env=envelopes.find(s=>s.envelopeId===e.envelopeId);if(!env||env.jurisdictionCode!==jurisdiction)throw Error('Missing source envelope');
  if(['DISCOVERY_FEED','API_SCHEMA','STRUCTURED_DATA'].includes(env.metadata.documentKind))throw Error('Discovery metadata is not CountryPack content');
  const verified=evidenceCandidate(env,{...e.provenance,proposedBy:e.proposedBy});if(verified.evidenceId!==e.evidenceId)throw Error('Evidence provenance changed');
 }
 const data={schemaVersion:'fabric-country-pack-candidate/1',jurisdictionCode:jurisdiction,label,evidenceIds:evidence.map(e=>e.evidenceId),
  provenance:evidence.map(e=>e.provenance),envelopeIds:evidence.map(e=>e.envelopeId),
  // Requested accounting periods are never treated as the law's effective period.
  temporal:{effectiveFrom:null,effectiveTo:null,status:'REVIEW_REQUIRED'},
  status:'CANDIDATE',aiAuthority:'CANDIDATE_ONLY',executorSupported:false,runtimeExecutable:false,reviewHistory:[]};
 return deepFreeze({...data,candidateId:hash(JSON.stringify(data))});
}
function reviewCandidate(candidate,{decisionSource,actor,decision,reason,reviewedHashes}={}){
 if(decisionSource!=='HUMAN'||typeof actor!=='string'||!actor.trim()||/^(?:ai|model|muse|meta|system)(?:$|[: -])/i.test(actor))throw Error('Human review required; AI is CANDIDATE_ONLY');
 if(!['REVIEW_REQUIRED','APPROVED','SUPERSEDED','RETIRED','CONFLICT'].includes(decision)||!reason?.trim())throw Error('Review decision and reason required');
 if(['RETIRED','SUPERSEDED'].includes(candidate.status))throw Error('Terminal candidate version; create a new version');
 const hashes=[...new Set(candidate.provenance.map(p=>p.rawContentHash))].sort();
 if(decision==='APPROVED'&&JSON.stringify([...(reviewedHashes??[])].sort())!==JSON.stringify(hashes))throw Error('Human must review every source hash');
 // APPROVED here means a reviewed research candidate, not an executable tax pack.
 return deepFreeze({...candidate,status:decision,runtimeExecutable:false,executorSupported:false,reviewHistory:[...candidate.reviewHistory,{actor,decisionSource,decision,reason,reviewedHashes:hashes,at:new Date().toISOString()}]});
}
function resolveCandidate(candidate,{periodStart,periodEnd}={}){
 if(!candidate)return {status:'MISSING_COUNTRY_PACK',runtimeExecutable:false};
 if(!parseEffectiveDate(periodStart)||!parseEffectiveDate(periodEnd)||periodStart>periodEnd)throw Error('Valid accounting period required');
 if(candidate.status==='CONFLICT')return {status:'CONFLICT',runtimeExecutable:false};
 if(['RETIRED','SUPERSEDED'].includes(candidate.status))return {status:candidate.status,runtimeExecutable:false};
 const {effectiveFrom, effectiveTo}=candidate.temporal;
 if(!parseEffectiveDate(effectiveFrom)||!parseEffectiveDate(effectiveTo)||effectiveFrom>effectiveTo)return {status:'REVIEW_REQUIRED',runtimeExecutable:false};
 if(periodStart<effectiveFrom||periodEnd>effectiveTo)return {status:'OUT_OF_PERIOD',runtimeExecutable:false};
 return {status:'REVIEW_REQUIRED',runtimeExecutable:false,reason:'Foundation has no reviewed deterministic tax executor'};
}
module.exports={STATES,evidenceCandidate,countryPackCandidate,reviewCandidate,resolveCandidate};
