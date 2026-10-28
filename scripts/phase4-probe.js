'use strict';
// Explicit, bounded official-source R&D. Never imported by routine regression.
const fs=require('node:fs'),path=require('node:path');
const {RawArtifactStore}=require('../src/fabric/artifacts');
const {SourceConnector}=require('../src/fabric/connector');
const {getSource}=require('../src/fabric/registry');
async function main(){
 if(!process.argv.includes('--live')||process.env.NODE_TEST_CONTEXT||process.env.NODE_ENV==='test')throw Error('Explicit --live required outside tests');
 const root=path.resolve(__dirname,'../research/phase4-packs');fs.mkdirSync(root,{recursive:true});
 const store=new RawArtifactStore(path.join(root,'raw')),connector=new SourceConnector({store,maxBytes:10*1024*1024,timeoutMs:20000});
 const filter=process.argv.find(a=>a.startsWith('--id='))?.slice(5)?.split(',');
 const targets=require('../research/phase4-packs/targets.json').filter(t=>!filter||filter.includes(t.id));let next=0;
 async function worker(){while(next<targets.length){const t=targets[next++],timestamp=new Date().toISOString();let artifact=null,error=null;
  try{artifact=await connector.retrieve(t);}catch(e){error={message:e.message,cause:e.cause?.code??null,redirects:e.redirects??[],finalUrl:e.finalUrl??null};}
  const row={...t,timestamp,authority:getSource(t.sourceId).authorityName,success:artifact?.status==='DISCOVERED',httpStatus:artifact?.httpStatus??null,resolvedUrl:artifact?.finalUrl??error?.finalUrl??null,contentType:artifact?.contentType??null,retrievalMethod:t.method,responseHash:artifact?.rawContentHash??null,failureReason:error?.message??(artifact?.status==='DISCOVERED'?null:artifact?.status),artifact,error};
  fs.appendFileSync(path.join(root,'observations.jsonl'),JSON.stringify(row)+'\n');console.log(t.id,row.httpStatus??'FAILED',artifact?.sourceType??'',row.failureReason??'OK');
 }}
 await Promise.all(Array.from({length:3},worker));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
