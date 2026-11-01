'use strict';
const {assertJsonData,validateAst,NAME,numberValue}=require('./dsl');
const {parseEffectiveDate}=require('../fabric/normalizer');
const {isKnownJurisdiction}=require('../global/jurisdictions');
const {isKnownCurrency}=require('../global/currencies');
const {decimalsFor}=require('../domain/money');
const TYPES=Object.freeze(['INCOME_TAX','CIT','SIMPLIFIED_INCOME','VAT','GST','SALES_TAX','WHT','FOREIGN_TAX_CREDIT']);
const TREATY_TAX_TYPES=Object.freeze(['INCOME_TAX','CIT','SIMPLIFIED_INCOME','WHT','FOREIGN_TAX_CREDIT']);
const FACT_TYPES=Object.freeze(['MONEY','NUMBER','BOOLEAN','STRING','COUNTRY']);
const BASIS=Object.freeze(['TAX_RESIDENCE','REGISTRATION','SOURCE','WITHHOLDING']);
const RESERVED=Object.freeze(['TAX_BASE','DOMESTIC_TAX']);
function validateCalculationRequest(r){
 assertJsonData(r);requireFields(r,['scopeId','subjectId','requestKey','taxType','jurisdictionCode','jurisdictionBasis','incomeOrEventType','currency','period','economicDate']);
 for(const field of ['scopeId','subjectId','requestKey','taxType','jurisdictionBasis','incomeOrEventType'])if(typeof r[field]!=='string'||!r[field].trim()||r[field].length>160)throw Error('Invalid calculation request field: '+field);
 requireFields(r.period,['periodStart','periodEnd']);if(!parseEffectiveDate(r.period.periodStart)||!parseEffectiveDate(r.period.periodEnd)||r.period.periodStart>r.period.periodEnd||!parseEffectiveDate(r.economicDate)||r.economicDate<r.period.periodStart||r.economicDate>r.period.periodEnd)throw Error('Valid effective period and economic date required');
 if(!/^[A-Z]{2}$/.test(r.jurisdictionCode)||!isKnownCurrency(r.currency))throw Error('Explicit jurisdiction code and supported currency required');return r;
}
function requireFields(object,required,allowed=required){if(!object||typeof object!=='object'||Array.isArray(object)||required.some(k=>!Object.hasOwn(object,k))||Object.keys(object).some(k=>!allowed.includes(k)))throw Error('Invalid contract fields: '+required.join(','));}
function windowValid(p,{draft=false,allowUndatedDemo=false}={}){if((draft||allowUndatedDemo)&&p.effectiveFrom===null&&p.effectiveTo===null)return; if(!parseEffectiveDate(p.effectiveFrom)||!parseEffectiveDate(p.effectiveTo)||p.effectiveFrom>p.effectiveTo)throw Error('Explicit valid effective window required');}
function roundingValid(rounding,currency){requireFields(rounding,['mode','precision']);if(!['DOWN','UP','HALF_UP'].includes(rounding.mode)||!Number.isInteger(rounding.precision)||rounding.precision<0||rounding.precision>decimalsFor(currency))throw Error('Governed final monetary rounding required');}
function factTypes(requiredFacts){
 if(!requiredFacts||Array.isArray(requiredFacts)||typeof requiredFacts!=='object')throw Error('Required fact schema required');
 const result={};for(const [k,t]of Object.entries(requiredFacts)){if(!NAME.test(k)||RESERVED.includes(k)||!FACT_TYPES.includes(t))throw Error('Invalid fact declaration');result[k]=['MONEY','NUMBER'].includes(t)?'NUMBER':t==='BOOLEAN'?'BOOLEAN':'STRING';}return result;
}
function parameterTypes(parameters){const result={};for(const [k,p]of Object.entries(parameters??{})){if(!NAME.test(k))throw Error('Invalid parameter name');requireFields(p,['valueType','value']);if(p.valueType==='NUMBER')numberValue(p.value);else if(p.valueType==='BOOLEAN'?typeof p.value!=='boolean':p.valueType==='STRING'?typeof p.value!=='string':true)throw Error('Invalid typed parameter');result[k]=p.valueType;}return result;}
function evidenceValid(p){if(!Array.isArray(p.evidenceRefs)||p.evidenceRefs.some(e=>!e.evidenceId||!e.sourceUrl||!e.locator||!/^[a-f0-9]{64}$/.test(e.rawContentHash??'')))throw Error('Hash-bound source evidence required');}
function testContentValid(p){if(!p.testOnly&&p.evidenceRefs.some(e=>e.sourceKind==='TEST_ONLY'||e.sourceUrl.startsWith('test-only:')))throw Error('TEST ONLY evidence cannot be production content');}
function validateRule(r,pack,{allowUndatedDemo=false}={}){
 requireFields(r,['ruleId','taxType','subjectTypes','incomeOrEventType','requiredFacts','applicabilityPredicate','taxBaseFormula','rateDefinition','amountFormula','parameters','finalRounding','effectiveFrom','effectiveTo','evidenceRefs','treatyRelevant'],['ruleId','taxType','subjectTypes','incomeOrEventType','requiredFacts','applicabilityPredicate','taxBaseFormula','rateDefinition','amountFormula','parameters','finalRounding','effectiveFrom','effectiveTo','evidenceRefs','treatyRelevant','supersedes','supersededBy','thresholds','exemptions','reliefs','requiredTrueFacts']);
 if(!NAME.test(r.ruleId)||!TYPES.includes(r.taxType)||!Array.isArray(r.subjectTypes)||!r.subjectTypes.length||r.subjectTypes.some(t=>!['INDIVIDUAL','COMPANY','PARTNERSHIP'].includes(t))||typeof r.incomeOrEventType!=='string'||!r.incomeOrEventType||typeof r.treatyRelevant!=='boolean')throw Error('Invalid rule scope');
 windowValid(r,{allowUndatedDemo});if(!(allowUndatedDemo&&r.effectiveFrom===null&&r.effectiveTo===null&&pack.effectiveFrom===null&&pack.effectiveTo===null)&&(r.effectiveFrom<pack.effectiveFrom||r.effectiveTo>pack.effectiveTo))throw Error('Rule outside pack window');roundingValid(r.finalRounding,pack.currency);evidenceValid(r);
 if(!r.evidenceRefs.length||r.evidenceRefs.some(e=>!pack.evidenceRefs.some(p=>p.evidenceId===e.evidenceId)))throw Error('Rule evidence outside pack');
 const inputs=factTypes(r.requiredFacts),parameters=parameterTypes(r.parameters);
 if(r.requiredTrueFacts&&(!Array.isArray(r.requiredTrueFacts)||r.requiredTrueFacts.some(k=>r.requiredFacts[k]!=='BOOLEAN')))throw Error('Required confirmation facts must be declared booleans');
 validateAst(r.applicabilityPredicate,{inputs,parameters,expected:'BOOLEAN'});validateAst(r.taxBaseFormula,{inputs,parameters,expected:'NUMBER'});
 validateAst(r.amountFormula,{inputs:{...inputs,TAX_BASE:'NUMBER'},parameters,expected:'NUMBER'});
 if(r.rateDefinition?.kind==='EXPRESSION'){requireFields(r.rateDefinition,['kind','expression']);validateAst(r.rateDefinition.expression,{inputs:{...inputs,TAX_BASE:'NUMBER'},parameters,expected:'NUMBER'});}else if(r.rateDefinition?.kind!=='FORMULA_DERIVED'||Object.keys(r.rateDefinition).length!==1)throw Error('Explicit rate definition required');
}
function validateCountryPack(p,{allowUndatedDemo=false}={}){
 assertJsonData(p);requireFields(p,['packId','version','jurisdictionCode','currency','effectiveFrom','effectiveTo','evidenceRefs','rules','testOnly'],['packId','version','jurisdictionCode','currency','effectiveFrom','effectiveTo','evidenceRefs','rules','testOnly','supersedes','supersededBy','originalSource','label']);
 if(!NAME.test(p.packId)||!Number.isInteger(p.version)||p.version<1||!isKnownJurisdiction(p.jurisdictionCode)||!isKnownCurrency(p.currency)||typeof p.testOnly!=='boolean')throw Error('Invalid pack identity');windowValid(p,{allowUndatedDemo});evidenceValid(p);testContentValid(p);
 if(!Array.isArray(p.rules)||!p.rules.length||p.rules.length>64||new Set(p.rules.map(r=>r.ruleId)).size!==p.rules.length)throw Error('Unique bounded rules required');for(const r of p.rules)validateRule(r,p,{allowUndatedDemo});return p;
}
function validateTreatyPack(p,{allowUndatedDemo=false}={}){
 assertJsonData(p);requireFields(p,['treatyPackId','treatyCode','jurisdictionA','jurisdictionB','version','effectiveFrom','effectiveTo','coveredTaxes','residenceRules','sourceRules','incomeArticles','permanentEstablishmentRules','withholdingLimits','reliefMethods','requiredFacts','evidenceRefs','testOnly','coverageStatus'],['treatyPackId','treatyCode','jurisdictionA','jurisdictionB','version','effectiveFrom','effectiveTo','coveredTaxes','residenceRules','sourceRules','incomeArticles','permanentEstablishmentRules','withholdingLimits','reliefMethods','requiredFacts','evidenceRefs','testOnly','coverageStatus','supersedes','supersededBy','researchProvenance','label']);
 if(!NAME.test(p.treatyPackId)||!Number.isInteger(p.version)||p.version<1||!isKnownJurisdiction(p.jurisdictionA)||!isKnownJurisdiction(p.jurisdictionB)||p.jurisdictionA===p.jurisdictionB||!['REVIEW_REQUIRED','COMPLETE_SUBSET'].includes(p.coverageStatus)||typeof p.testOnly!=='boolean')throw Error('Invalid treaty identity');
 windowValid(p,{draft:p.coverageStatus==='REVIEW_REQUIRED',allowUndatedDemo});evidenceValid(p);testContentValid(p);factTypes(p.requiredFacts);
 if(!Array.isArray(p.coveredTaxes)||!p.coveredTaxes.length||p.coveredTaxes.some(t=>!TYPES.includes(t))||!Array.isArray(p.incomeArticles))throw Error('Treaty scope required');
 for(const a of p.incomeArticles){requireFields(a,['articleId','incomeOrEventType','requiredFacts','eligibilityPredicate','parameters','effects','evidenceRefs']);const eligibilityInputs={...factTypes(p.requiredFacts),...factTypes(a.requiredFacts)},inputs={...eligibilityInputs,TAX_BASE:'NUMBER',DOMESTIC_TAX:'NUMBER'},parameters=parameterTypes(a.parameters);validateAst(a.eligibilityPredicate,{inputs:eligibilityInputs,parameters,expected:'BOOLEAN'});evidenceValid(a);if(!a.evidenceRefs.length||a.evidenceRefs.some(e=>!p.evidenceRefs.some(p=>p.evidenceId===e.evidenceId)))throw Error('Treaty article evidence missing');
  if(!Array.isArray(a.effects)||!a.effects.length)throw Error('Treaty effects required');for(const effect of a.effects){requireFields(effect,['kind','amountFormula','finalRounding','currency']);if(!['WITHHOLDING_LIMIT','ALLOCATION','EXEMPTION','CREDIT'].includes(effect.kind)||!isKnownCurrency(effect.currency))throw Error('Unsupported treaty effect');roundingValid(effect.finalRounding,effect.currency);validateAst(effect.amountFormula,{inputs,parameters,expected:'NUMBER'});}
 }
 if(p.coverageStatus==='COMPLETE_SUBSET'&&(!p.evidenceRefs.length||!p.incomeArticles.length))throw Error('Complete treaty subset requires evidence and articles');return p;
}
module.exports={TYPES,TREATY_TAX_TYPES,FACT_TYPES,BASIS,RESERVED,requireFields,windowValid,roundingValid,factTypes,parameterTypes,validateCountryPack,validateTreatyPack,validateCalculationRequest};
