'use strict';
// Bounded historical subset of preserved official law, never automatic approval.
const fs=require('node:fs'),path=require('node:path');
const {officialEvidence}=require('../src/fabric/officialEvidence');
const {countryPackCandidate,attachExecutableContent}=require('../src/fabric/candidates');
const {validateCountryPack}=require('../src/tax/contracts');
function build(){
 const source=officialEvidence(),citations=[
  source.reference('PP55_2022',{start:'Pasal 56 (1)',end:'Pasal 63',legalCitation:'PP 55/2022 articles 56-62: rate, eligibility, duration, gross base and payment'}),
  source.reference('PP55_2022',{start:'Pasal 74 Peraturan',end:'PENJELASAN ATAS',legalCitation:'PP 55/2022 article 74 and promulgation: 20 December 2022'}),
  source.reference('UU7_2021',{start:'harta termasuk setoran tunai',end:';',legalCitation:'UU 7/2021: Income Tax Act article 4(3)(c), documented equity is excluded income'})
 ];
 const original=require('../research/moroccan-tax/reference/company-catalog.json');
 const rule=JSON.parse(JSON.stringify(original.candidate.executableContent.rules[0]));
 Object.assign(rule,{ruleId:'ID_PP55_PT_MONTHLY_2025',effectiveFrom:'2025-01-01',effectiveTo:'2025-12-31',evidenceRefs:citations.map(c=>c.ref)});
 // 2025 is a deliberately narrower supported period, not the legal repeal date.
 // Newly registered after commencement avoids PP23/2018 transition assumptions.
 const pack={packId:'ID_PP55_PT_2025',version:1,jurisdictionCode:'ID',currency:'IDR',effectiveFrom:rule.effectiveFrom,effectiveTo:rule.effectiveTo,evidenceRefs:rule.evidenceRefs,rules:[rule],testOnly:false,label:'PP 55/2022: qualifying ordinary domestic PT, monthly final turnover tax; supported 2025 subset'};
 validateCountryPack(pack);
 const candidate=attachExecutableContent(countryPackCandidate([...new Map(citations.map(c=>[c.envelope.envelopeId,c.envelope])).values()],citations.map(c=>c.evidence),{label:pack.label}),'COUNTRY_PACK',pack);
 const sources=original.sources.filter(s=>s.identity!=='PP20_2026');
 return {schemaVersion:'moroccan-tax-catalog/1',calculationVersion:'id-pp55-pt-monthly-2025/1',candidate,sources,scope:'Domestic ordinary PT registered in 2023 or later, within three tax years, prior-year aggregate turnover <= IDR 4.8bn; no exclusions, election, withholding or prepayment; exact-rupiah subset',parameterSources:{FINAL_RATE:'PP55 article 56(2)',TURNOVER_LIMIT:'articles 57(1),58(1)',PT_MAX_YEARS:'article 59(1)(c),59(2)(a)',FIRST_REGISTRATION_YEAR:'Conservative scope after 20 December 2022 commencement',ONE_YEAR:'Inclusive registration tax-year count, article 59(2)(a)'},formula:'Monthly gross turnover before discounts x 0.005; no expense deduction against this final gross base (article 60(1),(4),(5)(a)); self-payment article 62(1)(a),(2)',effectivePeriodNote:'2025 supported subset of law commencing 2022-12-20; no assertion of applicability after 2025; PP20/2026 is not applied to 2025 facts.'};
}
if(require.main===module){const result=build();fs.writeFileSync(path.resolve(__dirname,'../research/moroccan-tax/historical-company-catalog.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:'CANDIDATE_REQUIRES_HUMAN_REVIEW',candidateId:result.candidate.candidateId}));}
module.exports={build};
