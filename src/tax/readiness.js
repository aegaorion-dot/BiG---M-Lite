'use strict';
const {validateCalculationRequest,TREATY_TAX_TYPES,BASIS}=require('./contracts');
const {temporalEligibility}=require('./contentRegistry');
const {typedInputs,typedParameters,evaluateAst}=require('./dsl');
const {candidateTaxFacts,inspectFacts,MULTI_VALUE_FACT_BASES}=require('./facts');
const {fingerprint,deepFreeze}=require('../onboarding/canonical');
const {verifyQuote}=require('../onboarding/evidence');
const {reviewStage}=require('./phase4Catalog');
const CORE={SUBJECT_TYPE:'STRING',INCOME_TYPE:'STRING'};
const LEGAL_CLASSIFICATION_FACTS=new Set(['TAX_RESIDENCE','SOURCE']);
function legalClassificationGap(name){
 return LEGAL_CLASSIFICATION_FACTS.has(name);
}
function planTaxReadiness({registry,request,snapshot,profileRevision=snapshot?.revision,profileState=null}){
 validateCalculationRequest(request);if(!BASIS.includes(request.jurisdictionBasis))throw Error('Explicit tax jurisdiction basis required; nationality/customer/bank cannot select tax law');const checked=candidateTaxFacts(snapshot);
 if(checked.snapshotHash!==snapshot.snapshotHash||snapshot.scopeId!==request.scopeId||snapshot.subjectId!==request.subjectId||snapshot.currency!==request.currency||snapshot.economicDate!==request.economicDate||fingerprint(snapshot.period)!==fingerprint(request.period))throw Error('Tax readiness snapshot scope or hash mismatch');
 const facts=new Map();let conflict=false;
 for(const f of snapshot.facts){
  if(facts.has(f.name)&&fingerprint(facts.get(f.name))!==fingerprint(f)){
   const base=(f.name.match(/^([A-Z][A-Z0-9_]*)_[A-Z]{2}$/)||[])[1];
   if(!(MULTI_VALUE_FACT_BASES.has(f.name)||(base&&MULTI_VALUE_FACT_BASES.has(base))))conflict=true;
  }
  facts.set(f.name,f);
 }
 const scoped=(registry.list('COUNTRY_PACK')).flatMap(c=>c.executableContent.jurisdictionCode===request.jurisdictionCode?c.executableContent.rules.filter(r=>r.taxType===request.taxType&&(r.incomeOrEventType==='*'||r.incomeOrEventType===request.incomeOrEventType)&&(!facts.has('SUBJECT_TYPE')||r.subjectTypes.includes(facts.get('SUBJECT_TYPE').value))).map(rule=>({candidate:c,rule})):[]);
 const all=registry.list('COUNTRY_PACK'),bindings=scoped.filter(b=>temporalEligibility(b.candidate,all,request.period,request.economicDate)==='IN_PERIOD'&&b.rule.effectiveFrom<=request.period.periodStart&&b.rule.effectiveTo>=request.period.periodEnd);
 const declarations={...CORE,[request.jurisdictionBasis]:'COUNTRY'},requirements={...declarations},prompts={},contributors=[];
 if(TREATY_TAX_TYPES.includes(request.taxType)){Object.assign(requirements,{TAX_RESIDENCE:'COUNTRY',SOURCE:'COUNTRY'});Object.assign(declarations,{TAX_RESIDENCE:'COUNTRY',SOURCE:'COUNTRY'});}
 let predicateUnknown=false,possible=0;
 for(const {candidate,rule}of bindings){
  Object.assign(declarations,rule.requiredFacts);
  // Candidate applicability preview drives questions only. Amount/base formulae
  // are never evaluated here; this is not an eligibility or tax determination.
  let relevant=true;
  try{relevant=evaluateAst(rule.applicabilityPredicate,{inputs:typedInputs(rule.requiredFacts,facts,request.currency),parameters:typedParameters(rule),trace:[],label:'candidate-question-scope'});}
  catch(e){predicateUnknown=true;relevant=true;}
  if(!relevant)continue;possible++;
  Object.assign(requirements,rule.requiredFacts);Object.assign(prompts,candidate.reviewPackage?.factPrompts??{});
  contributors.push({candidateId:candidate.candidateId,contentHash:candidate.contentHash,ruleId:rule.ruleId,stage:reviewStage(candidate,registry)});
 }
 // Research dossiers have explicit tax scopes in data and never masquerade as
 // executable rules. Their questions remain evidence-review questions.
 for(const c of registry.governance.list('RESEARCH').filter(c=>c.jurisdictionCode===request.jurisdictionCode&&c.taxScope?.taxTypes.includes(request.taxType))){
  Object.assign(requirements,c.requiredFacts);Object.assign(declarations,c.requiredFacts);Object.assign(prompts,c.reviewPackage?.factPrompts??{});
  contributors.push({candidateId:c.candidateId,contentHash:fingerprint(c.requiredFacts),stage:'REVIEW_REQUIRED'});
 }
 const residence=facts.get('TAX_RESIDENCE'),source=facts.get('SOURCE');
 if(TREATY_TAX_TYPES.includes(request.taxType)&&residence?.type==='COUNTRY'&&source?.type==='COUNTRY'&&residence.value!==source.value){
  for(const c of registry.list('TREATY_PACK').filter(c=>[c.executableContent.jurisdictionA,c.executableContent.jurisdictionB].includes(residence.value)&&[c.executableContent.jurisdictionA,c.executableContent.jurisdictionB].includes(source.value)&&c.executableContent.coveredTaxes.includes(request.taxType))){
   const p=c.executableContent,status=temporalEligibility(c,registry.list('TREATY_PACK'),request.period,request.economicDate);
   if(status==='OUT_OF_PERIOD')continue;
   Object.assign(requirements,p.requiredFacts);Object.assign(declarations,p.requiredFacts);
   for(const a of p.incomeArticles.filter(a=>a.incomeOrEventType===request.incomeOrEventType)){Object.assign(requirements,a.requiredFacts);Object.assign(declarations,a.requiredFacts);}
   Object.assign(prompts,c.reviewPackage?.factPrompts??{});contributors.push({candidateId:c.candidateId,contentHash:c.contentHash,stage:reviewStage(c,registry)});
  }
 }
 const requiredMissingFacts=Object.keys(requirements).filter(k=>!facts.has(k)||facts.get(k).type!==requirements[k]);
 const semanticMismatch=facts.has('INCOME_TYPE')&&facts.get('INCOME_TYPE').value!==request.incomeOrEventType||facts.has(request.jurisdictionBasis)&&facts.get(request.jurisdictionBasis).value!==request.jurisdictionCode;
 const researchGaps=requiredMissingFacts.filter(legalClassificationGap);
 const userFactsNeeded=requiredMissingFacts.filter(k=>!legalClassificationGap(k));
 const researchSignal=profileState?detectResearchSignal({profileState,request,requiredMissingFacts,researchGaps}):null;
 const status=conflict?'CONFLICT':semanticMismatch?'CONTEXT_REVIEW_REQUIRED':profileRevision!==snapshot.revision?'PROFILE_REVISION_CHANGED':requiredMissingFacts.length?(researchGaps.length&&!userFactsNeeded.length?'RESEARCH_REQUIRED':'MISSING_REQUIRED_FACT'):!contributors.length?scoped.length?'OUT_OF_PERIOD':'MISSING_APPROVED_RULE':inspectFacts(snapshot).status!=='CONFIRMED'?'FACT_CONFIRMATION_REQUIRED':contributors.some(c=>c.stage!=='APPROVED_EXECUTABLE')?'GOVERNANCE_REVIEW_REQUIRED':'READY_FOR_ENGINE_REVIEW';
 const questions=['CONFLICT','CONTEXT_REVIEW_REQUIRED','PROFILE_REVISION_CHANGED'].includes(status)?[]:userFactsNeeded.map(name=>({key:'tax.'+name,name,factType:requirements[name],semanticRole:name,text:prompts[name]??'Please provide the reviewed value for '+name.toLowerCase().replaceAll('_',' ')+'.',authority:'CANDIDATE_ONLY',purpose:'TAX_READINESS_REVIEW',candidateIds:contributors.map(c=>c.candidateId)}));
 const result={status,taxReady:false,authoritativeDetermination:false,profileRevision,snapshotHash:snapshot.snapshotHash,requestHash:fingerprint(request),requirements,declarations,requiredMissingFacts,researchGaps,userFactsNeeded,researchSignal,questions,contributors,candidatePredicatePreviewOnly:true,predicateUnknown,possibleRuleCount:possible,postingPerformed:false};
 return deepFreeze({...result,requirementsHash:fingerprint({requirements,contributors,requestHash:result.requestHash})});
}
function detectResearchSignal({profileState,request,requiredMissingFacts,researchGaps}){
 try{
  const slots=profileState.slots??{},facts=profileState.jurisdictionFacts??[];
  const nationality=slots['user.nationality']?.value??null;
  const physical=slots['user.physicalLocation']?.value??null;
  const businessType=slots['org.businessType']?.value??null;
  const work=facts.filter(f=>f.basis==='BUSINESS_WORK_LOCATION'&&f.status!=='REJECTED').map(f=>f.countryCode);
  const customers=[...new Set(facts.filter(f=>f.basis==='CUSTOMER_LOCATION'&&f.status!=='REJECTED').map(f=>f.countryCode))];
  const hasFreelanceIncome=businessType==='freelancer'||(slots['org.activities']?.value??[]).includes('freelancer');
  const crossBorder=nationality&&physical&&nationality!==physical;
  const unresolvedLegal=researchGaps.length>0||requiredMissingFacts.some(k=>legalClassificationGap(k));
  const recognized=crossBorder&&work.includes(request.jurisdictionCode)&&hasFreelanceIncome&&customers.length>0&&unresolvedLegal;
  if(!recognized)return {recognized:false,nationality,physicalLocation:physical,workLocations:work,customerCountries:customers,researchGaps};
  return {recognized:true,kind:'CROSS_BORDER_FREELANCE_LEGAL_CLASSIFICATION',nationality,physicalLocation:physical,workLocations:work,customerCountries:customers,researchGaps,missingCoverage:true,note:'Unresolved legal classification requires governed research; user must not supply legal conclusions.'};
 }catch{return {recognized:false};}
}
function discoverResearchNeed({profileState,request,plan=null,registry=null,snapshot=null}){
 const readiness=plan??(registry&&snapshot?planTaxReadiness({registry,request,snapshot,profileRevision:snapshot.revision,profileState}):null);
 if(!readiness)throw Error('Readiness plan or registry required');
 const signal=readiness.researchSignal??detectResearchSignal({profileState,request,requiredMissingFacts:readiness.requiredMissingFacts,researchGaps:readiness.researchGaps??[]});
 if(!signal?.recognized)return null;
 const {createResearchNeed}=require('../ai/researchWorkflow');
 const questionsToResolve=[...new Set([...(readiness.researchGaps??[]),...(readiness.requiredMissingFacts??[]).filter(legalClassificationGap)])];
 if(!questionsToResolve.length)return null;
 return createResearchNeed({objective:`Resolve legal classification for ${signal.nationality} freelance activity in ${request.jurisdictionCode} (${request.taxType}/${request.incomeOrEventType}) from user facts plus governed law; no user legal conclusions.`,profile:{nationality:signal.nationality,physicalLocation:signal.physicalLocation,workLocations:signal.workLocations,customerCountries:signal.customerCountries},transactions:[],questionsToResolve});
}
function taxQuestion(plan){
 if(!plan)return null;
 if(plan.questions.length)return plan.questions[0];
 if(plan.status==='RESEARCH_REQUIRED')return {key:'tax.researchRequired',text:'Tax residence/source classification needs governed legal research from your confirmed facts. No legal conclusion is requested from you.',authority:'CANDIDATE_ONLY',researchGaps:plan.researchGaps??[]};
 if(['CONFLICT','CONTEXT_REVIEW_REQUIRED','PROFILE_REVISION_CHANGED'].includes(plan.status))return {key:'tax.contextReview',text:'The tax context changed or contains conflicting facts. Review it before continuing.',authority:'CANDIDATE_ONLY'};
 return null;
}
function acceptTaxFactCandidates({registry,request,snapshot,answers,userText,profileRevision}){
 const plan=planTaxReadiness({registry,request,snapshot,profileRevision});
 if(['CONFLICT','CONTEXT_REVIEW_REQUIRED','PROFILE_REVISION_CHANGED'].includes(plan.status)||!Array.isArray(answers)||answers.length>40)throw Error('Current non-conflicting tax context and bounded candidate answers required');
 const next=new Map(snapshot.facts.map(f=>[f.name,f])),seen=new Set();
 for(const answer of answers){
  if(!answer||Object.keys(answer).some(k=>!['name','type','value','supportingQuote','operation','status'].includes(k))||!plan.declarations[answer.name]||answer.type!==plan.declarations[answer.name]||seen.has(answer.name)||answer.status&&answer.status!=='CANDIDATE'||!verifyQuote(answer.supportingQuote,userText)||answer.operation&&!['SET','REPLACE','REMOVE'].includes(answer.operation))throw Error('Only declared, typed, current-message evidenced tax candidates are accepted');
  seen.add(answer.name);
  if(answer.operation==='REMOVE')next.delete(answer.name);else next.set(answer.name,{name:answer.name,type:answer.type,value:answer.value,evidenceReference:answer.supportingQuote});
 }
 // A tax answer invalidates the entire earlier confirmation, including answers
 // previously confirmed. Profile revision is tracked independently of fact changes.
 return candidateTaxFacts({...snapshot,revision:profileRevision,facts:[...next.values()]});
}
function taxReadinessProposal({registry,request,snapshot,profileState}){
 const plan=planTaxReadiness({registry,request,snapshot,profileRevision:profileState.revision});
 if(plan.requiredMissingFacts.length||['CONFLICT','CONTEXT_REVIEW_REQUIRED','PROFILE_REVISION_CHANGED','OUT_OF_PERIOD','MISSING_APPROVED_RULE'].includes(plan.status))throw Error('Complete current candidate facts required before a tax review proposal');
 const data={request,snapshotHash:snapshot.snapshotHash,profileRevision:profileState.revision,profileFingerprint:fingerprint({slots:profileState.slots,jurisdictionFacts:profileState.jurisdictionFacts}),requirementsHash:plan.requirementsHash,stage:plan.status,authority:'CANDIDATE_ONLY',taxReady:false};
 return deepFreeze({...data,proposalHash:fingerprint(data)});
}
function isTaxProposalCurrent(proposal,context){
 try{return proposal.proposalHash===taxReadinessProposal(context).proposalHash;}catch{return false;}
}
module.exports={planTaxReadiness,taxQuestion,acceptTaxFactCandidates,taxReadinessProposal,isTaxProposalCurrent,detectResearchSignal,discoverResearchNeed,legalClassificationGap};
