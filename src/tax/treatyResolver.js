'use strict';
const {packKey,temporalEligibility}=require('./contentRegistry');
const {typedInputs,typedParameters,evaluateAst}=require('./dsl');
function resolveTreaty({registry,facts,taxType,incomeOrEventType,period,economicDate,currency,trace=[]}){
 const get=name=>facts.get(name)?.value;
 const residence=facts.get('TAX_RESIDENCE')?.type==='COUNTRY'?get('TAX_RESIDENCE'):null,source=facts.get('SOURCE')?.type==='COUNTRY'?get('SOURCE'):null,missing=[];
 if(!residence)missing.push('TAX_RESIDENCE');if(!source)missing.push('SOURCE');
 const base={status:'REVIEW_REQUIRED',treatyApplicable:null,selectedTreatyPack:null,candidateTreaties:[],requiredMissingFacts:missing,reason:null,evaluatedAsOf:economicDate};
 if(missing.length)return {...base,status:'MISSING_FACT',reason:'SOURCE_AND_RESIDENCE_REQUIRED_CUSTOMER_LOCATION_IS_NOT_SOURCE'};
 if(residence===source)return {...base,status:'NOT_NEEDED',treatyApplicable:false,reason:'CONFIRMED_SOURCE_AND_RESIDENCE_MATCH'};
 const relevant=registry.list('TREATY_PACK').filter(c=>{const p=c.executableContent;return [p.jurisdictionA,p.jurisdictionB].includes(residence)&&[p.jurisdictionA,p.jurisdictionB].includes(source)&&p.coveredTaxes.includes(taxType);});
 if(!relevant.length)return {...base,status:'MISSING_TREATY',reason:'NO_REGISTERED_TREATY_FOR_CONFIRMED_PAIR'};
 const candidates=relevant.map(c=>({candidateId:c.candidateId,packId:packKey(c.executableContent),status:temporalEligibility(c,relevant,period,economicDate)}));
 const active=relevant.filter((c,i)=>candidates[i].status==='IN_PERIOD'&&registry.approved(c));
 if(active.length>1)return {...base,status:'CONFLICT',candidateTreaties:candidates,reason:'CONFLICTING_APPROVED_TREATY_VERSIONS'};
 if(!active.length)return {...base,status:candidates.every(c=>c.status==='OUT_OF_PERIOD')?'OUT_OF_PERIOD':'REVIEW_REQUIRED',candidateTreaties:candidates,reason:'TREATY_REVIEW_REQUIRED'};
 const candidate=active[0],p=candidate.executableContent;
 if(p.coverageStatus!=='COMPLETE_SUBSET'||!p.evidenceRefs.length)return {...base,candidateTreaties:candidates,reason:'TREATY_REVIEW_REQUIRED'};
 const articles=p.incomeArticles.filter(a=>a.incomeOrEventType===incomeOrEventType);
 if(articles.length!==1)return {...base,status:articles.length?'CONFLICT':'REVIEW_REQUIRED',candidateTreaties:candidates,reason:'EXACT_APPROVED_INCOME_ARTICLE_REQUIRED'};
 const article=articles[0],required={...p.requiredFacts,...article.requiredFacts},missingFacts=Object.keys(required).filter(k=>!facts.has(k));
 if(missingFacts.length)return {...base,status:'MISSING_FACT',candidateTreaties:candidates,requiredMissingFacts:missingFacts,reason:'CONFIRMED_TREATY_FACTS_REQUIRED'};
 try{if(!evaluateAst(article.eligibilityPredicate,{inputs:typedInputs(required,facts,currency),parameters:typedParameters(article),trace,label:packKey(p)+':eligibility'}))return {...base,candidateTreaties:candidates,reason:'TREATY_ELIGIBILITY_NOT_ESTABLISHED'};}catch(e){return {...base,candidateTreaties:candidates,reason:'TREATY_FACTS_REQUIRE_REVIEW'};}
 return {...base,status:'APPLICABLE',treatyApplicable:true,selectedTreatyPack:{candidateId:candidate.candidateId,treatyPackId:p.treatyPackId,version:p.version,contentHash:candidate.contentHash,articleId:article.articleId},candidateTreaties:candidates,requiredMissingFacts:[],reason:'APPROVED_SUBSET_AND_ELIGIBILITY_CONFIRMED',selection:{candidate,pack:p,article}};
}
module.exports={resolveTreaty};
