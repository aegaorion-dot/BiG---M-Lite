'use strict';
// Muse semantic interpretation for already observed sales/receipt records and
// Samira's clarification. Amounts and transaction records remain source-owned.
const path=require('node:path'),fs=require('node:fs');
require('../src/web/environment').loadEnvironment(path.resolve('.env'));
const {createMuseRuntime}=require('../src/ai/museRuntime');
let raw=process.env.SAMIRA_RECONCILE_INPUT??'';
if(!raw&&process.env.SAMIRA_RECONCILE_INPUT_PATH)raw=fs.readFileSync(process.env.SAMIRA_RECONCILE_INPUT_PATH,'utf8');
process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>raw+=chunk);
const run=async()=>{try{
 const input=JSON.parse(raw);if(!Array.isArray(input.sales)||!Array.isArray(input.expenses)||typeof input.clarification!=='string')throw Error('Observed transactions and original clarification required');
 const ids=new Set([...input.sales,...input.expenses].map(x=>x.candidateId));const quoteIsFromInput=(quote)=>input.clarification.includes(quote)||[...input.sales,...input.expenses].some(t=>Object.values(t.evidence??{}).some(e=>e?.quote===quote));
 const runtime=createMuseRuntime(),startedAt=new Date().toISOString(),start=Date.now();
 const response=await runtime.adapter._post('document-understanding',{
  system:`You are BiG-M, interpreting already extracted transaction observations alongside the user's exact clarification. This is semantic interpretation only, not legal/tax advice. Return JSON {sales:[{candidateId,taxActivity:"GOODS_SALE"|"CATERING_SERVICE"|"UNRESOLVED",evidenceQuote}],expenses:[{candidateId,expenseType:"INGREDIENTS"|"PACKAGING"|"FUEL"|"EQUIPMENT"|"UTILITIES"|"PHONE"|"MEAL"|"OTHER"|"UNRESOLVED",use:"BUSINESS"|"PERSONAL"|"MIXED"|"UNKNOWN",businessUsePercent:string|null,evidenceQuote}]}. Classify solely from source descriptions and the user clarification. Do not infer percentages or allocate any mixed cost unless the user explicitly states a percentage. Evidence quote must be an exact substring of either the original user's clarification or an input field evidence quote for that candidate. Use supplied candidate IDs only and return each input candidate once. Do not repeat amounts or change transactions.`,
  user:JSON.stringify({task:'Classify sales as tangible pastry goods or catering services, and semantically reconcile each receipt expense with the user clarification. Preserve mixed/unknown use without allocating a percentage.',originalUserClarification:input.clarification,sales:input.sales,expenses:input.expenses})
 },{maxOutputTokens:2200,validate(value){for(const k of ['sales','expenses'])if(!Array.isArray(value[k]))throw Error('Missing '+k);const expected=k=>new Set(input[k].map(x=>x.candidateId));for(const group of ['sales','expenses']){const seen=new Set();for(const item of value[group]){if(!expected(group).has(item.candidateId)||seen.has(item.candidateId)||!quoteIsFromInput(item.evidenceQuote))throw Error('Semantic reconciliation provenance failed');seen.add(item.candidateId);}if(seen.size!==expected(group).size)throw Error('Muse omitted observed '+group);}return value;}});
 const result={startedAt,elapsedMs:Date.now()-start,provider:'meta',model:runtime.adapter.model,sales:response.sales,expenses:response.expenses,metrics:runtime.adapter.metrics().slice(-1)};if(process.env.SAMIRA_RECONCILE_OUTPUT_PATH)fs.writeFileSync(process.env.SAMIRA_RECONCILE_OUTPUT_PATH,JSON.stringify(result,null,2),'utf8');process.stdout.write(JSON.stringify(result,null,2)+'\n');
}catch(error){process.stderr.write(JSON.stringify({error:{name:error.name,message:error.message}})+'\n');process.exitCode=1;}};
if(raw)run();else process.stdin.on('end',run);
