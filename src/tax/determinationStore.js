'use strict';
const fs=require('node:fs');
const {fingerprint,deepFreeze}=require('../onboarding/canonical');
const {atomicWrite}=require('../fabric/governanceStore');
function verifyDetermination(record){const {integrityHash,...payload}=record;if(integrityHash!==fingerprint(payload))throw Error('Determination integrity mismatch');return record;}
class TaxDeterminationStore{
 constructor({persistPath=null}={}){
  this.persistPath=persistPath;this.records=new Map();this.requests=new Map();
  if(persistPath&&fs.existsSync(persistPath)){const data=JSON.parse(fs.readFileSync(persistPath,'utf8'));if(data.version!==1||data.integrityHash!==fingerprint(data.records))throw Error('Determination store integrity mismatch');for(const r of data.records){verifyDetermination(r);if(this.requests.has(r.idempotencyScope))throw Error('Duplicate determination scope');const copy=deepFreeze(r);this.records.set(r.determinationId,copy);this.requests.set(r.idempotencyScope,copy);}}
 }
 find(scope,requestHash){const existing=this.requests.get(scope);if(existing&&existing.requestHash!==requestHash)throw Error('IDEMPOTENCY_CONFLICT: use a new request key for changed facts or context');return existing??null;}
 get(id,{scopeId,subjectId}={}){const r=this.records.get(id);return r&&r.scopeId===scopeId&&r.subjectId===subjectId?r:null;}
 list({scopeId,subjectId}){return [...this.records.values()].filter(r=>r.scopeId===scopeId&&r.subjectId===subjectId);}
 listForCandidate(candidateId){if(typeof candidateId!=='string'||!candidateId.trim())throw Error('Candidate id required');return [...this.records.values()].filter(r=>r.appliedRules?.some(rule=>rule.candidateId===candidateId)).map(r=>({determinationId:r.determinationId,status:r.status,taxType:r.taxType,jurisdictionCode:r.jurisdictionCode,period:r.period,currency:r.currency,taxableBase:r.taxableBase,taxAmount:r.taxAmount,calculationHash:r.calculationHash,engineVersion:r.engineVersion,appliedRules:r.appliedRules.map(({ruleId,packId,packVersion,candidateId,contentHash,governanceStatus})=>({ruleId,packId,packVersion,candidateId,contentHash,governanceStatus})),inputEvidence:(r.inputFacts?.facts??[]).filter(f=>['ANNUAL_GENERAL_BASE_PROXY','ANNUAL_NET_BUSINESS_INCOME'].includes(f.name)).map(({name,type,value,evidenceReference,confirmationAuthority,provisional})=>({name,type,value,evidenceReference,confirmationAuthority,provisional})),postingPerformed:r.postingPerformed===true}));}
 save(record){verifyDetermination(record);const existing=this.find(record.idempotencyScope,record.requestHash);if(existing)return existing;const next=new Map(this.records);next.set(record.determinationId,deepFreeze(record));if(this.persistPath){const records=[...next.values()];atomicWrite(this.persistPath,{version:1,records,integrityHash:fingerprint(records)});}this.records=next;this.requests.set(record.idempotencyScope,record);return record;}
}
module.exports={TaxDeterminationStore,verifyDetermination};
