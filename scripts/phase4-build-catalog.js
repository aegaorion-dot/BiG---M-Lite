'use strict';
// Offline editorial compilation. No legal approval, network, eval or country executor.
const fs=require('node:fs'),path=require('node:path');
const {loadSources}=require('./phase4-normalize');
const {evidenceCandidate,countryPackCandidate,attachExecutableContent}=require('../src/fabric/candidates');
const {referenceCandidate}=require('../src/tax/referenceCandidates');
const {validateCountryPack,validateTreatyPack}=require('../src/tax/contracts');
const {fingerprint}=require('../src/onboarding/canonical');
const {hash}=require('../src/fabric/artifacts');
const sources=loadSources(),evidence=new Map(),candidates=[],researchCandidates=[],matrix=[];
const I=name=>({op:'INPUT',name}),N=value=>({op:'LITERAL',valueType:'NUMBER',value:String(value)}),S=value=>({op:'LITERAL',valueType:'STRING',value}),B=value=>({op:'LITERAL',valueType:'BOOLEAN',value}),O=(op,...args)=>({op,args});
const eq=(name,value)=>O('EQ',I(name),typeof value==='boolean'?B(value):S(value));
const round=(ast,precision=0)=>({...O('ROUND',ast),rule:{mode:'DOWN',precision}});
const nonnegative=name=>O('GTE',I(name),N(0));
// This representability guard is a deliberately narrow product boundary, NOT a
// statutory eligibility condition. No fractional-rupiah rounding law is invented.
const wholeMultiple=(ast,unit)=>O('EQ',ast,O('MULTIPLY',round(O('DIVIDE',ast,N(unit))),N(unit)));
function cite(id,needle,legalLocator,length=450){
 const source=sources.get(id);if(!source)throw Error('Missing acquired source: '+id);
 const {envelope:env,row}=source,text=env.normalizedContent.text,start=text.indexOf(needle);
 if(start<0)throw Error('Missing citation text: '+id+' '+needle);
 const anchor=env.citationAnchors.find(a=>a.start<=start&&a.end>start),end=Math.min(start+length,anchor.end),quote=text.slice(start,end);
 const e=evidenceCandidate(env,{anchorId:anchor.anchorId,start,end,quote});
 const ref={evidenceId:e.evidenceId,sourceUrl:row.artifact.sourceUrl,rawContentHash:row.artifact.rawContentHash,rawStorageRef:'research/phase4-packs/raw/'+row.artifact.rawStorageRef,artifactId:row.artifact.artifactId,envelopeId:env.envelopeId,envelopeStorageRef:'research/phase4-packs/normalized/'+id+'.json',normalizedTextHash:hash(text),locator:e.provenance.locator,start,end,quote,quoteHash:hash(quote),legalLocator,sourceKind:'OFFICIAL_LEGAL_TEXT_OR_AUTHORITY_GUIDANCE',documentTitle:env.metadata.title??legalLocator,...(row.artifact.sourceType==='PDF'?{extractionStorageRef:'research/phase4-packs/extractions/'+id+'.json',extractionHash:hash(fs.readFileSync(path.resolve(__dirname,'../research/phase4-packs/extractions/'+id+'.json')))}:{})};
 evidence.set(ref.evidenceId,{ref,e,env});return ref;
}
function unique(refs){return [...new Map(refs.map(e=>[e.evidenceId,e])).values()];}
function reviewPackage(stage,scope,temporal,exclusions=[],prompts={}){
 return {stage,sourceStatus:'SOURCE_VERIFIED',structureStatus:stage==='READY_FOR_REVIEW'?'STRUCTURE_VALIDATED':'REVIEW_REQUIRED',humanApproval:false,scope,temporal,exclusions,factPrompts:prompts};
}
function pack({packId,year,from=year+'-01-01',to=year+'-12-31',currency='IDR',country='ID',rules,refs,review,supersedes}){
 const p={packId,version:1,jurisdictionCode:country,currency,effectiveFrom:from,effectiveTo:to,evidenceRefs:unique(refs),rules:rules.map(r=>({...r,effectiveFrom:from,effectiveTo:to})),testOnly:false,label:review.scope,...(supersedes?{supersedes}: {})};
 validateCountryPack(p);
 const es=p.evidenceRefs.map(r=>evidence.get(r.evidenceId)),base=countryPackCandidate(es.map(e=>e.env),es.map(e=>e.e),{label:p.label});
 const candidate={...attachExecutableContent(base,'COUNTRY_PACK',p),reviewPackage:review};candidates.push(candidate);
 matrix.push({jurisdiction:country,taxTypes:[...new Set(rules.map(r=>r.taxType))],subjectTypes:[...new Set(rules.flatMap(r=>r.subjectTypes))],period:{from,to},ruleAvailability:rules.map(r=>r.ruleId),evidenceStatus:'SOURCE_VERIFIED',governanceStatus:'READY_FOR_REVIEW',executable:false,packId,knownGaps:review.exclusions});
 return candidate;
}
function rule(ruleId,taxType,subjects,event,requiredFacts,predicate,base,amount,refs,extra={}){
 return {ruleId,taxType,subjectTypes:subjects,incomeOrEventType:event,requiredFacts,applicabilityPredicate:predicate,taxBaseFormula:base,amountFormula:amount,rateDefinition:{kind:'FORMULA_DERIVED'},parameters:{},finalRounding:{mode:'DOWN',precision:0},evidenceRefs:unique(refs),treatyRelevant:true,...extra};
}
const hppRates=cite('id-hpp','Pasal 17 diubah','UU7/2021 Article3(7), PPh17(1)(a)',3000);
const hppTop=cite('id-hpp','35%','PPh17(1)(a), highest individual band 35%',170);
const hppRound=cite('id-hpp','Penghasilan Kena Pajak dibulatkan','PPh17(4): PKP floor to 1,000 IDR',160);
const hppStart=cite('id-hpp','mulai berlaku pada Tahun Pajak 2022','UU7/2021 Article17(1): income-tax chapter from tax year 2022',180);
const hppPublication=cite('id-hpp','Disahkan di Jakarta','UU7/2021 signing/promulgation 29 October2021',1000);
const guideRates=cite('id-individual','Tarif pajak penghasilan wajib pajak orang pribadi','DJP current individual rate guidance; contemporary examples elsewhere on page may be stale',1600);
const pp55scope=cite('id-pp55-html','Pasal 56 (1)','PP55/2022 Articles56-57: income exclusions and subject scope',3500);
const pp55time=cite('id-pp55-html','Pasal 59 (1)','PP55/2022 Article59: 7-year individual regime period',1100);
const pp55base=cite('id-pp55-html','Pasal 60 (1)','PP55/2022 Article60: monthly gross, cumulative 500m exclusion, rate/base',1700);
const pp55exceed=cite('id-pp55-html','Pasal 61 (1)','PP55/2022 Article61: current-year threshold crossing and subsequent years',850);
const pp20scope=cite('id-pp20','Pasal 56 \n','PP20/2026 ArticleI(3), amended Article56 exclusions',1400);
const pp20subjects=cite('id-pp20','Pasal 57 \n','PP20/2026 ArticleI(4), amended Article57(1)-(2)',2300);
const pp20aggregate=cite('id-pp20','Pasal 58 \n','PP20/2026 ArticleI(5), amended Article58 aggregate turnover',2200);
const pp20aggregateBody=cite('id-pp20','jumlah keseluruhan peredaran bruto','Amended Article58(1)-(2): professional/foreign/spousal turnover',2200);
const pp20exclusions=cite('id-pp20','Wajib Pajak orang pribadi beserta seluruh','Amended Article57(2)(e)-(f), disqualification and succession',2000);
const pp20transition=cite('id-pp20','6. Pasal 59 dihapus.','PP20/2026 ArticleI(6), ArticleII transition; not modeled as automatic backdating',2000);
const pp20commencement=cite('id-pp20','pada tanggal 22 April 2026','PP20/2026 promulgation 22 April 2026 and ArticleII(2)',450);
const pp20status=cite('id-pp20-status','Dokumen ini mengubah','JDIH current relationship: PP20 changes PP55',200);
const modelSubjects=['INDIVIDUAL_FREELANCER','SOLE_PROPRIETOR','MICRO_BUSINESS','SMALL_BUSINESS'];
const activityPredicate=O('OR',...modelSubjects.map(v=>eq('BUSINESS_CAPACITY',v)));
for(const year of ['2025','2026']){
 const base=O('MULTIPLY',round(O('DIVIDE',I('REVIEWED_TAXABLE_INCOME'),N(1000))),N(1000));
 const slice=(lower,upper,rate)=>O('MULTIPLY',O('MAX',N(0),upper===null?O('SUBTRACT',I('TAX_BASE'),N(lower)):O('MIN',O('SUBTRACT',I('TAX_BASE'),N(lower)),N(upper-lower))),N(rate));
 const amount=O('ADD',slice(0,60000000,'0.05'),slice(60000000,250000000,'0.15'),slice(250000000,500000000,'0.25'),slice(500000000,5000000000,'0.30'),slice(5000000000,null,'0.35'));
 const refs=[hppRates,hppTop,hppRound,hppStart,hppPublication,guideRates];
 pack({packId:'ID_INDIVIDUAL_ORDINARY_'+year,year,refs,
  rules:[rule('ID_ART17_REVIEWED_PKP_'+year,'INCOME_TAX',['INDIVIDUAL'],'ANNUAL_ORDINARY_INDIVIDUAL_INCOME',
   {TAX_RESIDENCE:'COUNTRY',BUSINESS_CAPACITY:'STRING',INCOME_REGIME:'STRING',REVIEWED_TAXABLE_INCOME:'MONEY',TAXABLE_INCOME_RECONCILIATION_APPROVED:'BOOLEAN',ANNUAL_TAX_PERIOD_REVIEWED:'BOOLEAN'},
   O('AND',eq('TAX_RESIDENCE','ID'),activityPredicate,eq('INCOME_REGIME','ORDINARY_ART17'),nonnegative('REVIEWED_TAXABLE_INCOME')),base,amount,refs,{requiredTrueFacts:['TAXABLE_INCOME_RECONCILIATION_APPROVED','ANNUAL_TAX_PERIOD_REVIEWED']})],
  review:reviewPackage('READY_FOR_REVIEW','Resident individual ordinary annual income tax on independently reviewed PKP; not final settlement',
   {publishedAt:'2021-10-29',legalFrom:'2022-01-01',coverageYear:year,verifiedAsOf:'2026-10-29',amendmentAssessment:'HPP Art17 five-band table reconciles with currently published DJP guidance; PP20/2026 amends UMKM scope, not this band table. Full current-law/legal-effect approval remains human review.',basis:'HPP Art17 commencement plus currently published DJP five-band table. Year-bounded applicability subset, not repeal date.'},
   ['Net-income method, NPPN, deductions/PTKP and fiscal reconciliation must already be reviewed; no automatic turnover-to-PKP conversion.','Withholding, instalments, foreign credit and tax payable/refundable settlement are separate.','Cross-border source/residence differences require separately approved treaty coverage.'],
   {REVIEWED_TAXABLE_INCOME:'What is the independently reviewed taxable income (PKP), after deductions and PTKP, for this tax year?',TAXABLE_INCOME_RECONCILIATION_APPROVED:'Has a human reviewer approved the fiscal reconciliation and taxable-income basis?',BUSINESS_CAPACITY:'In what capacity does this individual earn the income?',INCOME_REGIME:'Which income-tax regime has been established for this income?'})});
}
function umkm(year,company=false){
 const current=year==='2026',refs=current?[pp20scope,pp20subjects,pp20exclusions,pp20aggregate,pp20aggregateBody,pp20transition,pp20commencement,pp20status,pp55base,pp55exceed]:[pp55scope,pp55time,pp55base,pp55exceed];
 const required={TAX_RESIDENCE:'COUNTRY',SOURCE:'COUNTRY',LEGAL_FORM:'STRING',INCOME_CATEGORY:'STRING',ELECTED_ORDINARY_REGIME:'BOOLEAN',PREVIOUSLY_DISQUALIFIED_FROM_FINAL:'BOOLEAN',PRIOR_YEAR_AGGREGATE_TURNOVER:'MONEY',MONTH_GROSS_BUSINESS_TURNOVER:'MONEY',YTD_GROSS_BEFORE_MONTH:'MONEY',AGGREGATION_BASIS_REVIEWED:'BOOLEAN',MONTH_PERIOD_REVIEWED:'BOOLEAN'};
 if(company)delete required.YTD_GROSS_BEFORE_MONTH;
 if(!current)required.REGIME_FIRST_TAX_YEAR='NUMBER';
 if(company)Object.assign(required,{FOUNDER_PROFESSIONAL_SERVICE_VEHICLE:'BOOLEAN',SPECIAL_INCOME_TAX_FACILITY:'BOOLEAN'});
 const predicates=[eq('TAX_RESIDENCE','ID'),eq('SOURCE','ID'),eq('LEGAL_FORM',company?'PT_PERORANGAN_ONE_FOUNDER':'INDIVIDUAL'),eq('INCOME_CATEGORY','ELIGIBLE_NON_PROFESSIONAL_DOMESTIC_BUSINESS'),eq('ELECTED_ORDINARY_REGIME',false),eq('PREVIOUSLY_DISQUALIFIED_FROM_FINAL',false),
  nonnegative('PRIOR_YEAR_AGGREGATE_TURNOVER'),O('LTE',I('PRIOR_YEAR_AGGREGATE_TURNOVER'),N(4800000000)),nonnegative('MONTH_GROSS_BUSINESS_TURNOVER')];
 if(!company)predicates.push(nonnegative('YTD_GROSS_BEFORE_MONTH'));
 if(!current)predicates.push(O('GTE',I('REGIME_FIRST_TAX_YEAR'),N(2018)),O('LTE',I('REGIME_FIRST_TAX_YEAR'),N(year)),O('LT',O('SUBTRACT',N(year),I('REGIME_FIRST_TAX_YEAR')),N(7)));
 if(company)predicates.push(eq('FOUNDER_PROFESSIONAL_SERVICE_VEHICLE',false),eq('SPECIAL_INCOME_TAX_FACILITY',false));
 const base=company?I('MONTH_GROSS_BUSINESS_TURNOVER'):O('SUBTRACT',O('MAX',N(0),O('SUBTRACT',O('ADD',I('YTD_GROSS_BEFORE_MONTH'),I('MONTH_GROSS_BUSINESS_TURNOVER')),N(500000000))),O('MAX',N(0),O('SUBTRACT',I('YTD_GROSS_BEFORE_MONTH'),N(500000000))));
 // Require exact whole rupiah liability. Rounding policy is inert for this subset.
 predicates.push(wholeMultiple(base,200));
 const requiredTrueFacts=['AGGREGATION_BASIS_REVIEWED','MONTH_PERIOD_REVIEWED'];
 const suffix=company?'PT_PERORANGAN':'INDIVIDUAL',scope='Monthly UMKM final-income '+suffix+' '+year+'; reviewed domestic non-professional business subset';
 return pack({packId:'ID_UMKM_'+suffix+'_'+year,year,from:current?'2026-04-22':'2025-01-01',refs,
  rules:[rule('ID_UMKM_MONTHLY_'+suffix+'_'+year,'SIMPLIFIED_INCOME',[company?'COMPANY':'INDIVIDUAL'],'MONTHLY_ELIGIBLE_DOMESTIC_BUSINESS',required,O('AND',...predicates),base,O('MULTIPLY',I('TAX_BASE'),N('0.005')),refs,{requiredTrueFacts})],
  review:reviewPackage('READY_FOR_REVIEW',scope,
   {publishedAt:current?'2026-04-22':'2022-12-20',legalFrom:current?'2026-04-22':'2022-12-20',coverageYear:year,verifiedAsOf:'2026-10-29',amendmentAssessment:'PP20/2026 changes PP55/2022; retained exact old/new article scope and ArticleII transitions. Coverage end is a review boundary, not claimed repeal.',basis:current?'PP20/2026 amended Art56-58, removed Art59; unchanged Art60-61 read with PP55. Whole requested month must fit after commencement.':'Pre-amendment PP55 subset closed at 2025-12-31; excludes PP20 retrospective transition beneficiaries.'},
   ['Prior-year turnover must include the legally relevant branches/spouse/business group; 2026 also professional and foreign turnover and all relevant one-founder companies. Human review of aggregation required.','Income category must be reviewed against Article56 exclusions: professional work, foreign-taxed income, separately final-taxed and exempt income are excluded.','2026 Jan-Apr split/transition, cooperatives, other legal forms, legacy beneficiaries and permanently disqualified histories need separate review.','Only one complete tax month; YTD before this month includes all relevant business outlets. No monthly-to-annual duplicate aggregation.','Exact whole-rupiah subset: taxable monthly gross must be a multiple of IDR200; other amounts unresolved pending governed rounding evidence.'],
   {PRIOR_YEAR_AGGREGATE_TURNOVER:'What is the prior-year turnover aggregated under this rule, including the relevant spouse, branches and business group?',MONTH_GROSS_BUSINESS_TURNOVER:'What is gross eligible business turnover for this tax month, before discounts?',YTD_GROSS_BEFORE_MONTH:'What is cumulative gross business turnover from the start of this tax year through the previous month?',LEGAL_FORM:'What is the taxpayer legal form?',INCOME_CATEGORY:'Has this income been classified against the statutory business-income exclusions?',ELECTED_ORDINARY_REGIME:'Has the taxpayer elected the ordinary income-tax regime?',PREVIOUSLY_DISQUALIFIED_FROM_FINAL:'Has a prior threshold crossing or election permanently ended eligibility?',AGGREGATION_BASIS_REVIEWED:'Has a human reviewed the statutory turnover aggregation basis?',MONTH_PERIOD_REVIEWED:'Is this exactly one complete tax month, with its YTD balance reconciled?',REGIME_FIRST_TAX_YEAR:'Which tax year first counted toward the statutory final-income regime period?'})});
}
umkm('2025');umkm('2026');umkm('2026',true);
const wht23=cite('id-wht','sebesar 2%','PPh23(1)(c), current DJP guidance; management/consulting subset',1100);
const wht26=cite('id-wht26','20% x penghasilan bruto','PPh26(1), current DJP rate table ONLY; old administrative instructions on this page are superseded',240);
for(const foreign of [false,true]){
 const refs=[foreign?wht26:wht23],event=foreign?'NONRESIDENT_INDEPENDENT_SERVICE_FEE':'RESIDENT_COMPANY_MANAGEMENT_FEE';
 const required={TAX_RESIDENCE:'COUNTRY',SOURCE:'COUNTRY',WITHHOLDING:'COUNTRY',PAYER_IS_WITHHOLDING_AGENT:'BOOLEAN',PAYEE_TAX_RESIDENCE:'COUNTRY',PAYEE_IS_PERMANENT_ESTABLISHMENT:'BOOLEAN',PAYMENT_CATEGORY:'STRING',GROSS_FEE_EXCLUDING_VAT:'MONEY'};
 const predicates=[eq('SOURCE','ID'),eq('WITHHOLDING','ID'),O('EQ',I('TAX_RESIDENCE'),I('PAYEE_TAX_RESIDENCE')),eq('PAYMENT_CATEGORY',foreign?'INDEPENDENT_PROFESSIONAL_SERVICE':'NON_FINAL_MANAGEMENT_SERVICE'),eq('PAYEE_IS_PERMANENT_ESTABLISHMENT',false),nonnegative('GROSS_FEE_EXCLUDING_VAT'),wholeMultiple(I('GROSS_FEE_EXCLUDING_VAT'),foreign?5:50)];
 if(foreign)predicates.push(O('NOT',eq('PAYEE_TAX_RESIDENCE','ID')));
 else {Object.assign(required,{NPWP_VALID:'BOOLEAN',SUBJECT_TO_PPH21:'BOOLEAN',FINAL_REGIME_CERTIFICATE_APPLIES:'BOOLEAN'});predicates.push(eq('PAYEE_TAX_RESIDENCE','ID'),eq('NPWP_VALID',true),eq('SUBJECT_TO_PPH21',false),eq('FINAL_REGIME_CERTIFICATE_APPLIES',false));}
 pack({packId:foreign?'ID_WHT26_SERVICE_2026':'ID_WHT23_MANAGEMENT_2026',year:'2026',refs,
  rules:[rule(foreign?'ID_ART26_NONRESIDENT_SERVICE_2026':'ID_ART23_RESIDENT_COMPANY_MANAGEMENT_2026','WHT',foreign?['INDIVIDUAL']:['COMPANY'],event,required,O('AND',...predicates),I('GROSS_FEE_EXCLUDING_VAT'),O('MULTIPLY',I('TAX_BASE'),N(foreign?'0.20':'0.02')),refs,{requiredTrueFacts:['PAYER_IS_WITHHOLDING_AGENT']})],
  review:reviewPackage('READY_FOR_REVIEW','2026 '+(foreign?'nonresident individual independent-service preliminary PPh26':'resident company non-final management-service PPh23')+' withholding; payee subject and explicit payer role',
   {publishedAt:null,legalFrom:null,coverageYear:'2026',verifiedAsOf:'2026-10-29',publicationStatus:'UNDATED_AUTHORITY_GUIDANCE',basis:'Current official DJP statutory rate table; administrative dates/forms on legacy pages are not incorporated. Legal temporal approval remains human review. Review bounded to 2026.'},
   ['Withholding amount is not annual income liability, actual payment or available credit. Evidence of withholding remains separate.','No payroll, construction, treaty percentage shortcut or missing-NPWP branch.','Exact whole-rupiah arithmetic subset; other base precision requires separate rounding review.','Confirmed SOURCE, WITHHOLDING and payee TAX_RESIDENCE must identify the same transaction.'],
   {GROSS_FEE_EXCLUDING_VAT:'What is the reviewed gross fee excluding VAT?',PAYER_IS_WITHHOLDING_AGENT:'Is the payer legally required to withhold on this payment?',PAYEE_TAX_RESIDENCE:'What is the confirmed tax residence of the recipient?',PAYEE_IS_PERMANENT_ESTABLISHMENT:'Is the recipient an Indonesian permanent establishment?',PAYMENT_CATEGORY:'What is the reviewed legal category of this payment?'})});
}
// A deliberately bounded Singapore company subset: normal chargeable income after
// fiscal reconciliation, PTE (not SUTE), no cash grant and no tax credits.
const sgRate=cite('sg-cit','Your company is taxed at a flat rate of 17%','IRAS CIT rate',230);
const sgPte=cite('sg-cit','All companies, including companies limited by guarantee','IRAS PTE, Section43; YA2020 onwards',1600);
const sgRebate=cite('sg-cit','[UPDATED!]','IRAS enhanced YA2026 rebate 50%, combined cap SGD40,000',1800);
{
 const refs=[sgRate,sgPte,sgRebate],nci=I('NORMAL_CHARGEABLE_INCOME');
 const base=O('SUBTRACT',nci,O('ADD',O('MULTIPLY',O('MIN',nci,N(10000)),N('0.75')),O('MULTIPLY',O('MIN',O('MAX',N(0),O('SUBTRACT',nci,N(10000))),N(190000)),N('0.50'))));
 const gross=O('MULTIPLY',I('TAX_BASE'),N('0.17')),amount=O('SUBTRACT',gross,O('MIN',O('MULTIPLY',gross,N('0.50')),N(40000)));
 pack({packId:'SG_CIT_YA2026_PTE_NO_CASH_GRANT',year:'2025',country:'SG',currency:'SGD',refs,
  rules:[rule('SG_NORMAL_CIT_PTE_YA2026','CIT',['COMPANY'],'CALENDAR_YEAR_COMPANY_NORMAL_INCOME_YA2026',
   {TAX_RESIDENCE:'COUNTRY',SOURCE:'COUNTRY',ASSESSMENT_YEAR:'NUMBER',NORMAL_CHARGEABLE_INCOME:'MONEY',FISCAL_RECONCILIATION_APPROVED:'BOOLEAN',CLAIMS_STARTUP_EXEMPTION:'BOOLEAN',CASH_GRANT_ELIGIBLE:'BOOLEAN',HAS_TAX_CREDITS_OR_SPECIAL_RATE_INCOME:'BOOLEAN',CALENDAR_BASIS_PERIOD_REVIEWED:'BOOLEAN'},
   O('AND',eq('TAX_RESIDENCE','SG'),eq('SOURCE','SG'),O('EQ',I('ASSESSMENT_YEAR'),N(2026)),eq('CLAIMS_STARTUP_EXEMPTION',false),eq('CASH_GRANT_ELIGIBLE',false),eq('HAS_TAX_CREDITS_OR_SPECIAL_RATE_INCOME',false),nonnegative('NORMAL_CHARGEABLE_INCOME'),wholeMultiple(nci,800)),base,amount,refs,
   {finalRounding:{mode:'DOWN',precision:2},requiredTrueFacts:['FISCAL_RECONCILIATION_APPROVED','CALENDAR_BASIS_PERIOD_REVIEWED']})],
  review:reviewPackage('READY_FOR_REVIEW','Singapore YA2026 PTE company subset, calendar income basis 2025, enhanced rebate, no cash-grant eligibility or credits',
   {publishedAt:null,assessmentYear:2026,incomeBasisYear:2025,verifiedAsOf:'2026-10-29',amendmentAssessment:'Current IRAS enhanced50%/40000 supersedes original Budget40%/30000 on same page; no cash-grant eligibility branch imported.',basis:'Current IRAS YA2026 enhanced rebate and YA2020+ PTE; this does NOT cover income earned in calendar 2026/YA2027.'},
   ['SSO403 persists; authority guidance is retained, statutory text review remains a human judgement point.','NCI after fiscal reconciliation only; no SUTE, credits, special rates, non-calendar basis period or cash-grant-eligible company.','Exact arithmetic subset: NCI multiple of SGD800 avoids fractional-cent rounding assumptions.','2026 request period is OUT_OF_PERIOD: YA2026 refers to calendar basis 2025 in this subset.'],
   {NORMAL_CHARGEABLE_INCOME:'What is normal chargeable income after fiscal reconciliation, before partial exemption?',ASSESSMENT_YEAR:'Which Year of Assessment applies, separately from the income basis period?',CASH_GRANT_ELIGIBLE:'Is the company eligible for the YA2026 CIT rebate cash grant?',CLAIMS_STARTUP_EXEMPTION:'Is the company claiming start-up tax exemption instead of PTE?'})});
}
function research(id,jurisdiction,refs,requiredFacts,scope,gaps,temporal={}){
 refs=unique(refs);const provenance=refs.map(r=>({...r})),candidate={candidateId:fingerprint({id,refs,requiredFacts,scope,gaps,temporal}),contentKind:'RESEARCH',jurisdictionCode:jurisdiction,evidenceIds:refs.map(r=>r.evidenceId),provenance,envelopeIds:refs.map(r=>r.envelopeId),status:'CANDIDATE',aiAuthority:'CANDIDATE_ONLY',executorSupported:false,runtimeExecutable:false,reviewHistory:[],researchId:id,requiredFacts,reviewPackage:reviewPackage('REVIEW_REQUIRED',scope,temporal,gaps)};
 if(id==='ID_VAT_APPLICABILITY_2026')candidate.taxScope={taxTypes:['VAT']};
 if(id==='ID_FOREIGN_TAX_RELIEF')candidate.taxScope={taxTypes:['FOREIGN_TAX_CREDIT']};
 researchCandidates.push(candidate);matrix.push({jurisdiction,taxTypes:candidate.taxScope?.taxTypes??[id],subjectTypes:[],period:temporal,ruleAvailability:[],evidenceStatus:'SOURCE_VERIFIED',governanceStatus:'REVIEW_REQUIRED',executable:false,knownGaps:gaps});return candidate;
}
const vat164=cite('id-vat164-text','Pasal 17 \n','PMK164/2023 Article17: PKP reporting threshold and effective registration',1900);
const vat131=cite('id-vat131-text','Pasal 3','PMK131/2024 ordinary non-luxury VAT base; not a complete indirect-tax regime',1900);
research('ID_VAT_APPLICABILITY_2026','ID',[vat164,vat131],{PKP_STATUS:'STRING',ANNUAL_TURNOVER:'MONEY',TRANSACTION_CATEGORY:'STRING',REGISTRATION_EFFECTIVE_DATE:'STRING'},
 'VAT/PPN registration and transaction applicability evidence',
 ['Registration timing and voluntary PKP election must be established; low turnover alone never means no VAT.','PMK11/2025/53/2025 interaction, exclusions and invoice rounding not compiled. No VAT amount rule or automatic registration decision.'],{verifiedAsOf:'2026-10-29',coverage:'REVIEW_REQUIRED'});
