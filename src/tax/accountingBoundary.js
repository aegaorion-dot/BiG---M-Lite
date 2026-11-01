'use strict';
const {Money}=require('../domain/money');
const {verifyDetermination}=require('./determinationStore');
function accountingReviewPlan(determination,{scopeId,subjectId,currency}){
 verifyDetermination(determination);
 if(determination.scopeId!==scopeId||determination.subjectId!==subjectId||determination.currency!==currency)throw Error('Accounting boundary scope/currency mismatch');
 if(determination.testOnly)return {status:'BLOCKED',reason:'TEST_ONLY_DETERMINATION',postingPerformed:false};
 if(determination.status!=='CALCULATED'||!determination.taxAmount)return {status:'BLOCKED',reason:'CALCULATED_DETERMINATION_REQUIRED',postingPerformed:false};
 const money=Money.fromMinor(determination.taxAmount.amountMinor,currency);
 return {status:'ACCOUNT_MAPPING_REVIEW_REQUIRED',determinationId:determination.determinationId,calculationHash:determination.calculationHash,amount:money.toJSON(),postingPerformed:false,postingTarget:'EXISTING_POSTING_SERVICE_ONLY'};
}
module.exports={accountingReviewPlan};
