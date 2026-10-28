'use strict';
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
 constructor({endpoint=null,apiKey=null,model=null,fetchImpl=null,timeoutMs=20000,allowLive=false}={}){
  super();this.endpoint=endpoint??process.env.BIGM_META_API_URL??null;this.apiKey=apiKey??process.env.BIGM_META_API_KEY??null;
  this.model=model??process.env.BIGM_META_MODEL??null;this._fetch=fetchImpl??globalThis.fetch;this.injectedFetch=Boolean(fetchImpl);this.timeoutMs=timeoutMs;this.allowLive=allowLive;
 }
 get name(){return 'meta-model-api';}
 _requireConfig(){
  if(!this.endpoint)throw Error('Meta endpoint not configured');
  if(!this.apiKey)throw Error('Meta API key not configured');
  if(!this.model)throw Error('Meta model not configured');
  if((process.env.NODE_TEST_CONTEXT||process.env.NODE_ENV==='test')&&!this.injectedFetch&&!this.allowLive)throw Error('live AI disabled during routine tests');
  if(typeof this._fetch!=='function')throw Error('fetch implementation unavailable');
 }
 async _post(task,input){
  this._requireConfig();
  const timeout=AbortSignal.timeout(this.timeoutMs);
  let res;
  try{
   res=await this._fetch(this.endpoint,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+this.apiKey},
    body:JSON.stringify({model:this.model,store:false,input:[{role:'system',content:[{type:'input_text',text:input.system??'Return JSON only.'}]},{role:'user',content:[{type:'input_text',text:input.user??JSON.stringify(input)}]}],max_output_tokens:2048}),signal:timeout});
  }catch{throw Error('Meta request unavailable or timed out');}
  if(!res||res.ok!==true)throw Error('Meta API request failed (status '+(res?.status??'?')+')');
  return responsePayload(await res.json());
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
