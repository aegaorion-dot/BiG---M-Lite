'use strict';
const {it}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {catalog,simulatedSystem,request,snapshot}=require('../scripts/lib/phase4-fixtures');
const {UniversalTaxEngine,TaxContentRegistry,candidateTaxFacts,confirmTaxFacts,createTaxSystem,taxSubjectDescriptor,BUSINESS_CAPACITIES,planTaxReadiness,taxReadinessProposal,isTaxProposalCurrent,acceptTaxFactCandidates,accountingReviewPlan}=require('../src/tax');
const {verifyPhase4Evidence}=require('../src/tax/phase4Catalog');
const {referenceCandidate}=require('../src/tax/referenceCandidates');
const {RawArtifactStore,hash}=require('../src/fabric/artifacts');
const {fingerprint}=require('../src/onboarding/canonical');
const {blankProfileState,planQuestion}=require('../src/onboarding/profiler');
const {createWebStore}=require('../src/web/store');
const {createActiveStore}=require('./workspace-fixture');
const UMKM='ID_UMKM_INDIVIDUAL_2026',ORDINARY='ID_INDIVIDUAL_ORDINARY_2026';
const money=n=>['MONEY',{amountMinor:String(n),currency:'IDR'}];
function annual(extra={}){
 return request({taxType:'INCOME_TAX',incomeOrEventType:'ANNUAL_ORDINARY_INDIVIDUAL_INCOME',period:{periodStart:'2026-01-01',periodEnd:'2026-12-31'},economicDate:'2026-12-31',...extra});
}
function temporary(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bigm-phase4-'));
 t.after(()=>{if(path.dirname(dir)!==os.tmpdir())throw Error('Unsafe temporary cleanup');fs.rmSync(dir,{recursive:true,force:true});});return dir;
}
function fixtureApproval(registry,candidate){
 return registry.governance.review(candidate.candidateId,{decisionSource:'HUMAN',actor:'Test fixture reviewer',decision:'APPROVED',reason:'TEST ONLY controlled verification, not real legal approval',reviewedHashes:[...new Set(candidate.provenance.map(p=>p.rawContentHash))]});
}
it('Phase 4 subject capacities retain separate individual/entity, business and owner identities',()=>{
 assert.deepEqual(BUSINESS_CAPACITIES,['INDIVIDUAL_FREELANCER','SOLE_PROPRIETOR','MICRO_BUSINESS','SMALL_BUSINESS','COMPANY']);
 for(const capacity of BUSINESS_CAPACITIES){
  const d=taxSubjectDescriptor({subjectId:capacity==='COMPANY'?'entity-1':'person-1',businessId:'coffee-1',ownerSubjectId:capacity==='COMPANY'?'person-1':null,legalSubjectType:capacity==='COMPANY'?'COMPANY':'INDIVIDUAL',capacity,legalForm:capacity==='COMPANY'?'PT':'INDIVIDUAL'});
  assert.equal(d.authority,'CANDIDATE_ONLY');assert.equal(d.businessId,'coffee-1');
 }
 assert.throws(()=>taxSubjectDescriptor({subjectId:'entity',businessId:'shop',ownerSubjectId:'entity',legalSubjectType:'COMPANY',capacity:'COMPANY',legalForm:'PT'}),/distinct/);
 assert.throws(()=>taxSubjectDescriptor({subjectId:'entity',businessId:'shop',legalSubjectType:'COMPANY',capacity:'SOLE_PROPRIETOR',legalForm:'PT'}),/contradicts/);
});
it('real catalog has eight structured review-ready CountryPacks, two draft treaties and zero legal approvals',()=>{
 const c=catalog();assert.equal(c.candidates.length,10);assert.equal(c.candidates.filter(x=>x.reviewPackage.stage==='READY_FOR_REVIEW').length,8);
 const s=createTaxSystem();assert.equal(s.governance.approved().length,0);
 for(const row of c.capabilityMatrix)assert.equal(row.executable,false);
 const result=s.engine.determine(annual(),snapshot(annual()));assert.equal(result.status,'REVIEW_REQUIRED');assert.equal(result.taxAmount,null);
 const candidate=s.registry.list('COUNTRY_PACK').find(c=>c.executableContent.packId===UMKM);
 assert.throws(()=>s.governance.review(candidate.candidateId,{decisionSource:'AI',actor:'Muse',decision:'APPROVED',reason:'approve'}),/Human review/);
});
it('real individual freelancer five-band formula matches independent boundary oracles and PKP thousand-rupiah floor',()=>{
 const {engine}=simulatedSystem([ORDINARY]),q=annual();
 for(const [income,expected]of [[0,0],[60000000,3000000],[250000000,31500000],[500000000,94000000],[5000000000,1444000000],[5000001999,1444000350]]){
  const r=engine.determine({...q,requestKey:'income-'+income},snapshot(q,{values:{REVIEWED_TAXABLE_INCOME:money(income)}}));
  assert.equal(r.status,'CALCULATED');assert.equal(r.taxAmount.amountMinor,String(expected));assert.equal(r.testOnly,true);
 }
 assert.equal(engine.determine({...q,requestKey:'no-reconciliation'},snapshot(q,{values:{TAXABLE_INCOME_RECONCILIATION_APPROVED:['BOOLEAN',false]}})).taxAmount,null);
});
it('sole proprietor UMKM exclusion uses cumulative annual gross and handles crossing IDR500m once',()=>{
 const {engine}=simulatedSystem([UMKM]),q=request();
 for(const [before,month,expected]of [[400000000,50000000,0],[450000000,100000000,250000],[600000000,100000000,500000],[4750000000,100000000,500000]]){
  const r=engine.determine({...q,requestKey:'month-'+before},snapshot(q,{values:{YTD_GROSS_BEFORE_MONTH:money(before),MONTH_GROSS_BUSINESS_TURNOVER:money(month)}}));
  assert.equal(r.status,'CALCULATED');assert.equal(r.taxAmount.amountMinor,String(expected));
 }
});
it('UMKM eligibility is not revenue-only: professional income, election, prior disqualification and aggregate turnover exclude the subset',()=>{
 const {engine}=simulatedSystem([UMKM]),q=request();
 for(const [name,value]of [['INCOME_CATEGORY',['STRING','INDEPENDENT_PROFESSIONAL_SERVICE']],['ELECTED_ORDINARY_REGIME',['BOOLEAN',true]],['PREVIOUSLY_DISQUALIFIED_FROM_FINAL',['BOOLEAN',true]],['PRIOR_YEAR_AGGREGATE_TURNOVER',money(4800000001)]]){
  const r=engine.determine({...q,requestKey:name},snapshot(q,{values:{[name]:value}}));assert.equal(r.status,'NOT_APPLICABLE');assert.equal(r.taxReady,false);assert.equal(r.taxAmount,null);
 }
 const missing=engine.determine({...q,requestKey:'aggregate-unreviewed'},snapshot(q,{values:{AGGREGATION_BASIS_REVIEWED:['BOOLEAN',false]}}));assert.equal(missing.status,'REVIEW_REQUIRED');
});
it('2026 one-founder company UMKM has no individual IDR500m exemption or unnecessary YTD question',()=>{
 const id='ID_UMKM_PT_PERORANGAN_2026',{engine,registry}=simulatedSystem([id]),q=request();
 const f=snapshot(q,{values:{SUBJECT_TYPE:['STRING','COMPANY'],LEGAL_FORM:['STRING','PT_PERORANGAN_ONE_FOUNDER'],FOUNDER_PROFESSIONAL_SERVICE_VEHICLE:['BOOLEAN',false],SPECIAL_INCOME_TAX_FACILITY:['BOOLEAN',false]},remove:['YTD_GROSS_BEFORE_MONTH']});
 const r=engine.determine(q,f);assert.equal(r.status,'CALCULATED');assert.equal(r.taxAmount.amountMinor,'500000');
 const plan=planTaxReadiness({registry,request:q,snapshot:f});assert.ok(!Object.hasOwn(plan.requirements,'YTD_GROSS_BEFORE_MONTH'));
 const excluded=snapshot(q,{values:{SUBJECT_TYPE:['STRING','COMPANY'],LEGAL_FORM:['STRING','PT_PERORANGAN_ONE_FOUNDER'],FOUNDER_PROFESSIONAL_SERVICE_VEHICLE:['BOOLEAN',true],SPECIAL_INCOME_TAX_FACILITY:['BOOLEAN',false]}});
 assert.equal(engine.determine({...q,requestKey:'professional-vehicle'},excluded).taxAmount,null);
});
it('missing turnover is exposed by the selected CountryPack and asks only that fact',()=>{
 const {registry,engine}=simulatedSystem([UMKM]),q=request(),f=snapshot(q,{remove:['PRIOR_YEAR_AGGREGATE_TURNOVER']});
 const r=engine.determine(q,f);assert.equal(r.status,'MISSING_REQUIRED_FACT');assert.ok(r.requiredMissingFacts.includes('PRIOR_YEAR_AGGREGATE_TURNOVER'));
 const plan=planTaxReadiness({registry,request:q,snapshot:f});assert.deepEqual(plan.requiredMissingFacts,['PRIOR_YEAR_AGGREGATE_TURNOVER']);
 assert.match(plan.questions[0].text,/prior-year turnover/);assert.equal(plan.taxReady,false);
 const state=blankProfileState();state.slots['currency.functional'].value='IDR';state.slots['currency.functional'].status='CANDIDATE';
 assert.equal(planQuestion(state,'en',{taxReadiness:plan}).key,'tax.PRIOR_YEAR_AGGREGATE_TURNOVER');
 state.slots['currency.functional'].value=null;assert.equal(planQuestion(state,'en',{taxReadiness:plan}).key,'currency.functional');
});
it('adding a declared requirement to governed data changes questions without country onboarding branches',()=>{
 const original=catalog().candidates.find(c=>c.executableContent.packId===UMKM),p=JSON.parse(JSON.stringify(original.executableContent));
 p.packId='TEST_DYNAMIC_REQUIREMENT';p.testOnly=true;p.rules[0].requiredFacts.NEW_DOCUMENT_REFERENCE='STRING';
 const c={...referenceCandidate('COUNTRY_PACK',p,p.evidenceRefs),reviewPackage:{factPrompts:{NEW_DOCUMENT_REFERENCE:'Which reviewed document establishes this fact?'}}},registry=new TaxContentRegistry({allowTestPacks:true});registry.register(c);
 const q=request(),plan=planTaxReadiness({registry,request:q,snapshot:snapshot(q)});
 assert.deepEqual(plan.requiredMissingFacts,['NEW_DOCUMENT_REFERENCE']);assert.equal(plan.questions[0].text,'Which reviewed document establishes this fact?');
 assert.equal(plan.contributors[0].stage,'READY_FOR_REVIEW');assert.equal(plan.taxReady,false);
});
it('2025 rules cannot execute in 2026; amended 2026 UMKM starts only after commencement and cannot leak to 2027',()=>{
 const old=simulatedSystem(['ID_UMKM_INDIVIDUAL_2025']),q=request();
 assert.equal(old.engine.determine(q,snapshot(q)).status,'OUT_OF_PERIOD');
 const {engine}=simulatedSystem([UMKM]);
 for(const period of [{periodStart:'2026-01-01',periodEnd:'2026-12-31'},{periodStart:'2026-04-01',periodEnd:'2026-04-30'},{periodStart:'2027-05-01',periodEnd:'2027-05-31'}]){
  const req=request({period,economicDate:period.periodEnd,requestKey:period.periodStart}),r=engine.determine(req,snapshot(req));assert.equal(r.status,'OUT_OF_PERIOD');assert.equal(r.taxAmount,null);assert.deepEqual(r.calculationTrace,[]);
 }
 assert.equal(engine.determine(q,snapshot(q)).status,'CALCULATED');
});
it('old individual UMKM regime counts its first eligible year, not an invented automatic 2026 extension',()=>{
 const {engine}=simulatedSystem(['ID_UMKM_INDIVIDUAL_2025']),q=request({period:{periodStart:'2025-05-01',periodEnd:'2025-05-31'},economicDate:'2025-05-31'});
 assert.equal(engine.determine(q,snapshot(q)).status,'CALCULATED');
 const expired=engine.determine({...q,requestKey:'old-expired'},snapshot(q,{values:{REGIME_FIRST_TAX_YEAR:['NUMBER','2018']}}));
 assert.equal(expired.taxAmount,null);assert.equal(expired.status,'NOT_APPLICABLE');
});
it('nationality, customer and bank location do not establish residence or registration for an Australian owner in Bali',()=>{
 const {engine}=simulatedSystem([UMKM]),q=request({jurisdictionBasis:'REGISTRATION'}),f=snapshot(q,{remove:['TAX_RESIDENCE'],values:{NATIONALITY:['COUNTRY','AU'],CUSTOMER_LOCATION:['COUNTRY','AU'],ACCOUNT_LOCATION:['COUNTRY','AU'],REGISTRATION:['COUNTRY','ID']}});
 const r=engine.determine(q,f);assert.equal(r.status,'MISSING_REQUIRED_FACT');assert.ok(r.requiredMissingFacts.includes('TAX_RESIDENCE'));assert.equal(r.taxAmount,null);
 const noRegistration=snapshot(q,{remove:['REGISTRATION'],values:{NATIONALITY:['COUNTRY','AU'],CUSTOMER_LOCATION:['COUNTRY','ID']}});
 assert.ok(engine.determine({...q,requestKey:'registration-missing'},noRegistration).requiredMissingFacts.includes('REGISTRATION'));
 assert.throws(()=>planTaxReadiness({registry:simulatedSystem([UMKM]).registry,request:{...q,jurisdictionBasis:'NATIONALITY'},snapshot:f}),/nationality/);
});
it('confirmed foreign customer location does not turn locally sourced Indonesian freelancer income into foreign-source treaty income',()=>{
 const {engine}=simulatedSystem([ORDINARY]),q=annual(),r=engine.determine(q,snapshot(q,{values:{CUSTOMER_LOCATION:['COUNTRY','SG'],NATIONALITY:['COUNTRY','ID']}}));
 assert.equal(r.status,'CALCULATED');assert.equal(r.treatyResult.status,'NOT_NEEDED');
 const bad=engine.determine({...q,requestKey:'nonresident-registration'},snapshot(q,{values:{TAX_RESIDENCE:['COUNTRY','SG'],SOURCE:['COUNTRY','SG']}}));
 assert.equal(bad.taxAmount,null);
});
it('VAT dossier exposes missing registration/transaction facts without an executable VAT decision or generic UMKM questionnaire',()=>{
 const {registry,engine}=createTaxSystem(),q=request({taxType:'VAT',incomeOrEventType:'DOMESTIC_SUPPLY',jurisdictionBasis:'REGISTRATION'}),f=snapshot(q),plan=planTaxReadiness({registry,request:q,snapshot:f});
 assert.ok(plan.requiredMissingFacts.includes('PKP_STATUS'));assert.ok(plan.requiredMissingFacts.includes('REGISTRATION_EFFECTIVE_DATE'));assert.equal(plan.taxReady,false);
 assert.equal(engine.determine(q,f).taxAmount,null);
 const umkm=planTaxReadiness({registry,request:request(),snapshot:snapshot(request())});assert.ok(!Object.hasOwn(umkm.requirements,'PKP_STATUS'));
});
it('resident company PPh23 withholding is separate from annual liability and actual tax-paid evidence',()=>{
 const {engine}=simulatedSystem(['ID_WHT23_MANAGEMENT_2026']),q=request({taxType:'WHT',jurisdictionBasis:'WITHHOLDING',incomeOrEventType:'RESIDENT_COMPANY_MANAGEMENT_FEE'}),f=snapshot(q,{values:{SUBJECT_TYPE:['STRING','COMPANY'],ACTUALLY_WITHHELD:money(150000)}});
 const r=engine.determine(q,f);assert.equal(r.status,'CALCULATED');assert.equal(r.withholding.amount.amountMinor,'200000');assert.deepEqual(r.withholding.domesticAmount,r.taxAmount);assert.deepEqual(r.reliefs,[]);assert.equal(r.postingPerformed,false);
 assert.ok(r.inputFacts.facts.some(f=>f.name==='ACTUALLY_WITHHELD'&&f.value.amountMinor==='150000'));
 const finalRegime=engine.determine({...q,requestKey:'final-regime'},snapshot(q,{values:{SUBJECT_TYPE:['STRING','COMPANY'],FINAL_REGIME_CERTIFICATE_APPLIES:['BOOLEAN',true]}}));
 assert.equal(finalRegime.taxAmount,null);
});
it('ID-SG nonresident-service path calculates domestic preliminary WHT before stopping for treaty review',()=>{
 const {engine}=simulatedSystem(['ID_WHT26_SERVICE_2026','ID_SG_SMALL_BUSINESS_RESEARCH_2026']),q=request({taxType:'WHT',jurisdictionBasis:'WITHHOLDING',incomeOrEventType:'NONRESIDENT_INDEPENDENT_SERVICE_FEE'}),f=snapshot(q,{values:{TAX_RESIDENCE:['COUNTRY','SG'],PAYEE_TAX_RESIDENCE:['COUNTRY','SG'],PAYMENT_CATEGORY:['STRING','INDEPENDENT_PROFESSIONAL_SERVICE']}});
 const r=engine.determine(q,f);assert.equal(r.domesticCandidate.taxAmount.amountMinor,'2000000');assert.equal(r.treatyResult.reason,'TREATY_REVIEW_REQUIRED');assert.equal(r.taxAmount,null);assert.equal(r.withholding,null);
 assert.ok(r.calculationTrace.some(t=>t.op==='MULTIPLY'));
});
it('ID-AU real treaty dossier is selected for foreign-source individual income and exposes article/residency facts',()=>{
 const {registry,engine}=simulatedSystem([ORDINARY,'ID_AU_SMALL_BUSINESS_RESEARCH_2026']),q=annual(),f=snapshot(q,{values:{SOURCE:['COUNTRY','AU'],NATIONALITY:['COUNTRY','AU']}});
 const r=engine.determine(q,f);assert.equal(r.domesticCandidate.taxAmount.amountMinor,'44000000');assert.equal(r.taxAmount,null);
 assert.equal(r.reason,'TREATY_REVIEW_REQUIRED');assert.ok(r.treatyResult.candidateTreaties.some(c=>c.packId.startsWith('ID_AU_')));
 const plan=planTaxReadiness({registry,request:q,snapshot:f});assert.ok(plan.requiredMissingFacts.includes('FIXED_BASE_AVAILABLE'));assert.ok(plan.requiredMissingFacts.includes('TREATY_RESIDENCE_DOCUMENT_VALID'));
});
it('source review of incomplete ID-SG/ID-AU treaties never enables execution',()=>{
 const {registry}=simulatedSystem(['ID_SG_SMALL_BUSINESS_RESEARCH_2026','ID_AU_SMALL_BUSINESS_RESEARCH_2026']);
 for(const c of registry.list('TREATY_PACK')){assert.equal(c.status,'APPROVED');assert.equal(c.executorSupported,false);assert.equal(c.runtimeExecutable,false);assert.equal(Boolean(registry.approved(c)),false);assert.equal(c.executableContent.effectiveFrom,null);assert.deepEqual(c.executableContent.incomeArticles,[]);}
});
it('foreign tax paid alone never creates a foreign tax credit or a final liability reduction',()=>{
 const {engine}=createTaxSystem(),q=request({taxType:'FOREIGN_TAX_CREDIT',incomeOrEventType:'FOREIGN_SERVICE_INCOME'}),f=snapshot(q,{values:{SOURCE:['COUNTRY','SG'],FOREIGN_TAX_PAID:money(2000000)}});
 const r=engine.determine(q,f);assert.equal(r.status,'MISSING_APPROVED_RULE');assert.equal(r.taxAmount,null);assert.deepEqual(r.reliefs,[]);
});
it('official raw bytes, retained PDF extraction, exact citations and trace are linked and mutation is detected',()=>{
 const verified=verifyPhase4Evidence(catalog());assert.ok(verified.verifiedArtifacts>=20);assert.ok(verified.verifiedReferences>=60);
 const corrupted=JSON.parse(JSON.stringify(catalog()));corrupted.candidates[0].executableContent.evidenceRefs[0].quote+=' changed';
 assert.throws(()=>verifyPhase4Evidence(corrupted),/Citation/);
 const {engine}=simulatedSystem([UMKM]),q=request(),r=engine.determine(q,snapshot(q));
 assert.ok(r.evidenceRefs.some(e=>e.sourceUrl.includes('2026pp020.pdf')&&e.locator.startsWith('pdf:page:')));
 assert.ok(r.appliedRules[0].contentHash);assert.ok(r.inputFacts.revision);assert.ok(r.calculationTrace.length>20);assert.equal(engine.replay(r).matches,true);
});
it('real acquired artifact byte tampering is detected without changing the retained official archive',t=>{
 const dir=temporary(t),store=new RawArtifactStore(dir),ref=catalog().candidates[0].executableContent.evidenceRefs[0];
 const original=JSON.parse(fs.readFileSync(path.join(__dirname,'../research/phase4-packs/raw/artifacts',ref.artifactId+'.json'))),bytes=fs.readFileSync(path.join(__dirname,'..',ref.rawStorageRef)),a=store.save(bytes,original);
 assert.equal(hash(store.read(a)),ref.rawContentHash);fs.appendFileSync(path.join(dir,a.rawStorageRef),'changed');assert.throws(()=>store.read(a),/Raw hash/);
});
it('duplicate citation references cannot change source URLs or extraction hashes through the verification cache',()=>{
 for(const key of ['sourceUrl','extractionHash']){
  const data=JSON.parse(JSON.stringify(catalog())),refs=data.candidates.flatMap(c=>c.executableContent.evidenceRefs),first=refs.find(r=>r.extractionHash),duplicate=refs.find(r=>r!==first&&r.artifactId===first.artifactId);
  duplicate[key]=key==='sourceUrl'?'https://unofficial.example/law':'0'.repeat(64);
  assert.throws(()=>verifyPhase4Evidence(data),/binding mismatch/);
 }
});
it('official PDF visual previews remain hash-bound; promulgation observation does not approve a treaty',()=>{
 const root=path.join(__dirname,'../research/phase4-packs'),index=JSON.parse(fs.readFileSync(path.join(root,'previews/index.json')));
 for(const row of index)assert.equal(hash(fs.readFileSync(path.join(root,row.previewRef))),row.previewHash);
 const treaties=catalog().candidates.filter(c=>c.contentKind==='TREATY_PACK');
 for(const c of treaties){assert.equal(c.reviewPackage.visualEvidence.publicationDateCandidate,'2025-12-31');assert.equal(c.reviewPackage.visualEvidence.observationAuthority,'CANDIDATE_ONLY_SOURCE_READING_NOT_LEGAL_APPROVAL');assert.equal(c.runtimeExecutable,false);}
});
it('candidate tax answers are typed, exact-quote evidenced and invalidate earlier human confirmation',()=>{
 const {registry}=simulatedSystem([UMKM]),q=request(),f=snapshot(q),answer={name:'PRIOR_YEAR_AGGREGATE_TURNOVER',type:'MONEY',value:{amountMinor:'900000000',currency:'IDR'},supportingQuote:'Prior-year aggregate turnover was IDR900000000.',operation:'REPLACE',status:'CANDIDATE'};
 const next=acceptTaxFactCandidates({registry,request:q,snapshot:f,answers:[answer],userText:answer.supportingQuote,profileRevision:1});
 assert.equal(next.status,'CANDIDATE');assert.equal(next.confirmation,null);assert.notEqual(next.snapshotHash,f.snapshotHash);
 for(const invalid of [{...answer,status:'APPROVED'},{...answer,name:'AI_APPROVED_LAW'},{...answer,type:'NUMBER'},{...answer,supportingQuote:'not in message'}]){
  assert.throws(()=>acceptTaxFactCandidates({registry,request:q,snapshot:f,answers:[invalid],userText:answer.supportingQuote,profileRevision:1}));
 }
});
it('contradictory residence and profile corrections invalidate tax review proposals',()=>{
 const {registry}=simulatedSystem([UMKM]),q=request(),f=snapshot(q),profileState=blankProfileState();profileState.revision=1;
 const proposal=taxReadinessProposal({registry,request:q,snapshot:f,profileState});assert.equal(isTaxProposalCurrent(proposal,{registry,request:q,snapshot:f,profileState}),true);
 const revised={...profileState,revision:2};assert.equal(isTaxProposalCurrent(proposal,{registry,request:q,snapshot:f,profileState:revised}),false);
 const conflict=candidateTaxFacts({...f,facts:[...f.facts,{name:'TAX_RESIDENCE',type:'COUNTRY',value:'AU',evidenceReference:'Conflicting statement'}]});
 assert.equal(planTaxReadiness({registry,request:q,snapshot:conflict}).status,'CONFLICT');
 const corrected=snapshot(q,{values:{PRIOR_YEAR_AGGREGATE_TURNOVER:money(999999999)}});assert.equal(isTaxProposalCurrent(proposal,{registry,request:q,snapshot:corrected,profileState}),false);
});
it('web profiler supplies pack-driven requirements to semantic AI and keeps tax answers candidate-only',async()=>{
 const q=request(),taxSystem=simulatedSystem([UMKM],{approve:false}),store=createWebStore({orgId:q.scopeId,taxSystem});
 store.editProfile({slot:'currency.functional',value:'IDR'});store.editProfile({slot:'org.subjectType',value:'INDIVIDUAL'});store.editProfile({basis:'TAX_RESIDENCE',countryCode:'ID'});store.editProfile({basis:'SOURCE',countryCode:'ID'});
 store.beginTaxReview(q);let received;
 const reply=await store.onboardingTurn('Legal form is INDIVIDUAL.',{aiProvider:{extractProfile:async args=>{received=JSON.parse(args.user);return {facts:[],jurisdictionFacts:[],taxFacts:[{name:'LEGAL_FORM',type:'STRING',value:'INDIVIDUAL',supportingQuote:'Legal form is INDIVIDUAL.',status:'CANDIDATE'}]};}}});
 assert.equal(reply.providerUsed,'meta');assert.ok(received.capabilities.activeTaxRequirements.declarations.PRIOR_YEAR_AGGREGATE_TURNOVER);
 assert.ok(!store.taxReadiness().requiredMissingFacts.includes('LEGAL_FORM'));assert.equal(store.taxReadiness().taxReady,false);
 store.editProfile({basis:'TAX_RESIDENCE',countryCode:'AU'});assert.equal(store.taxReadiness().status,'PROFILE_REVISION_CHANGED');assert.equal(store.onboardingState().question.key,'tax.contextReview');
});
it('web tax review and questions survive restart; profile correction prevents stale proposals',t=>{
 const dir=temporary(t),file=path.join(dir,'workspace.json'),q=request(),system=simulatedSystem([UMKM],{approve:false}),store=createWebStore({orgId:q.scopeId,persistPath:file,taxSystem:system});
 store.editProfile({slot:'currency.functional',value:'IDR'});store.beginTaxReview(q);
 const initial=store.taxReadiness(),reopened=createWebStore({orgId:q.scopeId,persistPath:file,taxSystem:system});assert.equal(reopened.taxReadiness().snapshotHash,initial.snapshotHash);assert.deepEqual(reopened.taxReadiness().requiredMissingFacts,initial.requiredMissingFacts);
 reopened.editProfile({slot:'currency.functional',value:'SGD'});assert.equal(reopened.taxReadiness().status,'PROFILE_REVISION_CHANGED');assert.throws(()=>reopened.proposeTaxReview(),/Current tax/);
});
it('real-content controlled determinations replay in a fresh process from pinned versions',t=>{
 const dir=temporary(t),options={governancePath:path.join(dir,'fabric.json'),determinationPath:path.join(dir,'results.json')},s=simulatedSystem([UMKM],options),q=request(),r=s.engine.determine(q,snapshot(q));
 const script="const f=require('./scripts/lib/phase4-fixtures');const s=f.simulatedSystem(['ID_UMKM_INDIVIDUAL_2026'],JSON.parse(process.argv[1]));const r=s.determinations.get(process.argv[2],{scopeId:'phase4-test-org',subjectId:'individual-1'});console.log(s.engine.replay(r).matches)";
 const child=spawnSync(process.execPath,['-e',script,JSON.stringify(options),r.determinationId],{cwd:path.join(__dirname,'..'),encoding:'utf8',windowsHide:true,timeout:15000});
 assert.equal(child.status,0,child.stderr);assert.equal(child.stdout.trim(),'true');
 assert.throws(()=>s.engine.determine(q,snapshot(q,{values:{MONTH_GROSS_BUSINESS_TURNOVER:money(50000000)}})),/IDEMPOTENCY_CONFLICT/);
});
it('effective supersession of a real rule copy is explicit and retiring the successor never revives its predecessor',()=>{
 const {registry,engine}=simulatedSystem([UMKM]),original=registry.list('COUNTRY_PACK')[0],p=JSON.parse(JSON.stringify(original.executableContent));p.version=2;p.supersedes=UMKM+'@1';p.effectiveFrom='2026-07-01';p.rules[0].effectiveFrom=p.effectiveFrom;
 const c=referenceCandidate('COUNTRY_PACK',p,p.evidenceRefs);registry.register(c);fixtureApproval(registry,c);
 const q=request({period:{periodStart:'2026-07-01',periodEnd:'2026-07-31'},economicDate:'2026-07-31'}),r=engine.determine(q,snapshot(q));assert.equal(r.packVersion,2);
 registry.governance.review(c.candidateId,{decisionSource:'HUMAN',actor:'Test fixture reviewer',decision:'RETIRED',reason:'TEST ONLY retirement'});
 const after=engine.determine({...q,requestKey:'retired'},snapshot(q));assert.equal(after.taxAmount,null);assert.notEqual(after.packVersion,1);assert.equal(engine.replay(r).matches,true);
});
it('Singapore YA2026 PTE/rebate subset uses income basis 2025 and never treats calendar 2026 as YA2026',()=>{
 const id='SG_CIT_YA2026_PTE_NO_CASH_GRANT',{engine}=simulatedSystem([id]),q=request({jurisdictionCode:'SG',currency:'SGD',taxType:'CIT',incomeOrEventType:'CALENDAR_YEAR_COMPANY_NORMAL_INCOME_YA2026',period:{periodStart:'2025-01-01',periodEnd:'2025-12-31'},economicDate:'2025-12-31'}),f=snapshot(q,{values:{SUBJECT_TYPE:['STRING','COMPANY']}});
 const r=engine.determine(q,f);assert.equal(r.status,'CALCULATED');assert.equal(r.taxableBase.amountMinor,'9750000');assert.equal(r.taxAmount.amountMinor,'828750');
 const next={...q,period:{periodStart:'2026-01-01',periodEnd:'2026-12-31'},economicDate:'2026-12-31',requestKey:'wrong-basis'};assert.equal(engine.determine(next,snapshot(next,{values:{SUBJECT_TYPE:['STRING','COMPANY']}})).status,'OUT_OF_PERIOD');
 const grant=engine.determine({...q,requestKey:'grant-eligible'},snapshot(q,{values:{SUBJECT_TYPE:['STRING','COMPANY'],CASH_GRANT_ELIGIBLE:['BOOLEAN',true]}}));assert.equal(grant.taxAmount,null);
});
it('unsupported fractional-rupiah arithmetic stays outside the reviewed subset instead of inventing rounding',()=>{
 const {engine}=simulatedSystem([UMKM]),q=request(),r=engine.determine(q,snapshot(q,{values:{YTD_GROSS_BEFORE_MONTH:money(600000000),MONTH_GROSS_BUSINESS_TURNOVER:money(100000001)}}));
 assert.equal(r.status,'NOT_APPLICABLE');assert.equal(r.taxAmount,null);assert.equal(r.taxReady,false);
});
it('unresolved 2026 tax leaves the single bookkeeping posting pipeline available',async()=>{
 const store=createActiveStore({taxSystem:simulatedSystem([UMKM],{approve:false})}),q=request({scopeId:'org-contoh'});store.beginTaxReview(q);
 assert.equal(store.taxReadiness().taxReady,false);
 await store.createSale({id:'phase4-sale',orgId:'org-contoh',date:'2026-05-01',jurisdiction:'ID',currency:'IDR',customer:'Local coffee customer',invoiceRef:'P4-1',description:'Coffee sale',amountMajor:'25000'});
 assert.equal(store.ctx.ledger.size,1);assert.equal(store.summary().transactionCount,1);assert.equal(store.taxReadiness().taxReady,false);
 const {engine}=simulatedSystem([UMKM]),r=engine.determine(request(),snapshot(request()));assert.equal(accountingReviewPlan(r,{scopeId:r.scopeId,subjectId:r.subjectId,currency:'IDR'}).status,'BLOCKED');
});
it('live probing requires explicit opt-in and cannot run inside routine regression',()=>{
 for(const args of [[],['--live']]){
  const child=spawnSync(process.execPath,['scripts/phase4-probe.js',...args],{cwd:path.join(__dirname,'..'),env:{...process.env,NODE_ENV:'test'},encoding:'utf8',windowsHide:true,timeout:3000});
  assert.equal(child.status,1);assert.match(child.stderr,/Explicit --live/);
 }
 const observations=fs.readFileSync(path.join(__dirname,'../research/phase4-packs/observations.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 assert.ok(observations.some(r=>r.id==='au-api-retry'&&r.httpStatus===200&&r.responseHash));assert.ok(observations.some(r=>r.id==='sg-sso-retry'&&r.httpStatus===403));assert.ok(observations.some(r=>r.failureReason==='Document exceeds byte limit'));
 for(const r of observations){assert.ok(r.timestamp);assert.ok(r.url);assert.ok(r.authority);assert.ok(r.retrievalMethod);assert.ok(r.success||r.failureReason);}
});
it('one universal tax executor remains country-neutral; Phase 4 legal literals live only in content',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/tax/taxEngine.js'),'utf8');assert.doesNotMatch(source,/\b(?:4800000000|500000000|60000000|PP20|2026pp020)\b/);assert.equal((source.match(/class UniversalTaxEngine/g)??[]).length,1);assert.doesNotMatch(source,/\beval\s*\(|new Function/);
});
