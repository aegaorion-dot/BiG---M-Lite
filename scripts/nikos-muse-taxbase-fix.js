'use strict';
require('../src/web/environment').loadEnvironment(require('node:path').resolve('.env'));
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createMuseRuntime}=require('../src/ai/museRuntime');
async function main(){
 const envelope=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'bigm-nikos-rule-revision.json.envelope.json'),'utf8')).body;
 const text=envelope.output.filter(o=>o.type==='message').flatMap(o=>o.content??[]).map(o=>o.text??'').join(''),candidate=JSON.parse(text);
 const current=candidate.pack.rules[0].taxBaseFormula;
 const runtime=createMuseRuntime({maxRequests:1,maxRetries:0,timeoutMs:90000});if(!runtime.enabled)throw Error('Meta Muse is not configured');
 const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
 const ruleShape=object({mode:{const:'DOWN'},precision:{const:0}});
 const nodeShape=depth=>object({op:{enum:['INPUT','PARAMETER','LITERAL','ADD','SUBTRACT','MULTIPLY','DIVIDE','GTE','LTE','GT','LT','AND','ROUND']},name:{type:['string','null']},code:{type:['string','null']},valueType:{type:['string','null'],enum:['NUMBER',null]},value:{type:['string','null']},args:{type:['array','null'],items:depth?nodeShape(depth-1):false},rule:{anyOf:[ruleShape,{type:'null'}]} });
 const schema={name:'tax_base_formula_fix',schema:object({taxBaseFormula:nodeShape(10)})};
 const system='You are Meta Muse correcting one executable formula AST in the existing BiG-M tax DSL. Return JSON only with taxBaseFormula as an AST object (not a string). Exact formula: MULTIPLY(ROUND(DIVIDE(SUBTRACT(INPUT ANNUAL_NET_BUSINESS_INCOME, PARAMETER BASIC_DEDUCTION), LITERAL 1000), rule DOWN precision 0), LITERAL 1000). The ROUND object has keys op,args,rule; args contains exactly one child, and rule is a sibling of args inside ROUND. Follow the strict schema exactly; set unused name/code/value/valueType/args/rule fields to null. Do not alter law or parameters.';
 const user=JSON.stringify({task:'Correct the ROUND-node JSON structure only. Keep the formula semantics and parameter names unchanged.',currentTaxBaseFormula:current,officialEvidence:{authority:'National Tax Agency of Japan',sourceTitle:'NTA Tax Answer No.2260 and 2025 Income Tax Guide',sourceUrl:'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm',proposition:'Taxable income is rounded down in units of 1,000 yen before the schedule is applied.'}});
 const proposal=await runtime.adapter._post('regulatory-rule-taxbase-correction',{system,user},{maxOutputTokens:2048,cache:false,responseSchema:schema});
 const clean=node=>{if(!node||typeof node!=='object')return node;if(Array.isArray(node))return node.map(clean);const out={};for(const [key,value]of Object.entries(node))if(value!==null)out[key]=clean(value);return out;},ast=clean(proposal.taxBaseFormula);
 const {validateAst}=require('../src/tax/dsl');validateAst(ast,{inputs:{ANNUAL_NET_BUSINESS_INCOME:'NUMBER'},parameters:{BASIC_DEDUCTION:'NUMBER'},expected:'NUMBER'});
 candidate.pack.rules[0].taxBaseFormula=ast;const output=path.join(os.tmpdir(),'bigm-nikos-rule-final-candidate.json');fs.writeFileSync(output,JSON.stringify({candidate,provider:runtime.adapter.model,metric:runtime.adapter.metrics().at(-1),output},null,2),'utf8');
 console.log(JSON.stringify({provider:runtime.adapter.model,httpStatus:runtime.adapter.metrics().at(-1)?.httpStatus,success:runtime.adapter.metrics().at(-1)?.success,taxBaseFormula:ast,output}));
}
main().catch(e=>{console.error(JSON.stringify({error:e.message,name:e.name}));process.exitCode=1;});
