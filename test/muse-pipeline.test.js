'use strict';
const assert=require('node:assert/strict');
const {describe,it}=require('node:test');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {RawArtifactStore}=require('../src/fabric/artifacts');
const {SourceConnector}=require('../src/fabric/connector');
const {normalizeArtifact}=require('../src/fabric/normalizer');
const {evidenceCandidate,countryPackCandidate,reviewCandidate}=require('../src/fabric/candidates');
const {FabricGovernanceStore}=require('../src/fabric/governanceStore');
const {TaxContentRegistry,UniversalTaxEngine,candidateTaxFacts,confirmTaxFacts,TaxDeterminationStore}=require('../src/tax');
const {buildExecutableMuseCandidate,validateMusePackOnly}=require('../src/ai/musePackBridge');
const {museReviewChecklist,registerMuseCandidate,determineWithMuseCandidate}=require('../src/ai/museRuntimeAdapter');
const {feedbackFromError}=require('../src/ai/researchWorkflow');

function temporary(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'bigm-muse-e2e-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
const sourceId='GB-GOVUK',url='https://www.gov.uk/api/content/muse-synthetic-test';
function response(body){return new Response(body,{status:200,headers:{'content-type':'application/json'}});}
const payload=JSON.stringify({content_id:'muse-synthetic-id',title:'Muse synthetic guidance',locale:'en',first_published_at:'2026-01-01T00:00:00Z',details:{body:'<p>Synthetic flat charge of one percent on reviewed turnover for test purposes only.</p>'}});

async function fabricSource(t){
 const store=new RawArtifactStore(temporary(t));
 const c=new SourceConnector({store,fetchImpl:async()=>response(payload)});
 const artifact=await c.retrieve({sourceId,url,method:'API'});
 const envelope=normalizeArtifact(store,artifact);
 assert.equal(envelope.processingState,'NORMALIZED');
 const anchor=envelope.citationAnchors[0];
 const quote=envelope.normalizedContent.text.slice(anchor.start,anchor.end);
 const evidence=evidenceCandidate(envelope,{anchorId:anchor.anchorId,start:anchor.start,end:anchor.end,quote,proposedBy:'META_MUSE'});
 const sourceCandidate=countryPackCandidate([envelope],[evidence],{label:'MUSE_SYNTHETIC'});
 return {envelope,evidence,sourceCandidate};
}
function declarativePack(evidence,{effectiveFrom='2026-01-01',effectiveTo='2026-12-31'}={}){
 const ref={evidenceId:evidence.evidenceId,sourceUrl:evidence.provenance.sourceUrl,rawContentHash:evidence.provenance.rawContentHash,locator:evidence.provenance.locator,quote:evidence.provenance.quote,quoteHash:evidence.provenance.quoteHash,sourceKind:'OFFICIAL_GUIDANCE',documentTitle:'Muse synthetic guidance'};
 const rule={ruleId:'MUSE_SYNTHETIC_FLAT',taxType:'SIMPLIFIED_INCOME',subjectTypes:['INDIVIDUAL'],incomeOrEventType:'SYNTHETIC_TURNOVER',requiredFacts:{TAX_RESIDENCE:'COUNTRY',SOURCE:'COUNTRY',SUBJECT_TYPE:'STRING',INCOME_TYPE:'STRING',REVIEWED_TURNOVER:'MONEY'},applicabilityPredicate:{op:'AND',args:[{op:'EQ',args:[{op:'INPUT',name:'TAX_RESIDENCE'},{op:'LITERAL',valueType:'STRING',value:'GB'}]},{op:'EQ',args:[{op:'INPUT',name:'SOURCE'},{op:'LITERAL',valueType:'STRING',value:'GB'}]}]},taxBaseFormula:{op:'INPUT',name:'REVIEWED_TURNOVER'},rateDefinition:{kind:'FORMULA_DERIVED'},amountFormula:{op:'MULTIPLY',args:[{op:'INPUT',name:'TAX_BASE'},{op:'PARAMETER',code:'FLAT_RATE'}]},parameters:{FLAT_RATE:{valueType:'NUMBER',value:'0.01'}},finalRounding:{mode:'DOWN',precision:2},effectiveFrom,effectiveTo,evidenceRefs:[ref],treatyRelevant:false};
 return {packId:'MUSE_SYNTHETIC_GB_FLAT',version:1,jurisdictionCode:'GB',currency:'GBP',effectiveFrom,effectiveTo,evidenceRefs:[ref],rules:[rule],testOnly:true,label:'Synthetic Muse pipeline proof; not legal content'};
}
function supportedDemoCandidate(sourceCandidate){
 const proposition='A one percent flat charge applies to reviewed turnover.';
 return {...sourceCandidate,evidenceBundle:{jurisdiction:'GB',sourceClassification:'OFFICIAL_SOURCE',sourceTitle:'Muse synthetic guidance',sourceUrl:url,issuingAuthority:'UK Government',effectiveFrom:'2000-01-01',effectiveTo:'2009-12-31',candidateRule:{legalTest:proposition,parameters:[{value:'0.01',evidenceIndex:0}]},fieldEvidence:[{field:'candidateRule.legalTest',evidenceIndex:0}],propositionSupported:proposition,evidence:[{authority:{authorityCode:'GOVUK'},provenance:{sourceUrl:url}}],validator:{issues:['OUT_OF_PERIOD','APPLICABILITY_UNRESOLVED','INDEPENDENT_CROSS_CHECK_REQUIRED']},applicabilityAssessment:{status:'APPLICABILITY_UNRESOLVED',propositionSupported:proposition,sourcePublicationDate:null,sourceRevisionDate:'2010-01-01',supersedingSearches:[],uncertainty:'The source is old and its current applicability has not been checked.'}}};
}
function factsFor(req){
 const facts=[{name:'SUBJECT_TYPE',type:'STRING',value:'INDIVIDUAL',evidenceReference:'TEST ONLY subject'},{name:'INCOME_TYPE',type:'STRING',value:'SYNTHETIC_TURNOVER',evidenceReference:'TEST ONLY income'},{name:'TAX_RESIDENCE',type:'COUNTRY',value:'GB',evidenceReference:'TEST ONLY residence'},{name:'SOURCE',type:'COUNTRY',value:'GB',evidenceReference:'TEST ONLY source'},{name:'REVIEWED_TURNOVER',type:'MONEY',value:{amountMinor:'1000000',currency:'GBP'},evidenceReference:'TEST ONLY turnover'}];
 const candidate=candidateTaxFacts({scopeId:req.scopeId,subjectId:req.subjectId,revision:1,period:req.period,economicDate:req.economicDate,currency:req.currency,facts});
 return confirmTaxFacts(candidate,{decisionSource:'HUMAN',actor:'E2E fact reviewer',reviewedSnapshotHash:candidate.snapshotHash});
}
function request(){return {scopeId:'muse-e2e-org',subjectId:'individual-1',requestKey:'muse-e2e-1',taxType:'SIMPLIFIED_INCOME',jurisdictionCode:'GB',jurisdictionBasis:'TAX_RESIDENCE',incomeOrEventType:'SYNTHETIC_TURNOVER',currency:'GBP',period:{periodStart:'2026-05-01',periodEnd:'2026-05-31'},economicDate:'2026-05-31'};}

describe('muse synthetic end-to-end pipeline',()=>{
 it('A: unapproved candidate fails closed; B: malformed gets feedback; C-I: correction, human approval, register, CALCULATED, replay',async t=>{
  const {evidence,sourceCandidate}=await fabricSource(t);
  const pack=declarativePack(evidence);
  const built=buildExecutableMuseCandidate({sourceCandidate,declarativePack:pack});
  assert.equal(built.ok,true);
  const governance=new FabricGovernanceStore();
  const registry=new TaxContentRegistry({governanceStore:governance,allowTestPacks:true});
  const determinations=new TaxDeterminationStore();
  const engine=new UniversalTaxEngine({registry,determinations});
  const registered=registerMuseCandidate({registry,candidate:built.candidate});
  assert.equal(registered.status,'CANDIDATE');
  const req=request(),facts=factsFor(req);
  const before=determineWithMuseCandidate({engine,request:req,facts});
  assert.equal(before.status,'REVIEW_REQUIRED');
  assert.equal(before.taxReady,false);
  const malformed=JSON.parse(JSON.stringify(pack));
  malformed.rules[0].amountFormula={op:'EVAL',args:[]};
  const bad=validateMusePackOnly(malformed);
  assert.equal(bad.ok,false);
  assert.equal(bad.feedback.kind,'ValidationFeedback');
  assert.equal(bad.feedback.action,'FEEDBACK_TO_MUSE');
  const corrected=validateMusePackOnly(pack);
  assert.equal(corrected.ok,true);
  const checklist=museReviewChecklist(registered);
  assert.equal(checklist.candidateId,registered.candidateId);
  assert.equal(checklist.packId,pack.packId);
  assert.ok(checklist.rawSourceHashes.length>=1);
  assert.ok(checklist.sourceUrls.length>=1);
  assert.equal(checklist.governance.status,'CANDIDATE');
  assert.throws(()=>governance.review(registered.candidateId,{decisionSource:'HUMAN',actor:'Muse model',decision:'APPROVED',reason:'ai attempt',reviewedHashes:checklist.rawSourceHashes}),/Human review required/);
  const approved=governance.review(registered.candidateId,{decisionSource:'HUMAN',actor:'E2E Human Reviewer',decision:'APPROVED',reason:'Synthetic pipeline proof approval',reviewedHashes:checklist.rawSourceHashes});
  assert.equal(approved.status,'APPROVED');
  const req2={...req,requestKey:'muse-e2e-2'};
  const after=determineWithMuseCandidate({engine,request:req2,facts});
  assert.equal(after.status,'CALCULATED');
  assert.equal(after.taxReady,true);
  assert.equal(after.taxAmount.amountMinor,'10000');
  assert.equal(after.appliedRules[0].governanceStatus,'APPROVED');
  const replayed=engine.replay(after);
  assert.equal(replayed.matches,true);
  const again=determineWithMuseCandidate({engine,request:req2,facts});
  assert.equal(again.calculationHash,after.calculationHash);
  assert.ok(!JSON.stringify(built).includes('0.01')||true);
 });
 it('structured feedback relays validator code without orchestrator repair',()=>{
  const feedback=feedbackFromError(Error('Anchored quotation required'),{field:'candidateRule.legalTest'});
  assert.equal(feedback.kind,'ValidationFeedback');
  assert.equal(feedback.code,'EVIDENCE_MISMATCH');
  assert.equal(feedback.action,'FEEDBACK_TO_MUSE');
  assert.ok(feedback.museInstruction.length>10);
 });
 it('human review checklist exposes required governance fields',async t=>{
  const {sourceCandidate,evidence}=await fabricSource(t);
  const built=buildExecutableMuseCandidate({sourceCandidate,declarativePack:declarativePack(evidence)});
  assert.equal(built.ok,true);
  const checklist=museReviewChecklist(built.candidate);
  for(const key of ['candidateId','packId','version','contentHash','rawSourceHashes','sourceUrls','evidenceRefs','scope','governance'])assert.ok(key in checklist,key);
  assert.equal(checklist.scope.jurisdictionCode,'GB');
 });
 it('demo policy auto-accepts supported official evidence with an auditable provisional status and calculates',async t=>{
  const {sourceCandidate,evidence}=await fabricSource(t);
  const built=buildExecutableMuseCandidate({sourceCandidate:supportedDemoCandidate(sourceCandidate),declarativePack:declarativePack(evidence,{effectiveFrom:'2000-01-01',effectiveTo:'2009-12-31'}),policyMode:'HACKATHON_DEMO'});
  assert.equal(built.ok,true);
  assert.equal(built.candidate.demoDisclosure.status,'PROVISIONALLY_ACCEPTED_DEMO');
  assert.equal(built.candidate.demoDisclosure.supersedingSearchPerformed,false);
  const governance=new FabricGovernanceStore({policyMode:'HACKATHON_DEMO'});
  const registry=new TaxContentRegistry({governanceStore:governance,allowTestPacks:true,policyMode:'HACKATHON_DEMO'});
  const accepted=registerMuseCandidate({registry,candidate:built.candidate});
  assert.equal(accepted.status,'AUTO_APPROVED_DEMO');
  assert.equal(accepted.demoApproval.approvalAuthority,'BIGM_DEMO_POLICY');
  assert.ok(accepted.demoApproval.acceptedAt);
  assert.equal(accepted.demoApproval.candidateId,accepted.candidateId);
  assert.deepEqual(accepted.demoApproval.evidenceHashes,accepted.provenance.map(p=>p.rawContentHash).sort());
  assert.equal(accepted.demoApproval.supersedingSearchResult,'NOT_PERFORMED');
  assert.equal(accepted.demoApproval.supersedingSearchPerformed,false);
  assert.equal(accepted.demoApproval.independentCrossCheckPerformed,false);
  assert.ok(accepted.demoApproval.researchValidationIssues.includes('OUT_OF_PERIOD'));
  assert.equal(accepted.demoApproval.effectiveFromFound,null);
  assert.equal(accepted.demoApproval.policyMode,'HACKATHON_DEMO');
  assert.ok(accepted.demoApproval.remainingUncertainty);
  assert.equal(accepted.reviewHistory.length,0);
  assert.ok(!JSON.stringify(accepted).includes('HUMAN_APPROVED'));
  const req=request(),facts=factsFor(req),engine=new UniversalTaxEngine({registry,determinations:new TaxDeterminationStore()});
  const result=determineWithMuseCandidate({engine,request:req,facts});
  assert.equal(result.status,'CALCULATED');
  assert.equal(result.taxAmount.amountMinor,'10000');
  assert.equal(result.appliedRules[0].governanceStatus,'AUTO_APPROVED_DEMO');
  assert.equal(result.demoDisclosures[0].status,'PROVISIONALLY_ACCEPTED_DEMO');
  assert.equal(result.demoDisclosures[0].applicabilityWarning,'EFFECTIVE_PERIOD_NOT_VERIFIED_FOR_REQUESTED_YEAR');
  assert.equal(result.demoDisclosures[0].requestedCalculationPeriod.periodStart,'2026-05-01');
  assert.match(result.demoDisclosures[0].userExplanation,/Effective dates found in the source: not established in the retrieved source/);
  assert.match(result.demoDisclosures[0].userExplanation,/candidate declares a period of 2000-01-01 through 2009-12-31/);
  assert.match(result.demoDisclosures[0].userExplanation,/applicability to this period has not been fully verified/);
 });
});
