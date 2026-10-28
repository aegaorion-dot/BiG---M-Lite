// Real retained law; fictional facts; simulated human workflow; isolated memory ONLY.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {installPgShim,restorePg,sql} from './helpers/pglite-swap.mjs';
import {synthPolicies,postFlow,principal} from './helpers/fs-golden.mjs';
const root='content/tax/cross-border/id-sg-interest-2025',out='docs/evidence/id-sg-first-real-cross-border';
mkdirSync(out,{recursive:true});
const read=f=>JSON.parse(readFileSync(`${root}/${f}`,'utf8')),sha=x=>createHash('sha256').update(x).digest('hex');
const save=(f,x)=>writeFileSync(`${out}/${f}`,JSON.stringify(x,null,2)+'\n');
const checks=[],cases=read('cases.json'),states=[];
const check=(id,name,ok,detail={})=>{checks.push({id,name,ok:!!ok,detail});assert.ok(ok,`${id}: ${name}: ${JSON.stringify(detail)}`);console.log(`PASS ${id} ${name}`);};
const reject=async fn=>{try{return {rejected:false,result:await fn()};}catch(e){return {rejected:true,message:e.message};}};
const failClosed=x=>x?.rejected||x?.status==='REVIEW_REQUIRED'||x?.status==='INSUFFICIENT_FACTS'||x?.status==='NOT_APPLICABLE';
const review='SIMULATED_ISOLATED_ACCEPTANCE_REVIEW; fictional dossiers, not actual taxpayer or professional approval';
const approval={decisionSource:'HUMAN',supportReviewConfirmed:true,reviewNotes:review,evidenceReference:review};
let error=null,snapshot,before;
installPgShim();
try{
  const mods={ctx:await import('../src/accountingContextServer.ts'),ev:await import('../src/accountingEventServer.ts'),pol:await import('../src/accountingPolicyServer.ts'),det:await import('../src/accountingDeterminationServer.ts'),jnl:await import('../src/accountingJournalServer.ts'),post:await import('../src/accountingPostingServer.ts')};
  await mods.post.ensureAccountingLedgerSchema();
  // Finish both independent controlled postings before the Tax before/after boundary.
  for(const scenario of cases){
    const co=`IDSG_INTEREST_${scenario.key}_CONTROLLED`,p=principal(co);
    await mods.ctx.bootstrapAccountingContext({companyKey:co,createdBy:p.ownerIdentity,functionalCurrency:scenario.currency,fiscalYear:2025});
    const nativeEvent=mods.ev.createCanonicalEvent,localMods={...mods,ev:{...mods.ev,createCanonicalEvent:(input,actor)=>nativeEvent({...input,transactionCurrency:scenario.currency},actor)}};
    const setup=await synthPolicies(co,localMods),ac=setup.ctx;
    await mods.ctx.ensureFiscalYearPeriods(co,ac.calendar.calendar_id,ac.entity.entity_id,2025,p.ownerIdentity);
    const posted=await postFlow(co,localMods,{entityId:ac.entity.entity_id,type:'CASH_PAYMENT',attrs:{economic_subject:'operating_expense',reviewedNature:'Only stipulated gross ordinary loan interest; withholding not posted by Tax'},amount:scenario.gross,key:`interest-${scenario.key}`,date:scenario.eventDate});
    assert.equal(posted.posted?.status,'posted',JSON.stringify(posted));states.push({scenario,co,p,setup,ac,posted});
  }
  snapshot=async()=>{
    const tables={};for(const table of ['bigm_accounting_journal','bigm_accounting_journal_line','bigm_accounting_ledger_entry']){
      const rows=(await sql(`SELECT * FROM ${table} ORDER BY 1`)).rows;tables[table]={count:rows.length,fullRowsSha256:sha(JSON.stringify(rows))};
    }
    const rows=(await sql('SELECT * FROM bigm_accounting_journal WHERE posted_at IS NOT NULL ORDER BY 1')).rows;
    tables.postedJournal={count:rows.length,fullRowsSha256:sha(JSON.stringify(rows))};return tables;
  };
  before=await snapshot();save('accounting-controlled-before.json',before);assert.equal(before.postedJournal.count,2);assert.equal(before.bigm_accounting_ledger_entry.count,4);
  const tax=await import('../src/taxCoreServer.ts'),loader=await import('../src/taxManualContentServer.ts');await tax.ensureTaxCoreSchema();
  for(const code of ['ID','SG']){
    const registered=(await tax.listJurisdictions()).find(j=>j.code===code);
    if(!registered){const draft=await tax.proposeJurisdiction({code,name:code==='ID'?'Indonesia':'Singapore',jurisdictionLevel:'COUNTRY',authorityName:code==='ID'?'DJP':'IRAS',effectiveFrom:'2020-01-01',evidenceReference:'CONTROLLED_REGISTRY_WINDOW_NOT_LAW_COMMENCEMENT'},states[0].p);await tax.approveJurisdiction(draft.jurisdiction_id,{decisionSource:'HUMAN',evidenceReference:review},states[0].p);}
  }
  for(const s of states){
    const {scenario:c,p}=s;
    const payer=await tax.createTaxSubject({subjectType:'COMPANY',legalName:`Fictional ${c.source} private borrower ${c.key}`,effectiveFrom:'2020-01-01'},p);
    const recipient=await tax.createTaxSubject({subjectType:'COMPANY',legalName:`Fictional ${c.residence} private lender ${c.key}`,effectiveFrom:'2020-01-01'},p);
    const tp=await tax.createTaxPeriod({taxSubjectId:payer.tax_subject_id,jurisdictionCode:c.source,periodCode:`INTEREST-${c.key}-2025`,startDate:c.from,endDate:c.to},p);
    const recipientPeriod=await tax.createTaxPeriod({taxSubjectId:recipient.tax_subject_id,jurisdictionCode:c.residence,periodCode:`LENDER-${c.key}-2025`,startDate:c.from,endDate:c.to},p);
    Object.assign(s,{payer,recipient,tp,recipientPeriod,facts:[],evidence:[],packs:{},executions:{}});
    s.fact=async(type,value,{subject=payer,jurisdiction=c.source,period=tp,from=c.from,to=c.to,sourceReference}={})=>{
      const f=await tax.createTaxFact({taxSubjectId:subject.tax_subject_id,jurisdictionCode:jurisdiction,taxPeriodId:period?.tax_period_id,factType:type,value,effectiveFrom:from,effectiveTo:to,sourceType:'DOCUMENT',sourceReference:sourceReference||`CONTROLLED_CASE:${c.key}:${type}:${randomUUID()}`,evidenceReference:`CASE_SHA256:${sha(JSON.stringify(c))};${review}`},p);
      const approved=await tax.approveTaxFact(f.tax_fact_id,{approvalEvidenceReference:review},p);s.facts.push(approved);return approved;
    };
    const residence=await s.fact('RESIDENCE',{jurisdictionCode:c.source,reviewed:true,basis:'Stipulated sole domestic residence, incorporation and board/control; Article 4(1); no dual residence'},{period:null});
    const lenderResidence=await s.fact('RESIDENCE',{jurisdictionCode:c.residence,reviewed:true,basis:c.residenceEvidence},{subject:recipient,jurisdiction:c.residence,period:null});
    const foreignBusiness=await s.fact('BUSINESS',{jurisdictionCode:c.residence,relationship:'Reviewed payment relationship to resident lender; no payer residence or permanent establishment inferred'},{jurisdiction:c.residence,period:null});
    const terms=await s.fact('INTEREST_TERMS',{...c.terms,payerTaxSubjectId:payer.tax_subject_id,recipientTaxSubjectId:recipient.tax_subject_id,payerResidenceFactId:residence.tax_fact_id,recipientResidenceFactId:lenderResidence.tax_fact_id,grossAmount:c.gross,eventDate:c.eventDate});
    Object.assign(s,{residence,lenderResidence,foreignBusiness,terms});
    for(const [type,object] of [['CONTROLLED_LOAN_AND_RESIDENCE_DOSSIER',{c,payer,recipient,residence,lenderResidence,foreignBusiness}],['POSTED_ACCOUNTING_PAYMENT',s.posted]]){
      const ref=`CONTROLLED:${c.key}:${type}:${sha(JSON.stringify(object))}`;
      const link=await tax.linkTaxEvidence({taxSubjectId:payer.tax_subject_id,evidenceReference:ref,sourceSystem:'CONTROLLED_ACCEPTANCE',sourceObjectType:type,sourceObjectId:`${c.key}:${type}`,sha256:sha(JSON.stringify(object))},p);
      s.evidence.push(await tax.verifyTaxEvidence(link.evidence_link_id,p));
    }
    const bind=await tax.createAccountingTaxBinding({taxSubjectId:payer.tax_subject_id,accountingEntityId:s.ac.entity.entity_id,accountingLedgerId:s.ac.ledger.ledger_id,effectiveFrom:c.from,effectiveTo:c.to},p);
    await tax.approveAccountingTaxBinding(bind.binding_id,{evidenceReference:review},p);
    const june=(await sql('SELECT * FROM bigm_accounting_period WHERE company_key=$1 AND fiscal_year=2025 AND period_number=6',[s.co])).rows[0];assert.ok(june);
    const pb=await tax.createTaxPeriodAccountingBinding({taxPeriodId:tp.tax_period_id,accountingBindingId:bind.binding_id,accountingPeriodId:june.period_id},p);await tax.approveTaxPeriodAccountingBinding(pb.period_binding_id,{evidenceReference:review},p);
    const scope=await tax.createAccountingSourceScope(pb.period_binding_id,{scopeType:'LEDGER_PERIOD'},p);await tax.approveAccountingSourceScope(scope.source_scope_id,{evidenceReference:review},p);
    const bridge=await tax.readAuthoritativeAccountingTaxSource(pb.period_binding_id,p),expense=bridge.rows.find(x=>x.account_id===s.setup.expAcct.account_id);assert.equal(Number(expense.period_debit),c.gross);
    const mapping=await tax.createFiscalMapping({taxSubjectId:payer.tax_subject_id,mappingCode:'REVIEWED_GROSS_ORDINARY_INTEREST',sourceAccountId:expense.account_id,jurisdictionCode:c.source,taxTypeCode:'WHT'},p);
    const mv=await tax.createFiscalMappingVersion(mapping.mapping_id,{fiscalCategory:'REVIEWED_ORDINARY_GROSS_INTEREST_PAYMENT',effectiveFrom:c.from,effectiveTo:c.to},p);await tax.approveFiscalMappingVersion(mv.mapping_version_id,{evidenceReference:review},p);
    const mapped=await tax.resolveAccountingFiscalMapping(expense.source_id,{jurisdictionCode:c.source,taxTypeCode:'WHT',asOfDate:c.eventDate},p);assert.equal(mapped.resolution_status,'MAPPED',JSON.stringify(mapped));
    Object.assign(s,{bind,june,pb,scope,bridge,expense,mapping,mv,mapped});
    for(const kind of ['domestic','treaty']){
      const m=read(`${c.source.toLowerCase()}-${kind}.manifest.v1.json`),validation=loader.validateManualContent(m,p);assert.ok(validation.valid,JSON.stringify(validation.errors));
      const draft=await loader.stageManualContent(m,p);assert.ok(draft.packVersionId,JSON.stringify(draft));
      const blocked=await reject(()=>tax.proposeSubjectCountryPack({taxSubjectId:payer.tax_subject_id,packCode:draft.packCode,packVersion:1,effectiveFrom:c.from,effectiveTo:c.to},p));assert.ok(blocked.rejected);
      const approved=await loader.approveManualContent(draft.packVersionId,approval,p);
      const proposed=await tax.proposeSubjectCountryPack({taxSubjectId:payer.tax_subject_id,packCode:draft.packCode,packVersion:1,effectiveFrom:c.from,effectiveTo:c.to,applicabilityFactIds:[residence.tax_fact_id],applicabilityReason:'Only exact reviewed ordinary interest context and retained independent legal source'},p);
      const config=await tax.confirmSubjectCountryPack(proposed.pack_config_version_id,{confirmationEvidenceReference:review},p);
      const governed=(await sql('SELECT * FROM bigm_tax_governed_knowledge_version WHERE governed_version_id=$1',[approved.governedVersionId])).rows[0];
      const decision=(await sql('SELECT * FROM bigm_tax_ai_governance_decision WHERE governance_decision_id=$1',[governed.governance_decision_id])).rows[0];
      const bindings=config.bindings;
      for(const b of bindings){const row=(await sql('SELECT r.rule_code FROM bigm_tax_rule_version v JOIN bigm_tax_rule r ON r.rule_id=v.rule_id WHERE v.rule_version_id=$1',[b.rule_version_id])).rows[0];b.canonicalRuleCode=row.rule_code;}
      s.packs[kind]={m,draft,approved,config,governed,decision,bindings,unapprovedBindingDenied:blocked};
    }
    const obligations=(await tax.discoverTaxObligations({taxSubjectId:payer.tax_subject_id,taxPeriodId:tp.tax_period_id,jurisdictionCodes:[c.source],asOfDate:c.eventDate},p)).results;
    for(const kind of ['domestic','treaty']){s.packs[kind].obligation=obligations.find(x=>x.pack_version_id===s.packs[kind].draft.packVersionId);assert.equal(s.packs[kind].obligation?.status,'APPLICABLE_CANDIDATE',JSON.stringify(obligations));}
    s.execute=async(kind,suffix,overrides={})=>{
      const b=s.packs[kind].bindings.find(x=>x.rule_code.endsWith(`_${suffix}`));assert.ok(b,`${kind}:${suffix}`);
      return tax.executeTaxRule({ruleCode:b.canonicalRuleCode,taxSubjectId:payer.tax_subject_id,taxPeriodId:tp.tax_period_id,jurisdictionCode:c.source,taxTypeCode:'WHT',asOfDate:c.eventDate,...overrides},p);
    };
    const event=await tax.createCrossBorderEvent({taxSubjectId:payer.tax_subject_id,taxPeriodId:tp.tax_period_id,eventSeriesKey:`REAL_INTEREST_${c.key}`,eventDate:c.eventDate,eventKind:'ORDINARY_DEBT_CLAIM_INTEREST_PAYMENT',jurisdictionCodes:[c.source,c.residence],factBundle:{interestTermsFactId:terms.tax_fact_id,payerTaxSubjectId:payer.tax_subject_id,recipientTaxSubjectId:recipient.tax_subject_id,recipientResidenceFactId:lenderResidence.tax_fact_id},currency:c.currency,amount:c.gross,sourceFactIds:[terms.tax_fact_id],evidenceLinkIds:s.evidence.map(x=>x.evidence_link_id)},p);
    s.event=await tax.confirmCrossBorderEvent(event.cross_border_event_id,{confirmationEvidenceReference:review},p);
    const component=(kind,execution,role,valueType='CLASSIFICATION')=>({obligationDiscoveryId:s.packs[kind].obligation.discovery_id,ruleExecutionId:execution.execution_id,role,valueType});s.component=component;
    s.determine=(kind,components,overrides={})=>tax.determineInternationalTax({taxSubjectId:payer.tax_subject_id,taxPeriodId:tp.tax_period_id,crossBorderEventId:event.cross_border_event_id,jurisdictionCode:c.source,effectiveDate:c.eventDate,determinationKind:kind,determinationSeriesKey:`${c.key}:${kind}`,components,...overrides},p);
    // Native context determinations precede every amount calculation.
    s.executions.source=await s.execute('treaty','SOURCE');s.executions.residence=await s.execute('treaty','PAYER_RESIDENCE');
    s.sourceContext=await s.determine('SOURCE',[component('treaty',s.executions.source,'CLASSIFICATION')]);
    s.residenceContext=await s.determine('RESIDENCE',[component('treaty',s.executions.residence,'CLASSIFICATION')]);
    assert.equal(s.sourceContext.status,'DETERMINISTICALLY_SUPPORTED',JSON.stringify(s.sourceContext));assert.equal(s.residenceContext.status,'DETERMINISTICALLY_SUPPORTED',JSON.stringify(s.residenceContext));
    s.missingEligibilityExecution=await s.execute('treaty','ELIGIBILITY');
    s.missingEligibility=await s.determine('TREATY_TREATMENT',[component('treaty',s.missingEligibilityExecution,'CLASSIFICATION')],{determinationSeriesKey:`${c.key}:MISSING_ELIGIBILITY`});
    assert.equal(s.missingEligibility.status,'REVIEW_REQUIRED',JSON.stringify(s.missingEligibility));assert.equal(s.missingEligibility.determined_amount,null);
    s.executions.domestic=await s.execute('domestic','AMOUNT');assert.equal(s.executions.domestic.status,'DETERMINED',JSON.stringify(s.executions.domestic));
    s.domestic=await s.determine('SOURCE',[component('treaty',s.executions.source,'CLASSIFICATION'),component('domestic',s.executions.domestic,'AMOUNT','NUMBER')],{determinationSeriesKey:`${c.key}:DOMESTIC`});
    assert.equal(Number(s.domestic.determined_amount),c.expectedDomestic,JSON.stringify(s.domestic));
    s.eligibility=await s.fact('TREATY_ELIGIBILITY',{...c.eligibility,reviewedRecipientSubjectId:recipient.tax_subject_id,recipientResidenceFactId:lenderResidence.tax_fact_id,reviewDossier:c.eligibilityEvidence});
    // Independently test missing numeric domestic-stage fact after eligibility exists.
    s.missingAmount=await s.execute('treaty','AMOUNT');assert.equal(s.missingAmount.output_json,null);
    // Native result relay is an explicitly approved fact, not an external tax calculator.
    s.domesticRelay=await s.fact('DOMESTIC_WHT_AMOUNT',Number(s.domestic.determined_amount),{sourceReference:`NATIVE_M2:${s.executions.domestic.execution_id}:${s.executions.domestic.replay_hash};NATIVE_M11:${s.domestic.international_determination_id}:${s.domestic.replay_hash}`});
    s.executions.eligibility=await s.execute('treaty','ELIGIBILITY');s.executions.treaty=await s.execute('treaty','AMOUNT');assert.equal(s.executions.treaty.status,'DETERMINED',JSON.stringify(s.executions.treaty));
    s.finalComponents=[component('treaty',s.executions.eligibility,'CLASSIFICATION'),component('domestic',s.executions.domestic,'DOMESTIC_AMOUNT','NUMBER'),component('treaty',s.executions.treaty,'AMOUNT','NUMBER')];
    s.newTreaty=async(label,from='2025-06-01',to=c.to)=>{
      const pack=await tax.createTreatyPack({packCode:`RETAINED_REAL_IDSG_INTEREST:${c.key}:${label}`,jurisdictionA:'ID',jurisdictionB:'SG'},p),g=s.packs.treaty.governed;
      const v=await tax.createTreatyVersion(pack.treaty_pack_id,{effectiveFrom:from,effectiveTo:to,coveredTaxTypes:['WHT'],requiredFacts:['INTEREST_TERMS','TREATY_ELIGIBILITY'],requiredEvidence:['REVIEWED_CERTIFIED_RESIDENCE_AND_ELIGIBILITY_DOSSIER'],legalSourceReference:s.packs.treaty.m.sources[0].canonicalUrl,humanJudgementPoints:['Beneficial ownership','Principal purpose','Domestic administrative eligibility','Sole Article 4 residence','No effective PE or fixed-base connection'],rule:{boundedArticle:'11',legalWhtEffectiveFrom:'2022-01-01',coverageWindowMeaning:'Reviewed applicability subset; not legal commencement/repeal'},governedVersionId:g.governed_version_id,configSourceId:g.lineage.configSourceId,governanceDecisionId:g.governance_decision_id,sourceHash:g.lineage.sourceHash,canonicalUrl:g.lineage.canonicalUrl,citations:g.lineage.citations,knowledgeClass:'EXECUTABLE_KNOWLEDGE'},p);
      for(const kind of ['domestic','treaty'])for(const b of s.packs[kind].bindings)await tax.bindTreatyRule(v.treaty_version_id,{ruleVersionId:b.rule_version_id,formulaVersionId:b.formula_version_id,parameterVersionIds:b.parameter_version_ids,treatmentCode:'ORDINARY_INTEREST_ART11_SOURCE_CAP'},p);
      return {pack,version:v};
    };
    s.treaty=await s.newTreaty('CURRENT');
    s.unapprovedTreaty=await s.determine('TREATY_TREATMENT',s.finalComponents,{treatyVersionId:s.treaty.version.treaty_version_id,determinationSeriesKey:`${c.key}:UNAPPROVED`});assert.equal(s.unapprovedTreaty.status,'REVIEW_REQUIRED');
    s.treaty.version=await tax.approveTreatyVersion(s.treaty.version.treaty_version_id,{approvalEvidenceReference:review},p);
    s.result=await s.determine('TREATY_TREATMENT',s.finalComponents,{treatyVersionId:s.treaty.version.treaty_version_id});
    assert.equal(s.result.status,'DETERMINISTICALLY_SUPPORTED',JSON.stringify(s.result));assert.equal(Number(s.result.determined_amount),c.expectedTreaty,JSON.stringify(s.result));
    s.replay=await s.determine('TREATY_TREATMENT',s.finalComponents,{treatyVersionId:s.treaty.version.treaty_version_id});
    console.log(`DETERMINED ${c.direction}: domestic ${s.domestic.determined_amount}, treaty ${s.result.determined_amount} ${c.currency}`);
  }
  const [a,b]=states;
  check(1,'Correct ID to SG context and governed source WHT',Number(a.result.determined_amount)===10000000&&Number(a.domestic.determined_amount)===20000000&&a.result.currency==='IDR',{source:a.scenario.source,residence:a.scenario.residence,domestic:a.domestic.determined_amount,treaty:a.result.determined_amount});
  check(2,'Correct SG to ID context and independently governed source WHT',Number(b.result.determined_amount)===20000&&Number(b.domestic.determined_amount)===30000&&b.result.currency==='SGD',{source:b.scenario.source,residence:b.scenario.residence,domestic:b.domestic.determined_amount,treaty:b.result.determined_amount});
  const negative=async(s,id,overrides)=>s.determine('TREATY_TREATMENT',s.finalComponents,{treatyVersionId:s.treaty.version.treaty_version_id,determinationSeriesKey:`${s.scenario.key}:NEGATIVE:${id}`,...overrides});
  const swapped=await negative(a,3,{jurisdictionCode:a.scenario.residence});
  check(3,'Swapped source and residence cannot reuse result',swapped.status==='REVIEW_REQUIRED'&&swapped.determined_amount===null,swapped);
  const wrongJur=await reject(()=>a.execute('domestic','AMOUNT',{jurisdictionCode:'SG'}));
  const oppositeRule=await reject(()=>tax.executeTaxRule({ruleCode:b.packs.domestic.bindings.find(x=>x.rule_code.endsWith('_AMOUNT')).canonicalRuleCode,taxSubjectId:a.payer.tax_subject_id,taxPeriodId:a.tp.tax_period_id,jurisdictionCode:'ID',taxTypeCode:'WHT',asOfDate:a.scenario.eventDate},a.p));
  check(4,'Wrong jurisdiction and opposite governed content cannot leak',failClosed(wrongJur.result||wrongJur)&&failClosed(oppositeRule.result||oppositeRule),{wrongJur,oppositeRule});
  const wrongSubject=await reject(()=>negative(a,5,{taxSubjectId:a.recipient.tax_subject_id}));
  const wrongOwner=await tax.getInternationalDetermination(a.result.international_determination_id,b.p);
  check(5,'Wrong subject and tenant cannot access event or result',wrongSubject.rejected&&wrongOwner===null,{wrongSubject,wrongOwner});
  const otherPeriod=await tax.createTaxPeriod({taxSubjectId:a.payer.tax_subject_id,jurisdictionCode:'ID',periodCode:'WRONG-2024',startDate:'2024-01-01',endDate:'2024-12-31'},a.p);
  const wrongPeriod=await reject(()=>negative(a,6,{taxPeriodId:otherPeriod.tax_period_id}));check(6,'Wrong Tax period cannot leak',wrongPeriod.rejected,wrongPeriod);
  const wrongType=await a.execute('domestic','AMOUNT',{taxTypeCode:'CIT'});check(7,'Wrong tax type cannot use WHT content',failClosed(wrongType)&&wrongType.output_json===null,wrongType);
  const unrelated=await negative(a,8,{treatyVersionId:b.treaty.version.treaty_version_id});check(8,'Other owned-context treaty cannot apply',unrelated.status==='REVIEW_REQUIRED'&&unrelated.determined_amount===null&&unrelated.reason_code==='EXACT_APPLICABLE_TREATY_VERSION_REQUIRED',unrelated);
  const expired=await a.newTreaty('OUTSIDE_WINDOW','2025-01-01','2025-05-31');expired.version=await tax.approveTreatyVersion(expired.version.treaty_version_id,{approvalEvidenceReference:review},a.p);
  const outOfWindow=await negative(a,9,{treatyVersionId:expired.version.treaty_version_id});check(9,'Approved treaty version outside its reviewed window cannot apply',outOfWindow.status==='REVIEW_REQUIRED'&&outOfWindow.determined_amount===null&&outOfWindow.reason_code==='EXACT_APPLICABLE_TREATY_VERSION_REQUIRED',{expiredVersion:expired.version,result:outOfWindow});
  check(10,'Unapproved treaty and content cannot execute',states.every(s=>s.unapprovedTreaty.status==='REVIEW_REQUIRED'&&s.unapprovedTreaty.determined_amount===null&&Object.values(s.packs).every(k=>k.unapprovedBindingDenied.rejected)),states.map(s=>({key:s.scenario.key,unapprovedTreaty:s.unapprovedTreaty,contentBindingDenials:Object.values(s.packs).map(k=>k.unapprovedBindingDenied)})));
  check(12,'Missing treaty eligibility gives REVIEW_REQUIRED',states.every(s=>s.missingEligibility.status==='REVIEW_REQUIRED'&&s.missingEligibility.determined_amount===null),states.map(s=>s.missingEligibility));
  const conflicting=await a.newTreaty('CONFLICT_NEGATIVE');conflicting.version=await tax.approveTreatyVersion(conflicting.version.treaty_version_id,{approvalEvidenceReference:review},a.p);
  const conflict=await negative(a,13);check(13,'Multiple effective governed treaty contents fail closed',conflict.status==='REVIEW_REQUIRED'&&conflict.reason_code==='CONFLICTING_ACTIVE_TREATY_VERSIONS'&&conflict.determined_amount===null,conflict);
  await tax.retireTaxTreatyVersion(conflicting.version.treaty_version_id,{effectiveTo:'2025-12-31',evidenceReference:review},a.p);
  check(14,'Missing required facts never become false or zero',states.every(s=>s.missingEligibilityExecution.status==='INSUFFICIENT_FACTS'&&s.missingEligibilityExecution.output_json===null&&s.missingAmount.status==='INSUFFICIENT_FACTS'&&s.missingAmount.output_json===null),states.map(s=>({classification:s.missingEligibilityExecution,amount:s.missingAmount})));
  check(15,'Exact native deterministic replay preserves result and hash',states.every(s=>s.result.international_determination_id===s.replay.international_determination_id&&s.result.replay_hash===s.replay.replay_hash&&s.result.determined_amount===s.replay.determined_amount),states.map(s=>({key:s.scenario.key,id:s.result.international_determination_id,replayedId:s.replay.international_determination_id,hash:s.result.replay_hash,replayedHash:s.replay.replay_hash})));
  check(16,'Domestic source, execution and approved amount relay remain in lineage',states.every(s=>s.result.rule_execution_ids.includes(s.executions.domestic.execution_id)&&s.result.fact_lineage.includes(s.domesticRelay.tax_fact_id)&&s.result.governance_lineage.some(g=>g.sourceHash===s.packs.domestic.m.sources[0].sha256)),states.map(s=>({result:s.result,domestic:s.domestic,relay:s.domesticRelay})));
  check(17,'Treaty source, article locators and approvals remain in lineage',states.every(s=>s.result.lineage.treaty.sourceHash===s.packs.treaty.m.sources[0].sha256&&s.result.lineage.treaty.citations.length===5&&s.result.lineage.treaty.governedVersionId===s.packs.treaty.governed.governed_version_id),states.map(s=>s.result.lineage.treaty));
  check(18,'Source and residence context retained before amount calculation',states.every(s=>s.sourceContext.status==='DETERMINISTICALLY_SUPPORTED'&&s.residenceContext.status==='DETERMINISTICALLY_SUPPORTED'&&new Date(s.executions.domestic.executed_at)>=new Date(s.sourceContext.created_at)&&new Date(s.executions.domestic.executed_at)>=new Date(s.residenceContext.created_at)&&s.result.fact_lineage.includes(s.terms.tax_fact_id)&&s.result.lineage.jurisdictionIds.length===2),states.map(s=>({key:s.scenario.key,terms:s.terms,source:s.sourceContext,payerResidence:s.residenceContext,lenderResidence:s.lenderResidence,firstAmountExecutedAt:s.executions.domestic.executed_at})));
  check(19,'Both Tax Subjects and owned transaction/event identities retained',states.every(s=>s.event.fact_bundle.payerTaxSubjectId===s.payer.tax_subject_id&&s.event.fact_bundle.recipientTaxSubjectId===s.recipient.tax_subject_id&&s.result.lineage.eventId===s.event.cross_border_event_id&&s.result.lineage.taxSubjectId===s.payer.tax_subject_id),states.map(s=>({event:s.event,lineage:s.result.lineage})));
  // Real governed treaty lifecycle, never SQL alteration of status to force a result.
  const historical=await tax.getInternationalDetermination(a.result.international_determination_id,a.p);
  const retired=await tax.retireTaxTreatyVersion(a.treaty.version.treaty_version_id,{effectiveTo:'2025-12-31',evidenceReference:review},a.p);
  const retiredNew=await negative(a,11);
  const preserved=await tax.getInternationalDetermination(a.result.international_determination_id,a.p);
  check(11,'Retired treaty cannot execute new authoritative determination; history preserved',retired.status==='RETIRED'&&retiredNew.status==='REVIEW_REQUIRED'&&retiredNew.determined_amount===null&&sha(JSON.stringify(historical))===sha(JSON.stringify(preserved)),{retired,result:retiredNew,historicalHash:sha(JSON.stringify(historical)),preservedHash:sha(JSON.stringify(preserved))});
  const after=await snapshot();save('accounting-controlled-after.json',after);check(20,'Accounting counts and complete row digests unchanged',JSON.stringify(before)===JSON.stringify(after),{before,after});
  const semantics=states.map(s=>({direction:s.scenario.direction,source:s.scenario.source,residence:s.scenario.residence,currency:s.scenario.currency,eventDate:s.scenario.eventDate,gross:s.scenario.gross,domestic:Number(s.domestic.determined_amount),treaty:Number(s.result.determined_amount),sourceHash:s.packs.domestic.m.sources[0].sha256,treatyHash:s.packs.treaty.m.sources[0].sha256,domesticManifestSha256:sha(JSON.stringify(s.packs.domestic.m)),treatyManifestSha256:sha(JSON.stringify(s.packs.treaty.m)),formula:read(`${s.scenario.source.toLowerCase()}-treaty.manifest.v1.json`).entries.at(-1).rule.formula.expressionAst}));
  save('reproduction.json',{semantics,semanticSha256:sha(JSON.stringify(semantics)),exactReplay:checks.find(x=>x.id===15),integerOracles:[{direction:'ID_TO_SG',gross:'100000000',domestic:'20000000',cap:'10000000',final:String(100000000n*10n/100n)},{direction:'SG_TO_ID',gross:'200000',domestic:'30000',cap:'20000',final:String(200000n*10n/100n)}]});
  for(const s of states){
    // Retain the actual immutable native versions and Accounting-derived fact,
    // as well as IDs/authoring manifests, so lineage can be inspected offline.
    const bindings=Object.values(s.packs).flatMap(x=>x.bindings);
    s.nativeContentRows={};
    for(const [label,table,key,ids] of [
      ['packVersions','bigm_tax_country_pack_version','pack_version_id',Object.values(s.packs).map(x=>x.draft.packVersionId)],
      ['legalSources','bigm_tax_ai_config_source','config_source_id',bindings.map(x=>x.config_source_id)],
      ['ruleVersions','bigm_tax_rule_version','rule_version_id',bindings.map(x=>x.rule_version_id)],
      ['formulaVersions','bigm_tax_formula_version','formula_version_id',bindings.map(x=>x.formula_version_id).filter(Boolean)],
      ['parameterVersions','bigm_tax_parameter_version','parameter_version_id',bindings.flatMap(x=>x.parameter_version_ids)],
    ])s.nativeContentRows[label]=(await sql(`SELECT * FROM ${table} WHERE ${key}=ANY($1::uuid[]) ORDER BY 1`,[[...new Set(ids)]])).rows;
    s.nativeContentRows.approvedFacts=(await sql('SELECT * FROM bigm_tax_fact WHERE company_key=$1 ORDER BY 1',[s.co])).rows;
    const {fact,execute,determine,component,newTreaty,setup,...serializable}=s;save(`case-${s.scenario.key.toLowerCase()}-complete-lineage.json`,serializable);
  }
  save('negative-control-lineage.json',{swapped,wrongJur,oppositeRule,wrongSubject,wrongPeriod,wrongType,unrelated,expired,outOfWindow,conflicting,conflict,retired,retiredNew});
}catch(e){error={classification:'UNCLASSIFIED_PENDING_REVIEW',message:e.message,stack:e.stack};console.error(e.stack||e.message);}
finally{
  if(snapshot){const after=await snapshot();save('accounting-controlled-after.json',after);}
  restorePg();checks.sort((a,b)=>a.id-b.id);save('acceptance.json',{total:20,passed:checks.filter(c=>c.ok).length,checks,error,approvalBoundary:review});
}
if(error)throw Error(error.message);
