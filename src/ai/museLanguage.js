'use strict';
const {t,interpolate}=require('../i18n/strings');
const Locale=require('../../public/locale');
const {Money}=require('../domain/money');
function localizedFact(f,locale){
 if(Locale.base(locale)==='en')return f;
 if(f.id==='profile.missing')return f; // Already phrased by the selected-language deterministic planner.
 const text=(key,values)=>interpolate(t(locale,'cognitive.'+key),values),v=f.value;let display;
 const amount=m=>{const money=m.amountMinor!=null?Money.fromJSON(m):Money.fromMajor(m.amount,m.currency);return Locale.money(String(money.amountMinor),money.currency,locale,money.decimals);};
 if(f.id==='workspace.active')display=text('workspaceActive',{status:v?'ya':'belum'});
 else if(f.id==='workspace.functionalCurrency')display=text('currency',{currency:v});
 else if(f.id.startsWith('report.')&&v?.amount!=null)display=text(({revenueMinor:'revenue',expenseMinor:'expenses',netMinor:'net'})[f.id.split('.')[1]],{amount:amount(v)});
 else if(f.id==='report.unavailable')display=text('reportUnavailable');
 else if(f.id==='tax.workspaceReady')display=text('taxReady',{status:v?'siap':'belum siap'});
 else if(f.id==='tax.packStatus')display=text('packStatus',{status:v});
 else if(f.id==='tax.selectedPacks')display=text('selectedPacks',{packs:v.join(', ')||'belum ada'});
 else if(f.id==='tax.reviewMissing')display=text('taxReviewMissing');
 else if(f.id==='tax.treatyReview')display=text('treatyReview');
 else if(f.id.startsWith('tax.catalog.'))display=text('packSummary',{pack:v.packId,version:v.version,status:v.governance,from:v.effectiveFrom??'?',to:v.effectiveTo??'?'});
 else if(f.id==='tax.readiness')display=text('taxReviewStatus',{status:v});
 else if(f.kind==='MISSING_INFORMATION'&&f.id.startsWith('tax.')&&typeof v==='string'){const key='product.taxFact.'+v,label=t(locale,key);display=text('missing',{fact:label===key?v:label});}
 else if(f.id==='intake.unavailable'||f.id==='tax.determinationUnavailable')display=text('unavailable');
 else if(f.id.startsWith('candidate.'))display=text('candidate',{id:v.candidateId,status:v.status,issues:[...(v.conflicts??[]),...(v.missingFields??[])].join('; ')});
 else if(f.id==='tax.determinationStatus')display=text('determination',{status:v.status,reason:v.reason??'belum ada'});
 else if(f.id==='tax.taxAmount'||f.id==='tax.taxableBase')display=text(f.id==='tax.taxAmount'?'taxAmount':'taxBase',{amount:amount(v)});
 else if(f.id.startsWith('tax.rule.'))display=text('rule',{rule:v.ruleId,pack:v.packId,version:v.packVersion,status:v.governanceStatus});
 else if(f.id==='tax.trace')display=text('trace');
 else if(f.id==='tax.treaty')display=text('treaty',{status:v.status,reason:v.reason??''});
 else if(f.id.startsWith('profile.')||f.id.startsWith('jurisdiction.'))display=text('profile',{role:v.role??f.id.slice(8),value:JSON.stringify(v.value),status:v.status});
 return {...f,display:display??f.display};
}
module.exports={localizedFact};
