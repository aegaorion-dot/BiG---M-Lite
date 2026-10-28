'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {loadSources}=require('./phase4-normalize');
const {RawArtifactStore}=require('../src/fabric/artifacts');
const root=path.resolve(__dirname,'../research/phase4-packs'),sources=loadSources(),store=new RawArtifactStore(path.join(root,'raw'));
const rows=fs.readFileSync(path.join(root,'observations.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const findings=rows.map(r=>{
 let disposition=r.success?'ACQUIRED_UNREVIEWED':'FAILED',reason=r.failureReason;
 if(r.success){
  const e=sources.get(r.id)?.envelope;
  if(e?.processingState==='NO_TEXT_REVIEW_REQUIRED'||/currently unavailable/i.test(e?.metadata.title??'')){disposition='SOFT_FAILURE_NOT_LEGAL_EVIDENCE';reason='HTTP200 unavailable/empty content';}
  if(r.artifact.sourceType==='JSON'){const j=JSON.parse(store.read(r.artifact));if(j.document_type==='redirect'){disposition='DISCOVERY_REDIRECT_ONLY';reason='Content API explicitly redirects to '+j.redirects?.[0]?.destination;}else if(e?.metadata.documentKind==='STRUCTURED_DATA')disposition='STRUCTURED_DISCOVERY_NOT_LEGAL_TEXT';}
  if(r.artifact.sourceType==='PDF'&&!e)disposition='PENDING_TEXT_EXTRACTION';
 }
 return {id:r.id,timestamp:r.timestamp,url:r.url,httpStatus:r.httpStatus,resolvedUrl:r.resolvedUrl,contentType:r.contentType,retrievalMethod:r.retrievalMethod,authority:r.authority,transportSuccess:r.success,responseHash:r.responseHash,disposition,failureReason:reason,artifactId:r.artifact?.artifactId??null};
});
const original=JSON.parse(fs.readFileSync(path.join(root,'original-inspection.json'),'utf8')).map(m=>{
 const bytes=fs.readFileSync(path.join(root,m.localPath)),gitSha=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex'),pdf=rows.find(r=>r.id==='sg-treaty-pdf'&&r.success);
 return {...m,snapshotGitBlobSha:gitSha,exactGitBlobMatch:gitSha===m.blobSha,newOfficialPdfHash:pdf.responseHash,officialPdfHashMatchesOriginal:pdf.responseHash===m.reportedOriginalPdfSha256};
});
fs.writeFileSync(path.join(root,'acquisition-findings.json'),JSON.stringify({findings,originalInspection:original},null,2)+'\n');
console.log(JSON.stringify({attempts:rows.length,rawArtifacts:rows.filter(r=>r.artifact).length,failures:findings.filter(r=>!r.transportSuccess).length,softFailures:findings.filter(r=>r.disposition==='SOFT_FAILURE_NOT_LEGAL_EVIDENCE').length,originalExactMatches:original.every(m=>m.exactGitBlobMatch&&m.officialPdfHashMatchesOriginal)}));
