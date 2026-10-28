'use strict';
// Lite adaptation of Original taxCoreServer pack applicability and taxPackComposition.
// This catalog never executes M3/M5 expressions and never treats AI as legal authority.
const {assertDate}=require('../domain/organization');
const {isKnownJurisdiction}=require('../global/jurisdictions');
const {fingerprint,deepFreeze}=require('../onboarding/canonical');
const ORIGINAL_PACKS=[
 require('./content/indonesia-cit-reference-2025.json'),
 require('./content/indonesia-cit-determination-2025.json'),
];
function packId(pack){return pack.packCode+'@'+pack.version;}
function validateContent(pack){
 const errors=[];
 if(!pack||typeof pack!=='object')return ['pack object required'];
 if(!pack.packCode||!Number.isInteger(pack.version)||pack.version<1)errors.push('pack code and positive integer version required');
 if(!isKnownJurisdiction(pack.jurisdictionCode))errors.push('registered jurisdiction required');
 try{assertDate(pack.effectiveFrom,'effectiveFrom');if(pack.effectiveTo)assertDate(pack.effectiveTo,'effectiveTo');if(pack.effectiveTo&&pack.effectiveFrom>pack.effectiveTo)errors.push('invalid effective window');}catch(e){errors.push(e.message);}
 if(!Array.isArray(pack.supportedSubjectTypes)||!pack.supportedSubjectTypes.length)errors.push('subject scope required');
 if(!Array.isArray(pack.supportedTaxTypes)||!pack.supportedTaxTypes.length)errors.push('tax scope required');
 if(!Array.isArray(pack.legalSources)||!pack.legalSources.length||pack.legalSources.some(s=>!s.url||!s.instrument))errors.push('source references required');
 if(!Array.isArray(pack.rules)||!pack.rules.length)errors.push('substantive rules required');
 for(const r of pack.rules??[]){
  if(!r.ruleCode)errors.push('rule identity required');
  if(!r.effectiveFrom||r.effectiveFrom<pack.effectiveFrom||(pack.effectiveTo&&(!r.effectiveTo||r.effectiveTo>pack.effectiveTo)))errors.push('rule outside pack window');
 }
 return errors;
}
class ContentRegistry{
 constructor(packs=ORIGINAL_PACKS,{supportedConsumers=[]}={}){this.supportedConsumers=Object.freeze([...supportedConsumers]);this.packs=new Map();for(const p of packs)this.register(p);}
 register(pack){const errors=validateContent(pack);if(errors.length)throw Error(errors.join('; '));const id=packId(pack);if(this.packs.has(id))throw Error('duplicate pack '+id);const copy=JSON.parse(JSON.stringify(pack));copy.contentHash=fingerprint(pack);this.packs.set(id,deepFreeze(copy));return id;}
 list(){return [...this.packs.values()];}
 get(id){return this.packs.get(id)??null;}
}
function approvalFor(pack,approvals){
 return (approvals??[]).find(a=>a.packId===packId(pack)&&a.contentHash===pack.contentHash&&a.decisionSource==='HUMAN'&&a.actor&&a.evidenceReference&&a.status==='APPROVED')??null;
}
function approveContent(registry,input){
 const {packId:id,actor,evidenceReference,decisionSource}=input;
 const pack=registry.get(id);if(!pack)throw Error('MISSING_COUNTRY_PACK');
 if(decisionSource!=='HUMAN'||!actor||/^(?:ai|model|system|meta|muse)(?:$|[: -])/i.test(actor))throw Error('human reviewer required');
 if(typeof evidenceReference!=='string'||!evidenceReference.trim())throw Error('source review evidence required');
 return {packId:id,contentHash:pack.contentHash,status:'APPROVED',scope:'SOURCE_CONTENT_REVIEW_ONLY',decisionSource:'HUMAN',actor,evidenceReference,timestamp:new Date().toISOString()};
}
function hasConflictingPackRules(packs,asOf){
 if(packs.length<2)return false;const owners=new Map();
 for(const pack of packs){
  const identity=packId(pack),rules=(pack.rules??[]).filter(r=>r.effectiveFrom<=asOf&&(!r.effectiveTo||r.effectiveTo>=asOf));
  if(!rules.length)return true;
  for(const r of rules){
   const kind=r.ruleKind??(r.classification==='PROFESSIONAL_JUDGMENT'?'REVIEW_REQUIRED':r.formula?'FISCAL_RECONCILIATION':null);
   if(!r.ruleCode||!kind)return true;
   const parameter=r.action?.parameterCode??r.action?.parameter;
   if(kind==='PARAMETER_RESOLUTION'&&!parameter)return true;
   // Naming different predicates never proves two legal outputs cannot overlap.
   const keys=['code:'+r.ruleCode,'target:'+r.taxTypeCode+':'+kind+':'+(parameter??''),
    ...(r.executionRoles??[]).map(role=>'role:'+r.taxTypeCode+':'+role),
    ...(Array.isArray(r.governedParameters)?r.governedParameters:[]).map(p=>'parameter:'+r.taxTypeCode+':'+p.code),
    ...(parameter?['parameter:'+r.taxTypeCode+':'+parameter]:[])];
   for(const key of keys){if(owners.has(key)&&owners.get(key)!==identity)return true;owners.set(key,identity);}
  }
 }
 return false;
}
function resolveCountryPacks({jurisdictionFacts=[],subjectType='UNKNOWN',taxType=null,effectiveDate,period=null,registry=new ContentRegistry(),approvals=[],confirmedPackIds=[],profileRevision=0}={}){
 assertDate(effectiveDate,'effective date');
 const from=period?.periodStart??effectiveDate,to=period?.periodEnd??effectiveDate;
 assertDate(from,'period start');assertDate(to,'period end');if(from>to)throw Error('invalid period range');
 const relevant=jurisdictionFacts.filter(f=>['REGISTRATION','INCORPORATION','TAX_RESIDENCE','SOURCE','WITHHOLDING','POSSIBLE_PE'].includes(f.basis)&&['CANDIDATE','CONFIRMED'].includes(f.status)&&f.countryCode);
 const countries=[...new Set(relevant.map(f=>f.countryCode))],candidates=[];
 const result={status:'REVIEW_REQUIRED',selectedPackIds:[],candidates,reason:'JURISDICTION_REQUIRES_REVIEW',requiresHumanApproval:true,evaluatedAsOf:effectiveDate,period:{periodStart:from,periodEnd:to},profileRevision};
 if(jurisdictionFacts.some(f=>f.status==='CONFLICT'))return {...result,reason:'CONFLICTING_JURISDICTION_FACTS'};
 if(!countries.length)return result;
 for(const country of countries){
  const packs=registry.list().filter(p=>p.jurisdictionCode===country);
  if(!packs.length){candidates.push({jurisdiction:country,status:'MISSING_COUNTRY_PACK',reason:'No substantive pack registered'});continue;}
  for(const pack of packs){
   let status='CANDIDATE',reason='HUMAN_CONFIRMATION_REQUIRED';
   const successor=pack.supersededBy?registry.get(pack.supersededBy):null;
   if(pack.lifecycleStatus==='RETIRED'){status='REVIEW_REQUIRED';reason='PACK_RETIRED';}
   else if(pack.supersededBy&&!successor){status='REVIEW_REQUIRED';reason='SUCCESSOR_SCOPE_UNRESOLVED';}
   else if(successor&&to>=successor.effectiveFrom){status='OUT_OF_PERIOD';reason='SUPERSEDED_EFFECTIVE_RANGE';}
   else if(pack.effectiveFrom>from||(pack.effectiveTo&&pack.effectiveTo<to)||effectiveDate<pack.effectiveFrom||(pack.effectiveTo&&effectiveDate>pack.effectiveTo)){status='OUT_OF_PERIOD';reason='Entire accounting period and evaluation date must fit the pack window';}
   else if(subjectType==='UNKNOWN'){status='REVIEW_REQUIRED';reason='SUBJECT_TYPE_REQUIRED';}
   else if(!pack.supportedSubjectTypes.includes(subjectType)||(taxType&&!pack.supportedTaxTypes.includes(taxType))){status='NOT_APPLICABLE';reason='SUBJECT_OR_TAX_TYPE_NOT_SUPPORTED';}
   else if(!approvalFor(pack,approvals)){status='REVIEW_REQUIRED';reason='PACK_SOURCE_REVIEW_REQUIRED';}
   else if(!pack.lite?.executable||!registry.supportedConsumers.includes(pack.lite.requiredConsumer)){status='REVIEW_REQUIRED';reason='LITE_EXECUTION_UNSUPPORTED';}
   candidates.push({packId:packId(pack),packCode:pack.packCode,version:pack.version,contentHash:pack.contentHash,jurisdiction:country,status,reason,effectiveFrom:pack.effectiveFrom,effectiveTo:pack.effectiveTo,subjectTypes:pack.supportedSubjectTypes,taxTypes:pack.supportedTaxTypes,sourceVerifiedInOriginal:Boolean(pack.originalSource?.repository==='aegaorion-dot/big-m-'),executable:Boolean(pack.lite?.executable&&registry.supportedConsumers.includes(pack.lite.requiredConsumer))});
  }
 }
 const eligible=candidates.filter(c=>c.status==='CANDIDATE');
 // Bounded overlap is ambiguous without explicit succession; a higher number is not authority.
 if(eligible.some(c=>eligible.filter(other=>other.packCode===c.packCode).length>1))return {...result,reason:'AMBIGUOUS_PACK_VERSION'};
 const winners=eligible;
 if(winners.length){
  if(hasConflictingPackRules(winners.map(c=>registry.get(c.packId)),effectiveDate))return {...result,reason:'CONFLICTING_COUNTRY_PACKS'};
  const missingCountry=countries.some(code=>!winners.some(p=>p.jurisdiction===code));
  if(missingCountry)return {...result,reason:'INCOMPLETE_MULTI_JURISDICTION_COVERAGE'};
  const confirmed=winners.every(p=>confirmedPackIds.includes(p.packId))&&relevant.every(f=>f.status==='CONFIRMED');
  return {...result,status:confirmed?'RESOLVED':'REVIEW_REQUIRED',selectedPackIds:confirmed?winners.map(p=>p.packId):[],reason:confirmed?'CONFIRMED_APPLICABLE_PACKS':'HUMAN_CONFIRMATION_REQUIRED',requiresHumanApproval:!confirmed};
 }
 const statuses=new Set(candidates.map(c=>c.status));
 return {...result,status:statuses.size===1?[...statuses][0]:'REVIEW_REQUIRED',reason:statuses.size===1?[...statuses][0]:'PACK_REVIEW_REQUIRED'};
}
module.exports={ORIGINAL_PACKS,ContentRegistry,packId,validateContent,approveContent,approvalFor,hasConflictingPackRules,resolveCountryPacks};
