'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {blankProfileState,applyFacts}=require('../src/onboarding/profiler');
const {createTaxSystem}=require('../src/tax');
const {ResearchRetriever}=require('../src/ai/researchRetriever');
const {createConfigurationService}=require('../src/configuration/service');
const {validateConfigurationCandidates}=require('../src/configuration/candidates');
const {estimateTaxes}=require('../src/configuration/estimates');

const roots=[];
test.after(()=>roots.forEach((root)=>fs.rmSync(root,{recursive:true,force:true})));
const temp=()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bigm-configuration-'));roots.push(dir);return dir;};

const officialUrl='https://www.iras.gov.sg/test-income-tax-page';
const pageText='TEST ONLY official guidance. A synthetic business income scale applies from 1 January 2026 at 10 percent of net business income. TEST ONLY.';

const period={periodStart:'2026-01-01',periodEnd:'2026-12-31'};
const workspace={organizationId:'org-configuration',functionalCurrency:'SGD',period,jurisdiction:'SG',activated:true};
const financial={
  available:true,
  currency:'SGD',
  period,
  recognizedBusinessIncome:{amountMinor:'1000000',currency:'SGD'},
  confirmedBusinessExpenses:{amountMinor:'250000',currency:'SGD'},
  employmentWage:{amountMinor:'0',currency:'SGD'},
  accounting:{journalCount:3},
};

function profileState(){
  return applyFacts(blankProfileState(),[
    {slot:'currency.functional',value:'SGD',source:'USER',supportingQuote:'SGD',status:'CANDIDATE',operation:'SET'},
    {slot:'org.businessType',value:'freelancer',source:'USER',supportingQuote:'freelancer',status:'CANDIDATE',operation:'SET'},
    {slot:'org.subjectType',value:'INDIVIDUAL',source:'USER',supportingQuote:'individual',status:'CANDIDATE',operation:'SET'},
    {slot:'accounting.periodStart',value:period.periodStart,source:'USER',supportingQuote:'period start',status:'CANDIDATE',operation:'SET'},
    {slot:'accounting.periodEnd',value:period.periodEnd,source:'USER',supportingQuote:'period end',status:'CANDIDATE',operation:'SET'},
  ],'USER',{jurisdictionFacts:[
    {basis:'REGISTRATION',countryCode:'SG',source:'USER',supportingQuote:'Singapore',status:'CANDIDATE'},
    {basis:'TAX_RESIDENCE',countryCode:'SG',source:'USER',supportingQuote:'Singapore tax resident',status:'CANDIDATE'},
    {basis:'SOURCE',countryCode:'SG',source:'USER',supportingQuote:'Singapore source income',status:'CANDIDATE'},
  ]});
}

function declarationPack(){
  return {
    packId:'SG_TEST_CONFIGURATION_INCOME',
    version:1,
    jurisdictionCode:'SG',
    currency:'SGD',
    effectiveFrom:'2026-01-01',
    effectiveTo:'2026-12-31',
    evidenceRefs:[],
    testOnly:false,
    label:'TEST ONLY configuration research candidate',
    rules:[{
      ruleId:'SG_TEST_CONFIGURATION_INCOME_RULE',
      taxType:'INCOME_TAX',
      subjectTypes:['INDIVIDUAL'],
      incomeOrEventType:'BUSINESS_INCOME',
      requiredFacts:{NET_BUSINESS_INCOME:'MONEY'},
      applicabilityPredicate:{op:'LITERAL',valueType:'BOOLEAN',value:true},
      taxBaseFormula:{op:'INPUT',name:'NET_BUSINESS_INCOME'},
      rateDefinition:{kind:'FORMULA_DERIVED'},
      amountFormula:{op:'MULTIPLY',args:[{op:'INPUT',name:'TAX_BASE'},{op:'PARAMETER',code:'RATE'}]},
      parameters:{RATE:{valueType:'NUMBER',value:'0.10'}},
      finalRounding:{mode:'HALF_UP',precision:2},
      effectiveFrom:'2026-01-01',
      effectiveTo:'2026-12-31',
      evidenceRefs:[],
      treatyRelevant:false,
    }],
  };
}

