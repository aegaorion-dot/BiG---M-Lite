'use strict';
// Controlled verification only. Real legal data copied into TEST ONLY packs.
// No production approval is ever written by these helpers.
const {TaxContentRegistry,UniversalTaxEngine,candidateTaxFacts,confirmTaxFacts,TaxDeterminationStore}=require('../../src/tax');
const {FabricGovernanceStore}=require('../../src/fabric/governanceStore');
const {referenceCandidate}=require('../../src/tax/referenceCandidates');
const {loadPhase4Catalog}=require('../../src/tax/phase4Catalog');
let retained;
function catalog(){return retained??=loadPhase4Catalog();}
function simulatedSystem(ids,{governancePath=null,determinationPath=null,approve=true}={}){
 const governance=new FabricGovernanceStore({persistPath:governancePath}),registry=new TaxContentRegistry({governanceStore:governance,allowTestPacks:true});
 for(const original of catalog().candidates.filter(c=>ids.includes(c.executableContent.packId??c.executableContent.treatyPackId))){
  const content=JSON.parse(JSON.stringify(original.executableContent));content.testOnly=true;content.label='TEST ONLY controlled approval simulation: '+content.label;
  const c={...referenceCandidate(original.contentKind,content,content.evidenceRefs),reviewPackage:original.reviewPackage};
  if(!governance.get(c.candidateId))registry.register(c);
  if(approve&&governance.get(c.candidateId).status==='CANDIDATE')governance.review(c.candidateId,{decisionSource:'HUMAN',actor:'Test fixture reviewer',decision:'APPROVED',reason:'TEST ONLY approval simulation on real retained legal content; not actual legal approval',reviewedHashes:[...new Set(c.provenance.map(p=>p.rawContentHash))]});
 }
 const determinations=new TaxDeterminationStore({persistPath:determinationPath});return {registry,governance,determinations,engine:new UniversalTaxEngine({registry,determinations})};
}
function request(extra={}){
 return {scopeId:'phase4-test-org',subjectId:'individual-1',requestKey:'case-1',taxType:'SIMPLIFIED_INCOME',jurisdictionCode:'ID',jurisdictionBasis:'TAX_RESIDENCE',incomeOrEventType:'MONTHLY_ELIGIBLE_DOMESTIC_BUSINESS',currency:'IDR',period:{periodStart:'2026-05-01',periodEnd:'2026-05-31'},economicDate:'2026-05-31',...extra};
}
function snapshot(req,{values={},remove=[],revision=1,confirmed=true}={}){
 const money=n=>['MONEY',{amountMinor:String(n),currency:req.currency}];
 const data={
  SUBJECT_TYPE:['STRING','INDIVIDUAL'],INCOME_TYPE:['STRING',req.incomeOrEventType],TAX_RESIDENCE:['COUNTRY',req.jurisdictionCode],SOURCE:['COUNTRY',req.jurisdictionCode],REGISTRATION:['COUNTRY',req.jurisdictionCode],WITHHOLDING:['COUNTRY',req.jurisdictionCode],
  LEGAL_FORM:['STRING','INDIVIDUAL'],INCOME_CATEGORY:['STRING','ELIGIBLE_NON_PROFESSIONAL_DOMESTIC_BUSINESS'],ELECTED_ORDINARY_REGIME:['BOOLEAN',false],PREVIOUSLY_DISQUALIFIED_FROM_FINAL:['BOOLEAN',false],
  PRIOR_YEAR_AGGREGATE_TURNOVER:money(1000000000),MONTH_GROSS_BUSINESS_TURNOVER:money(100000000),YTD_GROSS_BEFORE_MONTH:money(450000000),AGGREGATION_BASIS_REVIEWED:['BOOLEAN',true],MONTH_PERIOD_REVIEWED:['BOOLEAN',true],REGIME_FIRST_TAX_YEAR:['NUMBER','2020'],
  BUSINESS_CAPACITY:['STRING','INDIVIDUAL_FREELANCER'],INCOME_REGIME:['STRING','ORDINARY_ART17'],REVIEWED_TAXABLE_INCOME:money(300000123),TAXABLE_INCOME_RECONCILIATION_APPROVED:['BOOLEAN',true],ANNUAL_TAX_PERIOD_REVIEWED:['BOOLEAN',true],
  PAYER_IS_WITHHOLDING_AGENT:['BOOLEAN',true],PAYEE_TAX_RESIDENCE:['COUNTRY','ID'],PAYEE_IS_PERMANENT_ESTABLISHMENT:['BOOLEAN',false],PAYMENT_CATEGORY:['STRING','NON_FINAL_MANAGEMENT_SERVICE'],GROSS_FEE_EXCLUDING_VAT:money(10000000),NPWP_VALID:['BOOLEAN',true],SUBJECT_TO_PPH21:['BOOLEAN',false],FINAL_REGIME_CERTIFICATE_APPLIES:['BOOLEAN',false],
  ASSESSMENT_YEAR:['NUMBER','2026'],NORMAL_CHARGEABLE_INCOME:money(20000000),FISCAL_RECONCILIATION_APPROVED:['BOOLEAN',true],CLAIMS_STARTUP_EXEMPTION:['BOOLEAN',false],CASH_GRANT_ELIGIBLE:['BOOLEAN',false],HAS_TAX_CREDITS_OR_SPECIAL_RATE_INCOME:['BOOLEAN',false],CALENDAR_BASIS_PERIOD_REVIEWED:['BOOLEAN',true],...values};
 const candidate=candidateTaxFacts({...req,revision,facts:Object.entries(data).filter(([name])=>!remove.includes(name)).map(([name,[type,value]])=>({name,type,value,evidenceReference:'TEST ONLY stipulated evidence: '+name}))});
 return confirmed?confirmTaxFacts(candidate,{decisionSource:'HUMAN',actor:'Test fixture fact reviewer',reviewedSnapshotHash:candidate.snapshotHash}):candidate;
}
module.exports={catalog,simulatedSystem,request,snapshot};
