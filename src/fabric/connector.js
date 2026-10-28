'use strict';
const {getSource,lookupSource,classifyLink,preferAccess}=require('./registry');
const {detectType,mimeMatches}=require('./artifacts');
class SourceConnector{
 constructor({store,fetchImpl=globalThis.fetch,maxBytes=2*1024*1024,timeoutMs=20000,maxRedirects=4}={}){
  if(!store||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>10*1024*1024||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000||!Number.isInteger(maxRedirects)||maxRedirects<0||maxRedirects>10)throw Error('Bounded artifact store and network limits required');
  Object.assign(this,{store,fetchImpl,maxBytes,timeoutMs,maxRedirects});
 }
 async retrievePreferred({sourceId,resources}){
  const source=getSource(sourceId);if(!source)throw Error('Unknown source');
  const remaining=resources.filter(r=>lookupSource(source.jurisdictionCode,r.url)?.sourceId===sourceId&&(r.method!=='API'||source.apiEndpoints.some(api=>r.url.startsWith(api.url))));
  const attempts=[];
  while(true){
   const selected=preferAccess(remaining);if(!selected)break;
   remaining.splice(remaining.indexOf(selected),1);
   try{const artifact=await this.retrieve({sourceId,url:selected.url,method:selected.method});
    if(artifact.status==='DISCOVERED')return artifact;
    attempts.push({url:selected.url,artifactId:artifact.artifactId,status:artifact.status});
   }catch(e){attempts.push({url:selected.url,error:e.message});}
  }
  const error=Error('No verified registered access method succeeded');error.attempts=attempts;throw error;
 }
 async retrieve({sourceId,url,method='HTML'}){
  const source=getSource(sourceId);if(!source||lookupSource(source.jurisdictionCode,url)?.sourceId!==sourceId)throw Error('Source URL not allowlisted for this authority/jurisdiction');
  if(!source.preferredAccessMethods.includes(method))throw Error('Unsupported access method');
  const sourceUrl=new URL(url).href;let current=sourceUrl;const redirects=[];
  const signal=AbortSignal.timeout(this.timeoutMs);
  for(let hop=0;hop<=this.maxRedirects;hop++){
   const response=await this.fetchImpl(current,{redirect:'manual',signal,headers:{accept:'application/json, application/xml, text/html, application/pdf;q=0.9, */*;q=0.1','user-agent':'BiG-M-Lite-SourceResearch/0.1'}});
   // Never trust a fetch adapter that silently followed a redirect.
   if(response.url&&new URL(response.url).href!==current)throw Error('Unexpected followed redirect');
   if([301,302,303,307,308].includes(response.status)){
    const location=response.headers.get('location');await response.body?.cancel();if(!location)throw Error('Redirect without location');
    const next=new URL(location,current).href,classification=classifyLink(source.jurisdictionCode,next);
    redirects.push({from:current,to:next,status:response.status,classification});
    if(lookupSource(source.jurisdictionCode,next)?.sourceId!==sourceId){const error=Error('Redirect blocked: '+classification);error.redirects=redirects;error.finalUrl=current;throw error;}
    if(hop===this.maxRedirects)throw Error('Too many redirects');current=next;continue;
   }
   const declared=Number(response.headers.get('content-length'));
   if(declared>this.maxBytes){await response.body?.cancel();throw Error('Document exceeds byte limit');}
   const chunks=[];let length=0;
   if(response.body){const reader=response.body.getReader();try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>this.maxBytes){await reader.cancel();throw Error('Document exceeds byte limit');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}}
   const bytes=Buffer.concat(chunks),contentType=response.headers.get('content-type')??null,detectedType=detectType(bytes),mimeValid=mimeMatches(detectedType,contentType);
   const status=response.status>=200&&response.status<300?(mimeValid?'DISCOVERED':'MIME_MISMATCH'):'HTTP_ERROR';
   // Raw preservation precedes normalization, including error pages and MIME mismatch bodies.
   return this.store.save(bytes,{sourceId,jurisdictionCode:source.jurisdictionCode,authorityCode:source.authorityCode,sourceUrl,finalUrl:current,redirects,sourceType:detectedType,retrievalMethod:method,retrievedAt:new Date().toISOString(),httpStatus:response.status,contentType,language:response.headers.get('content-language')??null,officialDocumentId:null,title:null,publishedAt:null,effectiveFrom:null,effectiveTo:null,status,etag:response.headers.get('etag'),lastModified:response.headers.get('last-modified'),unstableUrl:/[?&](?:token|signature|expires|session)=|\/latest(?:\/|$)/i.test(current)});
  }
  throw Error('Redirect limit');
 }
}
module.exports={SourceConnector};
