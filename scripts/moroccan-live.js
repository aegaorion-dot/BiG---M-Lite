'use strict';
const fs=require('node:fs'),path=require('node:path');
async function main(){
 if(process.env.BIGM_META_LIVE_TEST!=='1'){console.log('SKIPPED: BIGM_META_LIVE_TEST=1 required.');return;}
 const root=path.resolve(__dirname,'..'),dir=path.join(root,'research/moroccan-expat'),evidenceFile=path.join(dir,'live-evidence.json'),privateDir=path.join(root,'data/moroccan/live-private'),budgetPath=path.join(privateDir,'budget.json');
 if(fs.existsSync(evidenceFile)||fs.existsSync(budgetPath))throw Error('Existing live run requires deliberate review; automatic repeats are blocked');
 const deterministic=JSON.parse(fs.readFileSync(path.join(dir,'deterministic-result.json'),'utf8'));if(!deterministic.success||!deterministic.rtl||!deterministic.processRestart)throw Error('Deterministic acceptance must pass first');
 fs.mkdirSync(privateDir,{recursive:true});fs.writeFileSync(budgetPath,JSON.stringify({requests:0,maxRequests:8,metrics:[]},null,2));
 const runtime=require('./lib/moroccanLiveRuntime').liveRuntime(budgetPath),{runMoroccanJourney}=require('./lib/moroccanJourney');let drive,result,stage='startup';const start=Date.now();
 try{drive=await require('./lib/browserDriver').browserDriver();result=await runMoroccanJourney({drive,live:true,museRuntime:runtime,liveBudgetPath:budgetPath,persistPath:path.join(root,'data/moroccan/live-user/store.json'),observe:s=>{stage=s;}});}catch(e){result={success:false,complete:false,stage:e.journeyStage??stage,failure:'CONTROLLED_LIVE_ACCEPTANCE_FAILED'};}finally{if(drive)await drive.close();}
 const budget=JSON.parse(fs.readFileSync(budgetPath,'utf8'));const evidence={...result,at:new Date().toISOString(),syntheticOnly:true,targetRequests:6,requestCeiling:8,paidRequests:budget.requests,retries:0,metrics:budget.metrics,totalWallMs:Date.now()-start,credentialsRecorded:false};
 const text=JSON.stringify(evidence,null,2)+'\n',key=process.env.BIGM_META_API_KEY;for(const v of [key,Buffer.from(key).toString('base64'),encodeURIComponent(key)])if(text.includes(v))throw Error('Credential-shaped public evidence rejected');fs.writeFileSync(evidenceFile,text);
 console.log(JSON.stringify({success:evidence.success,stage,requests:budget.requests,requestCeiling:8,totalWallMs:evidence.totalWallMs,failure:evidence.failure??null}));if(!result.success)process.exitCode=1;
}
main().catch(()=>{console.error('Controlled live journey could not initialize. No credentials, environment or prompts were logged.');process.exitCode=1;});