const ftc=cite('id-ftc-html','Pasal 1','PMK192/2018 foreign credit; source acquisition only, no universal credit formula',800);
research('ID_FOREIGN_TAX_RELIEF','ID',[ftc],{FOREIGN_TAX_PAID:'MONEY',FOREIGN_INCOME_COUNTRY:'COUNTRY',FOREIGN_NET_INCOME:'MONEY',DOMESTIC_TAX_ATTRIBUTABLE_TO_FOREIGN_INCOME:'MONEY'},
 'Foreign tax credit source and required-evidence investigation',
 ['Domestic/treaty limitation, per-country/per-income aggregation, taxable versus exempt foreign income, proof of tax and current amendments require review.','No executable FOREIGN_TAX_CREDIT rule; generic MIN operation alone is not authority.'],{verifiedAsOf:'2026-10-29',coverage:'REVIEW_REQUIRED'});
// Real treaty evidence is deliberately non-executable until scope, MLI, residence,
// temporal effect and 2026 administrative eligibility are reviewed together.
const admin112=cite('id-treaty112-text','Pasal 2','PMK112/2025: 2026 treaty administration and eligibility',1600);
const adminStart=cite('id-treaty112-text','Pasal 29','PMK112/2025 commencement on promulgation; visual page25 shows31December2025, BN1205',220);
for(const other of ['SG','AU']){
 const id='id-'+other.toLowerCase(),refs=[
  cite(id,'Entry into Effect:','DJP '+id+' reported entry into effect; distinguish base treaty / MLI and tax class',180),
  cite(id,other==='SG'?'Article 4 FISCAL DOMICILE':'Article 4 RESIDENCE','Article4 residence; no nationality inference',other==='SG'?1600:2300),
  cite(id,'Article 5 PERMANENT ESTABLISHMENT','Article5 fixed place/service PE; not inferred from client location',1500),
  cite(id,'Article 7 BUSINESS PROFITS','Article7 business profits; Article14 classification reviewed separately',1500),
  cite(id,'Article 14 INDEPENDENT PERSONAL SERVICES','Article14 professional independent services; fixed-base and presence tests',1600),
  cite(id,other==='SG'?'Article 23 ELIMINATION':'Article 24 METHODS','Elimination of double taxation; domestic method not compiled',1800),
  cite(id,other==='SG'?'Article 28 ENTITLEMENT':'ARTICLE 7 OF THE MLI – PREVENTION','Principal-purpose/benefit eligibility',1000),
  cite(id,'Article 29 ENTRY INTO FORCE','Effective dates by tax class',1600),
  cite(id+'-pdf',other==='SG'?'INDEPENDENT PERSONAL SERVICES':'INDEPENDENT PERSONAL SERVICES','Official PDF Article14 cross-check',1600),
  admin112,adminStart];
 const p={treatyPackId:'ID_'+other+'_SMALL_BUSINESS_RESEARCH_2026',treatyCode:'ID_'+other,jurisdictionA:'ID',jurisdictionB:other,version:1,effectiveFrom:null,effectiveTo:null,coveredTaxes:['INCOME_TAX','CIT','SIMPLIFIED_INCOME','WHT','FOREIGN_TAX_CREDIT'],residenceRules:refs.filter(r=>r.legalLocator.startsWith('Article4')),sourceRules:refs.filter(r=>r.legalLocator.startsWith('Article7')),incomeArticles:[],permanentEstablishmentRules:refs.filter(r=>r.legalLocator.startsWith('Article5')),withholdingLimits:[],reliefMethods:refs.filter(r=>r.legalLocator.startsWith('Elimination')),requiredFacts:{TAX_RESIDENCE:'COUNTRY',SOURCE:'COUNTRY',TREATY_RESIDENCE_DOCUMENT_VALID:'BOOLEAN',INCOME_ARTICLE_CLASSIFICATION:'STRING',FIXED_BASE_AVAILABLE:'BOOLEAN',SOURCE_STATE_PRESENCE_DAYS:'NUMBER',PRINCIPAL_PURPOSE_TEST_PASSED:'BOOLEAN'},evidenceRefs:unique(refs),testOnly:false,coverageStatus:'REVIEW_REQUIRED',label:'Official '+id+' service/business/relief evidence dossier; no executable treaty article'};
 validateTreatyPack(p);
 const review=reviewPackage('REVIEW_REQUIRED',p.label,{verifiedAsOf:'2026-10-29',legalEffect:'REVIEW_REQUIRED',basis:other==='SG'?'DJP reports 2022-01-01; Article29 differentiates source WHT, other taxes and Singapore YA.':'DJP base effective date 1993-07-01 versus MLI header2021-01-01; no single universal commencement inferred.'},
  ['Treaty income classification, residence/tie-breaker, fixed base/PE, rolling presence window, benefit/PPT and valid 2026 PMK112 documents need human review.','No rate/cap/exemption/credit is executable; source presence alone is not complete eligibility.','Source HTML/PDF reading-order differences require legal article review.','PMK112 PDF Article29 says commencement on promulgation; visual page25 shows31December2025 and BN1205. Extraction placeholders and conflicting abstract cannot set dates automatically.','No domestic foreign-credit method compiled; treaty does not replace domestic law.'],
  {TAX_RESIDENCE:'What is the independently established tax residence of this tax subject?',SOURCE:'Where is this income sourced under the applicable law, separately from customer location?',INCOME_ARTICLE_CLASSIFICATION:'Which treaty income article has been established for this income?',FIXED_BASE_AVAILABLE:'Was a fixed base regularly available in the source state?',SOURCE_STATE_PRESENCE_DAYS:'What is presence in the source state over the treaty article’s required period?',TREATY_RESIDENCE_DOCUMENT_VALID:'Is a valid tax residence document available for this period under the 2026 procedure?',PRINCIPAL_PURPOSE_TEST_PASSED:'Has a human reviewed eligibility under the principal-purpose test?'});
 const previewIndex=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../research/phase4-packs/previews/index.json'),'utf8'));
 review.visualEvidence={...previewIndex.find(p=>p.sourceId==='id-treaty112-text'),publicationDateCandidate:'2025-12-31',gazetteNumberCandidate:'1205',observationAuthority:'CANDIDATE_ONLY_SOURCE_READING_NOT_LEGAL_APPROVAL'};
 candidates.push({...referenceCandidate('TREATY_PACK',p,p.evidenceRefs),reviewPackage:review});
 matrix.push({jurisdiction:'ID–'+other,taxTypes:p.coveredTaxes,subjectTypes:['INDIVIDUAL','COMPANY'],period:null,ruleAvailability:[],evidenceStatus:'SOURCE_VERIFIED',governanceStatus:'REVIEW_REQUIRED',executable:false,treatyCoverage:'ACQUIRED_DOSSIER_NO_EXECUTABLE_ARTICLES',knownGaps:review.exclusions});
}
for(const [id,jurisdiction,needle,locator,scope]of [
 ['au-residence','AU','Your tax residency','ATO tax residence guidance','Australia residence source; nationality is insufficient'],
 ['au-business-current','AU','Sole trader','ATO business structures','Australia business characterization'],
 ['us-small','US','Publication 334','IRS Publication334; edition must be checked before any year applicability','US small-business source preservation only'],
 ['uk-sole-current','GB','sole trader','GOVUK Content API /become-sole-trader','UK sole-trader source preservation only']]){
 const e=sources.get(id).envelope,t=e.normalizedContent.text,actual=t.includes(needle)?needle:t.slice(0,80);
 research(id.toUpperCase().replaceAll('-','_'),jurisdiction,[cite(id,actual,locator,750)],{},scope,['Acquisition proof only; no executable domestic tax coverage or temporal inference.'],{verifiedAsOf:'2026-10-29',coverage:'UNRESOLVED'});
}
const output={schemaVersion:'phase4-governed-catalog/1',researchedAsOf:'2026-10-29',approvalPolicy:'CANDIDATE_ONLY; no actual human approval recorded',candidates,researchCandidates,capabilityMatrix:matrix};
const out=path.resolve(__dirname,'../src/tax/content/phase4-catalog.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(output,null,2)+'\n');
const reportDir=path.resolve(__dirname,'../research/phase4-packs');fs.writeFileSync(path.join(reportDir,'capability-matrix.json'),JSON.stringify(matrix,null,2)+'\n');
console.log(JSON.stringify({candidates:candidates.length,researchCandidates:researchCandidates.length,readyForReview:candidates.filter(c=>c.reviewPackage.stage==='READY_FOR_REVIEW').length,approved:0}));
