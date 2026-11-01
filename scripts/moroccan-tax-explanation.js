'use strict';
// One opt-in paid explanation of an already calculated result. No research tools.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
async function main(){
 if(!process.argv.includes('--live')){console.log('SKIPPED: explicit --live required');return;}
 const root=path.resolve(__dirname,'..'),privateDir=path.join(root,'data/moroccan/tax-explanation'),budgetFile=path.join(privateDir,'budget.json'),output=path.join(root,'research/moroccan-expat/tax-live-explanation.json');
 if(fs.existsSync(budgetFile)||fs.existsSync(output))throw Error('Existing controlled check cannot be repeated automatically');
 require('../src/web/environment').loadEnvironment(path.join(root,'.env'));
 const key=process.env.BIGM_META_API_KEY;if(!key)throw Error('Private Meta configuration required');
 const variants=[key,Buffer.from(key).toString('base64'),encodeURIComponent(key)],safe=value=>{const text=JSON.stringify(value,null,2)+'\n';if(variants.some(v=>text.includes(v)))throw Error('Credential-shaped output rejected');return text;};
 const {MetaModelAdapter}=require('../src/ai/aiAdapter'),{createMuseRuntime}=require('../src/ai/museRuntime'),{createWebStore}=require('../src/web/store'),{fingerprint}=require('../src/onboarding/canonical');
 const adapter=new MetaModelAdapter({allowLive:true,maxRequests:1,maxRetries:0,timeoutMs:60000}),transport=adapter._fetch;
 fs.mkdirSync(privateDir,{recursive:true});fs.writeFileSync(budgetFile,safe({ceiling:1,requests:0,retries:0}));
 adapter._fetch=async(...args)=>{const b=JSON.parse(fs.readFileSync(budgetFile));if(b.requests>=1)throw Error('Controlled request ceiling reached');b.requests++;fs.writeFileSync(budgetFile,safe(b));return transport(...args);};
 const store=createWebStore({persistPath:path.resolve(process.argv.find(a=>a.startsWith('--store='))?.slice(8)??path.join(root,'data/moroccan/run-9/store.json')),museRuntime:createMuseRuntime({adapter})});
 const before=fingerprint(store.financialPosition()),result=store.scopedTax.view().result;assert.equal(result?.status,'CALCULATED');
 const question=require('../src/i18n/strings').t('ar-MA','scope.question.tax'),answer=await store.museAssistant({question}),tax=answer.sections.flatMap(s=>s.facts).find(f=>f.id==='scope.tax');
 const success=answer.provider==='meta'&&tax?.kind==='CALCULATED_RESULT'&&tax.value.netTaxPayable.amountMinor===result.netTaxPayable.amountMinor&&fingerprint(store.financialPosition())===before;
 const evidence={success,syntheticOnly:true,locale:'ar-MA',question,answer,paidRequests:JSON.parse(fs.readFileSync(budgetFile)).requests,requestCeiling:1,retries:0,regulatoryResearchCalls:0,stateUnchanged:fingerprint(store.financialPosition())===before,metrics:adapter.metrics(),credentialsRecorded:false,at:new Date().toISOString()};
 fs.writeFileSync(output,safe(evidence));console.log(JSON.stringify({success,requests:evidence.paidRequests,retries:0,stateUnchanged:evidence.stateUnchanged}));if(!success)process.exitCode=1;
}
if(require.main===module)main().catch(()=>{console.error('Controlled tax explanation did not complete. No credential or provider response was logged; do not retry automatically.');process.exitCode=1;});
module.exports={main};
