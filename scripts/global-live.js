'use strict';
// Explicit synthetic acceptance: exactly two paid requests; no retries or raw logging.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
async function main(){
 if(process.env.BIGM_META_LIVE_TEST!=='1'){console.log('SKIPPED: BIGM_META_LIVE_TEST=1 required.');return;}
 const root=path.resolve(__dirname,'..'),dir=path.join(root,'research/global-freelancer'),file=path.join(dir,'live-evidence.json');
 if(fs.existsSync(file))throw Error('Live evidence already exists; refuse an accidental repeat');
 const runs=JSON.parse(fs.readFileSync(path.join(dir,'reruns.json'),'utf8')),last=runs.filter(r=>r.success&&r.complete).at(-1);assert.ok(last);
 require('../src/web/environment').loadEnvironment(path.join(root,'.env'));
 const {MetaModelAdapter}=require('../src/ai/aiAdapter'),{createMuseRuntime}=require('../src/ai/museRuntime'),{createWebStore}=require('../src/web/store'),{fingerprint}=require('../src/onboarding/canonical');
 const {scenario,fxProvider}=require('./lib/globalJourney');
 const adapter=new MetaModelAdapter({allowLive:true,maxRequests:2,maxRetries:0,timeoutMs:60000}),runtime=createMuseRuntime({adapter}),steps=[];
 const beforeCall=Date.now(),profileStore=createWebStore({museRuntime:runtime});let failure=null;
 try{
  const p=await profileStore.onboardingTurn(scenario.profile),s=profileStore.onboardingState();assert.equal(p.providerUsed,'meta');assert.equal(adapter.requestCount,1);
  for(const [slot,value]of [['user.nationality','US'],['user.homeCountry','US'],['user.physicalLocation','AE'],['currency.functional','USD'],['org.subjectType','INDIVIDUAL']])assert.equal(s.slots[slot]?.value,value);
  assert.match(s.slots['user.travelStatus']?.value??'',/temporary|vacation/i);assert.equal(s.slots['user.travelDays']?.value,'30');
  for(const value of ['INFLUENCER','CREATOR','FREELANCER','SOFTWARE_LICENSOR'])assert.ok(s.slots['org.activities'].value.includes(value));
  assert.deepEqual(s.jurisdictionCandidates.filter(f=>f.basis==='CUSTOMER_LOCATION').map(f=>f.countryCode).sort(),['AE','AU','EG','GB','JP','KE']);
  assert.ok(!s.jurisdictionCandidates.some(f=>['TAX_RESIDENCE','REGISTRATION','INCORPORATION','SOURCE'].includes(f.basis)));
  steps.push({check:'initial-complex-profile',success:true,elapsedMs:Date.now()-beforeCall,provider:p.providerUsed,candidates:Object.fromEntries(Object.entries(s.slots).filter(([,v])=>v.value!=null).map(([k,v])=>[k,{value:v.value,status:v.status,supportingQuote:v.supportingQuote??v.evidence??null}])),jurisdictions:s.jurisdictionCandidates.map(f=>({basis:f.basis,countryCode:f.countryCode,status:f.status,supportingQuote:f.supportingQuote}))});
 }catch{failure='INITIAL_PROFILE_CHECK_FAILED';steps.push({check:'initial-complex-profile',success:false,elapsedMs:Date.now()-beforeCall});}
 const store=createWebStore({persistPath:path.join(root,'data/global-freelancer/run-'+last.run+'/store.json'),museRuntime:runtime,fxProvider:fxProvider()}),before=fingerprint(store.financialPosition());store.setUiLanguage('en');const start=Date.now();
 try{
  const answer=await store.museAssistant({question:'Explain my entire financial position simply: actual receipts, client balances, income categories, spending, card repayment and remaining liability, business versus personal and mixed costs, provisional profit, countries, withholding, treaties and why final tax is uncertain.'});
  assert.equal(answer.provider,'meta');assert.equal(adapter.requestCount,2);assert.equal(fingerprint(store.financialPosition()),before);
  const selected=answer.sections.flatMap(s=>s.facts);assert.ok(selected.every(f=>f.id.startsWith('position.')));
  for(const id of ['cashReceived','receivables','card','spending','incomeTypes','tax'])assert.ok(selected.some(f=>f.id==='position.'+id),'Missing grounded financial topic');
  steps.push({check:'final-grounded-explanation',success:true,elapsedMs:Date.now()-start,provider:answer.provider,contextHash:answer.contextHash,sections:answer.sections.map(s=>({kind:s.kind,facts:s.facts.map(f=>({id:f.id,display:f.display})),explanation:s.explanation})),authoritativeStateUnchanged:true});
 }catch{failure??='FINAL_EXPLANATION_CHECK_FAILED';steps.push({check:'final-grounded-explanation',success:false,elapsedMs:Date.now()-start,authoritativeStateUnchanged:fingerprint(store.financialPosition())===before});}
 const evidence={at:new Date().toISOString(),syntheticOnly:true,success:!failure,failure,requestCeiling:2,retries:0,requests:adapter.requestCount,model:adapter.model,steps,metrics:adapter.metrics().map(m=>({purpose:m.purpose,success:m.success,schemaValidationSuccess:m.schemaValidationSuccess,fallbackUsed:m.fallbackUsed,cacheHit:m.cacheHit,latencyMs:m.latencyMs,usage:m.usage,failure:m.failure??null})),credentialsRecorded:false};
 const serialized=JSON.stringify(evidence,null,2)+'\n';const key=process.env.BIGM_META_API_KEY;assert.ok(key&&key.length>=12);for(const variant of [key,Buffer.from(key).toString('base64'),encodeURIComponent(key)])assert.ok(!serialized.includes(variant));
 fs.writeFileSync(file,serialized);console.log(JSON.stringify({success:evidence.success,requests:evidence.requests,requestCeiling:2,steps:steps.map(s=>({check:s.check,success:s.success,elapsedMs:s.elapsedMs})),failure}));if(failure)process.exitCode=1;
}
main().catch(()=>{console.error('Controlled live verification could not initialize. No configuration or credentials were logged.');process.exitCode=1;});
