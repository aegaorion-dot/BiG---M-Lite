'use strict';
const {describe,it}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createWebStore}=require('../src/web/store');
const {createActiveStore}=require('./workspace-fixture');
const {FinancialPeriod}=require('../src/domain/organization');
const EXPAT="I'm Australian and I run a coffee shop in Bali. My customers pay in Indonesian rupiah, I sometimes import equipment, and I want the app in English.";
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bigm-lite-'));t.after(()=>{if(path.dirname(dir)!==os.tmpdir())throw Error('unsafe cleanup target');fs.rmSync(dir,{recursive:true,force:true});});return path.join(dir,'store.json');}
function activate(s,key='scenario'){const p=s.onboardingPropose();assert.equal(p.ok,true,JSON.stringify(p));s.onboardingValidate();s.onboardingConfirm({proposalHash:p.proposal.hash});return s.onboardingActivate({activationKey:key});}
describe('Real descriptions and restart invariants',()=>{
 it('mandatory expat initial profile separates nationality, work and payment currency',async()=>{
  const s=createWebStore();await s.onboardingTurn(EXPAT);const st=s.onboardingState();
  assert.equal(st.slots['user.nationality'].value,'AU');assert.equal(st.uiLanguage,'en');
  assert.deepEqual(st.jurisdictionCandidates.map(f=>[f.basis,f.countryCode]),[['BUSINESS_WORK_LOCATION','ID']]);
  assert.deepEqual(st.slots['currency.transactions'].value,['IDR']);assert.equal(st.slots['currency.functional'].value,null);
  assert.deepEqual(st.slots['currency.foreignPurchases'].value,[]);assert.equal(st.question.key,'currency.functional');
 });
 it('mandatory second statement resolves candidates without running 2025 tax rules',async()=>{
  const s=createWebStore();await s.onboardingTurn(EXPAT);await s.onboardingTurn('My business is registered in Indonesia and I want to keep my books in IDR.');
  const st=s.onboardingState();assert.equal(st.slots['user.nationality'].value,'AU');assert.equal(st.slots['currency.functional'].value,'IDR');
  assert.ok(st.jurisdictionCandidates.some(f=>f.basis==='REGISTRATION'&&f.countryCode==='ID'&&f.status==='CANDIDATE'));
  const rec=activate(s);assert.equal(rec.countryPackResolution.status,'OUT_OF_PERIOD');assert.deepEqual(rec.countryPackResolution.selectedPackIds,[]);
  assert.equal(s.onboardingReadiness().workspaceReady,true);assert.equal(s.onboardingReadiness().taxReady,false);assert.equal(s.ctx.org.jurisdiction,'ID');
 });
 it('bookkeeping can activate from Bali work location with registration unresolved',async()=>{
  const s=createWebStore();await s.onboardingTurn(EXPAT);await s.onboardingTurn('I want my books in IDR.');activate(s);
  assert.equal(s.workspaceProfile().jurisdictionBasis,'BUSINESS_WORK_LOCATION');assert.equal(s.onboardingDraft().organizationProfile.domicile,'');
  assert.equal(s.workspaceProfile().taxReady,false);assert.equal(s.ctx.org.baseCurrency,'IDR');
 });
 it('freelancer nationality and US clients never become business registration',async()=>{
  const s=createWebStore();await s.onboardingTurn("I'm an Indonesian freelance graphic designer working with US clients. I prefer Indonesian for the app.");
  let st=s.onboardingState();assert.equal(st.slots['user.nationality'].value,'ID');assert.equal(st.uiLanguage,'id');
  assert.deepEqual(st.jurisdictionCandidates.map(f=>[f.basis,f.countryCode]),[['CUSTOMER_LOCATION','US']]);assert.equal(st.slots['currency.functional'].value,null);
  await s.onboardingTurn('Saya bekerja di Bandung. Pembukuan saya IDR.');activate(s);assert.equal(s.ctx.org.jurisdiction,'ID');
 });
 it('UMKM operational location does not establish registration',async()=>{
  const s=createWebStore();await s.onboardingTurn('Saya punya warung kopi di Bandung, pelanggan bayar cash dan QRIS.');
  assert.ok(s.onboardingState().jurisdictionCandidates.some(f=>f.basis==='BUSINESS_WORK_LOCATION'&&f.countryCode==='ID'));
  assert.ok(!s.onboardingState().jurisdictionCandidates.some(f=>f.basis==='REGISTRATION'));
  await s.onboardingTurn('Pembukuan dalam IDR.');activate(s);assert.equal(s.ctx.org.baseCurrency,'IDR');
 });
 it('Singapore registration, Bali work, US customers and Australian bank stay distinct',async()=>{
  const s=createWebStore();await s.onboardingTurn('My company is registered in Singapore. I operate in Bali. My customers are in the United States. My bank account is in Australia. I keep my books in SGD.');
  const facts=s.onboardingState().jurisdictionCandidates;
  for(const [basis,country]of [['REGISTRATION','SG'],['BUSINESS_WORK_LOCATION','ID'],['CUSTOMER_LOCATION','US'],['ACCOUNT_LOCATION','AU']])assert.ok(facts.some(f=>f.basis===basis&&f.countryCode===country),basis);
  activate(s);assert.equal(s.ctx.org.jurisdiction,'SG');assert.equal(s.workspaceProfile().countryPackResolution.status,'MISSING_COUNTRY_PACK');
 });
 it('negative registration and ambiguous country answers stay unapproved',async()=>{
  const s=createWebStore();await s.onboardingTurn('No, I am NOT registered in Singapore.');await s.onboardingTurn('Maybe Indonesia or Singapore?');
  assert.ok(!s.onboardingState().jurisdictionCandidates.some(f=>f.basis==='REGISTRATION'&&f.status==='CANDIDATE'));
 });
 it('mid-onboarding and confirmed state survive restore',async t=>{
  const file=temp(t),s=createWebStore({persistPath:file});await s.onboardingTurn(EXPAT);
  let restored=createWebStore({persistPath:file});assert.deepEqual(restored.onboardingState().profileState,s.onboardingState().profileState);
  await restored.onboardingTurn('I keep my books in IDR.');const p=restored.onboardingPropose().proposal;restored.onboardingValidate();restored.onboardingConfirm({proposalHash:p.hash});
  restored=createWebStore({persistPath:file});assert.equal(restored.onboardingReadiness().workspaceReady,true);assert.equal(restored.workspaceProfile().activated,false);
 });
 it('activation runtime, history, replay idempotency and CLOSED periods survive restart',t=>{
  const file=temp(t),s=createActiveStore({persistPath:file},{country:'SG',currency:'SGD',name:'Persistent Singapore'});
  const rec=s.onboardingHistory()[0],period=s.ctx.periods.list()[0];s.ctx.periods.replace(new FinancialPeriod({...period,status:'CLOSED'}));s.persist();
  const r=createWebStore({persistPath:file});assert.deepEqual(r.workspaceProfile(),s.workspaceProfile());assert.deepEqual(r.ctx.org,s.ctx.org);assert.deepEqual(r.onboardingHistory(),s.onboardingHistory());
  const n=r.ctx.audit.size;r.onboardingActivate({activationKey:rec.activationKey,actor:'test human'});assert.equal(r.ctx.audit.size,n);
  assert.equal(r.ctx.periods.list()[0].status,'CLOSED');
  assert.throws(()=>r.ctx.periods.getPostingPeriod(r.ctx.org.id,'2026-08-01'),/CLOSED/);
 });
 it('save failure rolls back activation and posting rather than returning success',async t=>{
  const file=temp(t),s=createWebStore({persistPath:file});s.editProfile({slot:'currency.functional',value:'IDR'});const p=s.onboardingPropose().proposal;s.onboardingValidate();s.onboardingConfirm({proposalHash:p.hash});
  const original=fs.renameSync;fs.renameSync=()=>{throw Error('simulated disk failure');};
  try{assert.throws(()=>s.onboardingActivate({activationKey:'disk'}),/could not be saved/);assert.equal(s.workspaceProfile().activated,false);assert.equal(s.ctx.org,null);}
  finally{fs.renameSync=original;}
  s.onboardingActivate({activationKey:'disk'});
  fs.renameSync=()=>{throw Error('disk failure');};
  try{await assert.rejects(()=>s.createSale({id:'save-fail',orgId:s.ctx.org.id,date:'2026-08-01',jurisdiction:'ZZ',currency:'IDR',customer:'Test',invoiceRef:'INV',description:'Test',amountMajor:'10'}),/could not be saved/);assert.equal(s.ctx.ledger.size,0);assert.equal(s.ctx.idempotency.size,0);}
  finally{fs.renameSync=original;}
 });
 it('pending corrections after activation survive restore without changing active runtime',t=>{
  const file=temp(t),s=createActiveStore({persistPath:file});s.editProfile({slot:'currency.functional',value:'USD'});
  const r=createWebStore({persistPath:file});assert.equal(r.onboardingState().slots['currency.functional'].value,'USD');assert.equal(r.workspaceProfile().functionalCurrency,'IDR');assert.equal(r.ctx.org.baseCurrency,'IDR');
 });
});
