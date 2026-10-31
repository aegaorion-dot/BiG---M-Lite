'use strict';
// Minimal safe bridge: Muse declarative RuleCandidate -> governed executable content.
// Uses only existing Fabric objects, attachExecutableContent(), validateCountryPack().
// No eval, no generated code. Only declarative AST/data accepted by the tax DSL.
const {attachExecutableContent}=require('../fabric/candidates');
const {validateCountryPack}=require('../tax/contracts');
const {assertJsonData}=require('../tax/dsl');
const {feedbackFromError,toValidationFeedback}=require('./researchWorkflow');
const {lookupSource}=require('../fabric/registry');

function demoDisclosureFor(sourceCandidate,declarativePack){
 const b=sourceCandidate?.evidenceBundle,a=b?.applicabilityAssessment;
 if(!b||b.sourceClassification!=='OFFICIAL_SOURCE'||b.jurisdiction!==declarativePack.jurisdictionCode||a?.status==='UNSUPPORTED'||b.validator?.issues?.includes('UNSUPPORTED'))return null;
 const sources=b.evidence??[];if(!sources.length||sources.some(e=>!e.authority?.authorityCode||!lookupSource(b.jurisdiction,e.provenance?.sourceUrl)))return null;
 const proposition=b.applicabilityAssessment?.propositionSupported??b.propositionSupported??b.candidateRule?.legalTest;
 const fieldEvidence=b.fieldEvidence??[],propositionBinding=fieldEvidence.some(binding=>binding.field==='candidateRule.legalTest'&&Number.isInteger(binding.evidenceIndex)&&sources[binding.evidenceIndex]);
 if(!proposition?.trim()||!propositionBinding)return null;
 const hashes=[...new Set(sourceCandidate.provenance.map(p=>p.rawContentHash))].sort();if(!hashes.length||declarativePack.evidenceRefs.some(r=>!hashes.includes(r.rawContentHash)||!sourceCandidate.evidenceIds.includes(r.evidenceId)))return null;
 const citedNumbers=new Set((b.candidateRule?.parameters??[]).filter(p=>Number.isInteger(p.evidenceIndex)&&sources[p.evidenceIndex]).map(p=>String(p.value)));
 const packNumbers=(declarativePack.rules??[]).flatMap(r=>Object.values(r.parameters??{}).filter(p=>p?.valueType==='NUMBER').map(p=>String(p.value)));
 if(packNumbers.some(v=>!citedNumbers.has(v)))return null;
 const publicationDate=a?.sourcePublicationDate??null,revisionDate=a?.sourceRevisionDate??null;
 const propositionSupported=a?.propositionSupported??b.propositionSupported??b.candidateRule.legalTest;
 const sourceYear=(publicationDate??revisionDate)?.slice(0,4)??null;
 const uncertainty=a?.uncertainty||'Applicability to the requested calculation period has not been fully verified.';
 const fieldDate=(field,value)=>value&&fieldEvidence.some(binding=>binding.field===field&&Number.isInteger(binding.evidenceIndex)&&sources[binding.evidenceIndex])?value:null;
 return {policyMode:'HACKATHON_DEMO',status:'PROVISIONALLY_ACCEPTED_DEMO',approvalAuthority:'BIGM_DEMO_POLICY',officialSourceAuthority:b.issuingAuthority,sourceTitle:b.sourceTitle,sourceUrl:b.sourceUrl,sourceHashes:hashes,sourcePublicationDate:publicationDate,sourceRevisionDate:revisionDate,sourceYear,effectiveFromFound:fieldDate('effectiveFrom',b.effectiveFrom),effectiveToFound:fieldDate('effectiveTo',b.effectiveTo),declaredPackEffectiveFrom:declarativePack.effectiveFrom??null,declaredPackEffectiveTo:declarativePack.effectiveTo??null,propositionSupported,applicabilityWarning:'EFFECTIVE_PERIOD_NOT_VERIFIED_FOR_REQUESTED_YEAR',applicabilityAssessment:a?.status??'NOT_ASSESSED',researchValidationIssues:b.validator?.issues??[],independentCrossCheckPerformed:Boolean(b.independentCrossCheckPerformed),supersedingSearchPerformed:Boolean(a?.supersedingSearches?.length),supersedingSearchResult:a?.supersedingSearches?.length?'NO_SUPERSEDING_REVISION_FOUND':'NOT_PERFORMED',supersedingSearches:(a?.supersedingSearches??[]).map(s=>({sourceId:s.sourceId,query:s.query,searchCallId:s.searchCallId,outcome:s.outcome})),absenceDisclaimer:'No superseding-rule search was recorded for this candidate. Absence of a found revision is not proof that no revision exists.',remainingUncertainty:uncertainty,recommendation:'Revalidate the current legal version before production filing or use.',effectiveWindowUnknown:!b.effectiveFrom&&!b.effectiveTo};
}

function buildExecutableMuseCandidate({sourceCandidate,declarativePack,policyMode='STRICT'}){
 try{
  assertJsonData({sourceCandidate,declarativePack});
  if(!sourceCandidate?.candidateId||!Array.isArray(sourceCandidate.provenance)||!sourceCandidate.provenance.length)throw Error('Governed source candidate required');
  if(sourceCandidate.status!=='CANDIDATE')throw Error('Source candidate must be CANDIDATE before executable content');
  if(!declarativePack||typeof declarativePack!=='object')throw Error('Declarative pack required');
  const packJurisdiction=declarativePack.jurisdictionCode;
  if(packJurisdiction!==sourceCandidate.jurisdictionCode)throw Error('Pack jurisdiction must match source candidate jurisdiction');
  const sourceHashes=new Set(sourceCandidate.provenance.map(p=>p.rawContentHash));
  const sourceEvidenceIds=new Set(sourceCandidate.evidenceIds??[]);
  for(const ref of declarativePack.evidenceRefs??[]){
   if(!ref?.evidenceId||!ref?.rawContentHash)throw Error('Pack evidence ref incomplete');
   if(!sourceHashes.has(ref.rawContentHash)||!sourceEvidenceIds.has(ref.evidenceId))throw Error('Pack evidence not bound to Fabric source candidate');
  }
  const demoDisclosure=policyMode==='HACKATHON_DEMO'?demoDisclosureFor(sourceCandidate,declarativePack):null;
  if(demoDisclosure)demoDisclosure.status='PROVISIONALLY_ACCEPTED_DEMO';
  validateCountryPack(declarativePack,{allowUndatedDemo:Boolean(demoDisclosure)});
  const candidate=attachExecutableContent({...sourceCandidate,...(demoDisclosure?{demoDisclosure}:{})},'COUNTRY_PACK',JSON.parse(JSON.stringify(declarativePack)));
  return {ok:true,candidate};
 }catch(error){
  const context={packId:declarativePack?.packId??null,field:declarativePack?.packId?'executableContent':'pack'};
  return {ok:false,feedback:feedbackFromError(error,context)};
 }
}

function validateMusePackOnly(declarativePack){
 try{
  assertJsonData(declarativePack);
  validateCountryPack(declarativePack);
  return {ok:true};
 }catch(error){
  return {ok:false,feedback:feedbackFromError(error,{packId:declarativePack?.packId??null})};
 }
}

module.exports={buildExecutableMuseCandidate,validateMusePackOnly,demoDisclosureFor};
