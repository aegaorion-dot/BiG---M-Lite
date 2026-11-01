'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
require('../src/web/environment').loadEnvironment(path.resolve('.env'));
const {MetaModelAdapter}=require('../src/ai/aiAdapter');
const {RegulatoryResearchWorker}=require('../src/ai/regulatoryResearch');
const {ResearchRetriever}=require('../src/ai/researchRetriever');
const {buildResearchBrief}=require('../src/ai/researchBrief');
const {sanitizeResearchRecord}=require('../src/fabric/researchSanitizer');
const {normalizeArtifact,normalizeResearchPdfExtraction}=require('../src/fabric/normalizer');
const {hash}=require('../src/fabric/artifacts');

const root=path.join(os.tmpdir(),'bigm-nikos-jp-tax-e7226799-3735-40da-8147-f3b690c28cee');
const job=JSON.parse(fs.readFileSync(path.join(root,'job.json'),'utf8'));
const profile={requestedTaxJurisdiction:'JP',nationality:'GR',taxResidence:'UNRESOLVED',calculationPeriod:'2025-10',periodFacts:'October-only user facts'};
const maxTurns=7;
const old=job.brief;
job.brief=buildResearchBrief({objective:old.objective,confirmedFacts:old.confirmedFacts,unknownFacts:old.unknownFacts,taxPeriod:old.taxPeriod,jurisdictions:old.jurisdictions,questionsToResolve:old.questionsToResolve,maxTurns,maxRetrievals:old.stopConditions.maxRetrievals});
const sourceRoot=path.join(root,'sources');
const retriever=new ResearchRetriever({root:sourceRoot});
const rawRoot=path.join(sourceRoot,'raw');
const snapshot=[];
for(const item of job.retrievals){
 if(item.status!=='RETRIEVED'||!item.artifactId||snapshot.some(s=>s.item.sourceHandle===item.sourceHandle))continue;
 const artifact=JSON.parse(fs.readFileSync(path.join(rawRoot,'artifacts',item.artifactId+'.json'),'utf8'));
 let extraction=null;
 const ep=path.join(sourceRoot,item.artifactId+'.extraction.json');
 if(fs.existsSync(ep))extraction=JSON.parse(fs.readFileSync(ep,'utf8'));
 const envelope=extraction?normalizeResearchPdfExtraction(retriever.store,artifact,extraction):normalizeArtifact(retriever.store,artifact);
 snapshot.push({item,artifact,extraction,envelopeHash:hash(JSON.stringify(envelope))});
}
retriever.restore(snapshot);
const adapter=new MetaModelAdapter({allowLive:true,maxRequests:2,maxRetries:0,timeoutMs:90000});
const outputSchema={status:'CANDIDATE|REVIEW_REQUIRED',countryPacks:[{pack:{packId:'JP_2025_INDIVIDUAL_BUSINESS_INCOME',version:1,jurisdictionCode:'JP',currency:'JPY',effectiveFrom:null,effectiveTo:null,evidenceRefs:[],rules:[{ruleId:'JP_2025_BUSINESS_INCOME_TAX',taxType:'INCOME_TAX',subjectTypes:['INDIVIDUAL'],incomeOrEventType:'BUSINESS_INCOME',requiredFacts:{ANNUAL_NET_BUSINESS_INCOME:'MONEY'},applicabilityPredicate:{op:'LITERAL',value:true,valueType:'BOOLEAN'},taxBaseFormula:{op:'INPUT',name:'ANNUAL_NET_BUSINESS_INCOME'},rateDefinition:{kind:'FORMULA_DERIVED'},amountFormula:{op:'INPUT',name:'TAX_BASE'},parameters:{},finalRounding:{mode:'DOWN',precision:0},effectiveFrom:null,effectiveTo:null,evidenceRefs:[],treatyRelevant:false}],testOnly:false},sourceEvidence:[{sourceHandle:'retrieved handle',locator:'read locator',quote:'exact text from a source reading'}],fieldEvidence:[{fieldPath:'candidateRule.legalTest',evidenceIndex:0}],propositionSupported:'supported legal proposition',candidateRule:{legalTest:'supported legal proposition',parameters:[{name:'parameter from source',value:'exact decimal string',unit:'unit',evidenceIndex:0}]},issuingAuthority:'National Tax Agency',applicabilityAssessment:{status:'APPLICABILITY_UNRESOLVED',sourcePublicationDate:null,sourceRevisionDate:null,uncertainty:'remaining uncertainty'},confidence:'HIGH|MEDIUM|LOW',uncertainties:[]}],treatyPacks:[],unresolved:[]};
const baseFetch=adapter._fetch,metrics=[];
adapter._fetch=async(url,options)=>{const t=Date.now(),response=await baseFetch(url,options);let body={};try{body=await response.clone().json()}catch{};const x={httpStatus:response.status,model:body.model??adapter.model,responseStatus:body.status??null,elapsedMs:Date.now()-t};metrics.push(x);console.log('META_CALL',JSON.stringify(x));return response;};
const worker=new RegulatoryResearchWorker({adapter,retriever,maxTurns,validateCandidates:async(p,c)=>({status:'CANDIDATE_CAPTURED',candidateIds:[],unresolved:[],activatedRules:0,userFactsChanged:false,postingPerformed:false}),persist:j=>fs.writeFileSync(path.join(root,'job.json'),JSON.stringify(sanitizeResearchRecord(j),null,2),'utf8')});
(async()=>{const result=await worker.run({profile,maxTurns,outputSchema,resume:{job,continuation:[]}});fs.writeFileSync(path.join(root,'resume-result.json'),JSON.stringify({status:result.status,turns:result.turns,retrievals:result.retrievals,readings:result.readings,proposal:result.proposal,metrics,root},null,2));console.log(JSON.stringify({status:result.status,turns:result.turns.length,latestTurn:result.turns.at(-1),retrievals:result.retrievals.filter(r=>r.status==='RETRIEVED').map(r=>({url:r.url,sourceHandle:r.sourceHandle,title:r.title,rawContentHash:r.rawContentHash})),readings:result.readings.map(r=>({sourceHandle:r.sourceHandle,locator:r.locator,text:r.text.slice(0,2600)})),proposal:result.proposal,metrics,root},null,2));})().catch(e=>{console.error(JSON.stringify({error:e.message,stack:e.stack,metrics,root}));process.exitCode=1;});
