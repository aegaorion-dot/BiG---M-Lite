'use strict';
// Opt-in LIVE Meta proof only. Never runs under routine npm test.
// Usage: BIGM_META_LIVE_TEST=1 node scripts/muse-live-proof.js
const path=require('node:path');
require('../src/web/environment').loadEnvironment(path.join(__dirname,'../.env'));
async function main(){
 if(process.env.BIGM_META_LIVE_TEST!=='1'){console.log(JSON.stringify({skipped:true,reason:'Set BIGM_META_LIVE_TEST=1 explicitly to use Meta credits.'}));return;}
 const {runMuseLiveProof}=require('../src/ai/museLiveWire');
 const result=await runMuseLiveProof();
 console.log(JSON.stringify({success:result.ok,calls:result.calls,model:result.model,feedbackSent:result.feedbackSent,countryPackCreated:false,approved:false}));
 if(!result.ok)process.exitCode=1;
}
main().catch(e=>{console.error(JSON.stringify({success:false,failure:String(e.message).slice(0,300)}));process.exitCode=1;});
