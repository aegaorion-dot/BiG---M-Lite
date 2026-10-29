'use strict';
// One additional profiling request explicitly authorized after the original two checks.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
async function main(){
 if(process.env.BIGM_META_LIVE_TEST!=='1'){console.log('SKIPPED: BIGM_META_LIVE_TEST=1 required.');return;}
 const root=path.resolve(__dirname,'..'),file=path.join(root,'research/global-freelancer/live-profile-recheck.json');
 if(fs.existsSync(file))throw Error('Recheck already recorded; refuse accidental repeat');
 const original=JSON.parse(fs.readFileSync(path.join(root,'research/global-freelancer/live-evidence.json'),'utf8'));assert.equal(original.requests,2);assert.equal(original.steps[1].success,true);
 require('../src/web/environment').loadEnvironment(path.join(root,'.env'));
 const {MetaModelAdapter}=require('../src/ai/aiAdapter'),{createMuseRuntime}=require('../src/ai/museRuntime'),{createWebStore}=require('../src/web/store');
 const {scenario}=require('./lib/globalJourney'),{validateExtractorPayload}=require('../src/onboarding/profiler');
 const adapter=new MetaModelAdapter({allowLive:true,maxRequests:1,maxRetries:0,timeoutMs:60000}),post=adapter._post.bind(adapter);let candidate=null;
 // Observe the same validation callback; never substitute a response or bypass validation.
 adapter._post=(task,input,options)=>post(task,input,task==='business-profiling'?{...options,validate:value=>{candidate=structuredClone(value);return options.validate(value);}}:options);
 const store=createWebStore({museRuntime:createMuseRuntime({adapter})}),start=Date.now();let failure=null,provider=null;
 try{
  const r=await store.onboardingTurn(scenario.profile);provider=r.providerUsed;assert.equal(provider,'meta');assert.equal(adapter.requestCount,1);const s=store.onboardingState();
  for(const [key,value]of [['user.nationality','US'],['user.homeCountry','US'],['user.physicalLocation','AE'],['currency.functional','USD'],['org.subjectType','INDIVIDUAL'],['user.travelDays','30']])assert.equal(s.slots[key]?.value,value);
  assert.match(s.slots['user.travelStatus']?.value??'',/temporary|vacation/i);
  for(const value of ['INFLUENCER','CREATOR','FREELANCER','SOFTWARE_LICENSOR'])assert.ok(s.slots['org.activities'].value.includes(value));
  assert.deepEqual(s.jurisdictionCandidates.filter(f=>f.basis==='CUSTOMER_LOCATION').map(f=>f.countryCode).sort(),['AE','AU','EG','GB','JP','KE']);
  assert.ok(!s.jurisdictionCandidates.some(f=>['TAX_RESIDENCE','REGISTRATION','INCORPORATION','SOURCE'].includes(f.basis)));
 }catch{failure='PROFILE_RECHECK_FAILED';}
 const key=process.env.BIGM_META_API_KEY;assert.ok(key&&key.length>=12);const variants=[key,Buffer.from(key).toString('base64'),encodeURIComponent(key)];
 if(candidate){const text=JSON.stringify(candidate);for(const v of variants)assert.ok(!text.includes(v));const privateFile=path.join(root,'data/global-freelancer/live-profile-candidate.json');fs.mkdirSync(path.dirname(privateFile),{recursive:true});fs.writeFileSync(privateFile,text);}
 const checked=candidate?validateExtractorPayload(candidate,{userText:scenario.profile}):null;
 const evidence={at:new Date().toISOString(),success:!failure,syntheticOnly:true,explicitUserAuthorization:'One additional profiling request after the original two-request run',requests:adapter.requestCount,requestCeiling:1,retries:0,elapsedMs:Date.now()-start,provider,failure,strictValidatorAccepted:checked?.ok??false,candidates:!failure?Object.fromEntries(Object.entries(store.onboardingState().slots).filter(([,v])=>v.value!=null).map(([k,v])=>[k,{value:v.value,status:v.status,supportingQuote:v.supportingQuote}])):null,jurisdictions:!failure?store.onboardingState().jurisdictionCandidates.map(f=>({basis:f.basis,countryCode:f.countryCode,status:f.status,supportingQuote:f.supportingQuote})):null,metrics:adapter.metrics().map(m=>({purpose:m.purpose,success:m.success,schemaValidationSuccess:m.schemaValidationSuccess,latencyMs:m.latencyMs,usage:m.usage,failure:m.failure??null})),credentialsRecorded:false};
 const text=JSON.stringify(evidence,null,2)+'\n';for(const v of variants)assert.ok(!text.includes(v));fs.writeFileSync(file,text);console.log(JSON.stringify({success:evidence.success,requests:evidence.requests,requestCeiling:1,elapsedMs:evidence.elapsedMs,strictValidatorAccepted:evidence.strictValidatorAccepted,failure}));if(failure)process.exitCode=1;
}
main().catch(()=>{console.error('Profile recheck could not initialize. No configuration or credential was logged.');process.exitCode=1;});