function researchAdapter(){
  let turn=0;
  return {
    injectedFetch:true,
    model:'muse-spark-test',
    requestCount:0,
    async researchTurn(request){
      turn+=1;
      this.requestCount=turn;
      const input=JSON.parse(request.user);
      if(turn===1){
        return {id:'turn-1',status:'completed',output:[{type:'web_search_call',id:'search-1',status:'completed',action:{queries:['site:iras.gov.sg TEST ONLY income tax scale']},results:[{url:officialUrl,title:'TEST ONLY official guidance',snippet:'TEST ONLY snippet, never evidence'}]}]};
      }
      if(turn===2){
        return {id:'turn-2',status:'completed',output:[{type:'function_call',call_id:'call-1',name:'retrieve_regulatory_sources',arguments:JSON.stringify({sources:[{url:officialUrl,jurisdictionCode:'SG',title:'TEST ONLY official guidance',issuingAuthority:'TEST ONLY authority',documentIdentity:'TEST ONLY identity',sourceRole:'OFFICIAL_SOURCE',originalSourceUrl:'',publicationMetadata:'TEST ONLY',reason:'TEST ONLY research'}]})}]};
      }
      if(turn===3){
        const retrieved=input.observedRetrievals?.[0];
        assert.ok(retrieved?.sourceHandle,'retrieved source handle must be observed before reading');
        return {id:'turn-3',status:'completed',output:[{type:'function_call',call_id:'call-2',name:'read_regulatory_passages',arguments:JSON.stringify({selections:[{sourceHandle:retrieved.sourceHandle,findText:'10 percent',pages:[],maxCharacters:2000}]})}]};
      }
      const reading=input.readPassageIndex?.[0];
      assert.ok(reading?.citationOptions?.length,'an anchored citation must be available');
      const option=reading.citationOptions[0];
      const proposition='TEST ONLY synthetic proposition supported by the read passage';
      const proposal={
        status:'CANDIDATE',
        countryPacks:[{
          pack:declarationPack(),
          sourceEvidence:[{sourceHandle:reading.sourceHandle,locator:reading.locator,quote:option.quote}],
          fieldEvidence:[{fieldPath:'candidateRule.legalTest',evidenceIndex:0}],
          propositionSupported:proposition,
          candidateRule:{legalTest:proposition,parameters:[{name:'RATE',value:'0.10',unit:'ratio',evidenceIndex:0}]},
          issuingAuthority:'TEST ONLY authority',
          applicabilityAssessment:{status:'APPLICABILITY_UNRESOLVED',propositionSupported:proposition,supportingEvidenceIndices:[0],sourcePublicationDate:null,sourceRevisionDate:null,supersedingSearches:[],uncertainty:'TEST ONLY effective date is not verified'},
        }],
        treatyPacks:[],
        questionsForUser:[],
        conflicts:[],
        unresolved:[{code:'APPLICABILITY_UNRESOLVED',detail:'TEST ONLY effective date is not verified'}],
      };
      return {id:'turn-4',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(proposal)}]}]};
    },
  };
}

function harness({policyMode='STRICT'}={}){
  const tax=createTaxSystem({includePhase4:false,policyMode});
  const state=profileState();
  const retriever=new ResearchRetriever({root:temp(),fetchImpl:async()=>new Response(`<html><title>TEST ONLY official guidance</title><main>${pageText}</main></html>`,{headers:{'content-type':'text/html'}})});
  const adapter=researchAdapter();
  const service=createConfigurationService({
    system:()=>({registry:tax.registry,engine:tax.engine,governance:tax.governance}),
    profile:()=>state,
    workspace:()=>workspace,
    financial:()=>financial,
    persist:()=>{},
    adapterFactory:()=>adapter,
    retrieverFactory:()=>retriever,
    maxTurns:4,
  });
  return {tax,service,state,adapter};
}

