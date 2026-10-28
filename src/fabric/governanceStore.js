'use strict';
// One durable Fabric governance collection for research, domestic and treaty content.
const fs=require('node:fs'),path=require('node:path');
const {fingerprint,deepFreeze}=require('../onboarding/canonical');
const {reviewCandidate,executableApproval}=require('./candidates');
function atomicWrite(file,data){const temp=file+'.tmp';fs.mkdirSync(path.dirname(file),{recursive:true});try{fs.writeFileSync(temp,JSON.stringify(data,null,2)+'\n');fs.renameSync(temp,file);}catch(e){throw Error('Fabric/determination state could not be saved: '+e.message);}}
class FabricGovernanceStore{
 constructor({persistPath=null}={}){this.persistPath=persistPath;this.candidates=new Map();if(persistPath&&fs.existsSync(persistPath)){const data=JSON.parse(fs.readFileSync(persistPath,'utf8'));if(data.version!==1||data.integrityHash!==fingerprint(data.candidates))throw Error('Fabric persistence integrity mismatch');for(const c of data.candidates)this.candidates.set(c.candidateId,deepFreeze(c));}}
 list(kind=null){return [...this.candidates.values()].filter(c=>!kind||c.contentKind===kind);}
 get(id){return this.candidates.get(id)??null;}
 _save(next){if(this.persistPath){const candidates=[...next.values()];atomicWrite(this.persistPath,{version:1,candidates,integrityHash:fingerprint(candidates)});}this.candidates=next;}
 register(candidate){
  if(!candidate?.candidateId||!candidate.provenance?.length||candidate.status!=='CANDIDATE'||candidate.reviewHistory?.length)throw Error('Register a fresh Fabric candidate before human review');
  if(this.candidates.has(candidate.candidateId)){const current=this.get(candidate.candidateId);if(current.contentHash!==candidate.contentHash)throw Error('Candidate identity conflict');return current;}
  const content=candidate.executableContent;
  if(content&&this.list(candidate.contentKind).some(c=>{const p=c.executableContent;return (p.packId??p.treatyPackId)===(content.packId??content.treatyPackId)&&p.version===content.version;}))throw Error('Immutable pack version already registered');
  const copy=deepFreeze(JSON.parse(JSON.stringify(candidate))),next=new Map(this.candidates);next.set(copy.candidateId,copy);this._save(next);return copy;
 }
 review(id,decision){const previous=this.get(id);if(!previous)throw Error('Unknown Fabric candidate');const reviewed=reviewCandidate(previous,decision),next=new Map(this.candidates);next.set(id,reviewed);this._save(next);return reviewed;}
 approved(kind){return this.list(kind).filter(executableApproval);}
 snapshot(){return JSON.parse(JSON.stringify(this.list()));}
}
module.exports={FabricGovernanceStore,atomicWrite};
