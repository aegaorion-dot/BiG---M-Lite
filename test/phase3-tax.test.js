'use strict';
const {it}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {Money}=require('../src/domain/money');
const {fingerprint}=require('../src/onboarding/canonical');
const {UniversalTaxEngine,createTaxSystem,candidateTaxFacts,confirmTaxFacts,profileTaxFactCandidates,TaxContentRegistry,TaxDeterminationStore,accountingReviewPlan}=require('../src/tax');
const {validateAst,evaluateAst,decimal,toMoney}=require('../src/tax/dsl');
const {validateCountryPack}=require('../src/tax/contracts');
const {originalCompanyCandidate,idSgResearchCandidate,referenceCandidate}=require('../src/tax/referenceCandidates');
const {FabricGovernanceStore}=require('../src/fabric/governanceStore');
const {executableApproval}=require('../src/fabric/candidates');
const {createActiveStore}=require('./workspace-fixture');
const input=name=>({op:'INPUT',name}),literal=(value,valueType='NUMBER')=>({op:'LITERAL',valueType,value}),op=(name,...args)=>({op:name,args});
function fixture({country='ID',currency='IDR',packId='TEST_DOMESTIC',version=1,from='2025-01-01',to='2025-12-31',rate='0.137',taxType='INCOME_TAX',treatyRelevant=true,...extra}={}){
 const evidenceRefs=[{evidenceId:'TEST_ONLY_EVIDENCE',rawContentHash:fingerprint({country,packId,version,rate}),sourceUrl:'test-only:fictional-tax-content',locator:'TEST ONLY - not law',sourceKind:'TEST_ONLY'}];
 return {packId,version,jurisdictionCode:country,currency,effectiveFrom:from,effectiveTo:to,evidenceRefs,testOnly:true,label:'TEST ONLY: invented arithmetic, no legal claim',...extra,rules:[{ruleId:'TEST_RULE',taxType,subjectTypes:['INDIVIDUAL','COMPANY'],incomeOrEventType:'BUSINESS_INCOME',requiredFacts:{AMOUNT:'MONEY'},applicabilityPredicate:literal(true,'BOOLEAN'),taxBaseFormula:input('AMOUNT'),rateDefinition:{kind:'EXPRESSION',expression:{op:'PARAMETER',code:'TEST_RATE'}},amountFormula:op('MULTIPLY',input('TAX_BASE'),{op:'PARAMETER',code:'TEST_RATE'}),parameters:{TEST_RATE:{valueType:'NUMBER',value:rate}},finalRounding:{mode:'HALF_UP',precision:currency==='IDR'?0:2},effectiveFrom:from,effectiveTo:to,evidenceRefs,treatyRelevant}]};
}
function treatyFixture({version=1,from='2025-01-01',to='2025-12-31',currency='IDR',taxType='INCOME_TAX',id='TEST_ID_SG',effects=null,...extra}={}){
 const evidenceRefs=[{evidenceId:'TEST_ONLY_TREATY',rawContentHash:fingerprint({version,id}),sourceUrl:'test-only:fictional-treaty',locator:'TEST ONLY invented limitation',sourceKind:'TEST_ONLY'}];
 return {treatyPackId:id,treatyCode:'TEST_ID_SG',jurisdictionA:'ID',jurisdictionB:'SG',version,effectiveFrom:from,effectiveTo:to,coveredTaxes:[taxType],residenceRules:[],sourceRules:[],incomeArticles:[{articleId:'TEST_ARTICLE',incomeOrEventType:'BUSINESS_INCOME',requiredFacts:{BENEFICIAL_OWNER:'BOOLEAN',PE_PRESENT:'BOOLEAN',ELIGIBILITY_REVIEWED:'BOOLEAN',FOREIGN_TAX_PAID:'MONEY'},eligibilityPredicate:op('AND',input('BENEFICIAL_OWNER'),op('NOT',input('PE_PRESENT')),input('ELIGIBILITY_REVIEWED')),parameters:{TEST_CAP:{valueType:'NUMBER',value:'0.037'}},effects:effects??[{kind:'WITHHOLDING_LIMIT',currency,amountFormula:op('MIN',input('DOMESTIC_TAX'),op('MULTIPLY',input('TAX_BASE'),{op:'PARAMETER',code:'TEST_CAP'})),finalRounding:{mode:'HALF_UP',precision:currency==='IDR'?0:2}}],evidenceRefs}],permanentEstablishmentRules:[],withholdingLimits:['TEST_ARTICLE'],reliefMethods:[],requiredFacts:{TAX_RESIDENCE:'COUNTRY',SOURCE:'COUNTRY'},evidenceRefs,testOnly:true,coverageStatus:'COMPLETE_SUBSET',label:'TEST ONLY: no treaty law',...extra};
}
function add(registry,content,kind='COUNTRY_PACK',{approve=true}={}){
 const candidate=referenceCandidate(kind,content,content.evidenceRefs);registry.register(candidate);if(approve)approveCandidate(registry,candidate);return candidate;
}
function approveCandidate(registry,candidate){return registry.governance.review(candidate.candidateId,{decisionSource:'HUMAN',actor:'Test human reviewer',decision:'APPROVED',reason:'TEST ONLY controlled approval simulation; not actual legal approval',reviewedHashes:[...new Set(candidate.provenance.map(p=>p.rawContentHash))]});}
function request(options={}){return {scopeId:'org-test-tax',subjectId:'subject-1',requestKey:'request-1',taxType:'INCOME_TAX',jurisdictionCode:'ID',jurisdictionBasis:'TAX_RESIDENCE',incomeOrEventType:'BUSINESS_INCOME',currency:'IDR',period:{periodStart:'2025-01-01',periodEnd:'2025-12-31'},economicDate:'2025-06-01',...options};}
function facts(req,{values={},remove=[],subjectType='INDIVIDUAL',confirmed=true,revision=1}={}){
 const defaults={SUBJECT_TYPE:['STRING',subjectType],INCOME_TYPE:['STRING',req.incomeOrEventType],TAX_RESIDENCE:['COUNTRY',req.jurisdictionCode],REGISTRATION:['COUNTRY',req.jurisdictionCode],SOURCE:['COUNTRY',req.jurisdictionCode],AMOUNT:['MONEY',{amountMinor:req.currency==='IDR'?'1000000':'10000',currency:req.currency}],...values};
 const data=candidateTaxFacts({...req,revision,facts:Object.entries(defaults).filter(([name])=>!remove.includes(name)).map(([name,[type,value]])=>({name,type,value,evidenceReference:'TEST ONLY stipulated dossier: '+name}))});
 return confirmed?confirmTaxFacts(data,{decisionSource:'HUMAN',actor:'Test human',reviewedSnapshotHash:data.snapshotHash}):data;
}
function system(contents=[fixture()]){const registry=new TaxContentRegistry({allowTestPacks:true});for(const p of contents)add(registry,p);return {registry,engine:new UniversalTaxEngine({registry})};}
function temporary(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bigm-tax-'));t.after(()=>{if(path.dirname(dir)!==os.tmpdir())throw Error('Unsafe cleanup');fs.rmSync(dir,{recursive:true,force:true});});return dir;}
it('Phase 3: exactly one neutral tax executor; no network, generated-code execution or country branches',()=>{
 const files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(p.endsWith('.js'))files.push(p);}}walk(path.join(__dirname,'../src'));
 assert.equal(files.filter(p=>/class\s+(?:UniversalTaxEngine|TaxEngine)\b/.test(fs.readFileSync(p,'utf8'))).length,1);
 for(const p of files.filter(p=>p.includes(path.sep+'tax'+path.sep))){const text=fs.readFileSync(p,'utf8');assert.doesNotMatch(text,/\beval\s*\(|new\s+Function\s*\(|\bfetch\s*\(/,p);}
 assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../src/tax/taxEngine.js'),'utf8'),/['"](?:ID|SG|AU|US|GB)['"]/);
});
it('AST validates references/types/arity/budgets and rejects arbitrary code and unsafe properties',()=>{
 assert.equal(validateAst(op('ADD',input('AMOUNT'),literal('2')),{inputs:{AMOUNT:'NUMBER'},expected:'NUMBER'}),'NUMBER');
 for(const ast of [{op:'EVAL',code:'process.exit()'},op('ADD',literal(true,'BOOLEAN'),literal('1')),{op:'INPUT',name:'CONSTRUCTOR'},{op:'INPUT',name:'AMOUNT',code:'run()'},JSON.parse('{"op":"LITERAL","valueType":"NUMBER","value":"1","__proto__":{}}'),literal(0.22),{op:'ROUND',args:[literal('1.1')],rule:{mode:'MAGIC',precision:0}}])assert.throws(()=>validateAst(ast,{inputs:{AMOUNT:'NUMBER'}}));
 let deep=literal('1');for(let i=0;i<40;i++)deep=op('ADD',deep,literal('1'));assert.throws(()=>validateAst(deep),/bounded|limit/);
 const malicious=fixture();malicious.rules[0].amountFormula={op:'Function',args:[]};assert.throws(()=>validateCountryPack(malicious),/not allowed/);
});
it('exact rational arithmetic, lazy IF/AND/OR and explicit Money rounding remain deterministic',()=>{
 const expr=op('IF',literal(true,'BOOLEAN'),op('MULTIPLY',literal('0.1'),literal('0.2')),op('DIVIDE',literal('1'),literal('0')));validateAst(expr);
 const trace=[];const result=evaluateAst(expr,{inputs:{},trace});assert.deepEqual(result,{n:1n,d:50n});assert.equal(toMoney(result,'SGD',{mode:'HALF_UP',precision:2}).amountMinor,2n);
 assert.equal(toMoney(decimal('1.005'),'SGD',{mode:'HALF_UP',precision:2}).amountMinor,101n);assert.equal(toMoney(decimal('1.005'),'SGD',{mode:'DOWN',precision:2}).amountMinor,100n);assert.throws(()=>toMoney(result,'SGD',null),/rounding/);
 for(const [kind,first,expected]of [['AND',false,false],['OR',true,true]]){const lazy=op(kind,literal(first,'BOOLEAN'),op('GT',op('DIVIDE',literal('1'),literal('0')),literal('0')));validateAst(lazy);assert.equal(evaluateAst(lazy,{inputs:{}}),expected);}
});
it('domestic TEST ONLY freelancer calculation returns Money, explicit rate and auditable trace',()=>{
 const {engine}=system(),req=request(),result=engine.determine(req,facts(req));assert.equal(result.status,'CALCULATED');assert.equal(result.taxAmount.amountMinor,'137000');assert.equal(result.rate.numerator,'137');assert.equal(result.rate.denominator,'1000');assert.equal(result.treatyResult.status,'NOT_NEEDED');assert.ok(result.calculationTrace.some(t=>t.op==='MULTIPLY'));assert.equal(result.postingPerformed,false);assert.equal(engine.replay(result).matches,true);
});
it('a second approved test CountryPack executes in the same engine with no core changes',()=>{
 const {engine}=system([fixture(),fixture({country:'SG',currency:'SGD',packId:'TEST_SECOND'})]);
 for(const [country,currency,expected]of [['ID','IDR','137000'],['SG','SGD','1370']]){const req=request({jurisdictionCode:country,currency,requestKey:country}),result=engine.determine(req,facts(req));assert.equal(result.status,'CALCULATED');assert.equal(result.taxAmount.amountMinor,expected);}
 assert.throws(()=>new TaxContentRegistry().register(referenceCandidate('COUNTRY_PACK',fixture(),fixture().evidenceRefs)),/TEST ONLY/);
 const disguised=fixture();disguised.testOnly=false;assert.throws(()=>validateCountryPack(disguised),/TEST ONLY/);
});
it('AI candidates, forged status, research-only approval and altered content cannot execute',()=>{
 const registry=new TaxContentRegistry({allowTestPacks:true}),candidate=add(registry,fixture(),'COUNTRY_PACK',{approve:false}),req=request();
 assert.equal(new UniversalTaxEngine({registry}).determine(req,facts(req)).status,'REVIEW_REQUIRED');
 assert.throws(()=>registry.governance.review(candidate.candidateId,{decisionSource:'AI',actor:'AI',decision:'APPROVED',reason:'self approve'}),/Human review/);
 assert.throws(()=>registry.register({...candidate,status:'APPROVED'}),/fresh/);
 const approved=approveCandidate(registry,candidate),tampered=JSON.parse(JSON.stringify(approved));tampered.executableContent.rules[0].parameters.TEST_RATE.value='0.99';assert.equal(Boolean(executableApproval(tampered)),false);
 const researchOnly={...approved,reviewHistory:approved.reviewHistory.map(({reviewedContentHash,...r})=>r)};assert.equal(Boolean(executableApproval(researchOnly)),false);
});
it('unconfirmed or changed facts cannot execute; exact human snapshot confirmation is mandatory',()=>{
 const {engine}=system(),req=request(),candidate=facts(req,{confirmed:false});assert.equal(engine.determine(req,candidate).status,'REVIEW_REQUIRED');
 assert.throws(()=>confirmTaxFacts(candidate,{decisionSource:'AI',actor:'Muse',reviewedSnapshotHash:candidate.snapshotHash}));
 const changed=JSON.parse(JSON.stringify(facts(req)));changed.facts[0].value='COMPANY';assert.equal(engine.determine({...req,requestKey:'changed'},changed).status,'REVIEW_REQUIRED');
});
it('required facts and scope are enforced without missing-to-zero/false conversion',()=>{
 const {engine}=system(),req=request();const result=engine.determine(req,facts(req,{remove:['AMOUNT']}));assert.equal(result.status,'MISSING_REQUIRED_FACT');assert.equal(result.taxAmount,null);
 const bad=engine.determine({...req,requestKey:'bad-scope',scopeId:'another-org'},facts(req));assert.equal(bad.status,'REVIEW_REQUIRED');
 const snapshot=facts(req),conflict=candidateTaxFacts({...snapshot,facts:[...snapshot.facts,{name:'TAX_RESIDENCE',type:'COUNTRY',value:'SG',evidenceReference:'Conflicting dossier'}]});const confirmed=confirmTaxFacts(conflict,{decisionSource:'HUMAN',actor:'Test human',reviewedSnapshotHash:conflict.snapshotHash});assert.equal(engine.determine({...req,requestKey:'conflict'},confirmed).status,'CONFLICT');
});
it('approved applicability false returns NOT_APPLICABLE, not a zero calculation',()=>{
 const pack=fixture();pack.rules[0].applicabilityPredicate=op('GT',input('AMOUNT'),literal('2000000'));const {engine}=system([pack]),req=request(),result=engine.determine(req,facts(req));assert.equal(result.status,'NOT_APPLICABLE');assert.equal(result.taxAmount,null);assert.equal(result.taxReady,false);assert.ok(!result.calculationTrace.some(t=>t.expression.endsWith(':amount')));
});
it('2025 rules never execute in 2026 and the entire period must fit',()=>{
 const {engine}=system();for(const period of [{periodStart:'2026-01-01',periodEnd:'2026-12-31'},{periodStart:'2025-12-01',periodEnd:'2026-01-31'}]){const req=request({period,economicDate:period.periodStart,requestKey:period.periodStart}),r=engine.determine(req,facts(req));assert.equal(r.status,'OUT_OF_PERIOD');assert.equal(r.taxAmount,null);assert.deepEqual(r.calculationTrace,[]);}
});
it('unsupported jurisdictions/rules and tax areas are explicit non-executable states',()=>{
 const {engine}=system();for(const country of ['AU','US','GB']){const req=request({jurisdictionCode:country,requestKey:country});assert.equal(engine.determine(req,facts(req)).status,'MISSING_APPROVED_RULE');}
 const req=request({taxType:'TRANSFER_PRICING'}),r=engine.determine(req,facts(req));assert.equal(r.status,'UNSUPPORTED_TAX_TYPE');assert.equal(r.taxAmount,null);
});
it('missing supersession, simultaneous versions and overlapping approved outputs fail closed',()=>{
 const p=fixture(),v2=fixture({version:2,rate:'0.9'}),{engine}=system([p,v2]),req=request();assert.equal(engine.determine(req,facts(req)).status,'CONFLICT');
 const other=fixture({packId:'TEST_OTHER'}),overlap=system([p,other]).engine.determine(req,facts(req));assert.equal(overlap.status,'CONFLICT');assert.ok(!overlap.calculationTrace.some(t=>t.expression.endsWith(':amount')));
 const unresolved=fixture({supersededBy:'UNKNOWN@2'}),r=system([unresolved]).engine.determine(req,facts(req));assert.equal(r.status,'REVIEW_REQUIRED');
});
it('explicit effective succession selects data versions and retiring a successor does not revive old law',()=>{
 const first=fixture(),second=fixture({version:2,from:'2025-07-01',supersedes:'TEST_DOMESTIC@1',rate:'0.2'}),{registry,engine}=system([first,second]);
 const early=request({period:{periodStart:'2025-01-01',periodEnd:'2025-06-30'}}),late=request({period:{periodStart:'2025-07-01',periodEnd:'2025-12-31'},economicDate:'2025-08-01',requestKey:'late'});
 assert.equal(engine.determine(early,facts(early)).packVersion,1);assert.equal(engine.determine(late,facts(late)).packVersion,2);
 const successor=registry.list('COUNTRY_PACK').find(c=>c.executableContent.version===2);registry.governance.review(successor.candidateId,{decisionSource:'HUMAN',actor:'Test reviewer',decision:'RETIRED',reason:'TEST ONLY retirement'});
 const again=engine.determine({...late,requestKey:'after-retirement'},facts(late));assert.equal(again.taxAmount,null);assert.notEqual(again.packVersion,1);
});
it('Original COMPANY 2025 content remains unapproved by default and never applies to an individual',()=>{
 const {engine,registry}=createTaxSystem(),req=request({taxType:'CIT',incomeOrEventType:'ANNUAL_COMPANY_INCOME'});
 assert.equal(registry.governance.approved('COUNTRY_PACK').length,0);assert.equal(engine.determine(req,facts(req)).status,'MISSING_APPROVED_RULE');
 const company=engine.determine({...req,requestKey:'company'},facts(req,{subjectType:'COMPANY'}));assert.equal(company.status,'REVIEW_REQUIRED');assert.equal(company.taxAmount,null);
});
it('Original 2025 formulas execute through the same AST after simulated review, retaining rounding and evidence',()=>{
 const registry=new TaxContentRegistry(),candidate=originalCompanyCandidate();registry.register(candidate);approveCandidate(registry,candidate);const engine=new UniversalTaxEngine({registry});
 for(const [turnover,expected]of [['4800000000','11000000'],['6000000000','13200000'],['7000000000','14457143'],['50000000001','22000000']]){
  const req=request({requestKey:turnover,taxType:'CIT',incomeOrEventType:'ANNUAL_COMPANY_INCOME'}),snapshot=facts(req,{subjectType:'COMPANY',values:{M3_TAXABLE_INCOME:['MONEY',{amountMinor:'100000123',currency:'IDR'}],ANNUAL_GROSS_TURNOVER:['MONEY',{amountMinor:turnover,currency:'IDR'}],CIT_RATE_TREATMENT:['STRING','GENERAL_OR_ARTICLE_31E'],M3_RECONCILIATION_APPROVED:['BOOLEAN',true],CIT_OBLIGATION_APPLICABLE:['BOOLEAN',true]}}),result=engine.determine(req,snapshot);
  assert.equal(result.status,'CALCULATED',JSON.stringify(result));assert.equal(result.taxableBase.amountMinor,'100000000');assert.equal(result.taxAmount.amountMinor,expected);assert.ok(result.evidenceRefs.every(e=>e.sourceKind==='PORTED_REFERENCE_NOT_NEW_LEGAL_CAPTURE'));assert.equal(engine.replay(result).matches,true);
  assert.equal(accountingReviewPlan(result,{scopeId:req.scopeId,subjectId:req.subjectId,currency:req.currency}).status,'ACCOUNT_MAPPING_REVIEW_REQUIRED');
 }
 const req=request({requestKey:'2026',taxType:'CIT',incomeOrEventType:'ANNUAL_COMPANY_INCOME',period:{periodStart:'2026-01-01',periodEnd:'2026-12-31'},economicDate:'2026-06-01'});assert.equal(engine.determine(req,facts(req,{subjectType:'COMPANY'})).status,'OUT_OF_PERIOD');
});
it('treaty missing/draft/effective-period/conflict conditions never finalize domestic candidate amounts',()=>{
 const req=request(),snapshot=facts(req,{values:{SOURCE:['COUNTRY','SG']}}),{registry,engine}=system();
 const missing=engine.determine(req,snapshot);assert.equal(missing.treatyResult.status,'MISSING_TREATY');assert.equal(missing.taxAmount,null);assert.equal(missing.domesticCandidate.taxAmount.amountMinor,'137000');
 const research=idSgResearchCandidate();registry.register(research);const reviewedDraft=approveCandidate(registry,research);assert.equal(reviewedDraft.runtimeExecutable,false);const draft=engine.determine({...req,requestKey:'draft'},snapshot);assert.equal(draft.reason,'TREATY_REVIEW_REQUIRED');assert.equal(draft.treatyResult.status,'REVIEW_REQUIRED');
 add(registry,treatyFixture(),'TREATY_PACK');const noFacts=engine.determine({...req,requestKey:'missing-facts'},snapshot);assert.equal(noFacts.treatyResult.status,'MISSING_FACT');assert.ok(noFacts.requiredMissingFacts.includes('PE_PRESENT'));
 const full=facts(req,{values:{SOURCE:['COUNTRY','SG'],BENEFICIAL_OWNER:['BOOLEAN',true],PE_PRESENT:['BOOLEAN',false],ELIGIBILITY_REVIEWED:['BOOLEAN',true],FOREIGN_TAX_PAID:['MONEY',{amountMinor:'20000',currency:'IDR'}]}});
 const calculated=engine.determine({...req,requestKey:'with-treaty'},full);assert.equal(calculated.status,'CALCULATED');assert.equal(calculated.taxAmount.amountMinor,'37000');assert.equal(calculated.appliedRules.length,2);
 add(registry,treatyFixture({id:'TEST_CONFLICTING_TREATY'}),'TREATY_PACK');const conflict=engine.determine({...req,requestKey:'treaty-conflict'},full);assert.equal(conflict.status,'CONFLICT');assert.equal(conflict.taxAmount,null);
});
it('out-of-period treaty and false eligibility remain unresolved',()=>{
 const req=request(),snapshot=facts(req,{values:{SOURCE:['COUNTRY','SG'],BENEFICIAL_OWNER:['BOOLEAN',true],PE_PRESENT:['BOOLEAN',true],ELIGIBILITY_REVIEWED:['BOOLEAN',true],FOREIGN_TAX_PAID:['MONEY',{amountMinor:'0',currency:'IDR'}]}}),s=system();add(s.registry,treatyFixture({from:'2024-01-01',to:'2024-12-31'}),'TREATY_PACK');
 assert.equal(s.engine.determine(req,snapshot).status,'OUT_OF_PERIOD');
 const current=system();add(current.registry,treatyFixture(),'TREATY_PACK');assert.equal(current.engine.determine(req,snapshot).reason,'TREATY_ELIGIBILITY_NOT_ESTABLISHED');
});
it('a domestic rule cannot bypass cross-border review by disabling its treaty hint',()=>{
 const {engine}=system([fixture({treatyRelevant:false})]),req=request(),r=engine.determine(req,facts(req,{values:{SOURCE:['COUNTRY','SG']}}));assert.equal(r.status,'REVIEW_REQUIRED');assert.equal(r.treatyResult.status,'MISSING_TREATY');assert.equal(r.taxAmount,null);
});
it('approved simple-regime and GST/sales-type fixtures use the same constrained operations',()=>{
 for(const taxType of ['SIMPLIFIED_INCOME','GST','SALES_TAX']){const pack=fixture({taxType,treatyRelevant:false});pack.rules[0].amountFormula=op('IF',op('LTE',input('TAX_BASE'),literal('500000')),literal('0'),op('MULTIPLY',op('SUBTRACT',input('TAX_BASE'),literal('500000')),{op:'PARAMETER',code:'TEST_RATE'}));const {engine}=system([pack]),req=request({taxType}),r=engine.determine(req,facts(req));assert.equal(r.status,'CALCULATED');assert.equal(r.taxAmount.amountMinor,'68500');}
});
it('governed foreign tax credit/exemption/allocation use the same DSL, without exceeding domestic liability',()=>{
 for(const [kind,formula,expected]of [['CREDIT',op('MAX',literal('0'),op('SUBTRACT',input('DOMESTIC_TAX'),op('MIN',input('FOREIGN_TAX_PAID'),input('DOMESTIC_TAX')))),'117000'],['EXEMPTION',literal('0'),'0'],['ALLOCATION',op('DIVIDE',input('DOMESTIC_TAX'),literal('2')),'68500']]){
  const {registry,engine}=system();add(registry,treatyFixture({effects:[{kind,amountFormula:formula,currency:'IDR',finalRounding:{mode:'HALF_UP',precision:0}}]}),'TREATY_PACK');const req=request(),r=engine.determine(req,facts(req,{values:{SOURCE:['COUNTRY','SG'],BENEFICIAL_OWNER:['BOOLEAN',true],PE_PRESENT:['BOOLEAN',false],ELIGIBILITY_REVIEWED:['BOOLEAN',true],FOREIGN_TAX_PAID:['MONEY',{amountMinor:'20000',currency:'IDR'}]}}));assert.equal(r.status,'CALCULATED');assert.equal(r.taxAmount.amountMinor,expected);
 }
});
it('withholding is limited only by an approved exact income article',()=>{
 const {registry,engine}=system([fixture({taxType:'WHT'})]);add(registry,treatyFixture({taxType:'WHT'}),'TREATY_PACK');const req=request({taxType:'WHT',jurisdictionBasis:'SOURCE'}),snapshot=facts(req,{values:{TAX_RESIDENCE:['COUNTRY','SG'],SOURCE:['COUNTRY','ID'],BENEFICIAL_OWNER:['BOOLEAN',true],PE_PRESENT:['BOOLEAN',false],ELIGIBILITY_REVIEWED:['BOOLEAN',true],FOREIGN_TAX_PAID:['MONEY',{amountMinor:'0',currency:'IDR'}]}}),r=engine.determine(req,snapshot);assert.equal(r.status,'CALCULATED');assert.equal(r.withholding.amount.amountMinor,'37000');assert.equal(r.withholding.domesticAmount.amountMinor,'137000');
});
it('nationality/customer/bank locations cannot establish registration, source or tax residence',()=>{
 const s=createActiveStore(),profile=s.onboardingState().profileState;const candidate=profileTaxFactCandidates(profile,{scopeId:'org',subjectId:'subject',period:{periodStart:'2025-01-01',periodEnd:'2025-12-31'},economicDate:'2025-06-01',currency:'IDR'});assert.equal(candidate.status,'CANDIDATE');assert.equal(candidate.confirmation,null);
 const {engine}=system(),req=request(),snapshot=facts(req,{remove:['TAX_RESIDENCE','REGISTRATION','SOURCE'],values:{NATIONALITY:['COUNTRY','AU'],CUSTOMER_LOCATION:['COUNTRY','SG'],ACCOUNT_LOCATION:['COUNTRY','SG']}});const r=engine.determine(req,snapshot);assert.equal(r.status,'MISSING_REQUIRED_FACT');assert.ok(r.requiredMissingFacts.includes('TAX_RESIDENCE'));
 const expat=facts(req,{values:{NATIONALITY:['COUNTRY','AU'],REGISTRATION:['COUNTRY','ID'],BUSINESS_WORK_LOCATION:['COUNTRY','ID']}});assert.equal(engine.determine({...req,requestKey:'expat'},expat).jurisdictionCode,'ID');
 const missingSource=facts(req,{remove:['SOURCE'],values:{CUSTOMER_LOCATION:['COUNTRY','US']}});assert.equal(engine.determine({...req,requestKey:'foreign-customer'},missingSource).treatyResult.status,'MISSING_FACT');
});
it('bookkeeping remains ready while 2026 tax is out of period; accounting has a review-only boundary',async()=>{
 const s=createActiveStore(),req=request({period:{periodStart:'2026-01-01',periodEnd:'2026-12-31'},economicDate:'2026-06-01'}),{engine}=system(),r=engine.determine(req,facts(req));assert.equal(s.onboardingReadiness().workspaceReady,true);assert.equal(r.taxReady,false);
 const before=s.ctx.ledger.size;assert.equal(accountingReviewPlan(r,{scopeId:req.scopeId,subjectId:req.subjectId,currency:req.currency}).status,'BLOCKED');assert.equal(s.ctx.ledger.size,before);
 const okReq=request({requestKey:'supported-2025'}),calculated=engine.determine(okReq,facts(okReq)),plan=accountingReviewPlan(calculated,{scopeId:okReq.scopeId,subjectId:okReq.subjectId,currency:okReq.currency});assert.equal(plan.reason,'TEST_ONLY_DETERMINATION');assert.equal(plan.postingPerformed,false);assert.equal(s.ctx.ledger.size,before);
 await s.createSale({id:'phase3-income',orgId:s.ctx.org.id,date:'2026-08-01',jurisdiction:'ID',currency:'IDR',customer:'Client',invoiceRef:'P3',description:'Income',amountMajor:'100'});assert.equal(s.ctx.ledger.size,before+1);
});
it('trace and idempotency are deterministic; changed facts with the same request key conflict',()=>{
 const {engine}=system(),req=request(),snapshot=facts(req),first=engine.determine(req,snapshot),repeated=engine.determine(req,snapshot);assert.equal(first,repeated);assert.equal(engine.determinations.records.size,1);
 const other=system().engine.determine(req,snapshot);assert.deepEqual(other.calculationTrace,first.calculationTrace);assert.equal(other.calculationHash,first.calculationHash);
 assert.throws(()=>engine.determine(req,facts(req,{revision:2})),/IDEMPOTENCY_CONFLICT/);
 assert.equal(engine.determinations.get(first.determinationId,{scopeId:'other',subjectId:req.subjectId}),null);
 const production=new UniversalTaxEngine({determinations:engine.determinations});assert.throws(()=>production.determine(req,snapshot),/TEST ONLY/);assert.throws(()=>production.replay(first),/TEST ONLY/);
});
it('Fabric approvals and historical determinations survive restart and replay after new versions',t=>{
 const dir=temporary(t),governancePath=path.join(dir,'fabric.json'),determinationPath=path.join(dir,'results.json');
 const governance=new FabricGovernanceStore({persistPath:governancePath}),registry=new TaxContentRegistry({governanceStore:governance,allowTestPacks:true});add(registry,fixture());const engine=new UniversalTaxEngine({registry,determinations:new TaxDeterminationStore({persistPath:determinationPath})}),req=request(),snapshot=facts(req),first=engine.determine(req,snapshot);
 add(registry,fixture({version:2,rate:'0.3',supersedes:'TEST_DOMESTIC@1'}));const current=engine.determine({...req,requestKey:'new-version'},snapshot);assert.equal(current.taxAmount.amountMinor,'300000');assert.equal(engine.replay(first).matches,true);
 const childScript="const {UniversalTaxEngine,TaxContentRegistry,TaxDeterminationStore}=require('./src/tax');const {FabricGovernanceStore}=require('./src/fabric/governanceStore');const store=new TaxDeterminationStore({persistPath:process.argv[2]});const registry=new TaxContentRegistry({governanceStore:new FabricGovernanceStore({persistPath:process.argv[1]}),allowTestPacks:true});const e=new UniversalTaxEngine({registry,determinations:store});const original=[...store.records.values()][0];const replay=e.determine(original.request,original.inputFacts);console.log(JSON.stringify({id:replay.determinationId,amount:replay.taxAmount,matched:e.replay(original).matches,count:store.records.size}));";
 const child=spawnSync(process.execPath,['-e',childScript,governancePath,determinationPath],{cwd:path.join(__dirname,'..'),env:{...process.env,NODE_ENV:'test'},encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(child.status,0,child.stderr);const restored=JSON.parse(child.stdout);assert.equal(restored.id,first.determinationId);assert.deepEqual(restored.amount,first.taxAmount);assert.equal(restored.matched,true);assert.equal(restored.count,2);
 const bad=JSON.parse(JSON.stringify(first));bad.taxAmount.amountMinor='999';assert.throws(()=>engine.replay(bad),/integrity/);
});
it('failed persistence never creates successful or duplicate authoritative determinations',t=>{
 const dir=temporary(t),{registry}=system(),determinations=new TaxDeterminationStore({persistPath:path.join(dir,'result.json')}),engine=new UniversalTaxEngine({registry,determinations}),req=request(),snapshot=facts(req),rename=fs.renameSync;
 fs.renameSync=()=>{throw Error('test disk failure');};try{assert.throws(()=>engine.determine(req,snapshot),/could not be saved/);assert.equal(determinations.records.size,0);}finally{fs.renameSync=rename;}
 assert.equal(engine.determine(req,snapshot).status,'CALCULATED');assert.equal(determinations.records.size,1);
});
it('division by zero and currency mixing remain unresolved, never zero liabilities',()=>{
 const pack=fixture();pack.rules[0].amountFormula=op('DIVIDE',input('TAX_BASE'),literal('0'));const {engine}=system([pack]),req=request();assert.equal(engine.determine(req,facts(req)).taxAmount,null);
 const wrongCurrency=system().engine.determine({...req,currency:'SGD'},facts({...req,currency:'SGD'}));assert.equal(wrongCurrency.reason,'CURRENCY_MISMATCH_NO_IMPLICIT_FX');
 assert.throws(()=>engine.determine({...req,period:null},facts(req)),/contract fields/);
});
it('negative/increasing treaty effects cannot become zero or final liabilities through rounding',()=>{
 for(const formula of [literal('-0.1'),op('ADD',input('DOMESTIC_TAX'),literal('0.1'))]){
  const {registry,engine}=system();add(registry,treatyFixture({effects:[{kind:'ALLOCATION',amountFormula:formula,currency:'IDR',finalRounding:{mode:'HALF_UP',precision:0}}]}),'TREATY_PACK');const req=request(),snapshot=facts(req,{values:{SOURCE:['COUNTRY','SG'],BENEFICIAL_OWNER:['BOOLEAN',true],PE_PRESENT:['BOOLEAN',false],ELIGIBILITY_REVIEWED:['BOOLEAN',true],FOREIGN_TAX_PAID:['MONEY',{amountMinor:'0',currency:'IDR'}]}}),r=engine.determine(req,snapshot);assert.equal(r.status,'REVIEW_REQUIRED');assert.equal(r.taxAmount,null);assert.equal(r.reason,'TREATY_MUST_NOT_CREATE_OR_INCREASE_DOMESTIC_LIABILITY');
 }
});
it('offline CLI persists unresolved real-content requests and replays exact scoped history without granting approval',t=>{
 const dir=temporary(t),root=path.join(__dirname,'..'),requestFile=path.join(root,'research/phase3-tax/test-only-request.json'),factsFile=path.join(root,'research/phase3-tax/test-only-confirmed-facts.json'),out=path.join(dir,'determination.json');
 function cli(args){return spawnSync(process.execPath,['scripts/tax-engine.js',...args,'--state='+dir],{cwd:root,env:{...process.env,NODE_ENV:'test'},encoding:'utf8',windowsHide:true,timeout:15000});}
 const first=cli(['determine',requestFile,factsFile,'--out='+out]);assert.equal(first.status,0,first.stderr);const record=JSON.parse(fs.readFileSync(out,'utf8'));assert.equal(record.status,'REVIEW_REQUIRED');assert.equal(record.taxAmount,null);
 const replay=cli(['replay',record.determinationId,'--scope='+record.scopeId,'--subject='+record.subjectId]);assert.equal(replay.status,0,replay.stderr);assert.equal(JSON.parse(replay.stdout).matches,true);
 const wrong=cli(['replay',record.determinationId,'--scope=wrong-org','--subject='+record.subjectId]);assert.equal(wrong.status,1);assert.match(wrong.stderr,/Unknown scoped/);
 const persisted=JSON.parse(fs.readFileSync(path.join(dir,'fabric.json'),'utf8'));assert.ok(persisted.candidates.every(c=>c.status==='CANDIDATE'));
 const archived=require('../research/phase3-tax/source-ports/index.json');assert.equal(require('../src/fabric/artifacts').hash(fs.readFileSync(path.join(root,'research/phase3-tax',archived.rawStorageRef))),archived.rawContentHash);assert.ok(require('../research/phase3-tax/test-only-determination.json').evidenceRefs.some(e=>e.rawContentHash===archived.rawContentHash));
});
