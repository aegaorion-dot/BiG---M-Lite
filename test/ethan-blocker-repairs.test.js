'use strict';
// Structural repair proof for Ethan blockers. Synthetic fixtures only; no live
// Muse call, no tax-law research, no CountryPack creation.
const {it,describe}=require('node:test'),assert=require('node:assert/strict');
const {candidateTaxFacts,confirmTaxFacts,inspectFacts,profileTaxFactCandidates,planTaxReadiness,discoverResearchNeed,taxQuestion,createTaxSystem}=require('../src/tax');
const {createWebStore}=require('../src/web/store');
const SCOPE={scopeId:'repair-test-org',subjectId:'person-1',period:{periodStart:'2025-04-01',periodEnd:'2025-12-31'},economicDate:'2025-12-31',currency:'JPY'};
function fact(name,value){return {name,type:'COUNTRY',value,evidenceReference:'TEST ONLY synthetic evidence: '+name+value};}
function ethanProfile(){
 return {revision:3,slots:{'user.nationality':{value:'US',status:'CONFIRMED',supportingQuote:'US citizen'},'user.physicalLocation':{value:'JP',status:'CONFIRMED',supportingQuote:'living in Tokyo'},'org.businessType':{value:'freelancer',status:'CONFIRMED',supportingQuote:'freelance software'},'org.subjectType':{value:'INDIVIDUAL',status:'CONFIRMED',supportingQuote:'individual freelancer'},'org.activities':{value:['FREELANCER'],status:'CONFIRMED',supportingQuote:'freelance work'}},jurisdictionFacts:[
  {basis:'BUSINESS_WORK_LOCATION',countryCode:'JP',status:'CONFIRMED',supportingQuote:'work in Tokyo'},
  {basis:'CUSTOMER_LOCATION',countryCode:'US',status:'CONFIRMED',supportingQuote:'US client'},
  {basis:'CUSTOMER_LOCATION',countryCode:'JP',status:'CONFIRMED',supportingQuote:'JP client'},
  {basis:'CUSTOMER_LOCATION',countryCode:'SG',status:'CONFIRMED',supportingQuote:'SG client'},
  {basis:'CUSTOMER_LOCATION',countryCode:'AU',status:'CONFIRMED',supportingQuote:'AU client'},
  {basis:'CUSTOMER_LOCATION',countryCode:'GB',status:'CONFIRMED',supportingQuote:'UK client'}]};
}
describe('Ethan blocker repairs (synthetic)',()=>{
 it('A: US+JP+SG+AU+GB customer locations coexist without false conflict',()=>{
  const snap=profileTaxFactCandidates(ethanProfile(),SCOPE);
  const names=snap.facts.map(f=>f.name).filter(n=>n.startsWith('CUSTOMER_LOCATION'));
  assert.deepEqual([...names].sort(),['CUSTOMER_LOCATION_AU','CUSTOMER_LOCATION_GB','CUSTOMER_LOCATION_JP','CUSTOMER_LOCATION_SG','CUSTOMER_LOCATION_US']);
  const confirmed=confirmTaxFacts(snap,{decisionSource:'HUMAN',actor:'Test reviewer',reviewedSnapshotHash:snap.snapshotHash});
  assert.equal(inspectFacts(confirmed).status,'CONFIRMED');
 });
 it('B: genuine single-value contradictions still conflict',()=>{
  const base=candidateTaxFacts({...SCOPE,revision:1,facts:[fact('TAX_RESIDENCE','US'),fact('TAX_RESIDENCE','JP')]});
  const confirmed=confirmTaxFacts(base,{decisionSource:'HUMAN',actor:'Test reviewer',reviewedSnapshotHash:base.snapshotHash});
  assert.equal(inspectFacts(confirmed).status,'CONFLICT');
 });
 it('C: missing TAX_RESIDENCE/SOURCE yields RESEARCH_REQUIRED, never empty questions',()=>{
  const {registry}=createTaxSystem({includePhase4:false});
  const base=profileTaxFactCandidates(ethanProfile(),SCOPE);
  const snap=candidateTaxFacts({...SCOPE,revision:base.revision,facts:[...base.facts,{name:'INCOME_TYPE',type:'STRING',value:'FREELANCE_SERVICES',evidenceReference:'TEST ONLY synthetic evidence: INCOME_TYPE'}]});
  const request={scopeId:SCOPE.scopeId,subjectId:SCOPE.subjectId,requestKey:'ethan-jp',taxType:'INCOME_TAX',jurisdictionCode:'JP',jurisdictionBasis:'TAX_RESIDENCE',incomeOrEventType:'FREELANCE_SERVICES',currency:'JPY',period:SCOPE.period,economicDate:SCOPE.economicDate};
  const plan=planTaxReadiness({registry,request,snapshot:snap,profileState:ethanProfile()});
  assert.equal(plan.status,'RESEARCH_REQUIRED');
  assert.ok(plan.researchGaps.includes('TAX_RESIDENCE'));
  assert.ok(plan.researchGaps.includes('SOURCE'));
  assert.equal(plan.questions.length,0);
  const q=taxQuestion(plan);
  assert.equal(q.key,'tax.researchRequired');
  assert.ok((q.researchGaps??[]).includes('TAX_RESIDENCE'));
 });
 it('D: missing governed coverage produces a ResearchNeed via the orchestrator boundary',()=>{
  const {registry}=createTaxSystem({includePhase4:false});
  const profile=ethanProfile(),base=profileTaxFactCandidates(profile,SCOPE);
  const snap=candidateTaxFacts({...SCOPE,revision:base.revision,facts:[...base.facts,{name:'INCOME_TYPE',type:'STRING',value:'FREELANCE_SERVICES',evidenceReference:'TEST ONLY synthetic evidence: INCOME_TYPE'}]});
  const request={scopeId:SCOPE.scopeId,subjectId:SCOPE.subjectId,requestKey:'ethan-jp',taxType:'INCOME_TAX',jurisdictionCode:'JP',jurisdictionBasis:'TAX_RESIDENCE',incomeOrEventType:'FREELANCE_SERVICES',currency:'JPY',period:SCOPE.period,economicDate:SCOPE.economicDate};
  const plan=planTaxReadiness({registry,request,snapshot:snap,profileState:profile});
  const need=discoverResearchNeed({profileState:profile,request,plan});
  assert.ok(need&&need.kind==='ResearchNeed');
  assert.ok(need.questionsToResolve.includes('TAX_RESIDENCE'));
  assert.ok(need.questionsToResolve.includes('SOURCE'));
  assert.match(need.objective,/governed law/);
 });
 it('E: live product tax review exposes the automatically discovered ResearchNeed',()=>{
  const store=createWebStore({taxSystem:createTaxSystem({includePhase4:false})});
  for(const [slot,value]of [['user.nationality','US'],['user.physicalLocation','JP'],['org.businessType','freelancer'],['org.subjectType','INDIVIDUAL']])store.editProfile({slot,value});
  store.editProfile({basis:'BUSINESS_WORK_LOCATION',countryCode:'JP'});
  store.editProfile({basis:'CUSTOMER_LOCATION',countryCode:'US'});
  const plan=store.beginTaxReview({...SCOPE,scopeId:'org-contoh',subjectId:'person-1',requestKey:'ethan-jp-product',taxType:'INCOME_TAX',jurisdictionCode:'JP',jurisdictionBasis:'TAX_RESIDENCE',incomeOrEventType:'FREELANCE_SERVICES'});
  assert.equal(plan.status,'RESEARCH_REQUIRED');
  assert.equal(plan.researchSignal.recognized,true);
  assert.equal(plan.researchNeed.kind,'ResearchNeed');
  assert.ok(plan.researchNeed.questionsToResolve.includes('TAX_RESIDENCE'));
  assert.ok(plan.researchNeed.questionsToResolve.includes('SOURCE'));
 });
 it('F: fail-closed behavior remains intact',()=>{
  const {registry,engine}=createTaxSystem({includePhase4:false});
  const snap=profileTaxFactCandidates(ethanProfile(),SCOPE);
  const request={scopeId:SCOPE.scopeId,subjectId:SCOPE.subjectId,requestKey:'ethan-jp',taxType:'INCOME_TAX',jurisdictionCode:'JP',jurisdictionBasis:'TAX_RESIDENCE',incomeOrEventType:'FREELANCE_SERVICES',currency:'JPY',period:SCOPE.period,economicDate:SCOPE.economicDate};
  const r=engine.determine(request,snap);
  assert.notEqual(r.status,'CALCULATED');
  assert.equal(r.taxAmount,null);
  assert.throws(()=>confirmTaxFacts(snap,{decisionSource:'AI',actor:'Muse',reviewedSnapshotHash:snap.snapshotHash}),/human/i);
 });
 it('G: demo confirms direct USER facts without treating AI legal classifications as user input',()=>{
  const profile=ethanProfile();profile.jurisdictionFacts[0].source='AI_INFERENCE';profile.slots['org.subjectType'].source='USER';
  const snap=profileTaxFactCandidates(profile,SCOPE);
  assert.ok(snap.facts.find(f=>f.name==='SUBJECT_TYPE').confirmationAuthority==='USER_INPUT');
  assert.equal(snap.facts.find(f=>f.name==='BUSINESS_WORK_LOCATION').confirmationAuthority,undefined);
  const userOnly=candidateTaxFacts({...SCOPE,revision:1,facts:[{name:'SUBJECT_TYPE',type:'STRING',value:'INDIVIDUAL',evidenceReference:'I am an individual',confirmationAuthority:'USER_INPUT'}]});
  const confirmed=confirmTaxFacts(userOnly,{decisionSource:'USER_INPUT',policyMode:'HACKATHON_DEMO',reviewedSnapshotHash:userOnly.snapshotHash});
  assert.equal(inspectFacts(confirmed,{policyMode:'HACKATHON_DEMO'}).status,'CONFIRMED');
  assert.equal(inspectFacts(confirmed).status,'REVIEW_REQUIRED');
  const inferred=candidateTaxFacts({...SCOPE,revision:1,facts:[{name:'TAX_RESIDENCE',type:'COUNTRY',value:'JP',evidenceReference:'Muse legal conclusion',confirmationAuthority:'BIGM_DEMO_POLICY'}]});
  assert.throws(()=>confirmTaxFacts(inferred,{decisionSource:'USER_INPUT',policyMode:'HACKATHON_DEMO',reviewedSnapshotHash:inferred.snapshotHash}),/direct user-input provenance/i);
 });
});
