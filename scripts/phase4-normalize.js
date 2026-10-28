'use strict';
const fs=require('node:fs'),path=require('node:path');
const {RawArtifactStore}=require('../src/fabric/artifacts');
const {normalizeArtifact,normalizePdfExtraction}=require('../src/fabric/normalizer');
function loadSources(){
 const root=path.resolve(__dirname,'../research/phase4-packs'),store=new RawArtifactStore(path.join(root,'raw'));
 const rows=fs.readFileSync(path.join(root,'observations.jsonl'),'utf8').trim().split('\n').map(JSON.parse),sources=new Map();
 for(const row of rows.filter(r=>r.success)){
  const a=row.artifact;let envelope;
  if(a.sourceType==='PDF'){
   const file=path.join(root,'extractions',row.id+'.json');if(!fs.existsSync(file))continue;
   envelope=normalizePdfExtraction(store,a,JSON.parse(fs.readFileSync(file,'utf8')));
  }else envelope=normalizeArtifact(store,a);
  sources.set(row.id,{row,envelope});
 }
 return sources;
}
if(require.main===module){const out=path.resolve(__dirname,'../research/phase4-packs/normalized');fs.mkdirSync(out,{recursive:true});for(const [id,{envelope}]of loadSources())fs.writeFileSync(path.join(out,id+'.json'),JSON.stringify(envelope,null,2)+'\n');console.log('Official sources normalized offline.');}
module.exports={loadSources};
