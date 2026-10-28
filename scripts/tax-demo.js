'use strict';
// Offline architecture demonstrations; all invented arithmetic is prominently TEST ONLY.
const fs=require('node:fs'),path=require('node:path');
const {createTaxSystem,UniversalTaxEngine,TaxContentRegistry,candidateTaxFacts,confirmTaxFacts}=require('../src/tax');
const {originalCompanyCandidate,referenceCandidate}=require('../src/tax/referenceCandidates');
const {fingerprint}=require('../src/onboarding/canonical');
const root=path.resolve(__dirname,'../research/phase3-tax');
function request(key,{year='2025',country='ID',currency='IDR',taxType='INCOME_TAX',event='BUSINESS_INCOME'}={}){return {scopeId:'demo-only',subjectId:'fictional-subject',requestKey:key,taxType,jurisdictionCode:country,jurisdictionBasis:'TAX_RESIDENCE',incomeOrEventType:event,currency,period:{periodStart:year+'-01-01',periodEnd:year+'-12-31'},economicDate:year+'-06-01'};}
function confirmedFacts(req,{subject='INDIVIDUAL',source=req.jurisdictionCode,extra=[]}={}){
 const facts=[['SUBJECT_TYPE','STRING',subject],['INCOME_TYPE','STRING',req.incomeOrEventType],['TAX_RESIDENCE','COUNTRY',req.jurisdictionCode],['REGISTRATION','COUNTRY',req.jurisdictionCode],['SOURCE','COUNTRY',source],['NATIONALITY','COUNTRY','AU'],['BUSINESS_WORK_LOCATION','COUNTRY','ID'],['AMOUNT','MONEY',{amountMinor:req.currency==='IDR'?'1000000':'10000',currency:req.currency}],...extra].map(([name,type,value])=>({name,type,value,evidenceReference:'DEMO ONLY stipulated case: '+name}));
 const candidate=candidateTaxFacts({...req,revision:1,facts});return confirmTaxFacts(candidate,{decisionSource:'HUMAN',actor:'Demo human simulation',reviewedSnapshotHash:candidate.snapshotHash});
}
function summary(label,result){return {case:label,testOnly:result.testOnly,status:result.status,reason:result.reason,taxReady:result.taxReady,taxAmount:result.taxAmount,packId:result.packId,packVersion:result.packVersion,treatyResult:result.treatyResult,calculationTraceSteps:result.calculationTrace.length,postingPerformed:result.postingPerformed};}
function main(){
 const production=createTaxSystem(),cases=[];
 const a=request('A');cases.push(summary('A: freelancer with only ported COMPANY rules (real coverage gap)',production.engine.determine(a,confirmedFacts(a))));
 const b=request('B',{year:'2026',taxType:'CIT',event:'ANNUAL_COMPANY_INCOME'});cases.push(summary('B: COMPANY 2026 versus 2025-only rules',production.engine.determine(b,confirmedFacts(b,{subject:'COMPANY'}))));
 const c=request('C');cases.push(summary('C: freelancer with explicit SG source; ID-SG legal subset incomplete',production.engine.determine(c,confirmedFacts(c,{source:'SG'}))));
 const d=request('D',{taxType:'CIT',event:'ANNUAL_COMPANY_INCOME'});cases.push(summary('D: Australian national, business registered/operated in ID; no AU engine selected',production.engine.determine(d,confirmedFacts(d,{subject:'COMPANY'}))));
 const candidate=originalCompanyCandidate(),dto=JSON.parse(JSON.stringify(candidate.executableContent));dto.testOnly=true;dto.label='TEST ONLY approval simulation of Original formulas; not a legally approved pack';
 const testRegistry=new TaxContentRegistry({allowTestPacks:true}),testCandidate=referenceCandidate('COUNTRY_PACK',dto,candidate.provenance);testRegistry.register(testCandidate);testRegistry.governance.review(testCandidate.candidateId,{decisionSource:'HUMAN',actor:'Demo human simulation',decision:'APPROVED',reason:'TEST ONLY isolated demonstration',reviewedHashes:[...new Set(candidate.provenance.map(p=>p.rawContentHash))]});
 const testEngine=new UniversalTaxEngine({registry:testRegistry}),positive=request('TEST_POSITIVE',{taxType:'CIT',event:'ANNUAL_COMPANY_INCOME'}),positiveFacts=confirmedFacts(positive,{subject:'COMPANY',extra:[['M3_TAXABLE_INCOME','MONEY',{amountMinor:'100000123',currency:'IDR'}],['ANNUAL_GROSS_TURNOVER','MONEY',{amountMinor:'6000000000',currency:'IDR'}],['CIT_RATE_TREATMENT','STRING','GENERAL_OR_ARTICLE_31E'],['M3_RECONCILIATION_APPROVED','BOOLEAN',true],['CIT_OBLIGATION_APPLICABLE','BOOLEAN',true]]}),result=testEngine.determine(positive,positiveFacts);
 cases.push(summary('TEST ONLY: Original COMPANY 2025 arithmetic through the neutral engine',result));
 fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,'demo-results.json'),JSON.stringify({noProductionLawApprovalGranted:true,defaultApprovedCountryPacks:production.governance.approved('COUNTRY_PACK').length,cases},null,2)+'\n');
 const sourcePath=path.resolve(__dirname,'../src/countrypack/content/indonesia-cit-determination-2025.json'),sourceBytes=fs.readFileSync(sourcePath),sourceHash=require('../src/fabric/artifacts').hash(sourceBytes),archive=path.join(root,'source-ports');fs.mkdirSync(archive,{recursive:true});fs.writeFileSync(path.join(archive,sourceHash+'.bin'),sourceBytes);
 fs.writeFileSync(path.join(archive,'index.json'),JSON.stringify({sourceKind:'PORTED_REFERENCE_NOT_NEW_LEGAL_CAPTURE',path:'src/countrypack/content/indonesia-cit-determination-2025.json',rawContentHash:sourceHash,rawStorageRef:'source-ports/'+sourceHash+'.bin',originalSource:dto.originalSource},null,2)+'\n');
 fs.writeFileSync(path.join(root,'test-only-determination.json'),JSON.stringify(result,null,2)+'\n');fs.writeFileSync(path.join(root,'test-only-request.json'),JSON.stringify(positive,null,2)+'\n');fs.writeFileSync(path.join(root,'test-only-confirmed-facts.json'),JSON.stringify(positiveFacts,null,2)+'\n');
 console.log(JSON.stringify({noProductionLawApprovalGranted:true,cases},null,2));
 if(result.status!=='CALCULATED'||result.taxAmount.amountMinor!=='13200000'||!testEngine.replay(result).matches||fingerprint(production.governance.snapshot())!==fingerprint(createTaxSystem().governance.snapshot()))throw Error('Offline demo verification failed');
}
if(require.main===module)main();module.exports={main};
