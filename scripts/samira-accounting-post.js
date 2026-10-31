'use strict';
// Replays only fully evidenced Samira financial events through onboarding,
// canonical intake, and PostingService. Payroll remains an observation because
// a net transfer cannot safely stand in for a gross-to-net payroll journal.
const path=require('node:path');
require('../src/web/environment').loadEnvironment(path.resolve('.env'));
const {createServer}=require('../src/web/server');
const actor='Samira El Amrani (synthetic E2E user)',auth=process.env.BIGM_API_TOKEN;
const persistPath=process.env.SAMIRA_ACCOUNTING_STORE;
if(!persistPath)throw Error('SAMIRA_ACCOUNTING_STORE must name the temporary copied scenario store');
const app=createServer({port:0,persistPath,authToken:auth??null});
async function call(route,body={}){const response=await fetch('http://127.0.0.1:'+app.server.address().port+route,{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+auth}:{})},body:JSON.stringify(body)}),text=await response.text();let value;try{value=JSON.parse(text)}catch{throw Error('Non-JSON '+route+' response')};if(!response.ok||value.ok===false)throw Error(route+': '+(value.error??response.status));return value;}
async function main(){await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(0,'127.0.0.1',resolve)});try{
 await call('/api/onboarding/language',{language:'ar-MA'});await call('/api/i18n/conversation',{locale:'ar-MA'});
 const userFacts=[
  ['user.displayName','Samira El Amrani'],['user.language','ar-MA'],['user.nationality','MA'],['user.homeCountry','MA'],['user.physicalLocation','FR'],['org.name','Samira El Amrani'],['org.subjectType','INDIVIDUAL'],['org.registrationStatus','unregistered'],['currency.functional','EUR'],['accounting.periodStart','2025-10-01'],['accounting.periodEnd','2025-10-31'],['modules.enabled',['sales','purchase','accounting','reports','import']]
 ];
 for(const [slot,value]of userFacts)await call('/api/onboarding/edit',{slot,value,actor});
 await call('/api/onboarding/edit',{basis:'BUSINESS_WORK_LOCATION',countryCode:'FR',actor});
 const proposed=await call('/api/onboarding/propose');if(!proposed.proposal?.hash)throw Error('Workspace proposal not created');
 const validated=await call('/api/onboarding/validate');if(!validated.validated)throw Error('Workspace proposal validation failed');
 await call('/api/onboarding/confirm',{proposalHash:proposed.proposal.hash,actor,decisionSource:'HUMAN',packIds:[]});
 await call('/api/onboarding/activate',{activationKey:'samira-e2e-'+proposed.proposal.hash,actor});
 const candidates=app.store.intake.list().candidates,chart=app.store.ctx.chart;
 const asset=chart.list().find(x=>x.code==='101'),salesAccount=chart.list().find(x=>x.code==='401'),wageAccount=chart.list().find(x=>x.code==='402');
 if(!asset||!salesAccount||!wageAccount)throw Error('Existing chart account mapping missing');
 const posted=[],review=[];
 for(const item of candidates){
  const payroll=item.current.description==='BULLETIN DE PAIE';
  const revenue=item.current.proposedTransactionType==='REVENUE'&&!payroll;
  if(!payroll&&!revenue)continue;
  let paid=false;
  if(payroll){const trace=app.store.intake.trace(item.candidateId),text=trace.extraction.textBlocks.map(x=>x.text).join('\n');paid=/Virement bancaire effectu/i.test(text)&&/31\/10\/2025/.test(text);}
  else{const trace=app.store.intake.trace(item.candidateId),blockId=item.evidence.description?.blockId,row=trace.extraction.textBlocks.find(x=>x.blockId===blockId)?.text??'';const status=row.match(/^status:\s*(.+)$/im)?.[1]??'';paid=/^pay/i.test(status)&&!/impay|non r[eé]gl|unpaid/i.test(status);}
  if(payroll){review.push({candidateId:item.candidateId,reason:'NET_PAYSLIP_TRANSFER_REQUIRES_GROSS_DEDUCTION_LIABILITY_JOURNAL'});continue;}
  if(!paid){review.push({candidateId:item.candidateId,reason:'SOURCE_STATUS_NOT_PAID'});continue;}
  // The income contract requires payer country, reviewed economic scope and
  // event semantics. Use the one local client whose source name explicitly
  // identifies Lyon; leave other buyers unposted because their location is not
  // present in the spreadsheet.
  if(!/Lyon/i.test(item.current.counterparty??'')){review.push({candidateId:item.candidateId,reason:'PAYER_COUNTRY_NOT_EVIDENCED'});continue;}
  const current={classificationAccountId:salesAccount.id,paymentAccountId:asset.id,settlementStatus:'PAID',eventType:'INCOME_RECEIPT',incomeCategory:/traiteur/i.test(item.current.description)?'PROJECT_SERVICE':'RETAIL_SALES',recognitionStatus:'EARNED',engagementId:item.current.referenceNumber,contractTotal:item.current.amount,payerCountry:'FR',economicScopeId:'BUSINESS_01',proposedTransactionType:'REVENUE'};
  const edited=await call('/api/intake/edit',{candidateId:item.candidateId,revision:item.revision,changes:current,actor});
  if(edited.candidate.status!=='READY_TO_CONFIRM')throw Error('Paid source candidate needs review: '+item.candidateId+' '+JSON.stringify(edited.candidate.conflicts??edited.candidate.missingFields));
  const confirmed=await call('/api/intake/confirm',{candidateId:item.candidateId,revision:edited.candidate.revision,reviewHash:edited.candidate.reviewHash,idempotencyKey:'samira-source-confirm:'+item.candidateId,actor});
  if(confirmed.candidate?.status!=='POSTED')throw Error('PostingService did not post '+item.candidateId);
  posted.push({candidateId:item.candidateId,kind:'BUSINESS_SALE_RECEIPT',date:item.current.transactionDate,amount:item.current.amount,currency:item.current.currency,accountingStatus:confirmed.candidate.status,journalId:confirmed.candidate.posting?.journal?.id??confirmed.candidate.posting?.receipt?.postingId,sourceHash:item.sourceRef?.fileHash??null});
 }
 const output={workspace:{activated:app.store.workspaceProfile().activated,jurisdiction:app.store.workspaceProfile().jurisdiction,currency:app.store.workspaceProfile().functionalCurrency,period:app.store.workspaceProfile().period,packStatus:app.store.workspaceProfile().countryPackResolution.status},postedCount:posted.length,posted,remainingReview:review,receiptExpenseCandidates:candidates.filter(c=>c.current.proposedTransactionType==='EXPENSE').length,journalCount:app.store.ctx.ledger.list().length,postingService:'existing canonical intake confirmation → PostingService',audit:{valid:app.store.ctx.audit.verifyChain().valid,entries:app.store.ctx.audit.size}};
 process.stdout.write(JSON.stringify(output,null,2)+'\n');
}finally{await new Promise(resolve=>app.server.close(resolve));}}
main().catch(e=>{process.stderr.write(JSON.stringify({error:e.message})+'\n');process.exitCode=1;});
