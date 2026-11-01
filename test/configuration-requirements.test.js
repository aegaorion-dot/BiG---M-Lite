'use strict';
const {describe,it}=require('node:test');
const assert=require('node:assert/strict');
const {blankProfileState,applyFacts}=require('../src/onboarding/profiler');
const {deriveConfiguration}=require('../src/configuration/requirements');
const {buildConfigurationResearchPlans,CONFIGURATION_OUTPUT_SCHEMA}=require('../src/configuration/research');
const {createTaxSystem}=require('../src/tax');

function profile({subjectType='INDIVIDUAL',businessType='freelancer',currency='IDR',jurisdiction='ID',basis='REGISTRATION',period=['2026-01-01','2026-12-31']}={}){
 let state=blankProfileState();
 const facts=[
  {slot:'currency.functional',value:currency,source:'USER',supportingQuote:'currency '+currency,status:'CANDIDATE',operation:'SET'},
  {slot:'org.businessType',value:businessType,source:'USER',supportingQuote:'activity '+businessType,status:'CANDIDATE',operation:'SET'},
  {slot:'org.subjectType',value:subjectType,source:'USER',supportingQuote:'subject '+subjectType,status:'CANDIDATE',operation:'SET'},
  {slot:'accounting.periodStart',value:period[0],source:'USER',supportingQuote:'period start',status:'CANDIDATE',operation:'SET'},
  {slot:'accounting.periodEnd',value:period[1],source:'USER',supportingQuote:'period end',status:'CANDIDATE',operation:'SET'},
 ];
 return applyFacts(state,facts,'USER',{jurisdictionFacts:[{basis,countryCode:jurisdiction,source:'USER',supportingQuote:'country '+jurisdiction,status:'CANDIDATE'}]});
}

function system(){return createTaxSystem({includePhase4:false});}