test('Muse research produces a governed CountryPack candidate and the deterministic engine awaits human review',async()=>{
  const {tax,service,adapter}=harness();
  const research=await service.runResearch({actor:'owner'});
  assert.ok(['CANDIDATES_VALIDATED','REVIEW_REQUIRED'].includes(research.research.status));
  assert.equal(research.research.candidateIds.length,1);
  assert.equal(adapter.requestCount,4);
  const candidateId=research.research.candidateIds[0];
  assert.ok(candidateId);
  const candidate=tax.registry.get(candidateId);
  assert.equal(candidate.status,'CANDIDATE');
  assert.equal(candidate.runtimeExecutable,false);
  assert.equal(candidate.executableContent.jurisdictionCode,'SG');
  assert.equal(candidate.executableContent.currency,'SGD');
  assert.equal(candidate.executableContent.rules[0].parameters.RATE.value,'0.10');
  assert.ok(candidate.executableContent.rules[0].evidenceRefs.length);
  assert.ok(candidate.executableContent.evidenceRefs.every((ref)=>ref.sourceUrl===officialUrl));
  const evidence=service.researchEvidence();
  assert.ok(evidence.sources.some((source)=>source.url===officialUrl));
  assert.ok(evidence.readings.some((reading)=>reading.sourceHandle));
  assert.ok(evidence.readings.every((reading)=>typeof reading.excerpt==='string'&&reading.excerpt.length<=400));

  const beforeReview=service.refreshEstimates();
  assert.equal(beforeReview.status,'NO_GOVERNED_RULE');
  assert.ok(beforeReview.pendingReview.some((entry)=>entry.candidateId===candidateId));
  assert.equal(beforeReview.estimates.length,0);

  assert.throws(()=>service.reviewCandidate({candidateId,actor:'muse',reason:'TEST ONLY self approval'}),/human/i);

  const reviewed=service.reviewCandidate({candidateId,actor:'owner',decision:'APPROVED',reason:'TEST ONLY reviewed every source hash'});
  assert.equal(reviewed.status,'APPROVED');
  assert.equal(reviewed.runtimeExecutable,true);

  const prepared=service.estimates();
  assert.equal(prepared.status,'REVIEW_REQUIRED');
  assert.ok(prepared.unresolved.some((entry)=>entry.code==='FACT_CONFIRMATION_REQUIRED'));
  const snapshotHash=prepared.prepared[0].snapshotHash;
  const afterConfirm=service.confirmEstimate({snapshotHash,actor:'owner'});
  assert.equal(afterConfirm.status,'CALCULATED');
  const estimate=afterConfirm.estimates[0];
  assert.equal(estimate.status,'CALCULATED');
  assert.equal(estimate.taxType,'INCOME_TAX');
  assert.equal(estimate.taxableBase.amountMinor,'750000');
  assert.equal(estimate.taxAmount.amountMinor,'75000');
  assert.equal(estimate.rate.kind,'FORMULA_DERIVED');
  assert.equal(estimate.rate.parameters.RATE.value,'0.10');
  assert.ok(estimate.appliedRules.some((rule)=>rule.ruleId==='SG_TEST_CONFIGURATION_INCOME_RULE'));
  assert.ok(estimate.legalSources.length>=1);
  assert.equal(estimate.legalSources[0].sourceUrl,officialUrl);
  assert.ok(estimate.determinationId);
  assert.equal(estimate.postingPerformed,false);
  assert.equal(estimate.authoritativeFiling,false);

  const proposal=service.proposal();
  assert.equal(proposal.contentApprovalRequired,false);
  assert.equal(proposal.requirements.find((entry)=>entry.id==='SG-INCOME_TAX').status,'GOVERNED_EXECUTABLE');
  // Consumption tax has no governed content yet, so the workspace is not fully tax ready.
  assert.equal(proposal.taxReady,false);
  assert.ok(proposal.requirements.some((entry)=>entry.id==='SG-CONSUMPTION_TAX'&&entry.status==='RESEARCH_REQUIRED'))
  assert.throws(()=>service.confirmProposal({proposalHash:proposal.proposalHash,actor:'muse'}),/human/i);
  const confirmation=service.confirmProposal({proposalHash:proposal.proposalHash,actor:'owner'});
  assert.equal(confirmation.decisionSource,'HUMAN');
  assert.equal(confirmation.proposalHash,proposal.proposalHash);
});

