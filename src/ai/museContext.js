'use strict';
const {fingerprint}=require('../onboarding/canonical');
const {Money}=require('../domain/money');
function topicFor(question){return /revenue|expense|profit|business results|income|pendapatan|hasil usaha/i.test(question)?'REPORT':/invoice|receipt|document|posted|posting|faktur|struk/i.test(question)?'INTAKE':/tax|pack|treaty|turnover|rule|pajak/i.test(question)?'TAX':'PROFILE';}
function buildContext({question,topic=null,candidateId=null,determinationId=null},sources){
 if(typeof question!=='string'||!question.trim()||question.length>2000)throw Error('Assistant question required (max 2000 characters)');topic??=topicFor(question);if(!['REPORT','INTAKE','TAX','PROFILE'].includes(topic))throw Error('Unknown assistant topic');
 const facts=[],allowedExplanations=[],add=(id,kind,value,display)=>facts.push({id,kind,value,display});const ws=sources.workspace();
 add('workspace.active','FACT',ws.activated,'Workspace activated: '+ws.activated+'.');
 if(ws.functionalCurrency)add('workspace.functionalCurrency','FACT',ws.functionalCurrency,'Bookkeeping functional currency: '+ws.functionalCurrency+'.');
 if(topic==='REPORT'){
  if(ws.activated){const report=sources.summary();for(const [key,label]of [['revenueMinor','Revenue'],['expenseMinor','Expenses'],['netMinor','Net bookkeeping income']]){const amount=Money.fromMinor(report.totals[key],report.currency).toMajorString();add('report.'+key,'CALCULATED_RESULT',{amount,currency:report.currency},label+': '+report.currency+' '+amount+'.');}allowedExplanations.push('RESULTS_BEFORE_TAX');}
  else {add('report.unavailable','MISSING_INFORMATION',null,'Accounting report is unavailable before workspace activation.');allowedExplanations.push('DATA_UNAVAILABLE');}
 }else if(topic==='INTAKE'){
  const candidates=sources.candidates(candidateId);if(!candidates.length){add('intake.unavailable','MISSING_INFORMATION',null,'No matching intake candidate is available.');allowedExplanations.push('DATA_UNAVAILABLE');}
  for(const c of candidates.slice(0,5)){add('candidate.'+c.candidateId,'FACT',{candidateId:c.candidateId,status:c.status,currency:c.current.currency,conflicts:c.validation?.conflicts??c.conflicts,missingFields:c.validation?.missingFields??c.missingFields},'Candidate '+c.candidateId+': '+c.status+'. '+[...(c.validation?.conflicts??c.conflicts??[]),...(c.validation?.missingFields??c.missingFields??[])].join('; '));}
  if(facts.some(f=>/FX_/.test(f.display)))allowedExplanations.push('NO_FX');
 }else if(topic==='TAX'){
  const readiness=sources.taxReadiness(),resolution=ws.countryPackResolution;
  add('tax.workspaceReady','FACT',ws.taxReady,'Workspace tax readiness: '+Boolean(ws.taxReady)+'.');
  if(resolution){add('tax.packStatus','FACT',resolution.status,'CountryPack resolution: '+resolution.status+'.');add('tax.selectedPacks','GOVERNED_RULE',resolution.selectedPackIds??[],'Selected CountryPacks: '+((resolution.selectedPackIds??[]).join(', ')||'none')+'.');}
  if(readiness){add('tax.readiness','FACT',readiness.status,'Tax review status: '+readiness.status+'.');for(const key of readiness.requiredMissingFacts.slice(0,12))add('tax.missing.'+key,'MISSING_INFORMATION',key,'Governed tax review requires: '+key.toLowerCase().replaceAll('_',' ')+'.');}
  else add('tax.reviewMissing','MISSING_INFORMATION',null,'No active scoped tax-fact review is available; tax jurisdiction and event scope need explicit review.');
  if(determinationId){const d=sources.determination(determinationId);if(!d)add('tax.determinationUnavailable','MISSING_INFORMATION',null,'The requested scoped tax determination is unavailable.');else {
   add('tax.determinationStatus','FACT',{status:d.status,reason:d.reason},'Determination status: '+d.status+'. Reason: '+(d.reason??'none')+'.');
   for(const field of ['taxableBase','taxAmount'])if(d[field]?.amountMinor!=null){const amount=Money.fromMinor(d[field].amountMinor,d[field].currency).toMajorString();add('tax.'+field,'CALCULATED_RESULT',{amount,currency:d[field].currency},(field==='taxAmount'?'Determined tax':'Taxable base')+': '+d[field].currency+' '+amount+'.');}
   for(const [i,r]of (d.appliedRules??[]).slice(0,10).entries())add('tax.rule.'+i,'GOVERNED_RULE',r,'Governed rule '+r.ruleId+' from '+r.packId+'@'+r.packVersion+' ('+r.governanceStatus+').');
   add('tax.trace','GOVERNED_RULE',{calculationTrace:(d.calculationTrace??[]).slice(0,12),packId:d.packId,packVersion:d.packVersion,evidenceRefs:(d.evidenceRefs??[]).slice(0,10)},'The deterministic calculation trace and governed evidence references accompany this result.');
   if(d.treatyResult)add('tax.treaty','GOVERNED_RULE',{status:d.treatyResult.status,reason:d.treatyResult.reason,selectedTreatyPack:d.treatyResult.selectedTreatyPack},'Treaty status: '+d.treatyResult.status+'. '+(d.treatyResult.reason??''));
   for(const key of (d.requiredMissingFacts??[]).slice(0,10))add('tax.determinationMissing.'+key,'MISSING_INFORMATION',key,'Determination requires: '+key.toLowerCase().replaceAll('_',' ')+'.');
  }}
  allowedExplanations.push('NEEDS_GOVERNED_REVIEW');
 }else{
  const p=sources.profile();for(const [slot,f]of Object.entries(p.slots)){if(f.value==null||['org.taxRegistrationNumber','org.address'].includes(slot)||Array.isArray(f.value)&&!f.value.length)continue;add('profile.'+slot,f.status==='CONFIRMED'?'FACT':'INFERENCE',{value:f.value,status:f.status,role:slot,quote:f.supportingQuote},slot+': '+JSON.stringify(f.value)+' ('+f.status+').');}
  for(const [i,f]of p.jurisdictionFacts.slice(0,10).entries())add('jurisdiction.'+i,f.status==='CONFIRMED'?'FACT':'INFERENCE',{role:f.basis,value:f.countryCode,status:f.status,quote:f.supportingQuote},f.basis+': '+f.countryCode+' ('+f.status+').');
  const requirement=sources.question();if(requirement.key!=='done')add('profile.missing','MISSING_INFORMATION',requirement.key,requirement.text);allowedExplanations.push('FACTS_ARE_CANDIDATES');
 }
 const context={topic,facts,allowedExplanations};if(JSON.stringify(context).length>20000)throw Error('Cognitive context exceeds safe bound');return {...context,contextHash:fingerprint(context)};
}
function catalogContext(sources){
 const context=buildContext({question:'Current business profile',topic:'PROFILE'},sources),catalog=sources.catalog().slice(0,50);
 return {...context,catalog,contextHash:fingerprint({facts:context.facts,catalog})};
}
module.exports={buildContext,catalogContext,topicFor};
