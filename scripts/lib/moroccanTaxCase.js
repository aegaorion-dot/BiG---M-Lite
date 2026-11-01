'use strict';
// Explicit synthetic legal-entity facts. No conclusion about Youssef's residence.
function taxCase(workspace){
 const period=workspace.period,year=period.periodStart.slice(0,4);
 if(year!=='2025')throw Error('This supported fixture is strictly historical 2025');
 const scopes=workspace.economicScopes.filter(s=>['OPERATING_BUSINESS','INVESTMENT_PROJECT'].includes(s.kind)),entityName=scopes[0].entityName;
 const fact=(name,type,value,evidenceReference)=>({name,type,value,evidenceReference});
 const register='SYNTHETIC entity certificate ID-PT-2024: ordinary PT registered 2024-01-15; domestic taxpayer status certified by the synthetic tax authority, not inferred from owner nationality/presence';
 const attestation='SYNTHETIC 2025-10-31 entity ledger/contract and payment review: all cafe receipts are earned domestic retail sales to ordinary consumers, before discounts; no other branches/revenue, no foreign/final-separate/exempt income, no designated withholding customers or prepayments; no ordinary-tax election or excluded facility; gym has documented equity and no sales';
 return {ownership:{subjectId:'synthetic-lombok-pt',entityName,scopeIds:scopes.map(s=>s.scopeId),evidenceReference:register+'; '+attestation},request:{scopeId:workspace.organizationId,subjectId:'synthetic-lombok-pt',requestKey:'pp55-2025-october-v1',taxType:'SIMPLIFIED_INCOME',jurisdictionCode:'ID',jurisdictionBasis:'REGISTRATION',incomeOrEventType:'DOMESTIC_BUSINESS_TURNOVER',currency:'IDR',period,economicDate:period.periodEnd},facts:[
  ...[['SUBJECT_TYPE','STRING','COMPANY'],['INCOME_TYPE','STRING','DOMESTIC_BUSINESS_TURNOVER'],['REGISTRATION','COUNTRY','ID'],['TAX_RESIDENCE','COUNTRY','ID'],['SOURCE','COUNTRY','ID'],['LEGAL_FORM','STRING','PT'],['REGISTRATION_YEAR','NUMBER','2024']].map(x=>fact(...x,register)),
  fact('PREVIOUS_YEAR_TURNOVER','MONEY',{amountMinor:'1200000000',currency:'IDR'},'SYNTHETIC complete 2024 entity annual turnover statement, 2024-01-15 through 2024-12-31, all branches IDR 1200000000'),
  ...['ORDINARY_TAX_ELECTION','EXCLUDED_FACILITY','PERMANENT_ESTABLISHMENT'].map(k=>fact(k,'BOOLEAN',false,attestation)),
  ...['QUALIFYING_DOMESTIC_BUSINESS','COMPLETE_ENTITY_SCOPE','GROSS_BEFORE_DISCOUNTS_CONFIRMED','NO_WITHHOLDING_OR_TAX_PREPAID','CAPITAL_IS_DOCUMENTED_EQUITY'].map(k=>fact(k,'BOOLEAN',true,attestation))]};
}
module.exports={taxCase};
