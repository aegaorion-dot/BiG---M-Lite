'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {MetaModelAdapter}=require('../src/ai/aiAdapter');
const {createMuseRuntime}=require('../src/ai/museRuntime');

test('receipt OCR remains raw and its spatial regions are passed to Meta Muse for interpretation',async()=>{
 let sent;const envelope={id:'resp-demo',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({transactions:[],profileFacts:[]})}]}]};
 const adapter=new MetaModelAdapter({endpoint:'https://api.meta.ai/v1/responses',apiKey:'test-key',model:'muse-spark-demo',fetchImpl:async(_url,init)=>{sent=JSON.parse(init.body);return new Response(JSON.stringify(envelope),{status:200,headers:{'content-type':'application/json'}});}});
 const runtime=createMuseRuntime({adapter});const events=[];runtime.attach({record:e=>events.push(e)});
 const extraction={pages:[{page:1,method:'OCR',width:2200,height:3200,coordinateSystem:'IMAGE_PIXELS'}],textBlocks:[{blockId:'b0',page:1,text:'uninterpreted OCR text',bbox:[12,34,200,20]}],tables:[]};
 await runtime.semanticProvider.interpret({extraction,sourceChannel:'DOCUMENT',receivedAt:'2026-10-31T00:00:00.000Z'});
 const user=JSON.parse(sent.input.at(-1).content[0].text);
 assert.equal(sent.model,'muse-spark-demo');assert.equal(sent.max_output_tokens,8192);assert.equal(user.untrustedData[0].text,'uninterpreted OCR text');assert.deepEqual(user.pageRegions,extraction.pages);assert.match(sent.input[0].content[0].text,/raw observations only/);assert.match(sent.input[0].content[0].text,/group text into distinct document\/receipt regions/);assert.equal(events.at(-1).candidateCount,0);
});
