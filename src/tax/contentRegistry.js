'use strict';
const {FabricGovernanceStore}=require('../fabric/governanceStore');
const {executableApproval}=require('../fabric/candidates');
const {validateCountryPack,validateTreatyPack}=require('./contracts');
class TaxContentRegistry{
 constructor({governanceStore=null,allowTestPacks=false,policyMode=null}={}){this.policyMode=policyMode??governanceStore?.policyMode??'STRICT';if(!['STRICT','HACKATHON_DEMO'].includes(this.policyMode))throw Error('Unknown tax governance policy mode');this.governance=governanceStore??new FabricGovernanceStore({policyMode:this.policyMode});if(this.governance.policyMode!==this.policyMode)throw Error('Tax registry and Fabric governance policy modes must match');this.allowTestPacks=allowTestPacks;}
 register(candidate){
  this.validate(candidate);if(candidate.executableContent.testOnly&&!this.allowTestPacks)throw Error('TEST ONLY content disabled in production');
  const executorSupported=candidate.contentKind==='COUNTRY_PACK'||candidate.executableContent.coverageStatus==='COMPLETE_SUBSET';
  const registered=this.governance.register({...candidate,executorSupported,runtimeExecutable:false});
  return this.policyMode==='HACKATHON_DEMO'&&registered.demoDisclosure?this.governance.autoApproveDemo(registered.candidateId):registered;
 }
 validate(candidate){
  const allowUndatedDemo=this.policyMode==='HACKATHON_DEMO'&&candidate.demoDisclosure?.policyMode==='HACKATHON_DEMO'&&candidate.demoDisclosure.status==='PROVISIONALLY_ACCEPTED_DEMO';
  if(candidate.contentKind==='COUNTRY_PACK')validateCountryPack(candidate.executableContent,{allowUndatedDemo});else if(candidate.contentKind==='TREATY_PACK')validateTreatyPack(candidate.executableContent,{allowUndatedDemo});else throw Error('Executable Fabric candidate required');
  const p=candidate.executableContent;if(p.evidenceRefs.some(e=>!candidate.evidenceIds.includes(e.evidenceId)||!candidate.provenance.some(ref=>ref.rawContentHash===e.rawContentHash)))throw Error('Pack evidence not bound to Fabric source candidate');
 }
 get(candidateId){return this.governance.get(candidateId);}
 list(kind){return this.governance.list(kind).filter(c=>this.allowTestPacks||!c.executableContent?.testOnly);}
 approved(candidate){try{this.validate(candidate);return executableApproval(candidate);}catch{return false;}}
 snapshot(){return JSON.parse(JSON.stringify([...this.list('COUNTRY_PACK'),...this.list('TREATY_PACK')]));}
}
const packKey=p=>(p.packId??p.treatyPackId)+'@'+p.version;
function temporalEligibility(candidate,all,period,date){
 const p=candidate.executableContent;
 if(candidate.status==='AUTO_APPROVED_DEMO'&&candidate.demoDisclosure?.policyMode==='HACKATHON_DEMO')return 'IN_PERIOD';
 if(!p.effectiveFrom||!p.effectiveTo)return 'REVIEW_REQUIRED';
 if(p.effectiveFrom>period.periodStart||p.effectiveTo<period.periodEnd||date<p.effectiveFrom||date>p.effectiveTo)return 'OUT_OF_PERIOD';
 if(['RETIRED','SUPERSEDED','CONFLICT'].includes(candidate.status))return candidate.status==='CONFLICT'?'CONFLICT':'REVIEW_REQUIRED';
 const successor=all.filter(c=>c.executableContent.supersedes===packKey(p));
 if(p.supersededBy){const explicit=all.find(c=>packKey(c.executableContent)===p.supersededBy);if(!explicit)return 'REVIEW_REQUIRED';successor.push(explicit);}
 // Succession remains part of the graph even after the successor is retired.
 if(successor.some(c=>c.executableContent.effectiveFrom&&period.periodEnd>=c.executableContent.effectiveFrom))return 'OUT_OF_PERIOD';
 return 'IN_PERIOD';
}
function resolveDomestic({registry,jurisdictionCode,taxType,subjectType,incomeOrEventType,period,economicDate}){
 const all=registry.list('COUNTRY_PACK'),scoped=all.filter(c=>{const p=c.executableContent;return p.jurisdictionCode===jurisdictionCode&&p.rules.some(r=>r.taxType===taxType&&r.subjectTypes.includes(subjectType)&&(r.incomeOrEventType==='*'||r.incomeOrEventType===incomeOrEventType));});
 if(!scoped.length)return {status:'MISSING_APPROVED_RULE',candidates:[],rules:[]};
 const candidates=scoped.map(c=>({candidateId:c.candidateId,packId:packKey(c.executableContent),status:temporalEligibility(c,all,period,economicDate)}));
 const inPeriod=scoped.filter((c,i)=>candidates[i].status==='IN_PERIOD'),approved=inPeriod.filter(c=>registry.approved(c));
 if(!approved.length)return {status:candidates.every(c=>c.status==='OUT_OF_PERIOD')?'OUT_OF_PERIOD':candidates.some(c=>c.status==='CONFLICT')?'CONFLICT':'REVIEW_REQUIRED',candidates,rules:[]};
 const rules=approved.flatMap(c=>c.executableContent.rules.filter(r=>r.taxType===taxType&&r.subjectTypes.includes(subjectType)&&(r.incomeOrEventType==='*'||r.incomeOrEventType===incomeOrEventType)&&(c.status==='AUTO_APPROVED_DEMO'||r.effectiveFrom<=period.periodStart&&r.effectiveTo>=period.periodEnd)).map(rule=>({candidate:c,pack:c.executableContent,rule,key:packKey(c.executableContent)+'/'+rule.ruleId})));
 // An identity cannot have two effective versions, even if their predicates differ.
 if(rules.some(r=>rules.filter(o=>o.pack.packId===r.pack.packId&&o.rule.ruleId===r.rule.ruleId).length>1))return {status:'CONFLICT',candidates,rules:[]};
 const selected=rules.filter(r=>!rules.some(o=>o.rule.supersedes===r.key)&&!r.rule.supersededBy);
 if(rules.some(r=>r.rule.supersededBy&&!rules.some(o=>o.key===r.rule.supersededBy)))return {status:'REVIEW_REQUIRED',candidates,rules:[]};
 return {status:selected.length?'RESOLVED':'OUT_OF_PERIOD',candidates,rules:selected};
}
module.exports={TaxContentRegistry,packKey,temporalEligibility,resolveDomestic};
