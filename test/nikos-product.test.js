'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {handleApi}=require('../src/web/api');
const {ruleCoverage}=require('../src/web/nikosCalculation');

test('Nikos product API exposes the actual calculation and progress consumed by its served page',async()=>{
 let invoked=0;const store={ctx:{org:null},checkAuth(){},serializeMutation:work=>work(),runNikosDemoCalculation:async()=>{invoked++;return {status:'CALCULATED',engine:'UniversalTaxEngine'};},nikosDemoResult:()=>({status:'CALCULATED'}),nikosDemoProgress:()=>({status:'RUNNING',events:[{step:'REGULATORY_RESEARCH',status:'STARTED'}]})};
 const started=await handleApi(store,'POST','/api/nikos/calculate',{},{});assert.equal(started.status,201);assert.equal(JSON.parse(started.body).result.engine,'UniversalTaxEngine');assert.equal(invoked,1);
 const progress=await handleApi(store,'GET','/api/nikos/progress');assert.equal(JSON.parse(progress.body).events[0].step,'REGULATORY_RESEARCH');
 const result=await handleApi(store,'GET','/api/nikos/result');assert.equal(JSON.parse(result.body).result.status,'CALCULATED');
});

test('Nikos regulatory candidate gate accepts a scoped, evidence-backed tax rule and rejects unguarded applicability',()=>{
 const values={BASIC_DEDUCTION_SELECTED:'580000',BASIC_DEDUCTION_INCOME_LOWER:'6550000',BASIC_DEDUCTION_INCOME_UPPER:'23500000',BRACKET_RATE_SELECTED:'0.40',BRACKET_TAXABLE_LOWER:'18000000',BRACKET_TAXABLE_UPPER:'39999000',BRACKET_QUICK_DEDUCTION_SELECTED:'2796000',RECONSTRUCTION_SURTAX_RATE:'0.021',TAXABLE_INCOME_ROUNDING_UNIT:'1000'};
 const params=Object.entries(values).map(([name,value])=>({name,value,evidenceIndex:0})),param=name=>({op:'PARAMETER',code:name}),input=name=>({op:'INPUT',name});
 const lower=(inputName,code)=>({op:'GT',args:[input(inputName),param(code)]}),upper=(inputName,code)=>({op:'LTE',args:[input(inputName),param(code)]});
 const rounded={op:'MULTIPLY',args:[{op:'ROUND',args:[{op:'DIVIDE',args:[input('TAX_BASE'),param('TAXABLE_INCOME_ROUNDING_UNIT')]}],rule:{mode:'DOWN',precision:0}},param('TAXABLE_INCOME_ROUNDING_UNIT')]};
 const candidate={candidateRule:{parameters:params},sourceEvidence:[{quote:(()=>{const yen=String.fromCharCode(0x5186),man=String.fromCharCode(0x4e07),pct=String.fromCharCode(0xff05),pctWords=String.fromCharCode(0x30d1,0x30fc,0x30bb,0x30f3,0x30c8);return ['58'+man+yen,'655'+man+yen,'2,350'+man+yen,'18,000,000'+yen,'39,999,000'+yen,'40'+pct,'2,796,000'+yen,'2.1'+pctWords,'1,000'+yen].join(' ')})()}],pack:{rules:[{parameters:Object.fromEntries(Object.entries(values).map(([name,value])=>[name,{valueType:'NUMBER',value}])),applicabilityPredicate:{op:'AND',args:[lower('ANNUAL_NET_BUSINESS_INCOME','BASIC_DEDUCTION_INCOME_LOWER'),upper('ANNUAL_NET_BUSINESS_INCOME','BASIC_DEDUCTION_INCOME_UPPER'),{op:'GT',args:[{op:'SUBTRACT',args:[input('ANNUAL_NET_BUSINESS_INCOME'),param('BASIC_DEDUCTION_SELECTED')]},param('BRACKET_TAXABLE_LOWER')]},{op:'LTE',args:[{op:'SUBTRACT',args:[input('ANNUAL_NET_BUSINESS_INCOME'),param('BASIC_DEDUCTION_SELECTED')]},param('BRACKET_TAXABLE_UPPER')]}]},taxBaseFormula:{op:'SUBTRACT',args:[input('ANNUAL_NET_BUSINESS_INCOME'),param('BASIC_DEDUCTION_SELECTED')]},rateDefinition:{kind:'EXPRESSION',expression:param('BRACKET_RATE_SELECTED')},amountFormula:{op:'MULTIPLY',args:[{op:'SUBTRACT',args:[{op:'MULTIPLY',args:[rounded,param('BRACKET_RATE_SELECTED')]},param('BRACKET_QUICK_DEDUCTION_SELECTED')]},{op:'ADD',args:[{op:'LITERAL',valueType:'NUMBER',value:'1'},param('RECONSTRUCTION_SURTAX_RATE')]}]}}]}};
 assert.equal(ruleCoverage(candidate),null);
 const flat=structuredClone(candidate);flat.pack.rules[0].applicabilityPredicate={op:'LITERAL',value:true,valueType:'BOOLEAN'};assert.match(ruleCoverage(flat),/Reference every selected evidence-backed parameter|Guard the rule/);
 const unbound=structuredClone(candidate);unbound.candidateRule.parameters.pop();assert.match(ruleCoverage(unbound),/scoped parameters/);
});
