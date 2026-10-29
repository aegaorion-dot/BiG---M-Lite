'use strict';
// Ownership/evidence adapter around the ONE Universal Tax Engine. No tax rates.
const {Money}=require('../domain/money'),{fingerprint,deepFreeze}=require('../onboarding/canonical'),{candidateTaxFacts,confirmTaxFacts}=require('./facts');
const copy=x=>JSON.parse(JSON.stringify(x));
function createScopedCalculation({state,system,financial,workspace,profileRevision,persist}){
 const services=()=>system();
 const binding=(position,ids)=>fingerprint({period:workspace().period,profileRevision:profileRevision(),scopes:position.scopePosition?.scopes.filter(s=>ids.includes(s.scopeId)),journalCount:position.accounting.journalCount});
 function view(position=financial()){
  if(!state.proposal)return {status:'NOT_REQUESTED',result:null,proposal:null};
  const p=state.proposal,current=binding(position,p.ownership.scopeIds)===p.financialHash;
  const s=services(),record=state.result?.determinationId?s.determinations.get(state.result.determinationId,{scopeId:p.request.scopeId,subjectId:p.request.subjectId}):null;
  const governed=record?.appliedRules.every(r=>s.registry.list('COUNTRY_PACK').some(c=>c.candidateId===r.candidateId&&s.registry.approved(c)&&c.contentHash===r.contentHash));
  return {status:!current?'STATE_CHANGED_REVIEW_REQUIRED':state.result&&!governed?'GOVERNANCE_REVIEW_REQUIRED':state.result?.calculationStatus??'FACT_CONFIRMATION_REQUIRED',result:current&&governed?copy(state.result):null,proposal:copy(p)};
 }
 function propose({ownership,request,facts}){
  const w=workspace(),position=financial(),rows=position.scopePosition?.scopes;if(!rows||!w.activated)throw Error('Active scoped bookkeeping required');
  require('./contracts').validateCalculationRequest(request);
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
 function law(){const s=services();return s.registry.list('COUNTRY_PACK').filter(c=>c.executableContent.packId==='ID_PP20_TRANSITIONAL_PT_2026').map(c=>({candidateId:c.candidateId,contentHash:c.contentHash,governanceStatus:c.status,reviewedHashes:[...new Set(c.provenance.map(p=>p.rawContentHash))].sort(),pack:c.executableContent}));}
 function reviewLaw({candidateId,contentHash,actor,decisionSource,reviewedHashes,reason}){const s=services(),c=s.registry.governance.get(candidateId);if(!c||c.contentHash!==contentHash||c.executableContent.packId!=='ID_PP20_TRANSITIONAL_PT_2026')throw Error('Review the exact current scoped legal content');s.registry.governance.review(candidateId,{actor,decisionSource,decision:'APPROVED',reviewedHashes,reason});return law();}
 function confirm({proposalHash,actor,decisionSource}){
  const p=state.proposal;if(!p||proposalHash!==p.proposalHash||binding(financial(),p.ownership.scopeIds)!==p.financialHash)throw Error('Current exact financial/tax proposal review required');
  const snapshot=confirmTaxFacts(p.snapshot,{actor,decisionSource,reviewedSnapshotHash:p.snapshot.snapshotHash}),s=services(),record=s.engine.determine(p.request,snapshot);
  let status=record.status;if(status==='CALCULATED'){
   const root=record.calculationTrace.findLast(x=>x.expression.endsWith(':amount')&&x.path==='root')?.result;
   if(!root||BigInt(root.numerator)%BigInt(root.denominator)!==0n)status='ROUNDING_POLICY_REVIEW_REQUIRED';
  }
  const zero=Money.zero(p.request.currency).toJSON(),result={taxPeriod:p.request.period,subjectId:p.request.subjectId,entityName:p.ownership.entityName,currency:p.request.currency,grossIncome:p.snapshot.facts.find(f=>f.name==='MONTHLY_TURNOVER').value,incomeByScope:p.incomeByScope,taxableIncome:status==='CALCULATED'?record.taxableBase:null,deductionsOrAdjustments:[],taxByScope:null,foreignTaxPaidOrWithheld:status==='CALCULATED'?zero:null,foreignTaxCreditApplied:status==='CALCULATED'?zero:null,grossTax:status==='CALCULATED'?record.taxAmount:null,credits:status==='CALCULATED'?zero:null,netTaxPayable:status==='CALCULATED'?record.taxAmount:null,calculationStatus:status,calculationVersion:record.engineVersion+';id-transitional-pt-monthly/1',determinationId:record.determinationId,ruleIds:record.appliedRules.map(r=>r.ruleId),evidenceIds:record.evidenceRefs.map(e=>e.evidenceId),evidence:record.evidenceRefs,trace:record.calculationTrace,inputFacts:snapshot.facts,ownership:p.ownership,excludedScopes:p.excludedScopes,reviewItems:p.excludedScopes.map(s=>({...s,status:'REVIEW_REQUIRED'})),treatyResult:record.treatyResult,reason:record.reason,financialHash:p.financialHash,postingPerformed:false};
  const before=state.result;state.result=result;try{persist();return view();}catch(e){state.result=before;throw e;}
 }
 return {view,propose,law,reviewLaw,confirm};
}
module.exports={createScopedCalculation};