test('Muse output cannot approve law, cite unread text, or silently change the researched jurisdiction',async()=>{
  const tax=createTaxSystem({includePhase4:false,policyMode:'STRICT'});
  const retriever=new ResearchRetriever({root:temp(),fetchImpl:async()=>new Response(`<html><title>TEST ONLY official guidance</title><main>${pageText}</main></html>`,{headers:{'content-type':'text/html'}})});
  await retriever.retrieve([{url:officialUrl,jurisdictionCode:'SG',title:'TEST ONLY official guidance',issuingAuthority:'TEST ONLY authority',documentIdentity:'TEST ONLY identity',sourceRole:'OFFICIAL_SOURCE',originalSourceUrl:'',publicationMetadata:'TEST ONLY',reason:'TEST ONLY'}]);
  const handle=[...retriever.sources.keys()][0];
  const reading=(await retriever.read([{sourceHandle:handle,findText:'10 percent',pages:[],maxCharacters:2000}])).passages[0];
  const option=reading.citationOptions[0];
  const job={researchId:'test-run',jurisdictions:['SG'],brief:{jurisdictions:['SG']}};
  const base={status:'CANDIDATE',countryPacks:[{pack:declarationPack(),sourceEvidence:[{sourceHandle:handle,locator:reading.locator,quote:option.quote}],fieldEvidence:[{fieldPath:'candidateRule.legalTest',evidenceIndex:0}],propositionSupported:'TEST ONLY',candidateRule:{legalTest:'TEST ONLY',parameters:[]},issuingAuthority:'TEST ONLY',applicabilityAssessment:{status:'APPLICABILITY_UNRESOLVED',uncertainty:'TEST ONLY'}}],treatyPacks:[],questionsForUser:[],conflicts:[],unresolved:[]};

  const approved=validateConfigurationCandidates({...base,status:'APPROVED'},{job,retriever,registry:tax.registry});
  assert.equal(approved.status,'REJECTED');

  const unread=validateConfigurationCandidates({...base,countryPacks:[{...base.countryPacks[0],sourceEvidence:[{sourceHandle:handle,locator:reading.locator,quote:'SEARCH SNIPPET NOT READ'}]}]},{job,retriever,registry:tax.registry});
  assert.equal(unread.status,'REJECTED');

  const otherJurisdiction=validateConfigurationCandidates({...base,countryPacks:[{...base.countryPacks[0],pack:{...declarationPack(),jurisdictionCode:'ID'}}]},{job,retriever,registry:tax.registry});
  assert.equal(otherJurisdiction.status,'REJECTED');
});

test('estimates report absent governed content and unmapped financial facts instead of inventing amounts',()=>{
  const tax=createTaxSystem({includePhase4:false,policyMode:'STRICT'});
  const configurationState=profileState();
  const empty=estimateTaxes({registry:tax.registry,engine:tax.engine,configuration:require('../src/configuration/requirements').deriveConfiguration({profileState:configurationState,registry:tax.registry}),financial,workspace});
  assert.equal(empty.status,'NO_GOVERNED_RULE');
  assert.deepEqual(empty.estimates,[]);
  assert.ok(empty.unresolved.some((entry)=>entry.code==='NO_GOVERNED_RULE_FOR_PROFILE'));
});

test('posted accounting records stay authoritative over externally supplied monetary facts',async()=>{
  const {tax,service}=harness();
  const research=await service.runResearch({actor:'owner'});
  service.reviewCandidate({candidateId:research.research.candidateIds[0],actor:'owner',decision:'APPROVED',reason:'TEST ONLY reviewed every source hash'});
  const configurationState=service.configuration();
  const claim=[{name:'NET_BUSINESS_INCOME',type:'MONEY',value:{amountMinor:'1',currency:'SGD'},evidenceReference:'TEST ONLY user claim'}];
  const prepared=estimateTaxes({registry:tax.registry,configuration:configurationState,financial,workspace,confirmedFacts:claim});
  const snapshotHash=prepared.prepared[0].snapshotHash;
  const snapshotMoney=prepared.prepared[0].snapshot.facts.find((entry)=>entry.name==='NET_BUSINESS_INCOME');
  assert.equal(snapshotMoney.value.amountMinor,'750000');
  assert.match(snapshotMoney.evidenceReference,/^financial-position:/);
  const calculated=estimateTaxes({registry:tax.registry,engine:tax.engine,configuration:configurationState,financial,workspace,confirmedFacts:claim,confirmations:{[snapshotHash]:{actor:'owner',reviewedSnapshotHash:snapshotHash}}});
  assert.equal(calculated.status,'CALCULATED');
  assert.equal(calculated.estimates[0].taxableBase.amountMinor,'750000');
});

test('HACKATHON_DEMO estimates use the same engine with explicit provisional disclosure only',async()=>{
  const {service}=harness({policyMode:'HACKATHON_DEMO'});
  const research=await service.runResearch({actor:'owner'});
  const candidateId=research.research.candidateIds[0];
  const candidate=service.candidates().find((entry)=>entry.candidateId===candidateId);
  assert.equal(candidate.governance,'AUTO_APPROVED_DEMO');
  const estimates=service.refreshEstimates();
  assert.equal(estimates.status,'CALCULATED');
  assert.equal(estimates.estimates[0].taxAmount.amountMinor,'75000');
  assert.ok(estimates.estimates[0].demoDisclosures.length>=1);
  assert.match(estimates.estimates[0].demoDisclosures[0].applicabilityWarning,/EFFECTIVE_PERIOD_NOT_VERIFIED|PROVISIONAL|NOT_FULLY_VERIFIED/i);
});
