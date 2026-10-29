'use strict';
// Reviewed accounting treatments at the existing intake adapter, not another ledger/engine.
const {Money}=require('../domain/money'),{isKnownJurisdiction}=require('../global/jurisdictions');
const FIELDS=['eventType','incomeCategory','expenseCategory','purpose','recognitionStatus','engagementId','contractTotal','payerCountry','ipRetained','reviewReason'];
const EVENTS=['INCOME_RECEIPT','CARD_PURCHASE','CARD_REPAYMENT'];
const INCOME=['EMPLOYMENT_WAGE','PROJECT_SERVICE','AFFILIATE_COMMISSION','SOFTWARE_LICENCE','ADVANCE_PAYMENT'];
const PURPOSES=['BUSINESS','PERSONAL','MIXED','UNKNOWN'];
function accountCodes(f){if(f.eventType==='INCOME_RECEIPT')return {classification:f.incomeCategory==='ADVANCE_PAYMENT'?'203':f.incomeCategory==='EMPLOYMENT_WAGE'?'402':'401',payment:'101'};if(f.eventType==='CARD_REPAYMENT')return {classification:'202',payment:'101'};return {classification:f.purpose==='PERSONAL'?'302':f.purpose==='BUSINESS'&&f.recognitionStatus==='EXPENSE'?'501':'103',payment:'202'};}
function issues(f,chart=null){const out=[];if(!EVENTS.includes(f.eventType))return ['Unsupported financial event'];
 for(const key of FIELDS)if(f[key]!=null&&(typeof f[key]!=='string'||f[key].length>500))out.push('Invalid bounded financial metadata: '+key);
 if(f.eventType==='INCOME_RECEIPT'){
  if(f.proposedTransactionType!=='REVENUE'||!INCOME.includes(f.incomeCategory)||!f.engagementId||!isKnownJurisdiction(f.payerCountry))out.push('Income category, engagement and payer country require review');
  if(f.recognitionStatus!==(f.incomeCategory==='ADVANCE_PAYMENT'?'ADVANCE':'EARNED'))out.push('Explicit earned/advance accounting recognition required');
  try{if(!f.contractTotal||Money.fromMajor(f.contractTotal,f.currency).amountMinor<Money.fromMajor(f.amount,f.currency).amountMinor)throw Error();}catch{out.push('Exact contract total must cover the received amount');}
  if(f.incomeCategory==='SOFTWARE_LICENCE'&&!['YES','NO'].includes(f.ipRetained))out.push('Licence/IP retention facts require review');
 }else if(f.eventType==='CARD_PURCHASE'){
  if(f.proposedTransactionType!=='EXPENSE'||!PURPOSES.includes(f.purpose)||!f.expenseCategory)out.push('Card purchase purpose/category require review');
  const allowed=f.purpose==='BUSINESS'?['EXPENSE','REVIEW_REQUIRED']:f.purpose==='PERSONAL'?['PERSONAL']:['REVIEW_REQUIRED'];if(!allowed.includes(f.recognitionStatus))out.push('Mixed/unknown purchases cannot be fully recognized as business expense without reviewed allocation');
 }else if(f.proposedTransactionType!=='TRANSFER'||f.recognitionStatus!=='LIABILITY_SETTLEMENT')out.push('Card repayment is liability settlement, not an expense');
 if(f.settlementStatus!=='PAID')out.push('Confirm observed receipt/purchase/payment before posting');
 if(chart){const codes=accountCodes(f);for(const [field,code]of [['classificationAccountId',codes.classification],['paymentAccountId',codes.payment]])if(!chart.has(f[field])||chart.get(f[field]).code!==code)out.push('Invalid '+field+' for reviewed '+f.eventType);}
 return out;
}
function review(f){return Object.fromEntries([...FIELDS,'classificationAccountId','paymentAccountId','proposedTransactionType','settlementStatus'].filter(k=>f[k]!=null).map(k=>[k,f[k]]));}
function lines(f,amount){const incoming=f.eventType==='INCOME_RECEIPT';return [{accountId:incoming?f.paymentAccountId:f.classificationAccountId,side:'DEBIT',amount},{accountId:incoming?f.classificationAccountId:f.paymentAccountId,side:'CREDIT',amount}];}
function postedAmount(candidate,journals){
 const command=candidate.canonicalCommand,original=Money.fromMajor(command.amount,command.currency),functional=command.functionalAmount?Money.fromJSON(command.functionalAmount):original;
 const root=candidate.posting?.journal?.id??candidate.posting?.receipt?.postingId,lineage=new Set([root]);
 for(let pass=0;pass<journals.length;pass++){let change=false;for(const j of journals)if(j.reversalOf&&lineage.has(j.reversalOf)&&!lineage.has(j.id)){lineage.add(j.id);change=true;}if(!change)break;}
 if(!journals.some(j=>j.id===root)||functional.amountMinor<=0n)throw Error('Financial record lacks valid posted journal lineage');
 const f=command.financialReview??{eventType:command.kind==='REVENUE'?'INCOME_RECEIPT':'CARD_PURCHASE',paymentAccountId:command.accountSelection?.paymentAccountId};
 const side=f.eventType==='INCOME_RECEIPT'?'DEBIT':'CREDIT';let signed=Money.zero(functional.currency);
 for(const j of journals)if(lineage.has(j.id))for(const l of j.lines)if(l.accountId===f.paymentAccountId)signed=l.side===side?signed.add(l.money):signed.sub(l.money);
 return {signed,originalSigned:Money.fromMinor(original.amountMinor*signed.amountMinor/functional.amountMinor,original.currency)};
}
function engagementIssues(candidate,candidates,journals){
 const f=candidate.current;if(f.eventType!=='INCOME_RECEIPT')return [];
 try{const total=Money.fromMajor(f.contractTotal,f.currency);let received=Money.fromMajor(f.amount,f.currency);
  for(const c of candidates){if(c.candidateId===candidate.candidateId||c.status!=='POSTED')continue;const old=c.canonicalCommand?.financialReview;if(old?.eventType!=='INCOME_RECEIPT'||old.engagementId!==f.engagementId)continue;
   if(c.canonicalCommand.currency!==f.currency||old.incomeCategory!==f.incomeCategory||old.payerCountry!==f.payerCountry||!Money.fromMajor(old.contractTotal,f.currency).equals(total))return ['Conflicting engagement currency, category, payer or contract total requires review'];
   received=received.add(postedAmount(c,journals).originalSigned);
  }
  return received.amountMinor>total.amountMinor?['Aggregate receipts exceed reviewed contract total']:[];
 }catch{return ['Exact consistent engagement contract data required'];}
}
module.exports={FIELDS,EVENTS,INCOME,PURPOSES,accountCodes,issues,review,lines,postedAmount,engagementIssues};
