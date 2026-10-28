'use strict';
// Exactly one paid request, only after explicit opt-in. Never part of npm test.
const path=require('node:path');require('../src/web/environment').loadEnvironment(path.join(__dirname,'..','.env'));
async function main(){
 if(process.env.BIGM_LIVE_SMOKE!=='1'){console.log('SKIPPED: set BIGM_LIVE_SMOKE=1 to authorize exactly one live request.');return;}
 if(!process.env.BIGM_META_API_URL||!process.env.BIGM_META_API_KEY||!process.env.BIGM_META_MODEL)throw Error('Configure BIGM_META_API_URL, BIGM_META_API_KEY and BIGM_META_MODEL first.');
 const {MetaModelAdapter}=require('../src/ai/aiAdapter'),{SYSTEM_PROMPT,RESPONSE_SCHEMA,validateExtractorPayload}=require('../src/onboarding/profiler');
 const message='My business is called Smoke Coffee and I keep my books in IDR.';
 let calls=0;
 const adapter=new MetaModelAdapter({allowLive:true,fetchImpl:async(...args)=>{calls++;if(calls>1)throw Error('One-request limit');return fetch(...args);}});
 const raw=await adapter.extractProfile({system:SYSTEM_PROMPT,user:JSON.stringify({message,responseSchema:RESPONSE_SCHEMA,capabilities:{modules:['sales','purchase','accounting','reports'],jurisdictions:['ID','SG','US','AU','GB'],currencies:['IDR','SGD','USD','AUD','GBP','EUR']}})});
 const checked=validateExtractorPayload(raw,{userText:message});if(!checked.ok||!checked.extracted.facts.length)throw Error('Live candidate extraction failed validation');
 console.log(JSON.stringify({requests:calls,providerUsed:'meta',model:adapter.model,candidateFacts:checked.extracted.facts.length,activation:false}));
}
main().catch(()=>{console.error('Meta smoke failed. No retry was made. Check provider configuration and response compatibility.');process.exitCode=1;});
