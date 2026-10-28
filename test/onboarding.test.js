'use strict';
const {describe,it}=require('node:test'),assert=require('node:assert/strict');
const {createWebStore,proposalHash}=require('../src/web/store');
const {detectSignals}=require('../src/onboarding/conversation');
const {hashProposal}=require('../src/onboarding/readiness');
const {createActiveStore}=require('./workspace-fixture');
function prepared(){
 const s=createWebStore();s.editProfile({slot:'currency.functional',value:'IDR'});
 const p=s.onboardingPropose().proposal;s.onboardingValidate();return {s,p};
}
describe('Candidate profile and governed configuration',()=>{
 it('country mentions never share a generic jurisdiction signal',()=>{
  const out=detectSignals('Saya punya perusahaan perdagangan di Singapura, tapi ingin menggunakan bahasa Indonesia.');
  assert.equal(out.jurisdiction,undefined);
  assert.ok(out.jurisdictionFacts.some(f=>f.basis==='BUSINESS_WORK_LOCATION'&&f.countryCode==='SG'));
  assert.ok(!out.jurisdictionFacts.some(f=>f.basis==='REGISTRATION'));
 });
 it('keeps USD receipts, IDR books and SGD purchases separate',async()=>{
  const s=createWebStore();await s.onboardingTurn('I get paid in USD but keep my books in IDR. I buy equipment in SGD.');
  const state=s.onboardingState();assert.equal(state.slots['currency.functional'].value,'IDR');
  assert.deepEqual(state.slots['currency.transactions'].value,['USD']);
  assert.deepEqual(state.slots['currency.foreignPurchases'].value,['SGD']);
  assert.equal(state.slots['currency.fxSource'].value,null);
  assert.equal(state.jurisdictionCandidates.length,0);
 });
 it('ambiguous answers never become business or personal names',async()=>{
  const s=createWebStore();await s.onboardingTurn('not sure');
  assert.equal(s.onboardingState().slots['org.name'].value,null);
  assert.equal(s.onboardingState().slots['user.displayName'].value,null);
 });
 it('an explicit correction replaces the named fact and invalidates downstream approval',async()=>{
  const {s,p}=prepared();s.onboardingConfirm({proposalHash:p.hash});
  await s.onboardingTurn('Correction: bookkeeping currency is USD.');
  const state=s.onboardingState();assert.equal(state.slots['currency.functional'].value,'USD');
  assert.equal(state.proposal,null);assert.equal(state.validated,null);assert.equal(state.confirmation,null);
  assert.throws(()=>s.onboardingActivate({activationKey:'stale'}),/not ready/);
 });
 it('contradictions stay visible until explicit correction',async()=>{
  const s=createWebStore();await s.onboardingTurn('My books are in IDR.');
  await s.onboardingTurn('My books are in USD.');
  assert.equal(s.onboardingState().slots['currency.functional'].status,'CONFLICT');
  assert.equal(s.onboardingPropose().ok,false);
  await s.onboardingTurn('Correction: my books are in USD.');
  assert.equal(s.onboardingState().slots['currency.functional'].status,'CANDIDATE');
  assert.equal(s.onboardingPropose().ok,true);
 });
 it('name and business-type corrections do not use first-write-wins',async()=>{
  const s=createWebStore();await s.onboardingTurn('Company Alpha, consulting.');
  await s.onboardingTurn('Actually Company Beta, coffee shop.');
  assert.equal(s.onboardingState().slots['org.name'].value,'Beta');
  assert.equal(s.onboardingState().slots['org.businessType'].value,'kuliner');
  const state=s.onboardingState();assert.equal(state.draft.organizationProfile.name,state.slots['org.name'].value);
 });
 it('proposal building never rewrites the user business type',async()=>{
  const s=createWebStore();await s.onboardingTurn('I run a coffee shop in Bali. My books are in IDR.');
  const before=s.onboardingState().slots;s.onboardingPropose();
  assert.deepEqual(s.onboardingState().slots,before);
 });
 it('activation requires validation and explicit human confirmation',()=>{
  const s=createWebStore();s.editProfile({slot:'currency.functional',value:'IDR'});const p=s.onboardingPropose().proposal;
  assert.throws(()=>s.onboardingConfirm({proposalHash:p.hash}),/validation/);
  s.onboardingValidate();assert.throws(()=>s.onboardingActivate({activationKey:'no-confirm'}),/not ready/);
  assert.throws(()=>s.onboardingConfirm({proposalHash:p.hash,packIds:['ID_CIT_REFERENCE@2']}),/applicable reviewed/);
  assert.throws(()=>s.onboardingConfirm({proposalHash:p.hash,actor:'AI',decisionSource:'AI'}),/human/);
  s.onboardingConfirm({proposalHash:p.hash});assert.equal(s.onboardingActivate({activationKey:'ok'}).proposal.hash,p.hash);
 });
 it('new proposals cannot reuse old validation',()=>{
  const {s,p}=prepared();s.onboardingConfirm({proposalHash:p.hash});s.editProfile({slot:'org.name',value:'New name'});
  const next=s.onboardingPropose().proposal;
  assert.notEqual(next.hash,p.hash);assert.equal(s.onboardingState().validated,null);
  assert.throws(()=>s.onboardingConfirm({proposalHash:next.hash}),/validation/);
  s.onboardingValidate();s.onboardingConfirm({proposalHash:next.hash});
  assert.equal(s.onboardingActivate({activationKey:'latest'}).proposal.organizationName,'New name');
 });
 it('hashes cover nested payloads, independent of object key order',()=>{
  const a={period:{start:'2025-01-01',end:'2025-12-31'},entities:[{jurisdiction:'ID'}]};
  const b={entities:[{jurisdiction:'ID'}],period:{end:'2025-12-31',start:'2025-01-01'}};
  assert.equal(hashProposal(a),hashProposal(b));b.period.end='2026-12-31';
  assert.notEqual(hashProposal(a),hashProposal(b));assert.equal(proposalHash(a),hashProposal(a));
 });
 it('activation replay cannot roll back an already active newer configuration',()=>{
  const {s,p}=prepared();s.onboardingConfirm({proposalHash:p.hash});const a=s.onboardingActivate({activationKey:'a'});
  const count=s.ctx.audit.size;assert.deepEqual(s.onboardingActivate({activationKey:'a'}),a);assert.equal(s.ctx.audit.size,count);
  s.editProfile({slot:'org.name',value:'Updated'});const next=s.onboardingPropose().proposal;s.onboardingValidate();s.onboardingConfirm({proposalHash:next.hash});s.onboardingActivate({activationKey:'b'});
  assert.throws(()=>s.onboardingActivate({activationKey:'a'}),/different proposal/);assert.equal(s.ctx.org.name,'Updated');
 });
 it('active runtime matches configuration and remains protected from pending edits',()=>{
  const s=createActiveStore({}, {country:'SG',currency:'SGD',name:'Singapore shop'});
  const ws=s.workspaceProfile();assert.equal(s.ctx.org.name,ws.organizationName);assert.equal(s.ctx.org.jurisdiction,ws.jurisdiction);assert.equal(s.ctx.org.baseCurrency,ws.functionalCurrency);assert.ok(Object.isFrozen(s.ctx.org));
  s.editProfile({slot:'currency.functional',value:'USD'});assert.equal(s.workspaceProfile().functionalCurrency,'SGD');assert.equal(s.ctx.org.baseCurrency,'SGD');
 });
 it('failed runtime application preserves active history and rejects overlapping periods',()=>{
  const s=createActiveStore(),before=s.onboardingHistory(),org=s.ctx.org;
  s.editProfile({slot:'accounting.periodStart',value:'2026-02-01'});
  const p=s.onboardingPropose().proposal;s.onboardingValidate();s.onboardingConfirm({proposalHash:p.hash});
  assert.throws(()=>s.onboardingActivate({activationKey:'overlap'}),/overlap/);
  assert.deepEqual(s.onboardingHistory(),before);assert.equal(s.ctx.org,org);
  assert.throws(()=>s.pipelineDepsFor({orgId:org.id,jurisdiction:'ID',currency:'IDR',date:'2025-12-31'}),/outside/);
 });
});
