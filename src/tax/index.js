'use strict';
const {TaxContentRegistry}=require('./contentRegistry');
const {TaxDeterminationStore}=require('./determinationStore');
const {FabricGovernanceStore}=require('../fabric/governanceStore');
const {UniversalTaxEngine}=require('./taxEngine');
const {originalCompanyCandidate,idSgResearchCandidate}=require('./referenceCandidates');
function createTaxSystem({governancePath=null,determinationPath=null,includePhase4=true,policyMode=process.env.BIGM_REGULATORY_POLICY==='HACKATHON_DEMO'?'HACKATHON_DEMO':'STRICT'}={}){
 const governance=new FabricGovernanceStore({persistPath:governancePath,policyMode}),registry=new TaxContentRegistry({governanceStore:governance,policyMode});
 for(const candidate of [originalCompanyCandidate(),idSgResearchCandidate()])if(!governance.get(candidate.candidateId))registry.register(candidate);
 if(includePhase4)require('./phase4Catalog').registerPhase4Catalog(registry);
 const determinations=new TaxDeterminationStore({persistPath:determinationPath}),engine=new UniversalTaxEngine({registry,determinations});
 return {engine,registry,governance,determinations};
}
module.exports={createTaxSystem,UniversalTaxEngine,TaxContentRegistry,TaxDeterminationStore,...require('./facts'),...require('./treatyResolver'),...require('./accountingBoundary'),...require('./readiness'),...require('./subjects')};
