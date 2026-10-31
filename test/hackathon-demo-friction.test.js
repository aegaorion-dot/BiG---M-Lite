'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createWebStore}=require('../src/web/store');

test('HACKATHON_DEMO validation provisionally activates workspace without a HUMAN approval step',()=>{
 const previous=process.env.BIGM_REGULATORY_POLICY;process.env.BIGM_REGULATORY_POLICY='HACKATHON_DEMO';
 try{
  const store=createWebStore();store.editProfile({basis:'BUSINESS_WORK_LOCATION',countryCode:'ID'});store.editProfile({slot:'currency.functional',value:'IDR'});
  const proposal=store.onboardingPropose();assert.equal(proposal.ok,true);
  assert.deepEqual(proposal.proposal.modules,['sales','purchase','accounting','reports','import']);
  const validated=store.onboardingValidate();assert.equal(validated.ok,true);assert.equal(validated.demoAdvance.status,'PROVISIONALLY_ACCEPTED_DEMO');
  const state=store.onboardingState();assert.equal(store.workspaceProfile().activated,true);assert.equal(state.confirmation.decisionSource,'BIGM_DEMO_POLICY');assert.equal(state.confirmation.actor,'BIGM_DEMO_POLICY');assert.equal(state.confirmation.provisional,true);
  assert.equal(state.active.confirmation.decisionSource,'BIGM_DEMO_POLICY');assert.equal(state.active.policyMode,'HACKATHON_DEMO');
  assert.equal(state.active.profileSnapshot.jurisdictionFacts[0].status,'CANDIDATE','auto activation must not turn an AI/system legal classification into a user-confirmed fact');
  assert.equal(store.ctx.audit.list().filter(e=>['onboarding.confirm','onboarding.activate'].includes(e.action)).some(e=>e.actor==='HUMAN'),false);
  const approvalAuditCount=store.ctx.audit.list().filter(e=>e.action==='onboarding.confirm').length;store.onboardingConfirm({proposalHash:proposal.proposal.hash});assert.equal(store.ctx.audit.list().filter(e=>e.action==='onboarding.confirm').length,approvalAuditCount,'a redundant confirm request must not add another approval event');
  assert.match(validated.demoAdvance.disclosure,/provisional/i);assert.match(validated.demoAdvance.disclosure,/does not authorize filing/);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bigm-demo-restore-'));try{const persistPath=path.join(dir,'store.json'),persisted=createWebStore({persistPath});persisted.editProfile({slot:'currency.functional',value:'EUR'});const p=persisted.onboardingPropose();persisted.onboardingValidate();const restored=createWebStore({persistPath});assert.equal(restored.workspaceProfile().activated,true);assert.equal(restored.onboardingState().confirmation.decisionSource,'BIGM_DEMO_POLICY');assert.equal(restored.ctx.audit.list().some(e=>e.actor==='HUMAN'),false);}finally{fs.rmSync(dir,{recursive:true,force:true});}
 }finally{if(previous===undefined)delete process.env.BIGM_REGULATORY_POLICY;else process.env.BIGM_REGULATORY_POLICY=previous;}
});

test('STRICT workspace activation still requires explicit HUMAN confirmation',()=>{
 const previous=process.env.BIGM_REGULATORY_POLICY;delete process.env.BIGM_REGULATORY_POLICY;
 try{
  const store=createWebStore();store.editProfile({slot:'currency.functional',value:'EUR'});const proposal=store.onboardingPropose();assert.equal(proposal.ok,true);store.onboardingValidate();
  assert.equal(store.workspaceProfile().activated,false);assert.throws(()=>store.onboardingActivate({activationKey:'strict-without-confirm'}),/ready/i);
  const confirmed=store.onboardingConfirm({proposalHash:proposal.proposal.hash,actor:'reviewer'});assert.equal(confirmed.decisionSource,'HUMAN');
  store.onboardingActivate({activationKey:'strict-confirmed',actor:'reviewer'});assert.equal(store.workspaceProfile().activated,true);
 }finally{if(previous!==undefined)process.env.BIGM_REGULATORY_POLICY=previous;}
});