describe('configuration requirements',()=>{
 it('starts empty with English as the fallback language and asks only material facts',()=>{
  const configuration=deriveConfiguration({profileState:blankProfileState()});
  assert.equal(configuration.language,'en');
  assert.equal(configuration.fallbackLanguage,'en');
  assert.equal(configuration.requirements.length,0);
  assert.deepEqual(configuration.questions.map((question)=>question.key).sort(),['accounting.period','currency.functional','jurisdiction','org.subjectType'].sort());
  assert.equal(configuration.postingPerformed,false);
  assert.equal(configuration.authoritativeDetermination,false);
 });

 it('identifies tax and reporting questions for an individual business without inventing law',()=>{
  const configuration=deriveConfiguration({profileState:profile(),registry:system().registry});
  const domains=configuration.requirements.map((entry)=>entry.domain).sort();
  assert.deepEqual(domains,['ACCOUNTING_OBLIGATIONS','CONSUMPTION_TAX','FILING_CALENDAR','INCOME_TAX']);
  assert.ok(configuration.requirements.every((entry)=>entry.status==='RESEARCH_REQUIRED'));
  assert.equal(configuration.researchRequirements.length,4);
  // No rate, threshold or deadline is present in a configuration profile.
  const serialized=JSON.stringify(configuration);
  assert.doesNotMatch(serialized,/"(?:rate|threshold|deadlineAmount|taxAmount)"\s*:/i);
  assert.ok(configuration.researchQuestions.every((question)=>question.text.length>40));
 });

 it('reports governed review instead of research when a CountryPack already exists',()=>{
  const tax=system();
  const configuration=deriveConfiguration({profileState:profile({subjectType:'COMPANY',businessType:'perdagangan',period:['2025-01-01','2025-12-31']}),registry:tax.registry});
  const cit=configuration.requirements.find((entry)=>entry.domain==='CIT');
  assert.ok(cit);
  assert.equal(cit.status,'GOVERNANCE_REVIEW_REQUIRED');
  assert.ok(cit.packCandidates.length>=1);
  assert.equal(cit.coveredPackIds.length,0);
 });

 it('marks jurisdictions without registered official sources as unresolved instead of researching blindly',()=>{
  const configuration=deriveConfiguration({profileState:profile({jurisdiction:'EG',currency:'USD'}),registry:system().registry});
  const income=configuration.requirements.find((entry)=>entry.domain==='INCOME_TAX');
  assert.equal(income.status,'RESEARCH_UNSUPPORTED');
  assert.equal(income.researchRequired,false);
  assert.ok(configuration.unresolved.some((entry)=>entry.id===income.id&&entry.status==='RESEARCH_UNSUPPORTED'));
 });

 it('keeps a missing functional currency as a material question, not a researched fact',()=>{
  const state=applyFacts(blankProfileState(),[
   {slot:'org.subjectType',value:'INDIVIDUAL',source:'USER',supportingQuote:'individual',status:'CANDIDATE',operation:'SET'},
   {slot:'accounting.periodStart',value:'2026-01-01',source:'USER',supportingQuote:'start',status:'CANDIDATE',operation:'SET'},
   {slot:'accounting.periodEnd',value:'2026-12-31',source:'USER',supportingQuote:'end',status:'CANDIDATE',operation:'SET'},
  ],'USER',{jurisdictionFacts:[{basis:'REGISTRATION',countryCode:'ID',source:'USER',supportingQuote:'Indonesia',status:'CANDIDATE'}]});
  const configuration=deriveConfiguration({profileState:state,registry:system().registry});
  assert.ok(configuration.questions.some((question)=>question.key==='currency.functional'));
  assert.ok(configuration.requirements.filter((entry)=>entry.kind==='TAX').every((entry)=>entry.status==='USER_FACT_REQUIRED'));
 });

 it('builds a bounded research plan per jurisdiction and preserves unsupported ones',()=>{
  const registry=system().registry;
  const supported=deriveConfiguration({profileState:profile({jurisdiction:'SG',currency:'SGD'}),registry});
  const planned=buildConfigurationResearchPlans({configuration:supported});
  assert.equal(planned.status,'PLANNED');
  assert.equal(planned.plans.length,1);
  assert.equal(planned.plans[0].jurisdiction,'SG');
  assert.ok(planned.plans[0].need.questionsToResolve.length<=15);
  assert.ok(planned.plans[0].brief.briefHash);
  assert.equal(planned.plans[0].brief.externalContentAuthority,'DATA_ONLY');
  assert.equal(planned.plans[0].brief.authority.approval,'HUMAN_GOVERNANCE_ONLY');
  assert.ok(planned.planHash);

  const unsupported=deriveConfiguration({profileState:profile({jurisdiction:'EG',currency:'USD'}),registry});
  const blocked=buildConfigurationResearchPlans({configuration:unsupported});
  assert.equal(blocked.status,'RESEARCH_UNSUPPORTED');
  assert.equal(blocked.plans.length,0);
  assert.ok(blocked.unsupported.some((entry)=>entry.reason==='NO_REGISTERED_OFFICIAL_SOURCE'));
 });

 it('requires a complete accounting period before planning any research',()=>{
  const state=applyFacts(blankProfileState(),[
   {slot:'currency.functional',value:'SGD',source:'USER',supportingQuote:'SGD',status:'CANDIDATE',operation:'SET'},
   {slot:'org.subjectType',value:'INDIVIDUAL',source:'USER',supportingQuote:'individual',status:'CANDIDATE',operation:'SET'},
   {slot:'org.businessType',value:'freelancer',source:'USER',supportingQuote:'freelancer',status:'CANDIDATE',operation:'SET'},
  ],'USER',{jurisdictionFacts:[{basis:'REGISTRATION',countryCode:'SG',source:'USER',supportingQuote:'Singapore',status:'CANDIDATE'}]});
  const configuration=deriveConfiguration({profileState:state,registry:system().registry});
  const planned=buildConfigurationResearchPlans({configuration});
  assert.equal(planned.status,'PROFILE_INCOMPLETE');
  assert.equal(planned.plans.length,0);
 });

 it('publishes the Muse output contract without a rate or approval path',()=>{
  assert.ok(CONFIGURATION_OUTPUT_SCHEMA.countryPacks[0].pack.rules[0].evidenceRefs);
  assert.match(JSON.stringify(CONFIGURATION_OUTPUT_SCHEMA),/MISSING_FACT/);
  assert.doesNotMatch(JSON.stringify(CONFIGURATION_OUTPUT_SCHEMA),/APPROVED|ACTIVE/);
 });
});
