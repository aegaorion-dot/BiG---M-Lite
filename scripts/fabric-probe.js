'use strict';
// Explicit, bounded, read-only R&D. Never imported by the normal test runner.
const fs=require('node:fs'),path=require('node:path');
const {SOURCES}=require('../src/fabric/registry');
const {RawArtifactStore}=require('../src/fabric/artifacts');
const {SourceConnector}=require('../src/fabric/connector');
async function main(){
 if(!process.argv.includes('--live'))throw Error('Use --live to authorize official-source network probes');
 if(process.env.NODE_ENV==='test'||process.env.NODE_TEST_CONTEXT)throw Error('Live research disabled in tests');
 const root=path.resolve(__dirname,'../research/country-pack-fabric'),store=new RawArtifactStore(path.join(root,'captures'));
 const connector=new SourceConnector({store,timeoutMs:15000,maxBytes:3*1024*1024});
 const selection=process.argv.find(a=>a.startsWith('--source='))?.split('=')[1];
 const mode=process.argv.find(a=>a.startsWith('--set='))?.split('=')[1]??'all';
 const seed=mode==='samples'?[]:SOURCES.flatMap(s=>['','robots.txt','sitemap.xml'].map(p=>({sourceId:s.sourceId,url:s.baseUrl+p,method:p==='sitemap.xml'?'STRUCTURED_DOWNLOAD':'HTML',kind:p||'homepage'})));
 const samples=mode==='seed'?[]:require('../research/country-pack-fabric/targets.json');
 const targets=[...seed,...samples].filter(t=>!selection||t.sourceId===selection);let i=0;
 async function worker(){while(i<targets.length){const target=targets[i++],at=new Date().toISOString();let row;
  try{const artifact=await connector.retrieve(target);row={...target,observedAt:at,artifact};console.log(target.sourceId,artifact.httpStatus,artifact.sourceType,target.kind);}
  catch(e){row={...target,observedAt:at,error:e.message,cause:e.cause?.code??null,redirects:e.redirects??null,finalUrl:e.finalUrl??null};console.log(target.sourceId,'BLOCKED',target.kind,e.message);}
  fs.appendFileSync(path.join(root,'observations.jsonl'),JSON.stringify(row)+'\n');
 }}
 await Promise.all(Array.from({length:4},worker));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
