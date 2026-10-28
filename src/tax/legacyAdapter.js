'use strict';
const {Money}=require('../domain/money');
const {fingerprint}=require('../onboarding/canonical');
const {referenceCandidate}=require('./referenceCandidates');
const {TaxContentRegistry}=require('./contentRegistry');
const {candidateTaxFacts,confirmTaxFacts}=require('./facts');
function ruleMatches(rule,view){
 if(rule.condition==null)return true;if(!Array.isArray(rule.condition.all))throw Error('Condition must contain all');
 return rule.condition.all.every(a=>{if(!['jurisdiction','currency','category','kind'].includes(a.field)||!['eq','neq'].includes(a.op))throw Error('Condition field/op not allowed');const same=(view[a.field]??null)===a.value;return a.op==='eq'?same:!same;});
}
function legacyDetermineTax(view,pack,Engine){
 if(!(view?.total instanceof Money)||!pack?.manifest||!Array.isArray(pack.rules))throw Error('Money transaction view and loaded pack required');
 const findings=[],totals=[];for(const rule of pack.rules.filter(r=>ruleMatches(r,view))){
  if(rule.placeholder){findings.push({ruleId:rule.id,category:rule.category,status:'PLACEHOLDER',amount:null,note:rule.note});continue;}
  // Legacy ungoverned rate/exemption actions can never become production tax law.
  const testOnly=Boolean(process.env.NODE_TEST_CONTEXT||process.env.NODE_ENV==='test')&&rule.source==='TEST-FIXTURE'&&pack.manifest.id==='test-pack';
  if(!testOnly){findings.push({ruleId:rule.id,category:rule.category,status:'REVIEW_REQUIRED',amount:null,note:'Legacy action has no approved executable Fabric version'});continue;}
  if(!['rate','exempt'].includes(rule.action?.kind))throw Error('Unsupported legacy test action');
  const evidenceRefs=[{evidenceId:'TEST_ONLY_LEGACY',rawContentHash:fingerprint(pack),sourceUrl:'test-only:legacy-fixture',locator:rule.id,sourceKind:'TEST_ONLY'}];
  const content={packId:'TEST_LEGACY',version:1,jurisdictionCode:view.jurisdiction,currency:view.currency,effectiveFrom:pack.manifest.validFrom,effectiveTo:pack.manifest.validTo,evidenceRefs,testOnly:true,label:'TEST ONLY compatibility fixture',rules:[{ruleId:'TEST_RATE',taxType:'VAT',subjectTypes:['COMPANY'],incomeOrEventType:view.kind,requiredFacts:{AMOUNT:'MONEY'},applicabilityPredicate:{op:'LITERAL',valueType:'BOOLEAN',value:true},taxBaseFormula:{op:'INPUT',name:'AMOUNT'},rateDefinition:{kind:'FORMULA_DERIVED'},amountFormula:rule.action.kind==='exempt'?{op:'LITERAL',valueType:'NUMBER',value:'0'}:{op:'MULTIPLY',args:[{op:'INPUT',name:'TAX_BASE'},{op:'LITERAL',valueType:'NUMBER',value:{numerator:String(rule.action.perMille),denominator:'1000'}}]},parameters:{},finalRounding:{mode:pack.manifest.rounding.mode,precision:view.total.decimals},effectiveFrom:pack.manifest.validFrom,effectiveTo:pack.manifest.validTo,evidenceRefs,treatyRelevant:false}]};
  const candidate=referenceCandidate('COUNTRY_PACK',content,evidenceRefs),registry=new TaxContentRegistry({allowTestPacks:true});registry.register(candidate);registry.governance.review(candidate.candidateId,{decisionSource:'HUMAN',actor:'Test reviewer',decision:'APPROVED',reason:'TEST ONLY simulation',reviewedHashes:evidenceRefs.map(e=>e.rawContentHash)});
  const period={periodStart:content.effectiveFrom,periodEnd:content.effectiveTo},request={scopeId:'test-only-legacy',subjectId:'fixture',requestKey:rule.id,taxType:'VAT',jurisdictionCode:view.jurisdiction,jurisdictionBasis:'REGISTRATION',incomeOrEventType:view.kind,currency:view.currency,period,economicDate:period.periodStart};
  const facts=candidateTaxFacts({...request,revision:1,facts:[{name:'SUBJECT_TYPE',type:'STRING',value:'COMPANY',evidenceReference:'TEST ONLY'},{name:'REGISTRATION',type:'COUNTRY',value:view.jurisdiction,evidenceReference:'TEST ONLY'},{name:'INCOME_TYPE',type:'STRING',value:view.kind,evidenceReference:'TEST ONLY'},{name:'AMOUNT',type:'MONEY',value:view.total.toJSON(),evidenceReference:'TEST ONLY'}]});
  const confirmed=confirmTaxFacts(facts,{decisionSource:'HUMAN',actor:'Test reviewer',reviewedSnapshotHash:facts.snapshotHash}),result=new Engine({registry}).determine(request,confirmed);if(result.status!=='CALCULATED')throw Error('Legacy TEST ONLY fixture failed: '+JSON.stringify(result));
  const amount=Money.fromMinor(result.taxAmount.amountMinor,view.currency);totals.push(amount);findings.push({ruleId:rule.id,category:rule.category,status:'FINAL',amount,source:rule.source,testOnly:true,determinationId:result.determinationId});
 }
 const finalTotal=totals.reduce((a,b)=>a.add(b),Money.zero(view.currency));
 return {findings,finalTotal,hasPlaceholder:findings.some(f=>f.status==='PLACEHOLDER'),status:findings.length&&findings.every(f=>f.status==='FINAL')?'CALCULATED':'REVIEW_REQUIRED',testOnly:totals.length>0,authoritativeTaxAmount:null,bookkeepingDeltaOnly:!totals.length};
}
module.exports={legacyDetermineTax,ruleMatches};
