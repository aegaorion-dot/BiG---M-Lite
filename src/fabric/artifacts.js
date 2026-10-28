'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const {deepFreeze}=require('../onboarding/canonical');
const {validateRawArtifact}=require('./contracts');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const PARSER_VERSION='fabric-raw/1';
function detectType(bytes){
 if(bytes.subarray(0,5).toString()==='%PDF-')return 'PDF';
 if(bytes[0]===0x50&&bytes[1]===0x4b&&[3,5,7].includes(bytes[2]))return 'ZIP';
 const head=bytes.subarray(0,4096).toString('utf8').replace(/^\uFEFF/,'').trimStart();
 if(/^[{[]/.test(head)){try{JSON.parse(bytes.toString('utf8'));return 'JSON';}catch{return 'INVALID_JSON';}}
 const root=head.replace(/^<\?xml[^>]*>\s*/i,'');
 if(/^(?:<!doctype\s+html|<html\b)/i.test(root))return 'HTML';
 if(/^(?:<\?xml\b|<[A-Za-z][\w:.-]*(?:\s|>))/.test(head))return 'XML';
 return 'UNSUPPORTED';
}
function mimeMatches(type,mime){
 const m=String(mime??'').split(';')[0].trim().toLowerCase();
 return ({JSON:['application/json','application/problem+json','application/feed+json'],XML:['text/xml','application/xml','application/atom+xml','application/rss+xml','application/rdf+xml'],HTML:['text/html','application/xhtml+xml'],PDF:['application/pdf'],ZIP:['application/zip','application/x-zip-compressed']})[type]?.includes(m)??false;
}
class RawArtifactStore{
 constructor(root){this.root=path.resolve(root);fs.mkdirSync(path.join(this.root,'blobs'),{recursive:true});fs.mkdirSync(path.join(this.root,'artifacts'),{recursive:true});}
 save(bytes,metadata){
  if(!Buffer.isBuffer(bytes))throw Error('Raw bytes required');
  const rawContentHash=hash(bytes),rawStorageRef='blobs/'+rawContentHash+'.bin',target=path.join(this.root,rawStorageRef),duplicate=fs.existsSync(target);
  const record=deepFreeze({...metadata,artifactId:randomUUID(),rawContentHash,rawStorageRef,byteLength:bytes.length,parserVersion:PARSER_VERSION,duplicateContent:duplicate});
  const validation=validateRawArtifact(record);if(!validation.ok)throw Error(validation.errors.join('; '));
  if(duplicate){if(hash(fs.readFileSync(target))!==rawContentHash)throw Error('Corrupt raw blob');}else fs.writeFileSync(target,bytes,{flag:'wx'});
  fs.writeFileSync(path.join(this.root,'artifacts',record.artifactId+'.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});return record;
 }
 read(artifact){
  if(!/^[a-f0-9-]{36}$/.test(artifact.artifactId??''))throw Error('Invalid artifact identity');
  const recorded=JSON.parse(fs.readFileSync(path.join(this.root,'artifacts',artifact.artifactId+'.json'),'utf8'));
  if(JSON.stringify(recorded)!==JSON.stringify(artifact))throw Error('Artifact provenance mismatch');
  if(!/^[a-f0-9]{64}$/.test(artifact.rawContentHash)||artifact.rawStorageRef!=='blobs/'+artifact.rawContentHash+'.bin')throw Error('Invalid raw reference');
  const bytes=fs.readFileSync(path.join(this.root,artifact.rawStorageRef));if(hash(bytes)!==artifact.rawContentHash)throw Error('Raw hash mismatch');return bytes;
 }
}
module.exports={hash,detectType,mimeMatches,RawArtifactStore,PARSER_VERSION};
