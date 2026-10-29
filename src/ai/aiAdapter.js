'use strict';
const {randomUUID,createHash}=require('node:crypto');
class AIProvider {
 get name(){return 'base';}
 async classify(){throw Error('AIProvider.classify not implemented');}
 async explain(){throw Error('AIProvider.explain not implemented');}
}
function responsePayload(raw){
 if(!raw||typeof raw!=='object')throw Error('invalid provider response');
 if(raw.status&&raw.status!=='completed')throw Error('provider response '+raw.status);
 if(raw.error)throw Error('provider response error');
 if(!Array.isArray(raw.output))throw Error('Responses envelope output array required');
 const messages=raw.output.filter(item=>item.type==='message'&&item.role==='assistant');
 if(messages.some(m=>(m.content??[]).some(c=>c.type==='refusal')))throw Error('provider refusal');
 const text=messages.flatMap(m=>(m.content??[]).filter(c=>c.type==='output_text').map(c=>c.text??'')).join('');
 if(!text.trim())throw Error('provider returned no output text');
 try{return JSON.parse(text);}catch{throw Error('provider returned invalid JSON');}
}
class MetaModelAdapter extends AIProvider {
 constructor({endpoint=null,apiKey=null,model=null,fetchImpl=null,timeoutMs=20000,allowLive=false,maxRetries=0,maxRequests=100,cacheTtlMs=300000,onMetric=null}={}){
  super();this.endpoint=endpoint??process.env.BIGM_META_API_URL??null;this.apiKey=apiKey??process.env.BIGM_META_API_KEY??null;
  this.model=model??process.env.BIGM_META_MODEL??null;this._fetch=fetchImpl??globalThis.fetch;this.injectedFetch=Boolean(fetchImpl);this.timeoutMs=timeoutMs;this.allowLive=allowLive;
  if(!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>10000||!Number.isFinite(timeoutMs)||timeoutMs<1)throw Error('Invalid Meta request budget or timeout');
  this.maxRetries=Number.isInteger(maxRetries)?Math.min(1,Math.max(0,maxRetries)):0;this.maxRequests=maxRequests;this.requestCount=0;this.cacheTtlMs=cacheTtlMs;this.cache=new Map();this.inflight=new Map();this.records=[];this.lastRequest=null;this.onMetric=onMetric;
 }
 get name(){return 'meta-model-api';}
 _requireConfig(){
  if(!this.endpoint)throw Error('Meta endpoint not configured');
  if(!this.apiKey)throw Error('Meta API key not configured');
  if(!this.model)throw Error('Meta model not configured');
  if((process.env.NODE_TEST_CONTEXT||process.env.NODE_ENV==='test')&&!this.injectedFetch&&!this.allowLive)throw Error('live AI disabled during routine tests');
  if(typeof this._fetch!=='function')throw Error('fetch implementation unavailable');
  if(!this.injectedFetch){let u;try{u=new URL(this.endpoint);}catch{throw Error('Invalid Meta endpoint');}if(u.protocol!=='https:'||u.hostname!=='api.meta.ai'||u.pathname!=='/v1/responses'||u.username||u.password||u.search||u.hash)throw Error('Official Meta Responses endpoint required');}
 }
 metrics(){return structuredClone(this.records);}
 markFallback(purpose){if(this.lastRequest?.purpose===purpose){const record={...this.lastRequest,fallbackUsed:true};this.lastRequest=Object.freeze(record);this.records[this.records.length-1]=record;}}
 _metric(record){this.lastRequest=Object.freeze(record);this.records.push(record);if(this.records.length>100)this.records.shift();try{this.onMetric?.(structuredClone(record));}catch{/* Telemetry never changes semantic authority. */}}
 async _post(task,input,options={}){
  this._requireConfig();
  const maxTokens=Math.min(4096,Math.max(128,options.maxOutputTokens??2048)),user=input.user??JSON.stringify(input),system=input.system??'Return JSON only.';
  if(user.length+system.length>50000)throw Error('Meta context limit exceeded');
  const key=createHash('sha256').update(JSON.stringify([task,this.model,system,user,maxTokens])).digest('hex'),cached=this.cache.get(key);
  if(options.cache!==false&&cached&&cached.expires>Date.now()){this._metric({...cached.provenance,cacheHit:true,latencyMs:0,at:new Date().toISOString()});return structuredClone(cached.value);}
  if(this.inflight.has(key))return structuredClone(await this.inflight.get(key));
  const work=this._request(task,{system,user,maxTokens},options,key);this.inflight.set(key,work);
  try{return structuredClone(await work);}finally{this.inflight.delete(key);}
 }
 async _request(task,{system,user,maxTokens},options,key){
  const start=Date.now(),record={requestId:randomUUID(),purpose:task,provider:'meta',model:this.model,success:false,parseSuccess:false,schemaValidationSuccess:null,fallbackUsed:false,cacheHit:false,attempts:0,usage:null,estimatedCost:null,costStatus:'NOT_REPORTED',at:new Date().toISOString()};
  try{
   let raw;
   for(let attempt=0;attempt<=this.maxRetries;attempt++){
    if(this.requestCount>=this.maxRequests)throw Error('Meta request budget exhausted');this.requestCount++;record.attempts++;
    const controller=new AbortController();let timer;
    try{
     raw=await Promise.race([(async()=>{let res;try{res=await this._fetch(this.endpoint,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+this.apiKey},body:JSON.stringify({model:this.model,store:false,input:[{role:'system',content:[{type:'input_text',text:system}]},{role:'user',content:[{type:'input_text',text:user}]}],max_output_tokens:maxTokens,reasoning:{effort:'minimal'},text:{format:{type:'json_object'}}}),signal:controller.signal});}catch{throw Error('Meta request unavailable or timed out');}
      if(res?.status===429&&attempt<this.maxRetries)return {retry:true};
      if(!res||res.ok!==true)throw Error('Meta API request failed (status '+(Number.isInteger(res?.status)?res.status:'?')+')');
      try{return {body:await res.json()};}catch{throw Error('Meta response JSON invalid');}})(),new Promise((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Meta request unavailable or timed out'));},this.timeoutMs);})]);
    }finally{clearTimeout(timer);}
    if(!raw.retry)break;
   }
   const body=raw.body;if(JSON.stringify(body).length>256000)throw Error('Meta response size limit exceeded');
   record.responseStatus=['completed','incomplete','failed','cancelled'].includes(body.status)?body.status:null;
   record.responseId=typeof body.id==='string'&&/^[\w-]{1,160}$/.test(body.id)?body.id:null;
   if(body.usage){const usage={};for(const k of ['input_tokens','output_tokens','total_tokens'])if(Number.isSafeInteger(body.usage[k])&&body.usage[k]>=0)usage[k]=body.usage[k];const reasoning=body.usage.output_tokens_details?.reasoning_tokens;if(Number.isSafeInteger(reasoning)&&reasoning>=0)usage.reasoning_tokens=reasoning;record.usage=usage;}
   const value=responsePayload(body);record.parseSuccess=true;
   let validated=value;if(options.validate){try{validated=options.validate(value);record.schemaValidationSuccess=true;}catch{record.schemaValidationSuccess=false;throw Error('Meta schema validation failed');}}
   record.success=true;record.latencyMs=Date.now()-start;this._metric(record);
   if(options.cache!==false){if(this.cache.size>=50)this.cache.delete(this.cache.keys().next().value);this.cache.set(key,{value:structuredClone(validated),expires:Date.now()+this.cacheTtlMs,provenance:record});}
   return validated;
  }catch(e){record.latencyMs=Date.now()-start;record.failure=e.message.startsWith('Meta ')?e.message:'Meta response invalid';this._metric(record);throw Error(record.failure);}
 }
 async extractProfile({system,user}){return this._post('profile-extract',{system,user});}
 async classify(summary){return this._post('classify-transaction',{system:'Return a candidate JSON classification only.',user:JSON.stringify(summary)});}
 async explain(summary){return this._post('explain-finance',{user:JSON.stringify(summary)});}
}
class FakeAIProvider extends AIProvider{
 constructor(handler){super();if(typeof handler!=='function')throw Error('FakeAIProvider needs a handler');this._handler=handler;}
 get name(){return 'fake';}
 async classify(s){return this._handler(s,'classify-transaction');}
 async explain(s){return this._handler(s,'explain-finance');}
}
module.exports={AIProvider,MetaModelAdapter,FakeAIProvider,responsePayload};
