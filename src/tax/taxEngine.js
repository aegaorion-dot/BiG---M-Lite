'use strict';
// One jurisdiction-neutral executor. Legal content and rates live only in governed data.
const {fingerprint,deepFreeze}=require('../onboarding/canonical');
const {assertJsonData,fromMoney,toMoney,encoded,evaluateAst,typedInputs:inputsFor,typedParameters:parametersFor}=require('./dsl');
const {TYPES,TREATY_TAX_TYPES,BASIS,validateCalculationRequest}=require('./contracts');
const {inspectFacts}=require('./facts');
const {TaxContentRegistry,resolveDomestic,packKey}=require('./contentRegistry');
const {FabricGovernanceStore}=require('../fabric/governanceStore');
const {resolveTreaty}=require('./treatyResolver');
const {TaxDeterminationStore,verifyDetermination}=require('./determinationStore');
const ENGINE_VERSION='universal-lite-tax/1';
function publicTreaty(result){if(!result)return null;const {selection,...publicPart}=result;return publicPart;}
class UniversalTaxEngine{
 constructor({registry=new TaxContentRegistry(),determinations=new TaxDeterminationStore()}={}){this.registry=registry;this.determinations=determinations;}
 determine(request,inputFacts){
  validateCalculationRequest(request);assertJsonData(inputFacts);
  if(!request.scopeId||!request.subjectId||typeof request.requestKey!=='string'||!request.requestKey.trim()||request.requestKey.length>160)throw Error('Scoped calculation request key required');
  const requestHash=fingerprint({request,inputFacts}),idempotencyScope=fingerprint({scopeId:request.scopeId,subjectId:request.subjectId,requestKey:request.requestKey});
  const cached=this.determinations.find(idempotencyScope,requestHash);if(cached){if(cached.testOnly&&!this.registry.allowTestPacks)throw Error('TEST ONLY determination disabled in production');return cached;}
  const result=this._calculate(request,inputFacts),executionSnapshots=this.registry.snapshot(),record={...result,testOnly:executionSnapshots.some(c=>c.executableContent?.testOnly),determinationId:fingerprint({engine:ENGINE_VERSION,idempotencyScope,requestHash}),engineVersion:ENGINE_VERSION,scopeId:request.scopeId,subjectId:request.subjectId,requestHash,idempotencyScope,request:JSON.parse(JSON.stringify(request)),inputFacts:JSON.parse(JSON.stringify(inputFacts)),executionSnapshots,createdAt:new Date().toISOString()};
  record.calculationHash=fingerprint(result);record.integrityHash=fingerprint(record);return this.determinations.save(deepFreeze(record));
 }
 _calculate(request,snapshot){
  const trace=[],base={status:'REVIEW_REQUIRED',reason:null,taxReady:false,taxType:request.taxType,jurisdictionCode:request.jurisdictionCode??null,period:request.period??null,economicDate:request.economicDate??null,currency:request.currency??null,appliedRules:[],taxableBase:null,rate:null,taxAmount:null,reliefs:[],withholding:null,treatyResult:null,evidenceRefs:[],packId:null,packVersion:null,domesticCandidate:null,requiredMissingFacts:[],calculationTrace:trace,postingPerformed:false};
  const finish=(status,reason,extra={})=>({...base,status,reason,...extra});
  if(!TYPES.includes(request.taxType))return finish('UNSUPPORTED_TAX_TYPE','TAX_TYPE_OUTSIDE_LITE_CAPABILITIES');
  const inspected=inspectFacts(snapshot);if(inspected.status!=='CONFIRMED')return finish(inspected.status,inspected.reason);
  if(snapshot.scopeId!==request.scopeId||snapshot.subjectId!==request.subjectId||snapshot.economicDate!==request.economicDate||snapshot.currency!==request.currency||fingerprint(snapshot.period)!==fingerprint(request.period))return finish('REVIEW_REQUIRED','FACT_SCOPE_PERIOD_DATE_OR_CURRENCY_MISMATCH');
  const facts=inspected.facts,subject=facts.get('SUBJECT_TYPE'),income=facts.get('INCOME_TYPE'),jurisdiction=facts.get(request.jurisdictionBasis);
  const missing=['SUBJECT_TYPE','INCOME_TYPE'].filter(k=>!facts.has(k));if(!BASIS.includes(request.jurisdictionBasis)||!jurisdiction)missing.push(BASIS.includes(request.jurisdictionBasis)?request.jurisdictionBasis:'EXPLICIT_TAX_JURISDICTION_BASIS');
  if(missing.length)return finish('MISSING_REQUIRED_FACT','CONFIRMED_SEMANTIC_TAX_FACTS_REQUIRED',{requiredMissingFacts:missing});
  if(subject.type!=='STRING'||income.type!=='STRING'||jurisdiction.type!=='COUNTRY'||jurisdiction.value!==request.jurisdictionCode||income.value!==request.incomeOrEventType)return finish('REVIEW_REQUIRED','SEMANTIC_TAX_CONTEXT_MISMATCH');
  const resolution=resolveDomestic({registry:this.registry,...request,subjectType:subject.value});
  if(resolution.status!=='RESOLVED'){
   if(TREATY_TAX_TYPES.includes(request.taxType))base.treatyResult=publicTreaty(resolveTreaty({registry:this.registry,facts,taxType:request.taxType,incomeOrEventType:request.incomeOrEventType,period:request.period,economicDate:request.economicDate,currency:request.currency,trace}));
   return finish(resolution.status,resolution.status,{domesticResolution:{status:resolution.status,candidates:resolution.candidates}});
  }
  const matched=[],missingInputs=new Set();
  try{
   for(const binding of resolution.rules){
    const {rule,pack}=binding;if(pack.currency!==request.currency)return finish('REVIEW_REQUIRED','CURRENCY_MISMATCH_NO_IMPLICIT_FX');
    for(const name of rule.requiredTrueFacts??[]){if(!facts.has(name))return finish('MISSING_REQUIRED_FACT','REQUIRED_REVIEW_EVIDENCE_MISSING',{requiredMissingFacts:[name]});if(facts.get(name).value!==true)return finish('REVIEW_REQUIRED','REQUIRED_EVIDENCE_NOT_APPROVED');}
    const inputs=inputsFor(rule.requiredFacts,facts,request.currency),parameters=parametersFor(rule);
    try{if(evaluateAst(rule.applicabilityPredicate,{inputs,parameters,trace,label:binding.key+':applicability'}))matched.push({...binding,inputs,parameters});}
    catch(e){if(e.missingFact)missingInputs.add(e.missingFact);else throw e;}
   }
   if(missingInputs.size)return finish('MISSING_REQUIRED_FACT','APPLICABILITY_FACTS_REQUIRED',{requiredMissingFacts:[...missingInputs].sort()});
   if(matched.length>1)return finish('CONFLICT','OVERLAPPING_APPROVED_RULE_OUTPUTS');
   if(!matched.length)return finish('NOT_APPLICABLE','APPROVED_PREDICATES_FALSE');
   const selected=matched[0],{rule,pack,inputs,parameters,candidate}=selected;
   const missingFacts=Object.keys(rule.requiredFacts).filter(k=>!facts.has(k));if(missingFacts.length)return finish('MISSING_REQUIRED_FACT','RULE_FACTS_REQUIRED',{requiredMissingFacts:missingFacts});
   const taxableBase=evaluateAst(rule.taxBaseFormula,{inputs,parameters,trace,label:selected.key+':base'});
   const amount=evaluateAst(rule.amountFormula,{inputs:{...inputs,TAX_BASE:taxableBase},parameters,trace,label:selected.key+':amount'});
   if(taxableBase.n<0n||amount.n<0n)return finish('REVIEW_REQUIRED','NEGATIVE_TAX_OUTPUT_REQUIRES_REVIEW');
   const domestic=toMoney(amount,request.currency,rule.finalRounding),baseMoney=toMoney(taxableBase,request.currency,rule.finalRounding);
   const rate=rule.rateDefinition.kind==='EXPRESSION'?encoded(evaluateAst(rule.rateDefinition.expression,{inputs:{...inputs,TAX_BASE:taxableBase},parameters,trace,label:selected.key+':rate'})):{kind:'FORMULA_DERIVED',parameters:rule.parameters};
   Object.assign(base,{packId:pack.packId,packVersion:pack.version,appliedRules:[{ruleId:rule.ruleId,packId:pack.packId,packVersion:pack.version,candidateId:candidate.candidateId,contentHash:candidate.contentHash,governanceStatus:'APPROVED'}],evidenceRefs:[...rule.evidenceRefs],domesticCandidate:{status:'DOMESTIC_CANDIDATE',taxableBase:baseMoney.toJSON(),taxAmount:domestic.toJSON(),rate}});
   let final=domestic;
   if(rule.treatyRelevant||TREATY_TAX_TYPES.includes(request.taxType)){
    const treaty=resolveTreaty({registry:this.registry,facts,taxType:request.taxType,incomeOrEventType:request.incomeOrEventType,period:request.period,economicDate:request.economicDate,currency:request.currency,trace});base.treatyResult=publicTreaty(treaty);
    if(!['NOT_NEEDED','APPLICABLE'].includes(treaty.status))return finish(treaty.status==='CONFLICT'?'CONFLICT':treaty.status==='OUT_OF_PERIOD'?'OUT_OF_PERIOD':'REVIEW_REQUIRED',treaty.reason==='TREATY_ELIGIBILITY_NOT_ESTABLISHED'?treaty.reason:'TREATY_REVIEW_REQUIRED',{requiredMissingFacts:treaty.requiredMissingFacts});
    if(treaty.status==='APPLICABLE'){
     const {pack:tp,article,candidate:tc}=treaty.selection,declared={...tp.requiredFacts,...article.requiredFacts},treatyInputs={...inputsFor(declared,facts,request.currency),TAX_BASE:taxableBase,DOMESTIC_TAX:fromMoney(domestic.toJSON(),request.currency)},treatyParameters=parametersFor(article);
     for(const effect of article.effects){
      if(effect.currency!==request.currency)return finish('REVIEW_REQUIRED','TREATY_CURRENCY_MISMATCH');
      const result=evaluateAst(effect.amountFormula,{inputs:{...treatyInputs,DOMESTIC_TAX:fromMoney(final.toJSON(),request.currency)},parameters:treatyParameters,trace,label:packKey(tp)+':'+effect.kind});
      const prior=fromMoney(final.toJSON(),request.currency);if(result.n<0n||result.n*prior.d>prior.n*result.d)return finish('REVIEW_REQUIRED','TREATY_MUST_NOT_CREATE_OR_INCREASE_DOMESTIC_LIABILITY');
      const adjusted=toMoney(result,request.currency,effect.finalRounding);if(adjusted.amountMinor<0n||adjusted.amountMinor>final.amountMinor)return finish('REVIEW_REQUIRED','TREATY_MUST_NOT_CREATE_OR_INCREASE_DOMESTIC_LIABILITY');
      base.reliefs.push({kind:effect.kind,before:final.toJSON(),after:adjusted.toJSON(),articleId:article.articleId});final=adjusted;
     }
     base.appliedRules.push({ruleId:article.articleId,treatyPackId:tp.treatyPackId,packVersion:tp.version,candidateId:tc.candidateId,contentHash:tc.contentHash,governanceStatus:'APPROVED'});base.evidenceRefs.push(...article.evidenceRefs);
    }
   }
   return finish('CALCULATED','APPROVED_GOVERNED_RULE_EXECUTED',{taxReady:true,taxableBase:baseMoney.toJSON(),rate,taxAmount:final.toJSON(),withholding:request.taxType==='WHT'?{amount:final.toJSON(),domesticAmount:domestic.toJSON()}:null});
  }catch(e){return finish(e.missingFact?'MISSING_REQUIRED_FACT':'REVIEW_REQUIRED',e.missingFact?'MISSING_REQUIRED_FACT':'CALCULATION_REQUIRES_REVIEW',{requiredMissingFacts:e.missingFact?[e.missingFact]:[],calculationError:e.message});}
 }
 replay(record){
  verifyDetermination(record);if(record.engineVersion!==ENGINE_VERSION)throw Error('Historical engine version unsupported');
  if(record.testOnly&&!this.registry.allowTestPacks)throw Error('TEST ONLY replay disabled in production');
  const governance=new FabricGovernanceStore();for(const c of record.executionSnapshots)governance.candidates.set(c.candidateId,deepFreeze(JSON.parse(JSON.stringify(c))));
  const historical=new UniversalTaxEngine({registry:new TaxContentRegistry({governanceStore:governance,allowTestPacks:this.registry.allowTestPacks})}),result=historical._calculate(record.request,record.inputFacts),actualHash=fingerprint(result);
  return deepFreeze({historicalReplay:true,authoritativeNewDetermination:false,matches:actualHash===record.calculationHash,expectedHash:record.calculationHash,actualHash,result});
 }
}
// Compatibility presentation delegates executable work to the same engine.
function determineTax(view,pack){return require('./legacyAdapter').legacyDetermineTax(view,pack,UniversalTaxEngine);}
function ruleMatches(rule,view){return require('./legacyAdapter').ruleMatches(rule,view);}
module.exports={UniversalTaxEngine,ENGINE_VERSION,determineTax,ruleMatches,CONDITION_FIELDS:['jurisdiction','currency','category','kind'],CONDITION_OPS:['eq','neq']};
