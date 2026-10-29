'use strict';
// A shared, durable eight-request ceiling across the initial and restarted server.
// Private diagnostic envelopes are retained only under ignored data/, never printed.
const fs=require('node:fs'),path=require('node:path');
const {MetaModelAdapter}=require('../../src/ai/aiAdapter'),{createMuseRuntime}=require('../../src/ai/museRuntime');
function liveRuntime(budgetPath){
 const root=path.resolve(__dirname,'../..');require('../../src/web/environment').loadEnvironment(path.join(root,'.env'));
 const key=process.env.BIGM_META_API_KEY;if(!key||key.length<12)throw Error('Meta configuration unavailable');
 const variants=[key,Buffer.from(key).toString('base64'),encodeURIComponent(key)],read=()=>JSON.parse(fs.readFileSync(budgetPath,'utf8'));
 const save=value=>{const text=JSON.stringify(value,null,2)+'\n';if(variants.some(v=>text.includes(v)))throw Error('Credential-shaped diagnostic rejected');fs.writeFileSync(budgetPath,text);};
 const adapter=new MetaModelAdapter({allowLive:true,maxRequests:8,maxRetries:0,timeoutMs:60000}),transport=adapter._fetch;
 adapter._fetch=async(url,request)=>{const budget=read();if(budget.requests>=8)throw Error('Live request ceiling exhausted');budget.requests++;const index=budget.requests;save(budget);
  const response=await transport(url,request);return {ok:response.ok,status:response.status,json:async()=>{const body=await response.json(),text=JSON.stringify(body);if(variants.some(v=>text.includes(v)))throw Error('Credential-shaped live response rejected');fs.writeFileSync(path.join(path.dirname(budgetPath),'response-'+index+'.json'),text);return body;}};
 };
 adapter.onMetric=metric=>{const budget=read();budget.metrics.push({purpose:metric.purpose,success:metric.success,cacheHit:metric.cacheHit,schemaValidationSuccess:metric.schemaValidationSuccess,latencyMs:metric.latencyMs,usage:metric.usage??null,failure:metric.failure??null});save(budget);};
 return createMuseRuntime({adapter,traceEnabled:true});
}
module.exports={liveRuntime};
