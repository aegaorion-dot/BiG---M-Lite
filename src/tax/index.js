'use strict';
const {TaxContentRegistry}=require('./contentRegistry');
const {TaxDeterminationStore}=require('./determinationStore');
const {FabricGovernanceStore}=require('../fabric/governanceStore');
const {UniversalTaxEngine}=require('./taxEngine');
const {originalCompanyCandidate,idSgResearchCandidate}=require('./referenceCandidates');
function createTaxSystem({governancePath=null,determinationPath=null}={}){
 const governance=new FabricGovernanceStore({persistPath:governancePath}),registry=new TaxContentRegistry({governanceStore:governance});
 for(const candidate of [originalCompanyCandidate(),idSgResearchCandidate()])if(!governance.get(candidate.candidateId))registry.register(candidate);
 const determinations=new TaxDeterminationStore({persistPath:determinationPath}),engine=new UniversalTaxEngine({registry,determinations});
 return {engine,registry,governance,determinations};
}
module.exports={createTaxSystem,UniversalTaxEngine,TaxContentRegistry,TaxDeterminationStore,...require('./facts'),...require('./treatyResolver'),...require('./accountingBoundary')};
