'use strict';
const {describe,it}=require('node:test'),assert=require('node:assert/strict');
const {createWebStore}=require('../src/web/store');
const {blankProfileState,validateExtractorPayload}=require('../src/onboarding/profiler');
const {listJurisdictions,getJurisdiction}=require('../src/global/jurisdictions');
const {listCurrencies}=require('../src/global/currencies');
const fact=(slot,value,quote,extra={})=>({slot,value,source:'USER',supportingQuote:quote,confidence:.9,status:'CANDIDATE',operation:'SET',...extra});
describe('Schema, evidence and candidate-only Meta authority',()=>{
 it('fresh runtime has no organization, currency, chart, modules or registration',()=>{
  const s=createWebStore(),st=s.onboardingState(),ws=s.workspaceProfile();
  assert.equal(s.ctx.org,null);assert.equal(s.ctx.chart,null);assert.equal(st.slots['org.name'].value,null);
  assert.equal(st.slots['currency.functional'].value,null);assert.deepEqual(st.jurisdictionCandidates,[]);assert.deepEqual(ws.modules,[]);assert.equal(ws.activated,false);
 });
 it('metadata preserves Original ID/SG/US/AU/GB and explicit unsupported payer metadata without a default fallback',()=>{
  assert.deepEqual(listJurisdictions().map(j=>j.code),['ID','SG','US','AU','GB','JP','EG','KE','AE','MA','FR','ES','TR']);
  for(const code of ['ID','SG','US','AU','GB']){const j=getJurisdiction(code);assert.ok(j.taxAuthority);assert.ok(j.officialDomains.length);assert.ok(j.researchInstruction);assert.ok(j.disclaimer);assert.equal(j.metadataOnly,true);}
  for(const code of ['JP','EG','KE','AE','MA']){const j=getJurisdiction(code);assert.equal(j.metadataOnly,true);assert.equal(j.coverageStatus,'NO_APPROVED_TAX_COVERAGE');assert.deepEqual(j.officialDomains,[]);assert.equal(j.taxAuthority,undefined);}
  assert.equal(getJurisdiction('XX'),null);assert.ok(listCurrencies().some(c=>c.code==='GBP'));
 });
 it('rejects fabricated evidence, out-of-range confidence and unsupported values',()=>{
  for(const f of [fact('org.name','Invented','not in message'),fact('org.name','Hello','Hello',{confidence:99}),fact('currency.functional','ZZZ','Hello'),fact('modules.enabled',['nuclear'],'Hello'),fact('org.name',{},'Hello'),fact('user.language','fr','Hello')]){
   assert.equal(validateExtractorPayload({facts:[f]},{userText:'Hello'}).ok,false,JSON.stringify(f));
  }
 });
 it('rejects AI self approval and the generic domicile slot',()=>{
  assert.equal(validateExtractorPayload({facts:[fact('org.name','Hello','Hello',{status:'APPROVED'})]},{userText:'Hello'}).ok,false);
  assert.equal(validateExtractorPayload({facts:[fact('org.domicile','ID','Indonesia')]},{userText:'Indonesia'}).ok,false);
 });
 it('preserves validated source, quote, confidence, role and CANDIDATE status',async()=>{
  const s=createWebStore(),text='Business name is Kopi Bali.';
  const aiProvider={model:'fixture-muse',extractProfile:async()=>({facts:[fact('org.name','Kopi Bali',text)],jurisdictionFacts:[]})};
  const out=await s.onboardingTurn(text,{aiProvider}),f=s.onboardingState().slots['org.name'];
  assert.equal(f.value,'Kopi Bali');assert.equal(f.supportingQuote,text);assert.equal(f.source,'USER');assert.equal(f.confidence,.9);assert.equal(f.semanticRole,'org.name');assert.equal(f.status,'CANDIDATE');
  assert.equal(out.providerUsed,'meta');assert.equal(out.model,'fixture-muse');assert.equal(s.workspaceProfile().activated,false);
 });
 it('invalid model output is labeled fallback and cannot populate unsupported slots',async()=>{
  const s=createWebStore(),r=await s.onboardingTurn('Hello',{aiProvider:{extractProfile:async()=>({facts:[fact('modules.enabled',['nuclear'],'Hello')]})}});
  assert.equal(r.providerUsed,'fallback');assert.equal(r.fallbackReason,'AI_SCHEMA_VALIDATION_FAILED');assert.equal(s.aiStatus().successes,0);assert.deepEqual(s.onboardingState().slots['modules.enabled'].value,[]);
 });
 it('model failure is distinguishable from provider not configured',async()=>{
  const s=createWebStore();const r=await s.onboardingTurn('Hello',{aiProvider:{extractProfile:async()=>{throw Error('private provider detail');}}});
  assert.equal(r.providerConfigured,true);assert.equal(r.providerUsed,'fallback');assert.equal(r.fallbackReason,'PROVIDER_UNAVAILABLE_OR_INVALID_RESPONSE');assert.ok(!JSON.stringify(r).includes('private provider detail'));
 });
 it('routine tests cannot make a real automatic Meta call even with inherited credentials',async()=>{
  const keys=['BIGM_META_API_URL','BIGM_META_API_KEY','BIGM_META_MODEL'],old=keys.map(k=>process.env[k]),originalFetch=globalThis.fetch;let calls=0;
  try{process.env.BIGM_META_API_URL='https://api.meta.ai/v1/responses';process.env.BIGM_META_API_KEY='synthetic';process.env.BIGM_META_MODEL='fixture';globalThis.fetch=async()=>{calls++;throw Error('forbidden');};
   const s=createWebStore(),r=await s.onboardingTurn('Hello');assert.equal(calls,0);assert.equal(r.fallbackReason,'LIVE_AI_DISABLED_IN_TESTS');assert.equal(r.providerConfigured,true);
  }finally{keys.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i]);globalThis.fetch=originalFetch;}
 });
 it('selecting language changes no jurisdiction or currency',()=>{
  const s=createWebStore();s.setUiLanguage('id');assert.deepEqual(s.onboardingState().jurisdictionCandidates,[]);assert.equal(s.onboardingState().slots['currency.functional'].value,null);
  assert.throws(()=>s.setUiLanguage('fr'),/Unsupported/);
 });
 it('profile state is the only candidate state and read operations cannot mutate it',()=>{
  const s=createWebStore(),st=s.onboardingState();st.slots['org.name'].value='External mutation';st.profileState.revision=99;
  assert.equal(s.onboardingState().slots['org.name'].value,null);assert.equal(s.onboardingState().profileRevision,0);
  assert.ok(blankProfileState().slots['currency.fxSource']);
 });
});
