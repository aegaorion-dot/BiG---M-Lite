'use strict';
const Locale=require('../../public/locale'),{decimalsFor}=require('../domain/money'),{t,interpolate}=require('../i18n/strings');
function positionFacts(p,question,locale){
 const money=m=>Locale.money(m.amountMinor,m.currency,locale,decimalsFor(m.currency)),phrase=(key,values={})=>interpolate(t(locale,'position.'+key),values),fact=(id,kind,value,key,values)=>({id:'position.'+id,kind,value,display:phrase(key,values)});
 const categories=Object.entries(p.incomeByType).map(([k,v])=>phrase('category.'+k)+': '+money(v)).join('; '),owed=Object.entries(p.receivables.byCurrency).map(([,v])=>money(v)).join('; ')||phrase('none'),countries=p.countries,hotel=p.reviewItems.find(r=>/hotel/i.test(r.description)),allocation=p.reviewItems.filter(r=>r.status==='ALLOCATION_REVIEW_REQUIRED');
 const facts=[
 fact('cashReceived','CALCULATED_RESULT',p.cashReceived,'cash',{amount:money(p.cashReceived)}),
 fact('receivables','CALCULATED_RESULT',p.receivables,'receivables',{amounts:owed}),
 fact('card','CALCULATED_RESULT',{liability:p.cardLiability,repayments:p.cardRepayments,lineage:p.lineage.filter(r=>r.eventType==='CARD_REPAYMENT')},'card',{liability:money(p.cardLiability),repayments:money(p.cardRepayments)}),
 fact('spending','CALCULATED_RESULT',{total:p.totalSpending,business:p.businessClassifiedSpending,personal:p.personalSpending,mixed:p.mixedSpending,recognized:p.confirmedBusinessExpenses,policyReview:p.businessRecognitionReview},'spending',{total:money(p.totalSpending),business:money(p.businessClassifiedSpending),personal:money(p.personalSpending),mixed:money(p.mixedSpending),recognized:money(p.confirmedBusinessExpenses),review:money(p.businessRecognitionReview)}),
 fact('incomeTypes','CALCULATED_RESULT',p.incomeByType,'incomeTypes',{categories,advances:money(p.advances),wages:money(p.employmentWage)}),
 fact('countries','FACT',countries,'countries',{citizenship:countries.citizenship??'?',home:countries.homeCountry??'?',physical:countries.physicalLocation??'?',work:countries.workLocations.join(', ')||'?',residence:countries.taxResidence.join(', ')||phrase('unconfirmed'),registration:countries.registration.join(', ')||phrase('unconfirmed'),payers:countries.payerCountries.join(', '),days:countries.travelDays??'?',entity:countries.entityDeclaration??phrase('unconfirmed')}),
 fact('tax','MISSING_INFORMATION',p.taxReadiness,'tax',{blockers:p.taxReadiness.blockers.map(k=>phrase('blocker.'+k)).join('; ')}),
 fact('profit','MISSING_INFORMATION',p.profit,'profit',{income:money(p.recognizedBusinessIncome),expenses:money(p.confirmedBusinessExpenses),net:money(p.profit.provisionalRecognizedBusinessNet),mixed:money(p.mixedSpending),review:money(p.businessRecognitionReview)}),
 fact('bank','CALCULATED_RESULT',p.cashBankBalance,'bank',{amount:money(p.cashBankBalance)}),
 fact('hotel','MISSING_INFORMATION',hotel??null,'hotel',{reason:hotel?.reason??phrase('unconfirmed')}),
 fact('policy','MISSING_INFORMATION',p.reviewItems,'policy',{count:String(p.reviewItems.length)}),
 fact('treaties','MISSING_INFORMATION',p.treatyContexts,'treaties',{contexts:p.treatyContexts.map(c=>c.homeCountry+' / '+c.payerCountry).join('; ')}),
 fact('confirmed','FACT',p.confirmedFacts,'confirmed',{engagements:String(p.engagementCount),balanced:String(p.accounting.balanced)})
 ];
 let ids;if(/(?:entire|whole).*financial position|explain.*financial position|kondisi keuangan/i.test(question))ids=null;else if(/hotel|vacation|liburan|hotel/i.test(question))ids=['hotel','spending','policy'];else if(/mastercard|visa|repay|card payment|paying.*card|bayar.*kartu/i.test(question))ids=['card','spending'];else if(/owe|receivable|piutang/i.test(question))ids=['receivables','cashReceived'];else if(/actually receive|money.*receive|cash received|terima/i.test(question))ids=['cashReceived','receivables','incomeTypes'];else if(/what kinds|income categor|jenis.*penghasilan/i.test(question))ids=['incomeTypes'];else if(/countr|negara/i.test(question))ids=['countries','treaties','tax'];else if(/profit|laba/i.test(question))ids=['profit','spending','incomeTypes'];else if(/tax|pajak/i.test(question))ids=['tax','treaties','countries','policy'];else if(/spent|spend|business versus|personal|belanja|pengeluaran/i.test(question))ids=['spending','card','policy'];else if(/uncertain|unsure|know for sure|tidak pasti/i.test(question))ids=['confirmed','tax','policy','countries','profit'];
 return ids?facts.filter(f=>ids.includes(f.id.slice(9))):facts;
}
module.exports={positionFacts};
