'use strict';
const fs=require('node:fs'),path=require('node:path');
const {fingerprint}=require('../onboarding/canonical'),{parseEffectiveDate}=require('../fabric/normalizer'),{evidenceCandidate,countryPackCandidate}=require('../fabric/candidates'),{FabricGovernanceStore}=require('../fabric/governanceStore'),{sanitizeResearchRecord}=require('../fabric/researchSanitizer'),{ResearchRetriever}=require('./researchRetriever');
const {routeResearchQuestions}=require('./researchQuestions');
function validateResidenceCandidates(proposed,{job,retriever,governance=new FabricGovernanceStore()}){
 if(!proposed||!['CANDIDATE','REVIEW_REQUIRED','MISSING_FACT','CONFLICT'].includes(proposed.status)||!Array.isArray(proposed.candidates)||proposed.candidates.length>8||!['missingFacts','conflicts','periodIssues','unresolved'].every(k=>Array.isArray(proposed[k])))throw Error('Research result schema required');
 if(/"(?:status|governance|decision)"\s*:\s*"(?:APPROVED|ACTIVE)"/.test(JSON.stringify(proposed)))throw Error('Muse cannot approve law');
 for(const f of proposed.missingFacts)if(f.status!=='MISSING_FACT'||!f.factId||!f.question||!f.whyNeeded)throw Error('Explicit conversational missing-fact request required');
 const candidateIds=[],bundles=[],unresolved=[...proposed.unresolved],detectedConflicts=[],effectivePeriodIssues=[],routing=routeResearchQuestions(proposed.missingFacts);
 unresolved.push(...routing.researchGaps.map(g=>({code:'MISROUTED_LEGAL_RESEARCH_GAP',factId:g.factId})));
 function bind(ref,jurisdiction){
  if(ref.evidenceRef){const observed=job.readings.flatMap(p=>(p.citationOptions??[]).map(option=>({p,option}))).find(r=>r.option.evidenceRef===ref.evidenceRef);if(!observed)throw Error('Unknown actual citation option');ref={...ref,sourceHandle:observed.p.sourceHandle,locator:observed.p.locator,quote:observed.option.quote};}
  const source=retriever.sources.get(ref.sourceHandle),read=job.readings.find(p=>p.sourceHandle===ref.sourceHandle&&p.locator===ref.locator&&typeof ref.quote==='string'&&ref.quote.trim()&&p.text.includes(ref.quote));
  if(!source||source.item.jurisdictionCode!==jurisdiction||!read)throw Error('Exact actually-read evidence required; search snippets are not evidence');
  const anchor=source.envelope.citationAnchors.find(a=>a.locator===ref.locator),start=source.envelope.normalizedContent.text.indexOf(ref.quote,anchor?.start??0);
  if(!anchor||start<anchor.start||start+ref.quote.length>anchor.end)throw Error('Anchored quotation required');
  return {source,evidence:evidenceCandidate(source.envelope,{anchorId:anchor.anchorId,start,end:start+ref.quote.length,quote:ref.quote,proposedBy:'META_MUSE'})};
 }
 for(const c of proposed.candidates){
  if(!job.jurisdictions.includes(c.jurisdiction)||c.researchRunId!==job.researchId||!Number.isInteger(c.taxYear)||c.taxYear!==Number(job.taxPeriod.periodStart.slice(0,4))||!['HIGH','MEDIUM','LOW'].includes(c.confidence)||!c.issuingAuthority||!c.sourceTitle||!c.articleSectionPage||!Array.isArray(c.evidence)||!c.evidence.length||c.evidence.length>15||!Array.isArray(c.crossChecks)||!Array.isArray(c.conditions)||!Array.isArray(c.exceptions)||!Array.isArray(c.fieldEvidence))throw Error('Complete structured evidence bundle required');
  if(c.candidateRule?.ruleType!=='RESIDENCE_TEST'||!c.candidateRule.ruleId||typeof c.candidateRule.legalTest!=='string'||!c.candidateRule.legalTest.trim()||typeof c.candidateRule.formula!=='string'||!Array.isArray(c.candidateRule.requiredFacts)||!Array.isArray(c.candidateRule.parameters))throw Error('Residence candidate schema required');
  if(c.effectiveFrom!==null&&!parseEffectiveDate(c.effectiveFrom)||c.effectiveTo!==null&&!parseEffectiveDate(c.effectiveTo)||c.effectiveFrom&&c.effectiveTo&&c.effectiveFrom>c.effectiveTo)throw Error('Invalid legal effective period');
  const bound=c.evidence.map(r=>bind(r,c.jurisdiction)),primary=bound[0].source;
  if(c.sourceUrl!==primary.item.url||c.sourceTitle!==primary.item.title||c.sourceClassification!==primary.item.sourceRole)throw Error('Source title/URL/classification provenance mismatch');
  for(const field of ['candidateRule.legalTest','candidateRule.formula','conditions','exceptions',...(c.effectiveFrom?['effectiveFrom']:[]),...(c.effectiveTo?['effectiveTo']:[])])if(!c.fieldEvidence.some(b=>b.field===field&&Number.isInteger(b.evidenceIndex)&&bound[b.evidenceIndex]))throw Error('Operative field lacks evidence binding: '+field);
  for(const p of c.candidateRule.parameters)if(typeof p.name!=='string'||typeof p.unit!=='string'||typeof p.value!=='string'||!/^\d+(?:\.\d+)?$/.test(p.value)||!Number.isInteger(p.evidenceIndex)||!bound[p.evidenceIndex])throw Error('Evidence-bound exact decimal legal parameter required');
  const checks=c.crossChecks.map(ref=>{if(!['CONSISTENT','CONFLICT','INCONCLUSIVE'].includes(ref.result))throw Error('Explicit cross-check outcome required');return {...bind(ref,c.jurisdiction),result:ref.result};});
  const issues=[];
  if(!c.effectiveFrom)issues.push('UNKNOWN_COMMENCEMENT');
  if(c.effectiveFrom&&c.effectiveFrom>job.taxPeriod.periodStart||c.effectiveTo&&c.effectiveTo<job.taxPeriod.periodEnd)issues.push('OUT_OF_PERIOD');
  if(bound.some(b=>b.source.item.sourceRole==='MIRROR_OF_OFFICIAL_SOURCE'&&b.source.item.fidelityStatus!=='VERIFIED_IDENTICAL_TO_OFFICIAL'))issues.push('MIRROR_FIDELITY_REVIEW_REQUIRED');
  if(!checks.some(b=>b.result==='CONSISTENT'&&!bound.some(p=>p.source.artifact.rawContentHash===b.source.artifact.rawContentHash)))issues.push('INDEPENDENT_CROSS_CHECK_REQUIRED');
  if(checks.some(b=>b.result==='CONFLICT'))issues.push('SOURCE_CONFLICT');
  if(checks.some(b=>b.result==='INCONCLUSIVE'))issues.push('INCONCLUSIVE_CROSS_CHECK');
  const all=[...bound,...checks],sourceCandidate=countryPackCandidate(all.map(b=>b.source.envelope),all.map(b=>b.evidence),{label:c.candidateRule.ruleId}),bundle={...c,evidence:all.map(b=>b.evidence),researchRunId:job.researchId,sourceCandidateId:sourceCandidate.candidateId,validator:{status:issues.length?'REVIEW_REQUIRED':'EVIDENCE_VALIDATED_CANDIDATE',issues,semanticLegalApproval:false},runtimeExecutable:false};
  // Deliberately a research candidate. No executable CountryPack is fabricated here.
  const candidate={...sourceCandidate,researchRunId:job.researchId,evidenceBundle:bundle};governance.register(candidate);candidateIds.push(candidate.candidateId);bundles.push(bundle);unresolved.push(...issues.map(code=>({code,jurisdiction:c.jurisdiction,candidateId:candidate.candidateId})));
  if(issues.includes('SOURCE_CONFLICT'))detectedConflicts.push({description:'Retrieved source cross-check reports a conflict',jurisdiction:c.jurisdiction,candidateId:candidate.candidateId});
  for(const code of issues.filter(i=>i==='UNKNOWN_COMMENCEMENT'||i==='OUT_OF_PERIOD'))effectivePeriodIssues.push({description:code,jurisdiction:c.jurisdiction,candidateId:candidate.candidateId});
 }
 for(const jurisdiction of job.jurisdictions)if(!proposed.candidates.some(c=>c.jurisdiction===jurisdiction))unresolved.push({code:'MISSING_JURISDICTION_CANDIDATE',jurisdiction});
 return {status:'VALIDATED_CANDIDATES_ONLY',candidateIds,bundles,unresolved,detectedConflicts,effectivePeriodIssues,...routing,activatedRules:0,userFactsChanged:false};
}
function saveResearchReplay(file,{job,retriever}){
 if(!job.proposal||job.failure||job.mode!=='LIVE'||job.producer!=='META_MUSE_REGULATORY_RESEARCH')throw Error('Completed live research required for replay cache');
 const payload=sanitizeResearchRecord({schemaVersion:'muse-research-replay/1',job,sources:retriever.snapshot()}),data={...payload,integrityHash:fingerprint(payload)};fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');return data.integrityHash;
}
function replayResearch(file,{governance}={}){
 const data=JSON.parse(fs.readFileSync(file,'utf8')),{integrityHash,...payload}=data;if(payload.schemaVersion!=='muse-research-replay/1'||fingerprint(payload)!==integrityHash||payload.job.mode!=='LIVE')throw Error('Live research replay integrity mismatch');
 const retriever=new ResearchRetriever({root:path.dirname(file),offline:true}).restore(payload.sources),result=validateResidenceCandidates(payload.job.proposal,{job:payload.job,retriever,governance});
 if(fingerprint(result)!==fingerprint(payload.job.validatorResults.at(-1)))throw Error('Replayed validation differs');
 return {researchId:payload.job.researchId,status:payload.job.status,...result,paidCalls:0,networkRequests:0};
}
module.exports={validateResidenceCandidates,saveResearchReplay,replayResearch};
