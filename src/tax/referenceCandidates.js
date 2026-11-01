'use strict';
// Bridge existing ported source references into the existing Fabric candidate model.
// This is not raw legal-source acquisition or approval.
const fs=require('node:fs'),path=require('node:path');
const {hash}=require('../fabric/artifacts');
const {fingerprint}=require('../onboarding/canonical');
const {attachExecutableContent}=require('../fabric/candidates');
function referenceCandidate(kind,content,provenance){
 const source={candidateId:fingerprint({kind,provenance}),jurisdictionCode:content.jurisdictionCode??content.jurisdictionA,evidenceIds:content.evidenceRefs.map(e=>e.evidenceId),provenance,envelopeIds:[],status:'CANDIDATE',aiAuthority:'CANDIDATE_ONLY',runtimeExecutable:false,executorSupported:false,reviewHistory:[]};
 return attachExecutableContent(source,kind,content);
}
function adaptExpression(ast){
 if(ast.op==='INPUT')return {op:'INPUT',name:ast.name};if(ast.op==='PARAMETER')return {op:'PARAMETER',code:ast.code};
 if(ast.op==='LITERAL'){const valueType=typeof ast.value==='number'?'NUMBER':typeof ast.value==='boolean'?'BOOLEAN':'STRING';if(valueType==='NUMBER'&&(!Number.isFinite(ast.value)||Number.isInteger(ast.value)&&!Number.isSafeInteger(ast.value)||/[eE]/.test(String(ast.value))))throw Error('Unsupported Original numeric representation');return {op:'LITERAL',valueType,value:valueType==='NUMBER'?String(ast.value):ast.value};}
 return {op:ast.op,args:ast.args.map(adaptExpression),...(ast.rule?{rule:{...ast.rule}}:{})};
}
function originalCompanyCandidate(){
 const relative='src/countrypack/content/indonesia-cit-determination-2025.json',bytes=fs.readFileSync(path.resolve(__dirname,'../../',relative)),p=JSON.parse(bytes),sourceHash=hash(bytes),sourceUrl='local-port:'+relative;
 const evidenceRefs=p.legalSources.map((s,i)=>({evidenceId:'ORIGINAL_CIT_'+i,sourceUrl,rawContentHash:sourceHash,locator:'/legalSources/'+i,legalSourceUrl:s.url,legalLocator:s.section,sourceKind:'PORTED_REFERENCE_NOT_NEW_LEGAL_CAPTURE',originalSource:p.originalSource}));
 const rules=p.rules.filter(r=>r.ruleKind==='CIT_DETERMINATION').map(r=>{
  const requiredFacts=Object.fromEntries([...new Set([...(r.requiredInputs??[]),...(r.requiredFacts??[])])].map(k=>[k,k==='PUBLIC_COMPANY_RATE_ELIGIBLE'?'BOOLEAN':k==='CIT_RATE_TREATMENT'?'STRING':'MONEY']));
  Object.assign(requiredFacts,{M3_RECONCILIATION_APPROVED:'BOOLEAN',CIT_OBLIGATION_APPLICABLE:'BOOLEAN'});
  return {ruleId:r.ruleCode,taxType:r.taxTypeCode,subjectTypes:r.subjectTypes,incomeOrEventType:'ANNUAL_COMPANY_INCOME',requiredFacts,
   applicabilityPredicate:adaptExpression(r.applicability),requiredTrueFacts:['M3_RECONCILIATION_APPROVED','CIT_OBLIGATION_APPLICABLE'],
   taxBaseFormula:adaptExpression(r.taxableIncomeFormula),rateDefinition:{kind:'FORMULA_DERIVED'},amountFormula:adaptExpression(r.formula),
   parameters:Object.fromEntries(Object.entries(r.parameters).map(([k,v])=>{const literal=adaptExpression({op:'LITERAL',value:v});return [k,{valueType:literal.valueType,value:literal.value}];})),finalRounding:r.finalRounding,effectiveFrom:r.effectiveFrom,effectiveTo:r.effectiveTo,evidenceRefs,treatyRelevant:true};
 });
 const content={packId:p.packCode,version:p.version,jurisdictionCode:p.jurisdictionCode,currency:'IDR',effectiveFrom:p.effectiveFrom,effectiveTo:p.effectiveTo,rules,evidenceRefs,testOnly:false,originalSource:p.originalSource,label:'Original COMPANY/CIT 2025 formulas; requires separate Lite human review; not individual income law'};
 return referenceCandidate('COUNTRY_PACK',content,evidenceRefs.map(e=>({...e,originalReferenceVerifiedInOriginal:true})));
}
function idSgResearchCandidate(){
 const researchProvenance={repository:'aegaorion-dot/big-m-',commit:'4d0da9a6acafc24f7db3778f66b4df6d7cf4764c',path:'tests/tax-id-sg-first-real-cross-border.test.mjs',blobSha:'4cef5943b422d011521234df99c2822632710b6e',scope:'Original COMPANY ordinary-interest demonstrator inspected. No treaty legal text or executable article imported.'};
 const snapshotPath='research/phase3-tax/original-id-sg-test.mjs',raw=fs.readFileSync(path.resolve(__dirname,'../../',snapshotPath));
 const evidenceRefs=[{evidenceId:'ORIGINAL_ID_SG_RESEARCH',sourceUrl:'https://github.com/'+researchProvenance.repository+'/blob/'+researchProvenance.commit+'/'+researchProvenance.path,rawContentHash:hash(raw),rawStorageRef:snapshotPath,locator:'RESEARCH_TEST_SOURCE_ONLY',sourceKind:'RESEARCH_CODE_NOT_LEGAL_EVIDENCE'}];
 const content={treatyPackId:'ID_SG_RESEARCH',treatyCode:'ID_SG',jurisdictionA:'ID',jurisdictionB:'SG',version:1,effectiveFrom:null,effectiveTo:null,coveredTaxes:['INCOME_TAX','CIT','WHT'],residenceRules:[],sourceRules:[],incomeArticles:[],permanentEstablishmentRules:[],withholdingLimits:[],reliefMethods:[],requiredFacts:{TAX_RESIDENCE:'COUNTRY',SOURCE:'COUNTRY'},evidenceRefs,testOnly:false,coverageStatus:'REVIEW_REQUIRED',researchProvenance,label:'ID-SG architecture demonstrator: no approved legal coverage, dates, caps or reliefs'};
 return referenceCandidate('TREATY_PACK',content,evidenceRefs);
}
module.exports={referenceCandidate,adaptExpression,originalCompanyCandidate,idSgResearchCandidate};
