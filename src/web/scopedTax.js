'use strict';
// Ownership/evidence adapter around the ONE Universal Tax Engine. No tax rates.
const {Money}=require('../domain/money'),{fingerprint,deepFreeze}=require('../onboarding/canonical'),{candidateTaxFacts,confirmTaxFacts}=require('../tax/facts');
const copy=x=>JSON.parse(JSON.stringify(x));
function createScopedCalculation({state,system,financial,workspace,profileRevision,persist}){
 const services=()=>system();
 const supportedPack=id=>['ID_PP55_PT_2025','ID_PP20_TRANSITIONAL_PT_2026',...require('../../research/moroccan-tax/expanded-catalog.json').candidates.map(c=>c.executableContent.packId??c.executableContent.treatyPackId)].includes(id);
 const binding=(position,ids)=>fingerprint({period:workspace().period,profileRevision:profileRevision(),scopes:position.scopePosition?.scopes.filter(s=>ids.includes(s.scopeId)),journalCount:position.accounting.journalCount});
 function view(position=financial()){
  if(!state.proposal)return {status:'NOT_REQUESTED',result:null,proposal:null};
  const p=state.proposal,current=binding(position,p.ownership.scopeIds)===p.financialHash;
  const s=services(),record=state.result?.determinationId?s.determinations.get(state.result.determinationId,{scopeId:p.request.scopeId,subjectId:p.request.subjectId}):null;
  const governed=record?.appliedRules.length>0&&record.appliedRules.every(r=>s.registry.list('COUNTRY_PACK').some(c=>c.candidateId===r.candidateId&&s.registry.approved(c)&&c.contentHash===r.contentHash));
  const authoritative=record&&fingerprint(project(record,p))===fingerprint(state.result)&&s.engine.replay(record).matches;
  return {status:!current?'STATE_CHANGED_REVIEW_REQUIRED':state.result&&!governed?'GOVERNANCE_REVIEW_REQUIRED':state.result&&!authoritative?'RESULT_INTEGRITY_REVIEW_REQUIRED':state.result?.calculationStatus??'FACT_CONFIRMATION_REQUIRED',result:current&&governed&&authoritative?copy(state.result):null,proposal:copy(p)};
 }
 function propose({ownership,request,facts}){
  const w=workspace(),position=financial(),rows=position.scopePosition?.scopes;if(!rows||!w.activated)throw Error('Active scoped bookkeeping required');
  require('../tax/contracts').validateCalculationRequest(request);
  if(request.scopeId!==w.organizationId||request.subjectId!==ownership?.subjectId||request.currency!==w.functionalCurrency||fingerprint(request.period)!==fingerprint(w.period)||request.taxType!=='SIMPLIFIED_INCOME'||request.incomeOrEventType!=='DOMESTIC_BUSINESS_TURNOVER')throw Error('Explicit active period/entity/currency tax context required');
  if(!ownership.entityName||!ownership.evidenceReference||!Array.isArray(ownership.scopeIds)||!ownership.scopeIds.length||new Set(ownership.scopeIds).size!==ownership.scopeIds.length)throw Error('Reviewed legal ownership evidence required');
  const selected=rows.filter(s=>ownership.scopeIds.includes(s.scopeId));
  if(selected.length!==ownership.scopeIds.length||selected.some(s=>['PERSONAL','EMPLOYMENT'].includes(s.kind)||s.entityName!==ownership.entityName)||rows.some(s=>s.entityName===ownership.entityName&&!ownership.scopeIds.includes(s.scopeId)))throw Error('All declared scopes of this legal entity must be included; owner and company remain distinct');
  const from=request.period.periodStart,to=request.period.periodEnd,lastDay=new Date(Date.UTC(Number(from.slice(0,4)),Number(from.slice(5,7)),0)).toISOString().slice(0,10);if(!from.endsWith('-01')||to!==lastDay)throw Error('One complete calendar tax month required');
  if(!Array.isArray(facts)||facts.some(f=>['MONTHLY_TURNOVER','TAX_YEAR'].includes(f.name)))throw Error('Tax amounts/year are derived from persisted records, never supplied by Muse');
  const turnover=selected.reduce((m,s)=>m.add(Money.fromJSON(s.amounts.revenue)),Money.zero(w.functionalCurrency));if(turnover.amountMinor<0n)throw Error('Negative taxable turnover requires separate review');
  const financialHash=binding(position,ownership.scopeIds),snapshot=candidateTaxFacts({...request,revision:profileRevision(),facts:[...facts,{name:'MONTHLY_TURNOVER',type:'MONEY',value:turnover.toJSON(),evidenceReference:'Persisted reviewed journal lineage '+financialHash},{name:'TAX_YEAR',type:'NUMBER',value:from.slice(0,4),evidenceReference:'Explicit tax period '+from+' / '+to}]});
  const data={request:copy(request),ownership:copy(ownership),snapshot,financialHash,incomeByScope:selected.map(s=>({scopeId:s.scopeId,name:s.name,grossIncome:s.amounts.revenue,capital:s.amounts.capital,recordedExpenses:s.amounts.expenses,journalIds:s.journalIds})),excludedScopes:rows.filter(s=>!ownership.scopeIds.includes(s.scopeId)).map(s=>({scopeId:s.scopeId,name:s.name,reason:'SEPARATE_TAX_SUBJECT_REVIEW_REQUIRED'}))};
  const proposal=deepFreeze({...data,proposalHash:fingerprint(data)}),before=copy(state);state.proposal=proposal;state.result=null;try{services();persist();return view();}catch(e){Object.assign(state,before);throw e;}
 }
 function law(){const s=services();return s.registry.snapshot().filter(c=>supportedPack(c.executableContent.packId??c.executableContent.treatyPackId)).map(c=>({candidateId:c.candidateId,contentHash:c.contentHash,governanceStatus:c.status,reviewedHashes:[...new Set(c.provenance.map(p=>p.rawContentHash))].sort(),pack:c.executableContent}));}
 function reviewLaw({candidateId,contentHash,actor,decisionSource,reviewedHashes,reason}){const s=services(),c=s.registry.governance.get(candidateId);if(!c||c.contentHash!==contentHash||!supportedPack(c.executableContent.packId??c.executableContent.treatyPackId))throw Error('Review the exact current scoped legal content');s.registry.governance.review(candidateId,{actor,decisionSource,decision:'APPROVED',reviewedHashes,reason});return law();}
 function confirm({proposalHash,actor,decisionSource}){
  const p=state.proposal;if(!p||proposalHash!==p.proposalHash||binding(financial(),p.ownership.scopeIds)!==p.financialHash)throw Error('Current exact financial/tax proposal review required');
  const snapshot=confirmTaxFacts(p.snapshot,{actor,decisionSource,reviewedSnapshotHash:p.snapshot.snapshotHash}),s=services(),record=s.engine.determine(p.request,snapshot);
  const before=state.result;state.result=project(record,p);try{persist();return view();}catch(e){state.result=before;throw e;}
 }
 function project(record,p){
  let status=record.status;if(status==='CALCULATED'){
   const root=record.calculationTrace.findLast(x=>x.expression.endsWith(':amount')&&x.path==='root')?.result;
   if(!root||BigInt(root.numerator)%BigInt(root.denominator)!==0n)status='ROUNDING_POLICY_REVIEW_REQUIRED';
  }
  const zero=Money.zero(p.request.currency).toJSON(),calculated=status==='CALCULATED',pack=record.executionSnapshots.find(c=>c.executableContent.packId===record.packId)?.executableContent;
  return {taxPeriod:p.request.period,incomeScope:p.ownership.scopeIds,subjectId:p.request.subjectId,entityName:p.ownership.entityName,currency:p.request.currency,grossIncome:p.snapshot.facts.find(f=>f.name==='MONTHLY_TURNOVER').value,incomeByScope:p.incomeByScope,taxableIncome:calculated?record.taxableBase:null,taxableBase:calculated?record.taxableBase:null,supportedDeductions:calculated?zero:null,deductionsOrAdjustments:[],taxByScope:p.incomeByScope.map(s=>({scopeId:s.scopeId,grossIncome:s.grossIncome,status:s.grossIncome.amountMinor==='0'?'NO_TURNOVER':'INCLUDED_IN_ENTITY_CALCULATION'})),foreignTaxPaidOrWithheld:calculated?zero:null,foreignTaxCreditApplied:calculated?zero:null,grossTax:calculated?record.taxAmount:null,credits:calculated?zero:null,withholdingOrCredits:calculated?zero:null,netTaxPayable:calculated?record.taxAmount:null,status,calculationStatus:status,applicableRateOrFormula:{rate:record.rate,formula:pack?.rules[0].amountFormula??null,parameters:pack?.rules[0].parameters??null,description:'MONTHLY_TURNOVER x FINAL_RATE; no expense deduction against final gross base'},effectivePeriod:pack?{effectiveFrom:pack.effectiveFrom,effectiveTo:pack.effectiveTo}:null,calculationVersion:record.engineVersion+';'+(record.packId??'unresolved')+'/1',determinationId:record.determinationId,ruleIds:record.appliedRules.map(r=>r.ruleId),evidenceIds:record.evidenceRefs.map(e=>e.evidenceId),evidence:record.evidenceRefs,trace:record.calculationTrace,inputFacts:record.inputFacts.facts,ownership:p.ownership,excludedScopes:p.excludedScopes,reviewItems:p.excludedScopes.map(s=>({...s,status:'REVIEW_REQUIRED'})),treatyResult:record.treatyResult,reason:record.reason,financialHash:p.financialHash,postingPerformed:false};
 }
 return {view,propose,law,reviewLaw,confirm};
}
module.exports={createScopedCalculation};
