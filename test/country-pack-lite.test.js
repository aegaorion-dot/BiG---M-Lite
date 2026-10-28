'use strict';
const {describe,it}=require('node:test'),assert=require('node:assert/strict');
const {ContentRegistry,ORIGINAL_PACKS,resolveCountryPacks,approveContent,hasConflictingPackRules}=require('../src/countrypack/resolver');
const fact=(basis,countryCode,status='CANDIDATE')=>({basis,countryCode,status,source:'USER',supportingQuote:'test evidence'});
function synthetic({code='TEST_REFERENCE',version=1,kind='CLASSIFICATION',ruleCode='SYNTHETIC_RULE',...overrides}={}){
 return {packCode:code,version,jurisdictionCode:'ID',effectiveFrom:'2025-01-01',effectiveTo:'2025-12-31',supportedSubjectTypes:['COMPANY'],supportedTaxTypes:['CIT'],
  legalSources:[{instrument:'SYNTHETIC TEST FIXTURE — NOT LAW',url:'urn:bigm:test'}],
  lite:{executable:true,requiredConsumer:'SYNTHETIC_TEST_ONLY',contentClass:'SYNTHETIC_TEST_ONLY'},rules:[{ruleCode,ruleKind:kind,taxTypeCode:'CIT',effectiveFrom:'2025-01-01',effectiveTo:'2025-12-31'}],...overrides};
}
function resolve(registry=new ContentRegistry(),extra={}){
 return resolveCountryPacks({registry,jurisdictionFacts:[fact('REGISTRATION','ID')],subjectType:'COMPANY',effectiveDate:'2025-01-01',period:{periodStart:'2025-01-01',periodEnd:'2025-12-31'},...extra});
}
describe('CountryPack catalog port from Original',()=>{
 it('retains both substantive versions, source identity, rules and dates',()=>{
  const r=new ContentRegistry();assert.deepEqual(r.list().map(p=>[p.packCode,p.version,p.rules.length]),[['ID_CIT_REFERENCE',2,18],['ID_CIT_DETERMINATION_2025',2,3]]);
  for(const p of r.list()){assert.equal(p.effectiveFrom,'2025-01-01');assert.equal(p.effectiveTo,'2025-12-31');assert.equal(p.originalSource.commit,'4d0da9a6acafc24f7db3778f66b4df6d7cf4764c');assert.ok(p.legalSources.length);assert.equal(p.lite.executable,false);assert.ok(Object.isFrozen(p.rules));}
  assert.ok(ORIGINAL_PACKS[0].rules.some(r=>r.action?.type==='REVIEW_REQUIRED'));
  assert.ok(ORIGINAL_PACKS[1].rules.some(r=>r.ruleCode==='ID_CIT_GENERAL_AND_ARTICLE_31E_2025'));
 });
 it('never reuses 2025 content for a 2026 accounting period',()=>{
  const r=resolve(undefined,{effectiveDate:'2026-01-01',period:{periodStart:'2026-01-01',periodEnd:'2026-12-31'}});
  assert.equal(r.status,'OUT_OF_PERIOD');assert.deepEqual(r.selectedPackIds,[]);assert.ok(r.candidates.every(p=>p.status==='OUT_OF_PERIOD'));
 });
 it('requires the entire period to fit even if the evaluated date fits',()=>{
  assert.equal(resolve(undefined,{period:{periodStart:'2025-01-01',periodEnd:'2026-01-01'}}).status,'OUT_OF_PERIOD');
 });
 it('returns explicit missing packs for SG/US/AU/GB; metadata does not create executable content',()=>{
  for(const code of ['SG','US','AU','GB']){const r=resolve(undefined,{jurisdictionFacts:[fact('REGISTRATION',code)]});assert.equal(r.status,'MISSING_COUNTRY_PACK');assert.deepEqual(r.selectedPackIds,[]);}
 });
 it('does not choose a pack from customers, bank, work or nationality',()=>{
  for(const basis of ['CUSTOMER_LOCATION','ACCOUNT_LOCATION','BUSINESS_WORK_LOCATION'])assert.equal(resolve(undefined,{jurisdictionFacts:[fact(basis,'ID')]}).reason,'JURISDICTION_REQUIRES_REVIEW');
 });
 it('honors subject and tax-type scope before approval',()=>{
  assert.equal(resolve(undefined,{subjectType:'INDIVIDUAL'}).status,'NOT_APPLICABLE');
  assert.equal(resolve(undefined,{taxType:'GST'}).status,'NOT_APPLICABLE');
 });
 it('source approval cannot be supplied by AI or without evidence',()=>{
  const r=new ContentRegistry();
  assert.throws(()=>approveContent(r,{packId:'ID_CIT_REFERENCE@2',actor:'AI',decisionSource:'AI',evidenceReference:'x'}),/human/);
  assert.throws(()=>approveContent(r,{packId:'ID_CIT_REFERENCE@2',actor:'Reviewer',decisionSource:'HUMAN'}),/evidence/);
 });
 it('reviewed Original content stays non-executable without the M3/M5 consumer',()=>{
  const registry=new ContentRegistry(),approvals=registry.list().map(p=>approveContent(registry,{packId:p.packCode+'@'+p.version,actor:'Reviewer',decisionSource:'HUMAN',evidenceReference:'reviewed Original source'}));
  const r=resolve(registry,{approvals});assert.equal(r.status,'REVIEW_REQUIRED');assert.ok(r.candidates.every(c=>c.reason==='LITE_EXECUTION_UNSUPPORTED'));assert.deepEqual(r.selectedPackIds,[]);
 });
 it('synthetic executable fixtures require independent source review and fact/pack confirmation',()=>{
  const registry=new ContentRegistry([synthetic()],{supportedConsumers:['SYNTHETIC_TEST_ONLY']});assert.equal(resolve(registry).status,'REVIEW_REQUIRED');
  const approval=approveContent(registry,{packId:'TEST_REFERENCE@1',actor:'Test human',decisionSource:'HUMAN',evidenceReference:'TEST ONLY'});
  assert.deepEqual(resolve(registry,{approvals:[approval]}).selectedPackIds,[]);
  const r=resolve(registry,{approvals:[approval],confirmedPackIds:['TEST_REFERENCE@1'],jurisdictionFacts:[fact('REGISTRATION','ID','CONFIRMED')]});
  assert.equal(r.status,'RESOLVED');assert.deepEqual(r.selectedPackIds,['TEST_REFERENCE@1']);
 });
 it('selects latest eligible version per series and rejects incomplete multi-country coverage',()=>{
  const old=synthetic({effectiveFrom:'2024-01-01',effectiveTo:'2024-12-31',rules:[{ruleCode:'OLD_SYNTHETIC',ruleKind:'CLASSIFICATION',taxTypeCode:'CIT',effectiveFrom:'2024-01-01',effectiveTo:'2024-12-31'}]});
  const registry=new ContentRegistry([old,synthetic({version:2})],{supportedConsumers:['SYNTHETIC_TEST_ONLY']}),approvals=registry.list().map(p=>approveContent(registry,{packId:p.packCode+'@'+p.version,actor:'Test reviewer',decisionSource:'HUMAN',evidenceReference:'TEST'}));
  const r=resolve(registry,{approvals,confirmedPackIds:['TEST_REFERENCE@2'],jurisdictionFacts:[fact('REGISTRATION','ID','CONFIRMED')]});assert.deepEqual(r.selectedPackIds,['TEST_REFERENCE@2']);
  const multi=resolve(registry,{approvals,jurisdictionFacts:[fact('REGISTRATION','ID'),fact('TAX_RESIDENCE','SG')]});assert.equal(multi.reason,'INCOMPLETE_MULTI_JURISDICTION_COVERAGE');assert.deepEqual(multi.selectedPackIds,[]);
 });
 it('overlapping approved versions fail closed instead of picking a version number',()=>{
  const registry=new ContentRegistry([synthetic(),synthetic({version:2})],{supportedConsumers:['SYNTHETIC_TEST_ONLY']});
  const approvals=registry.list().map(p=>approveContent(registry,{packId:p.packCode+'@'+p.version,actor:'Reviewer',decisionSource:'HUMAN',evidenceReference:'TEST'}));
  const r=resolve(registry,{approvals});assert.equal(r.reason,'AMBIGUOUS_PACK_VERSION');assert.deepEqual(r.selectedPackIds,[]);
 });
 it('retiring a successor never revives its predecessor',()=>{
  const old=synthetic({supersededBy:'TEST_REFERENCE@2'}),successor=synthetic({version:2,lifecycleStatus:'RETIRED'});
  const registry=new ContentRegistry([old,successor],{supportedConsumers:['SYNTHETIC_TEST_ONLY']});
  const approvals=[approveContent(registry,{packId:'TEST_REFERENCE@1',actor:'Reviewer',decisionSource:'HUMAN',evidenceReference:'TEST'})];
  const r=resolve(registry,{approvals});assert.deepEqual(r.selectedPackIds,[]);assert.equal(r.candidates.find(p=>p.version===1).reason,'SUPERSEDED_EFFECTIVE_RANGE');
 });
 it('retired versions cannot be used even for historical dates',()=>{
  const registry=new ContentRegistry([synthetic({lifecycleStatus:'RETIRED'})]);assert.equal(resolve(registry).candidates[0].reason,'PACK_RETIRED');
 });
 it('composition rejects duplicate rules, output targets and unknown content',()=>{
  const a=synthetic({code:'A'}),b=synthetic({code:'B',ruleCode:'OTHER'});
  assert.equal(hasConflictingPackRules([a,b],'2025-06-01'),true);
  b.rules[0].ruleKind='OBLIGATION_DISCOVERY';assert.equal(hasConflictingPackRules([a,b],'2025-06-01'),false);
  b.rules=[];assert.equal(hasConflictingPackRules([a,b],'2025-06-01'),true);
 });
 it('approval is bound to exact immutable content, not only pack name/version',()=>{
  const registry=new ContentRegistry([synthetic()],{supportedConsumers:['SYNTHETIC_TEST_ONLY']}),approval=approveContent(registry,{packId:'TEST_REFERENCE@1',actor:'Reviewer',decisionSource:'HUMAN',evidenceReference:'TEST'});
  const changed=synthetic();changed.legalSources[0].instrument='Different synthetic content';
  const other=new ContentRegistry([changed]);assert.equal(resolve(other,{approvals:[approval]}).candidates[0].reason,'PACK_SOURCE_REVIEW_REQUIRED');
 });
});
