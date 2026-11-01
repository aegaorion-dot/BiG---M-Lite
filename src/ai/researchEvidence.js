'use strict';
const fs=require('node:fs'),path=require('node:path');
const {fingerprint}=require('../onboarding/canonical'),{parseEffectiveDate}=require('../fabric/normalizer'),{evidenceCandidate,countryPackCandidate}=require('../fabric/candidates'),{FabricGovernanceStore}=require('../fabric/governanceStore'),{sanitizeResearchRecord}=require('../fabric/researchSanitizer'),{ResearchRetriever}=require('./researchRetriever');
const {routeResearchQuestions}=require('./researchQuestions');
function primaryDate(value){const date=value?new Date(value):null;return date&&!Number.isNaN(date.valueOf())?date.toISOString().slice(0,10):null;}
function revisionDate(value){return primaryDate(value);}
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
  const assessment=c.applicabilityAssessment??{status:'APPLICABILITY_UNRESOLVED',propositionSupported:null,supportingEvidenceIndices:[],sourcePublicationDate:primaryDate(bound[0].source.artifact.publishedAt),sourceRevisionDate:revisionDate(bound[0].source.artifact.lastModified),supersedingSearches:[],uncertainty:'No applicability assessment was recorded by the original research run.'};
  const assessmentStatuses=['UNSUPPORTED','SUPERSEDED','CONFLICTING_AUTHORITY','APPLICABILITY_UNRESOLVED','SUPPORTED_NO_SUPERSEDING_EVIDENCE'];
  if(!assessment||!assessmentStatuses.includes(assessment.status)||!Array.isArray(assessment.supersedingSearches)||typeof assessment.uncertainty!=='string')throw Error('Structured applicability assessment required');
  for(const date of [assessment.sourcePublicationDate,assessment.sourceRevisionDate])if(date!==null&&date!==undefined&&!parseEffectiveDate(date))throw Error('Applicability source dates must be exact dates or null');
  const artifactPublicationDate=primaryDate(bound[0].source.artifact.publishedAt),artifactRevisionDate=revisionDate(bound[0].source.artifact.lastModified);
  if(assessment.sourcePublicationDate!==undefined&&assessment.sourcePublicationDate!==artifactPublicationDate||assessment.sourceRevisionDate!==undefined&&assessment.sourceRevisionDate!==artifactRevisionDate)throw Error('Applicability publication/revision dates must preserve retrieved source metadata');
  if(assessment.status==='SUPPORTED_NO_SUPERSEDING_EVIDENCE'){
   if(typeof assessment.propositionSupported!=='string'||!assessment.propositionSupported.trim()||!Array.isArray(assessment.supportingEvidenceIndices)||!assessment.supportingEvidenceIndices.includes(0)||assessment.supportingEvidenceIndices.some(i=>!Number.isInteger(i)||!bound[i])||!assessment.supersedingSearches.length)throw Error('Supported applicability requires evidence for the proposition and bounded superseding searches');
   for(const search of assessment.supersedingSearches){
    if(typeof search.query!=='string'||!search.query.trim()||typeof search.searchCallId!=='string'||search.outcome!=='NO_CONTRARY_EVIDENCE')throw Error('Supported applicability requires recorded no-contrary-evidence searches');
    const authority=job.brief.preferredAllowedSources.flatMap(j=>j.jurisdiction===c.jurisdiction?j.sources:[]).find(s=>s.sourceId===search.sourceId),observed=job.searches.flatMap(s=>s.calls??[]).find(call=>call.id===search.searchCallId&&call.queries.includes(search.query));
    if(!observed||!authority||!authority.domains.some(domain=>search.query.toLowerCase().includes('site:'+domain.toLowerCase())))throw Error('Applicability search must match an observed authority-targeted official search');
   }
  }
  if(assessment.status==='SUPERSEDED'){
   if(!Array.isArray(assessment.supersedingEvidenceIndices)||!assessment.supersedingEvidenceIndices.length||assessment.supersedingEvidenceIndices.some(i=>!Number.isInteger(i)||!bound[i]||bound[i].source.item.sourceRole!=='OFFICIAL_SOURCE'||bound[i].source.artifact.rawContentHash===bound[0].source.artifact.rawContentHash))throw Error('Superseded status requires distinct bound official evidence');
   const sourceDate=assessment.sourcePublicationDate??assessment.sourceRevisionDate,hasNewerEvidence=assessment.supersedingEvidenceIndices.some(i=>{const a=bound[i].source.artifact.publishedAt??bound[i].source.artifact.lastModified;return sourceDate&&a&&Date.parse(a)>Date.parse(sourceDate);});
   if(!hasNewerEvidence)throw Error('Superseding official evidence must be demonstrably newer than the source under assessment');
  }
  const issues=[];
  if(c.effectiveFrom&&c.effectiveFrom>job.taxPeriod.periodStart||c.effectiveTo&&c.effectiveTo<job.taxPeriod.periodEnd)issues.push('OUT_OF_PERIOD');
  if(assessment.status==='UNSUPPORTED')issues.push('UNSUPPORTED');
  if(assessment.status==='SUPERSEDED')issues.push('SUPERSEDED');
  if(assessment.status==='CONFLICTING_AUTHORITY'&&!checks.some(b=>b.result==='CONFLICT'))throw Error('Conflicting-authority assessment requires an evidenced conflicting cross-check');
  if(assessment.status==='CONFLICTING_AUTHORITY'||checks.some(b=>b.result==='CONFLICT'))issues.push('CONFLICTING_AUTHORITY');
  if(assessment.status==='APPLICABILITY_UNRESOLVED')issues.push('APPLICABILITY_UNRESOLVED');
  if(bound.some(b=>b.source.item.sourceRole==='MIRROR_OF_OFFICIAL_SOURCE'&&b.source.item.fidelityStatus!=='VERIFIED_IDENTICAL_TO_OFFICIAL'))issues.push('MIRROR_FIDELITY_REVIEW_REQUIRED');
  if(!checks.some(b=>b.result==='CONSISTENT'&&!bound.some(p=>p.source.artifact.rawContentHash===b.source.artifact.rawContentHash)))issues.push('INDEPENDENT_CROSS_CHECK_REQUIRED');
  if(checks.some(b=>b.result==='INCONCLUSIVE'))issues.push('INCONCLUSIVE_CROSS_CHECK');
  const all=[...bound,...checks],sourceCandidate=countryPackCandidate(all.map(b=>b.source.envelope),all.map(b=>b.evidence),{label:c.candidateRule.ruleId}),bundle={...c,applicabilityAssessment:assessment,evidence:all.map(b=>b.evidence),researchRunId:job.researchId,sourceCandidateId:sourceCandidate.candidateId,validator:{status:issues.length?'REVIEW_REQUIRED':'EVIDENCE_VALIDATED_CANDIDATE',issues,semanticLegalApproval:false},runtimeExecutable:false};
  // Deliberately a research candidate. No executable CountryPack is fabricated here.
  const candidate={...sourceCandidate,researchRunId:job.researchId,evidenceBundle:bundle};governance.register(candidate);candidateIds.push(candidate.candidateId);bundles.push(bundle);unresolved.push(...issues.map(code=>({code,jurisdiction:c.jurisdiction,candidateId:candidate.candidateId})));
  if(issues.includes('CONFLICTING_AUTHORITY'))detectedConflicts.push({description:'Authoritative sources conflict on applicability',jurisdiction:c.jurisdiction,candidateId:candidate.candidateId});
  for(const code of issues.filter(i=>i==='OUT_OF_PERIOD'||i==='APPLICABILITY_UNRESOLVED'))effectivePeriodIssues.push({description:code,jurisdiction:c.jurisdiction,candidateId:candidate.candidateId});
 }
 for(const jurisdiction of job.jurisdictions)if(!proposed.candidates.some(c=>c.jurisdiction===jurisdiction))unresolved.push({code:'MISSING_JURISDICTION_CANDIDATE',jurisdiction});
 return {status:'VALIDATED_CANDIDATES_ONLY',candidateIds,bundles,unresolved,detectedConflicts,effectivePeriodIssues,...routing,activatedRules:0,userFactsChanged:false};
}
function saveResearchReplay(file,{job,retriever}){
 if(!job.proposal||job.failure||job.mode!=='LIVE'||job.producer!=='META_MUSE_REGULATORY_RESEARCH')throw Error('Completed live research required for replay cache');
 const payload=sanitizeResearchRecord({schemaVersion:'muse-research-replay/1',job,sources:retriever.snapshot()}),data={...payload,integrityHash:fingerprint(payload)};fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');return data.integrityHash;
}
function replayResearch(file,{governance,allowValidatorChange=false}={}){
 const data=JSON.parse(fs.readFileSync(file,'utf8')),{integrityHash,...payload}=data;if(payload.schemaVersion!=='muse-research-replay/1'||fingerprint(payload)!==integrityHash||payload.job.mode!=='LIVE')throw Error('Live research replay integrity mismatch');
 const retriever=new ResearchRetriever({root:path.dirname(file),offline:true}).restore(payload.sources),result=validateResidenceCandidates(payload.job.proposal,{job:payload.job,retriever,governance});
 const historicalValidatorMatched=fingerprint(result)===fingerprint(payload.job.validatorResults.at(-1));
 if(!historicalValidatorMatched&&!allowValidatorChange)throw Error('Replayed validation differs');
 return {researchId:payload.job.researchId,status:payload.job.status,...result,...(allowValidatorChange?{historicalValidatorMatched}:{}),paidCalls:0,networkRequests:0};
}
module.exports={validateResidenceCandidates,saveResearchReplay,replayResearch};
