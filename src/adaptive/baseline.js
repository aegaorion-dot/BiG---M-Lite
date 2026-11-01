'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{fingerprint}=require('../onboarding/canonical');
const ROOT=path.resolve(__dirname,'../..'),BASE='research/moroccan-expat/residence-research';
const read=file=>JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8'));
const sha=data=>createHash('sha256').update(data).digest('hex');
function frozenBaseline(){
 const manifest=read(BASE+'/BASE-MUSE-BASELINE.json'),{integrityHash,...body}=manifest;
 if(fingerprint(body)!==integrityHash||!manifest.frozen||manifest.liveRequests!==20)throw Error('Frozen BASE-MUSE manifest invalid');
 for(const [name,digest]of Object.entries(manifest.artifactSha256)){if(path.isAbsolute(name)||name.includes('..'))throw Error('Unsafe baseline reference');const text=fs.readFileSync(path.join(ROOT,BASE,name),'utf8').replace(/\r\n/g,'\n');if(sha(text)!==digest)throw Error('Frozen BASE-MUSE artifact changed: '+name);}
 const evaluation=read(BASE+'/run-2/evaluation-cases.json'),{integrityHash:evalHash,...evalBody}=evaluation;if(fingerprint(evalBody)!==evalHash||evaluation.cases.length!==20)throw Error('Frozen evaluation integrity mismatch');
 return {manifest,evaluation,first:read(BASE+'/run-1/job.json'),final:read(BASE+'/run-2/final-job.json'),cache:read(BASE+'/run-2/final-replay.json'),root:path.join(ROOT,BASE,'run-2'),baselineHash:integrityHash};
}
module.exports={ROOT,BASE,read,sha,frozenBaseline};
