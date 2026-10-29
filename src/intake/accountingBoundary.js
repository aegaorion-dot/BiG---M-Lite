'use strict';
// A canonical import adapter, not an accounting executor. Existing domain
// classes and PostingService own journal balance, immutability and ledger writes.
const {JournalEntry,JournalLine}=require('../domain/journal');
const {Money}=require('../domain/money');
const {runTransactionPipeline}=require('../app/verticalSlice');
const {validateCanonical,accountingInput}=require('./canonical');
async function postCanonical(deps,command,actor){
 validateCanonical(command);
 if(command.mode==='TRANSACTION_IMPORT')return runTransactionPipeline({...deps,input:accountingInput(command),accountSelection:command.accountSelection,actor});
 if(command.journalLines.length<2||command.journalLines.length>2000)throw Error('Invalid canonical journal line count');
 const lines=command.journalLines.map(l=>{if(!deps.chart.has(l.accountId))throw Error('Unknown canonical account');return new JournalLine({accountId:l.accountId,side:l.side,money:Money.fromMajor(l.amount,command.currency)});});
 const entry=new JournalEntry({id:'j-'+command.id,orgId:command.orgId,date:command.date,currency:command.currency,transactionId:command.id,memo:command.description,lines});
 entry.assertBalanced();const receipt=deps.posting.post(entry,{actor,idempotencyKey:command.idempotencyKey});
 return {transactionId:command.id,packId:null,packVersion:null,classification:{category:'JOURNAL_IMPORT',source:'reviewed-external-journal'},aiNote:'No AI posting authority',receipt,
  journal:{id:entry.id,balanced:entry.isBalanced(),finalized:entry.finalized,lines:entry.lines.map(l=>({accountId:l.accountId,side:l.side,amountMinor:l.money.amountMinor.toString(),currency:l.money.currency}))},balances:[],tax:{status:'requires_review',finalTotalMinor:null,finalLiabilityMinor:null},report:'Reviewed external journal posted through existing PostingService.'};
}
module.exports={postCanonical};
