'use strict';
// Minimal safe bridge: Muse declarative RuleCandidate -> governed executable content.
// Uses only existing Fabric objects, attachExecutableContent(), validateCountryPack().
// No eval, no generated code. Only declarative AST/data accepted by the tax DSL.
const {attachExecutableContent}=require('../fabric/candidates');
const {validateCountryPack}=require('../tax/contracts');
const {assertJsonData}=require('../tax/dsl');
const {feedbackFromError,toValidationFeedback}=require('./researchWorkflow');

function buildExecutableMuseCandidate({sourceCandidate,declarativePack}){
 try{
  assertJsonData({sourceCandidate,declarativePack});
  if(!sourceCandidate?.candidateId||!Array.isArray(sourceCandidate.provenance)||!sourceCandidate.provenance.length)throw Error('Governed source candidate required');
  if(sourceCandidate.status!=='CANDIDATE')throw Error('Source candidate must be CANDIDATE before executable content');
  if(!declarativePack||typeof declarativePack!=='object')throw Error('Declarative pack required');
  const packJurisdiction=declarativePack.jurisdictionCode;
  if(packJurisdiction!==sourceCandidate.jurisdictionCode)throw Error('Pack jurisdiction must match source candidate jurisdiction');
  const sourceHashes=new Set(sourceCandidate.provenance.map(p=>p.rawContentHash));
  const sourceEvidenceIds=new Set(sourceCandidate.evidenceIds??[]);
  for(const ref of declarativePack.evidenceRefs??[]){
   if(!ref?.evidenceId||!ref?.rawContentHash)throw Error('Pack evidence ref incomplete');
   if(!sourceHashes.has(ref.rawContentHash)||!sourceEvidenceIds.has(ref.evidenceId))throw Error('Pack evidence not bound to Fabric source candidate');
  }
  validateCountryPack(declarativePack);
  const candidate=attachExecutableContent(sourceCandidate,'COUNTRY_PACK',JSON.parse(JSON.stringify(declarativePack)));
  return {ok:true,candidate};
 }catch(error){
  const context={packId:declarativePack?.packId??null,field:declarativePack?.packId?'executableContent':'pack'};
  return {ok:false,feedback:feedbackFromError(error,context)};
 }
}

function validateMusePackOnly(declarativePack){
 try{
  assertJsonData(declarativePack);
  validateCountryPack(declarativePack);
  return {ok:true};
 }catch(error){
  return {ok:false,feedback:feedbackFromError(error,{packId:declarativePack?.packId??null})};
 }
}

module.exports={buildExecutableMuseCandidate,validateMusePackOnly};
