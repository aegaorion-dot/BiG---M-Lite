'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const role=process.argv[2];
async function main(){
 if(!['fx','multilingual'].includes(role))throw Error('Unknown international smoke role');
 const flag=role==='fx'?'BIGM_FX_LIVE_TEST':'BIGM_META_LIVE_TEST';if(process.env[flag]!=='1'){console.log('SKIPPED: explicit '+flag+'=1 required.');return;}
 const start=Date.now();let result,success=false,failure=null;
 try{
  if(role==='fx'){
   const {FrankfurterProvider}=require('../src/fx/frankfurter'),p=new FrankfurterProvider({allowLive:true,maxRequests:1,timeoutMs:20000});const rate=await p.getRate({baseCurrency:'SGD',quoteCurrency:'IDR',date:'2026-06-01'});result={provider:rate.provider,base:rate.baseCurrency,quote:rate.quoteCurrency,date:rate.rateDate,rate:rate.rate,reference:rate.providerReference,requests:p.calls};success=true;
  }else{
   require('../src/web/environment').loadEnvironment(path.join(__dirname,'../.env'));if(!process.env.BIGM_META_API_KEY)throw Error('Meta configuration missing');
   const {MetaModelAdapter}=require('../src/ai/aiAdapter'),{createMuseRuntime}=require('../src/ai/museRuntime'),{createWebStore}=require('../src/web/store');const adapter=new MetaModelAdapter({allowLive:true,maxRequests:2,maxRetries:0,timeoutMs:45000}),s=createWebStore({museRuntime:createMuseRuntime({adapter})});s.setUiLanguage('id-ID');const response=await s.onboardingTurn('Saya orang Australia dan menjalankan coffee shop di Bali.'),state=s.onboardingState();result={locale:s.currentLocale(),conversationLocale:s.currentConversationLocale(),model:adapter.model,providerUsed:response.providerUsed,question:response.question,candidates:{nationality:state.slots['user.nationality'],jurisdictions:state.jurisdictionCandidates},functionalCurrency:state.slots['currency.functional'].value,requests:adapter.requestCount,metrics:adapter.metrics()};assert.equal(response.providerUsed,'meta');assert.equal(response.question.provider,'meta');assert.match(response.question.text,/apa|mana|pembukuan|mata uang/i);assert.equal(state.slots['user.nationality'].value,'AU');assert.ok(state.jurisdictionCandidates.some(f=>f.basis==='BUSINESS_WORK_LOCATION'&&f.countryCode==='ID'));assert.equal(s.workspaceProfile().activated,false);success=true;
  }
 }catch(e){failure=String(e.message).slice(0,200);}
 const evidence={role,at:new Date().toISOString(),success,latencyMs:Date.now()-start,result,failure,credentialsRecorded:false},dir=path.join(__dirname,'../research/phase8-international');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'live-'+role+'.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({role,success,latencyMs:evidence.latencyMs,requests:result?.requests,failure}));if(!success)process.exitCode=1;
}
main().catch(()=>{console.error('International smoke could not run; no credential details logged.');process.exitCode=1;});
