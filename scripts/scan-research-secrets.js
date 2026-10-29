'use strict';
// Read-only scan: values never leave process memory. No network or model invocation.
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),{createHash}=require('node:crypto');
function runGit(args,input){const r=cp.spawnSync('git',args,{input,maxBuffer:256*1024*1024});if(r.status!==0)throw Error('Git security inspection failed');return r.stdout;}
function scan({refs=['--all'],knownSecrets=[]}={}){
 const lines=runGit(['rev-list','--objects',...refs]).toString('utf8').trim().split(/\r?\n/).filter(Boolean),paths=new Map();
 for(const line of lines){const i=line.indexOf(' '),sha=i<0?line:line.slice(0,i);if(!paths.has(sha))paths.set(sha,[]);if(i>=0)paths.get(sha).push(line.slice(i+1));}
 const patterns=[['GOOGLE_API_KEY',/\bAIza[0-9A-Za-z_-]{30,}\b/g],['PROVIDER_TOKEN',/\b(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|(?:AKIA|ASIA)[A-Z0-9]{16}|EAA[A-Za-z0-9]{50,})\b/g],['PRIVATE_KEY',/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g],['BEARER_TOKEN',/\bBearer\s+([A-Za-z0-9_.~+\/-]{16,}=*)/g],['SECRET_LITERAL',/(?:api[_-]?key|access[_-]?token|auth[_-]?token|client_secret|secret|password)[\w.-]*[ \t]*[=:][ \t]*["']([A-Za-z0-9_./+=-]{12,})["']/gi]];
 patterns.push(['QUERY_CREDENTIAL',/[?&](?:key|api_key|apikey|token|access_token|secret|client_secret|session_token|password)=([A-Za-z0-9_./+=-]{12,})/gi]);
 patterns.push(['FIREWORKS_CREDENTIAL',/\bfw_[A-Za-z0-9_-]{20,}\b/g]);
 const variants=knownSecrets.filter(s=>typeof s==='string'&&s.length>=12).flatMap(s=>[s,Buffer.from(s).toString('base64'),encodeURIComponent(s),JSON.stringify(s).slice(1,-1)]).map(s=>Buffer.from(s)),batch=runGit(['cat-file','--batch'],[...paths.keys()].join('\n')+'\n');let offset=0,blobs=0,commits=0,fixtureMatches=0;const findings=[],logFiles=[];
 while(offset<batch.length){const nl=batch.indexOf(10,offset),[sha,type,n]=batch.subarray(offset,nl).toString('ascii').split(' '),size=Number(n),body=batch.subarray(nl+1,nl+1+size);offset=nl+size+2;if(type!=='blob'&&type!=='commit')continue;const locations=paths.get(sha);if(type==='blob')blobs++;else commits++;
  if(variants.some(v=>body.includes(v)))findings.push({category:'CONFIGURED_CREDENTIAL',object:sha,paths:locations});
  if(locations.some(p=>/(?:\.log$|test-output|debug-output)/i.test(p)))logFiles.push(...locations);
  // Scan byte-preserving Latin-1 as well, so embedded ASCII tokens in binary blobs are covered.
  const text=body.toString('latin1');for(const [category,pattern]of patterns){pattern.lastIndex=0;for(const m of text.matchAll(pattern)){const value=m[1]??m[0],fixture=((category==='SECRET_LITERAL'||category==='BEARER_TOKEN')&&(/^(?:test|fake|synthetic|fixture|mock|local|http)[_-]/i.test(value)||['YOUR_SECRET_KEY','secret-intake-token'].includes(value)))||(category==='QUERY_CREDENTIAL'&&['fixture-sensitive','fixture-password'].includes(value));if(fixture){fixtureMatches++;continue;}findings.push({category,object:sha,paths:locations,line:text.slice(0,m.index).split('\n').length,valueSha256:createHash('sha256').update(value).digest('hex')});}}
 }
 const envFiles=[...new Set([...paths.values()].flat().filter(p=>/(^|\/)\.env(?:\..*)?$/.test(p)&&!/(^|\/)\.env\.example$/.test(p)))];
 return {reachableBlobsScanned:blobs,reachableCommitsScanned:commits,knownCredentialMatches:findings.filter(f=>f.category==='CONFIGURED_CREDENTIAL').length,unresolvedCredentials:findings.length,findings,reviewedSyntheticFixtureMatches:fixtureMatches,trackedEnvironmentFiles:envFiles,committedLogFiles:[...new Set(logFiles)],passed:findings.length===0&&envFiles.length===0};
}
if(require.main===module){try{require('../src/web/environment').loadEnvironment(path.join(__dirname,'../.env'));const report=scan({knownSecrets:[process.env.BIGM_META_API_KEY,process.env.BIGM_API_TOKEN]}),out=process.argv.find(a=>a.startsWith('--output='));if(out)fs.writeFileSync(out.slice(9),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;}catch{console.error('Security scan could not complete; no credential details were logged.');process.exitCode=1;}}
module.exports={scan};
