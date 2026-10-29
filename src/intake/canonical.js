'use strict';
const {Money}=require('../domain/money');
const {fingerprint}=require('../onboarding/canonical');
const {approvedFx,convert}=require('../fx/rates');
function reviewHash(c,workspace){return fingerprint({candidateId:c.candidateId,revision:c.revision,current:c.current,workspace,...(c.fx?{fx:c.fx}:{})});}
const CHANNELS=Object.freeze(['NATIVE','CHAT','DOCUMENT','EXTERNAL_TRANSACTION','EXTERNAL_JOURNAL']);
function canonicalCommand(c,ctx){
 const f=c.current,journal=c.candidateType==='EXTERNAL_JOURNAL',reference=c.documentId??c.sourceId;
 return {contractVersion:'universal-intake-v1',mode:journal?'JOURNAL_IMPORT':'TRANSACTION_IMPORT',intakeId:c.candidateId,intakeChannel:c.sourceChannel,sourceRef:c.sourceRef??{reference},sourceRevision:c.revision,
  economicDate:f.transactionDate,description:f.description,counterparty:f.counterparty??null,amount:f.amount,currency:f.currency,functionalCurrency:ctx.org.baseCurrency,transactionType:journal?'JOURNAL':f.proposedTransactionType,
  proposedAccounting:journal?{lines:structuredClone(f.journalLines)}:{classificationAccountId:f.classificationAccountId,paymentAccountId:f.paymentAccountId},
  evidenceRefs:structuredClone(c.evidence),taxCandidateRefs:{taxAmount:f.taxAmount??null,subtotal:f.subtotal??null,status:'REQUIRES_GOVERNED_TAX_REVIEW'},status:'CONFIRMED',revisions:structuredClone(c.revisions),confirmation:structuredClone(c.confirmation),
  id:c.nativeInput?.id??'intake-'+c.candidateId,orgId:ctx.org.id,date:f.transactionDate,jurisdiction:ctx.org.jurisdiction,kind:journal?'JOURNAL':f.proposedTransactionType,
  items:journal?[]:c.nativeInput?.items??[{description:f.description,amountMajor:f.amount}],journalLines:journal?structuredClone(f.journalLines):[],
  evidence:{kind:journal?'OTHER':c.candidateType==='BANK_ROW'?'BANK_STATEMENT':c.documentId?'RECEIPT':c.nativeInput?.evidence.kind??'OTHER',reference,hash:c.sourceRef?.fileHash??(c.documentId?ctx.documentHash:null)},
  idempotencyKey:c.nativeInput?.idempotencyKey??'document-intake:'+c.candidateId,memo:f.description,accountSelection:journal?null:{classificationAccountId:f.classificationAccountId,paymentAccountId:f.paymentAccountId},
  provenance:{candidateId:c.candidateId,revision:c.revision,documentId:c.documentId,extractionId:c.extractionId,interpretationId:c.interpretationId,importRef:c.importRef??null,mappingRefs:c.mappingRefs??[]},
  transactionCurrency:f.currency,documentCurrency:c.documentCurrency??null,reportingCurrency:ctx.workspace?.reportingCurrency??ctx.org.baseCurrency,
  ...(c.fx&&approvedFx(c,ctx.workspace)?{fx:structuredClone(c.fx),originalAmount:Money.fromMajor(f.amount,f.currency).toJSON(),functionalAmount:structuredClone(c.fx.conversion.functional)}:{}),
  taxCandidates:{taxAmount:f.taxAmount??null,subtotal:f.subtotal??null,status:'REQUIRES_GOVERNED_TAX_REVIEW'}};
}
function validateCanonical(command){
 if(!command||command.contractVersion!=='universal-intake-v1'||!CHANNELS.includes(command.intakeChannel)||!['TRANSACTION_IMPORT','JOURNAL_IMPORT'].includes(command.mode)||command.status!=='CONFIRMED'||command.confirmation?.decisionSource!=='HUMAN'||command.intakeId!==command.provenance?.candidateId||command.date!==command.economicDate||command.kind!==command.transactionType)throw Error('Invalid confirmed universal intake contract / FX_REQUIRED');
 if(command.currency!==command.functionalCurrency){const c={candidateId:command.intakeId,current:{amount:command.amount,currency:command.currency,transactionDate:command.date},fx:command.fx};if(command.mode!=='TRANSACTION_IMPORT'||!approvedFx(c,{functionalCurrency:command.functionalCurrency,organizationId:command.orgId})||fingerprint(command.functionalAmount)!==fingerprint(convert(command.amount,command.currency,command.fx.rate).functional)||fingerprint(command.originalAmount)!==fingerprint(Money.fromMajor(command.amount,command.currency).toJSON()))throw Error('FX_REQUIRED: exact approved conversion required');}
 if(command.mode==='JOURNAL_IMPORT'&&command.kind!=='JOURNAL'||command.mode==='TRANSACTION_IMPORT'&&!['REVENUE','EXPENSE'].includes(command.kind))throw Error('Invalid canonical accounting mode');
 Money.fromMajor(command.amount,command.currency);return command;
}
function economicFingerprint(c){
 try{
  const f=c.current;if(!f.transactionDate||!f.currency)return null;let lines;
  if(c.candidateType==='EXTERNAL_JOURNAL')lines=f.journalLines;
  else if(['REVENUE','EXPENSE'].includes(f.proposedTransactionType)&&f.classificationAccountId&&f.paymentAccountId)lines=[{accountId:f.classificationAccountId,side:f.proposedTransactionType==='REVENUE'?'CREDIT':'DEBIT',amount:f.amount},{accountId:f.paymentAccountId,side:f.proposedTransactionType==='REVENUE'?'DEBIT':'CREDIT',amount:f.amount}];
  else return null;
  const sums=new Map();for(const line of lines){if(!line.accountId||!['DEBIT','CREDIT'].includes(line.side))return null;const key=line.accountId+':'+line.side,minor=Money.fromMajor(line.amount,f.currency).amountMinor;if(minor<=0n)return null;sums.set(key,(sums.get(key)??0n)+minor);}
  return fingerprint({date:f.transactionDate,currency:f.currency,lines:[...sums].sort(([a],[b])=>a.localeCompare(b)).map(([key,minor])=>[key,String(minor)])});
 }catch{return null;}
}
function accountingInput(command){validateCanonical(command);if(command.currency===command.functionalCurrency)return command;const functional=Money.fromJSON(command.functionalAmount);return {...command,currency:functional.currency,amount:functional.toMajorString(),items:[{description:command.description,amountMajor:functional.toMajorString()}]};}
module.exports={CHANNELS,canonicalCommand,validateCanonical,economicFingerprint,reviewHash,accountingInput};
