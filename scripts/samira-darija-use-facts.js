'use strict';
// Extract explicit use/percentage assertions from Samira's Darija clarification
// and bind them to existing Muse-observed expense candidates without making a
// tax or accounting decision.
const path=require('node:path'),fs=require('node:fs');
require('../src/web/environment').loadEnvironment(path.resolve('.env'));
const {createMuseRuntime}=require('../src/ai/museRuntime');
const input=JSON.parse(process.env.SAMIRA_USE_FACT_INPUT_PATH?fs.readFileSync(process.env.SAMIRA_USE_FACT_INPUT_PATH,'utf8'):(process.env.SAMIRA_USE_FACT_INPUT??'{}'));
if(typeof input.message!=='string'||!Array.isArray(input.expenses))throw Error('Original message and observed expenses required');
const ids=new Set(input.expenses.map(x=>x.candidateId)),runtime=createMuseRuntime();
(async()=>{const startedAt=new Date().toISOString(),start=Date.now();
 const output=await runtime.adapter._post('document-understanding',{system:'Interpret the user\'s original Moroccan Arabic/Darija clarification. Return JSON {statements:[{candidateId,use:"BUSINESS"|"PERSONAL"|"MIXED"|"UNKNOWN",businessUsePercent:string|null,evidenceQuote:string}]}. Bind a statement to an observed expense only when the description and original user statement clearly refer to the same item. Quotes must be exact contiguous text from the original user message. A percentage must be null unless explicitly stated. Omit items the user did not discuss. Do not provide legal or tax treatment. Preserve uncertainty.',user:JSON.stringify({task:'Extract only the user-stated business/personal use and any explicitly quantified allocation from this message. Link those statements to matching already observed receipt candidates.',originalUserMessage:input.message,observedExpenses:input.expenses})},{maxOutputTokens:1400,validate(value){if(!Array.isArray(value?.statements))throw Error('Statement list required');for(const f of value.statements){if(!ids.has(f.candidateId)||!input.message.includes(f.evidenceQuote)||!['BUSINESS','PERSONAL','MIXED','UNKNOWN'].includes(f.use))throw Error('Darija statement evidence failed');if(f.businessUsePercent!==null&&typeof f.businessUsePercent!=='string')throw Error('Percent must be explicit string or null');}return value;}});
 const result={startedAt,elapsedMs:Date.now()-start,provider:'meta',model:runtime.adapter.model,statements:output.statements,metrics:runtime.adapter.metrics().slice(-1)};if(process.env.SAMIRA_USE_FACT_OUTPUT)fs.writeFileSync(process.env.SAMIRA_USE_FACT_OUTPUT,JSON.stringify(result,null,2),'utf8');process.stdout.write(JSON.stringify(result,null,2)+'\n');
})().catch(e=>{process.stderr.write(JSON.stringify({error:{name:e.name,message:e.message,providerFailure:runtime.adapter.metrics().at(-1)??null}})+'\n');process.exitCode=1;});
