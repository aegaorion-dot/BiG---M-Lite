'use strict';
const path=require('node:path');
const fs=require('node:fs'),os=require('node:os');
const {fork}=require('node:child_process');
const {LIMITS,textOf,csvRows}=require('./files');
class ExtractionProvider {async extract(){throw Error('ExtractionProvider.extract not implemented');}}
class LocalExtractionProvider extends ExtractionProvider {
 async extract({bytes,mime}){
  if(mime==='text/plain'||mime==='text/csv'){
   const text=textOf(bytes);return {extractor:'bigm-text',extractorVersion:'1',method:'TEXT',pages:[{page:1,method:'TEXT'}],textBlocks:text.split(/\r?\n/).map((text,i)=>({blockId:'b'+i,page:1,row:i+1,text})).filter(b=>b.text.trim()),tables:mime==='text/csv'?[{page:1,rows:csvRows(text)}]:[],detectedLanguage:null,confidence:1,warnings:[]};
  }
  return new Promise((resolve,reject)=>{
   const workDir=fs.mkdtempSync(path.join(os.tmpdir(),'bigm-ocr-'));
   const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,NODE_ENV:process.env.NODE_ENV};
   const child=fork(path.join(__dirname,'extract-worker.js'),[],{execArgv:['--max-old-space-size=256'],env,stdio:['ignore','ignore','ignore','ipc']});
   let finished=false;
   const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);child.kill();
    const target=path.resolve(workDir),root=path.resolve(os.tmpdir());
    if(path.dirname(target)!==root||!path.basename(target).startsWith('bigm-ocr-'))return reject(Error('Unsafe OCR cleanup target'));
    fs.rmSync(target,{recursive:true,force:true,maxRetries:3,retryDelay:50});error?reject(error):resolve(result);};
   const timer=setTimeout(()=>finish(Error('Extraction timed out; document requires review')),60000);
   child.once('error',()=>finish(Error('Local extractor unavailable')));
   child.once('exit',()=>finish(Error('Malformed document or extractor resource limit')));
   child.once('message',message=>message.error?finish(Error(message.error)):finish(null,message.result));
   child.send({base64:bytes.toString('base64'),mime,workDir});
  });
 }
}
function validateExtraction(raw){
 if(!raw||typeof raw.extractor!=='string'||!raw.extractor||typeof raw.extractorVersion!=='string'||!['TEXT','PDF_TEXT','OCR','MIXED'].includes(raw.method)||!Array.isArray(raw.pages)||!raw.pages.length||raw.pages.length>LIMITS.pages||!Array.isArray(raw.textBlocks)||raw.textBlocks.length>20000||!Array.isArray(raw.tables)||!Array.isArray(raw.warnings)||raw.warnings.length>100||raw.warnings.some(w=>typeof w!=='string'||w.length>500)||!Number.isFinite(raw.confidence)||raw.confidence<0||raw.confidence>1)throw Error('Invalid extraction provider contract');
 const pages=new Set(raw.pages.map(p=>p.page)),ids=new Set();let chars=0;
 if(pages.size!==raw.pages.length||[...pages].some(p=>!Number.isInteger(p)||p<1||p>LIMITS.pages))throw Error('Invalid extraction pages');
 for(const b of raw.textBlocks){
  if(!b||typeof b.blockId!=='string'||ids.has(b.blockId)||!pages.has(b.page)||typeof b.text!=='string'||b.text.length>10000||b.bbox&&(!Array.isArray(b.bbox)||b.bbox.length!==4||b.bbox.some(n=>!Number.isFinite(n))))throw Error('Invalid extraction text block');
  ids.add(b.blockId);chars+=b.text.length;
 }
 if(chars>LIMITS.textChars||JSON.stringify(raw).length>2*1024*1024)throw Error('Extraction output limit exceeded');
 for(const t of raw.tables)if(!pages.has(t.page)||!Array.isArray(t.rows)||t.rows.length>LIMITS.rows+1||t.rows.some(r=>!Array.isArray(r)||r.length>30||r.some(c=>typeof c!=='string'||c.length>2000)))throw Error('Invalid extraction table');
 return structuredClone(raw);
}
module.exports={ExtractionProvider,LocalExtractionProvider,validateExtraction};
