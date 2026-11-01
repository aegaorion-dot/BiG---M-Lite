'use strict';
require('../src/web/environment').loadEnvironment(require('node:path').resolve('.env'));
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createMuseRuntime}=require('../src/ai/museRuntime');
async function main(){
 const envelope=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'bigm-nikos-rule-revision.json.envelope.json'),'utf8')).body;
 const text=envelope.output.filter(o=>o.type==='message').flatMap(o=>o.content??[]).map(o=>o.text??'').join(''),candidate=JSON.parse(text),rule=candidate.pack.rules[0];
 const runtime=createMuseRuntime({maxRequests:1,maxRetries:0,timeoutMs:90000});if(!runtime.enabled)throw Error('Meta Muse is not configured');
 const schema={name:'jp_rule_applicability_fix',schema:{type:'object',properties:{applicabilityPredicate:{type:'string'}},required:['applicabilityPredicate'],additionalProperties:false}};
 const system='You are Meta Muse correcting applicability AST for the existing BiG-M DSL. The declared rule input is only ANNUAL_NET_BUSINESS_INCOME. TAX_BASE is unavailable in applicabilityPredicate. Return only a JSON-serialized valid DSL AST string. Predicate must check: input > DEDUCTION_INCOME_LOW; input <= DEDUCTION_INCOME_HIGH; (input - BASIC_DEDUCTION) >= BRACKET_LOW; and (input - BASIC_DEDUCTION) <= BRACKET_HIGH. Use AND of these four comparisons, exact DSL shapes {op:INPUT,name:...}, {op:PARAMETER,code:...}, {op:SUBTRACT,args:[...]}, {op:GT|GTE|LTE,args:[...]}, {op:AND,args:[...]}. Do not change amounts, parameters, rule scope, or tax formula.';
 const user=JSON.stringify({candidateRuleId:rule.ruleId,parameters:rule.parameters,existingPredicate:rule.applicabilityPredicate,sourceEvidence:{authority:candidate.issuingAuthority,proposition:candidate.propositionSupported,sourceUrls:['https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm','https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm']}});
 const proposal=await runtime.adapter._post('regulatory-rule-applicability-correction',{system,user},{maxOutputTokens:1024,cache:false,responseSchema:schema}),ast=JSON.parse(proposal.applicabilityPredicate);
 const {validateAst}=require('../src/tax/dsl');validateAst(ast,{inputs:{ANNUAL_NET_BUSINESS_INCOME:'NUMBER'},parameters:Object.fromEntries(Object.entries(rule.parameters).map(([k,v])=>[k,v.valueType])),expected:'BOOLEAN'});
 rule.applicabilityPredicate=ast;const out=path.join(os.tmpdir(),'bigm-nikos-rule-final-candidate.json');fs.writeFileSync(out,JSON.stringify({candidate,provider:runtime.adapter.model,metric:runtime.adapter.metrics().at(-1),output:out},null,2),'utf8');
 console.log(JSON.stringify({provider:runtime.adapter.model,httpStatus:runtime.adapter.metrics().at(-1)?.httpStatus,success:true,applicabilityPredicate:ast,output:out}));
}
main().catch(e=>{console.error(JSON.stringify({error:e.message,name:e.name}));process.exitCode=1;});
