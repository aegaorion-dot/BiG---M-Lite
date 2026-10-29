'use strict';
const {FxRateProvider,requestPair,validateRate}=require('./rates');
class FrankfurterProvider extends FxRateProvider{
 constructor({fetchImpl=null,allowLive=false,timeoutMs=12000,maxRequests=64}={}){super();if(!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>1000||!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw Error('Invalid FX bounds');this.name='frankfurter-v2';this.fetch=fetchImpl??globalThis.fetch;this.injected=Boolean(fetchImpl);this.allowLive=allowLive;this.timeoutMs=timeoutMs;this.maxRequests=maxRequests;this.calls=0;}
 async getRate(request){
  requestPair(request);if((process.env.NODE_ENV==='test'||process.env.NODE_TEST_CONTEXT)&&!this.injected&&!this.allowLive)throw Error('Live FX disabled in routine tests');if(this.calls>=this.maxRequests)throw Error('FX request ceiling');this.calls++;
  const url='https://api.frankfurter.dev/v2/rate/'+request.baseCurrency+'/'+request.quoteCurrency+'?date='+request.date,controller=new AbortController();let timer;
  try{return await Promise.race([(async()=>{const response=await this.fetch(url,{signal:controller.signal,redirect:'error',headers:{accept:'application/json'}});if(!response.ok||Number(response.headers?.get('content-length'))>8192||!/^application\/json(?:;|$)/i.test(response.headers?.get('content-type')??''))throw Error('FX unavailable');let text='';if(response.body?.getReader){const reader=response.body.getReader();let count=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>8192){await reader.cancel();throw Error('FX response too large');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}text=Buffer.concat(chunks).toString('utf8');}else{text=await response.text();if(Buffer.byteLength(text)>8192)throw Error('FX response too large');}
   const keys=[...text.matchAll(/"([^"\\]*)"\s*:/g)].map(m=>m[1]);if(keys.length!==4||new Set(keys).size!==4||keys.some(k=>!['base','quote','date','rate'].includes(k)))throw Error('Ambiguous FX response fields');const raw=JSON.parse(text);if(!raw||Array.isArray(raw)||Object.keys(raw).some(k=>!['base','quote','date','rate'].includes(k))||typeof raw.rate!=='number'||!Number.isFinite(raw.rate))throw Error('Invalid FX response');
   // Preserve the provider's decimal lexeme; never calculate using JSON.parse's Number.
   const matches=[...text.matchAll(/"rate"\s*:\s*(\d+(?:\.\d+)?)(?=\s*[,}])/g)];if(matches.length!==1)throw Error('Invalid rate encoding');
   return validateRate({baseCurrency:raw.base,quoteCurrency:raw.quote,rate:matches[0][1],rateDate:raw.date,requestedDate:request.date,provider:this.name,providerReference:url,fetchedAt:new Date().toISOString(),status:'AVAILABLE'},request);
  })(),new Promise((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('FX unavailable or timed out'));},this.timeoutMs);})]);}catch{throw Error('FX_REQUIRED: provider unavailable or invalid historical rate');}finally{clearTimeout(timer);}
 }
}
module.exports={FrankfurterProvider};
