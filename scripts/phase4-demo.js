'use strict';
// Offline fictitious dossiers only. Production catalog is never approved.
const fs=require('node:fs'),path=require('node:path');
const {createTaxSystem,TaxContentRegistry,UniversalTaxEngine,planTaxReadiness}=require('../src/tax');
const {catalog,simulatedSystem,request,snapshot}=require('./lib/phase4-fixtures');
const {createWebStore}=require('../src/web/store');
const out=path.resolve(__dirname,'../research/phase4-packs/demo');
function brief(r){return {status:r.status,reason:r.reason,taxReady:r.taxReady,testOnly:r.testOnly,taxAmount:r.taxAmount,domesticCandidate:r.domesticCandidate,withholding:r.withholding,treatyResult:r.treatyResult,requiredMissingFacts:r.requiredMissingFacts,appliedRules:r.appliedRules,sourceHashes:[...new Set(r.evidenceRefs.map(e=>e.rawContentHash))],traceSteps:r.calculationTrace.length,determinationId:r.determinationId,integrityHash:r.integrityHash,postingPerformed:r.postingPerformed};}
async function main(){
 fs.mkdirSync(out,{recursive:true});const real=createTaxSystem(),cases=[];
 function productionCase(name,q,options={}){
  const f=snapshot(q,options),r=real.engine.determine(q,f),readiness=planTaxReadiness({registry:real.registry,request:q,snapshot:f});
  cases.push({name,scenarioFacts:'TEST ONLY fictitious confirmed dossier; no actual user facts or legal approval',request:q,determination:brief(r),readiness});
 }
 const annual=request({requestKey:'freelancer-2026',taxType:'INCOME_TAX',incomeOrEventType:'ANNUAL_ORDINARY_INDIVIDUAL_INCOME',period:{periodStart:'2026-01-01',periodEnd:'2026-12-31'},economicDate:'2026-12-31'});
 productionCase('1 Indonesian freelancer, ID source/residence, SG/US customers',annual,{values:{NATIONALITY:['COUNTRY','ID'],BUSINESS_WORK_LOCATION:['COUNTRY','ID'],CUSTOMER_LOCATION:['COUNTRY','SG'],OTHER_CUSTOMER_LOCATION:['COUNTRY','US']}});
 productionCase('2 Bandung coffee-shop individual UMKM, May2026',request({requestKey:'coffee-shop'}));
 productionCase('2a Missing aggregate turnover asks only the pack-required missing fact',request({requestKey:'coffee-turnover-missing'}),{remove:['PRIOR_YEAR_AGGREGATE_TURNOVER']});
 productionCase('2b PPN question requires PKP status and transaction facts; no VAT amount rule',request({requestKey:'coffee-vat',taxType:'VAT',jurisdictionBasis:'REGISTRATION',incomeOrEventType:'DOMESTIC_RETAIL_SUPPLY'}));
 productionCase('3 Australian owner in Bali, tax residence not established',request({requestKey:'bali-unknown',jurisdictionBasis:'REGISTRATION'}),{remove:['TAX_RESIDENCE'],values:{NATIONALITY:['COUNTRY','AU'],BUSINESS_WORK_LOCATION:['COUNTRY','ID'],CUSTOMER_LOCATION:['COUNTRY','AU']}});
 productionCase('3a Confirmed ID residence with AU-source ordinary income selects ID-AU dossier',{...annual,requestKey:'bali-au-source'},{values:{NATIONALITY:['COUNTRY','AU'],SOURCE:['COUNTRY','AU']}});
 productionCase('ID-SG service WHT route remains unapproved',request({requestKey:'sg-service',taxType:'WHT',jurisdictionBasis:'WITHHOLDING',incomeOrEventType:'NONRESIDENT_INDEPENDENT_SERVICE_FEE'}),{values:{TAX_RESIDENCE:['COUNTRY','SG'],PAYEE_TAX_RESIDENCE:['COUNTRY','SG'],PAYMENT_CATEGORY:['STRING','INDEPENDENT_PROFESSIONAL_SERVICE']}});
 const oldRegistry=new TaxContentRegistry();oldRegistry.register(catalog().candidates.find(c=>c.executableContent.packId==='ID_UMKM_INDIVIDUAL_2025'));
 const q=request({requestKey:'2025-expiry'}),expired=new UniversalTaxEngine({registry:oldRegistry}).determine(q,snapshot(q));
 cases.push({name:'4 Explicit 2025-only catalog rejected for 2026',determination:brief(expired)});
 const simulated=simulatedSystem(['ID_UMKM_INDIVIDUAL_2026']),simRequest=request({requestKey:'controlled-real-umkm'}),simFacts=snapshot(simRequest),determination=simulated.engine.determine(simRequest,simFacts);
 fs.writeFileSync(path.join(out,'test-only-determination.json'),JSON.stringify(determination,null,2)+'\n');
 fs.writeFileSync(path.join(out,'test-only-request.json'),JSON.stringify(simRequest,null,2)+'\n');
 fs.writeFileSync(path.join(out,'test-only-facts.json'),JSON.stringify(simFacts,null,2)+'\n');
 const controlled={label:'TEST ONLY isolated approval simulation on real legal content; not actual legal approval',umkm:brief(determination),replay:simulated.engine.replay(determination).matches};
 for(const [name,ids,req,values]of [
  ['ordinary2026',['ID_INDIVIDUAL_ORDINARY_2026'],{...annual,requestKey:'controlled-ordinary'},{}],
  ['idAuDomesticThenReview',['ID_INDIVIDUAL_ORDINARY_2026','ID_AU_SMALL_BUSINESS_RESEARCH_2026'],{...annual,requestKey:'controlled-au'},{SOURCE:['COUNTRY','AU']}],
  ['idSgDomesticThenReview',['ID_WHT26_SERVICE_2026','ID_SG_SMALL_BUSINESS_RESEARCH_2026'],request({requestKey:'controlled-sg',taxType:'WHT',jurisdictionBasis:'WITHHOLDING',incomeOrEventType:'NONRESIDENT_INDEPENDENT_SERVICE_FEE'}),{TAX_RESIDENCE:['COUNTRY','SG'],PAYEE_TAX_RESIDENCE:['COUNTRY','SG'],PAYMENT_CATEGORY:['STRING','INDEPENDENT_PROFESSIONAL_SERVICE']}]
 ]){const s=simulatedSystem(ids),r=s.engine.determine(req,snapshot(req,{values}));controlled[name]=brief(r);}
 const store=createWebStore({orgId:'phase4-bookkeeping-demo'});
 for(const [slot,value]of [['currency.functional','IDR'],['org.name','TEST ONLY coffee shop'],['accounting.periodStart','2026-01-01'],['accounting.periodEnd','2026-12-31']])store.editProfile({slot,value});
 store.editProfile({basis:'REGISTRATION',countryCode:'ID'});const proposal=store.onboardingPropose();if(!proposal.ok)throw Error('Bookkeeping proposal failed');
 if(!store.onboardingValidate().ok)throw Error('Bookkeeping validation failed');store.onboardingConfirm({proposalHash:proposal.proposal.hash,actor:'Demo bookkeeping reviewer'});store.onboardingActivate({activationKey:'phase4-demo',actor:'Demo bookkeeping reviewer'});
 await store.createSale({id:'phase4-coffee',orgId:'phase4-bookkeeping-demo',date:'2026-05-01',jurisdiction:'ID',currency:'IDR',customer:'TEST ONLY local customer',invoiceRef:'DEMO-P4',description:'Coffee sale',amountMajor:'25000'});
 const output={label:'OFFLINE DEMO: fictitious facts, production law approvals=0',productionApprovedCount:real.governance.approved().length,cases,controlled,bookkeeping:{ledgerEntries:store.ctx.ledger.size,onePostingPipeline:true,taxUnresolved:true}};
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({cases:cases.length,productionApproved:output.productionApprovedCount,controlledUmkm:determination.taxAmount,replay:controlled.replay,bookkeepingEntries:store.ctx.ledger.size}));
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
