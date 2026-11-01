'use strict';
require('../src/web/environment').loadEnvironment(require('node:path').resolve('.env'));
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createMuseRuntime}=require('../src/ai/museRuntime');
const {ResearchRetriever}=require('../src/ai/researchRetriever');
 const {normalizeArtifact,normalizeResearchPdfExtraction}=require('../src/fabric/normalizer');
const {hash}=require('../src/fabric/artifacts');

async function main(){
 const root=path.join(os.tmpdir(),'bigm-nikos-official-pdfs'),retriever=new ResearchRetriever({root});
 const artifactDir=path.join(root,'raw','artifacts');
 const pdfArtifact=fs.readdirSync(artifactDir).map(f=>JSON.parse(fs.readFileSync(path.join(artifactDir,f),'utf8'))).find(a=>a.sourceUrl.endsWith('/13.pdf'));
 const extraction=JSON.parse(fs.readFileSync(path.join(root,'13.extraction.json'),'utf8'));extraction.rawContentHash=pdfArtifact.rawContentHash;
 const artifacts=fs.readdirSync(artifactDir).map(f=>JSON.parse(fs.readFileSync(path.join(artifactDir,f),'utf8')));
 const htmlArtifacts=['2260.htm','1199.htm'].map(suffix=>artifacts.find(a=>a.sourceUrl.endsWith(suffix)));
 if(htmlArtifacts.some(a=>!a))throw Error('Saved NTA HTML source missing');
 const items=[...htmlArtifacts.map(a=>({sourceHandle:'source-'+a.artifactId,url:a.sourceUrl,status:'RETRIEVED',jurisdictionCode:'JP',sourceRole:'OFFICIAL_SOURCE',title:a.sourceUrl.endsWith('2260.htm')?'NTA Tax Answer 2260 — Income tax rates':'NTA Tax Answer 1199 — Basic deduction',rawContentHash:a.rawContentHash})),{sourceHandle:'source-'+pdfArtifact.artifactId,url:pdfArtifact.sourceUrl,status:'RETRIEVED',jurisdictionCode:'JP',sourceRole:'OFFICIAL_SOURCE',title:'NTA Income Tax Guide 2025',rawContentHash:pdfArtifact.rawContentHash}];
 retriever.restore([...htmlArtifacts.map((artifact,i)=>{const envelope=normalizeArtifact(retriever.store,artifact);return {item:items[i],artifact,envelopeHash:hash(JSON.stringify(envelope))};}),{item:items[2],artifact:pdfArtifact,extraction,envelopeHash:hash(JSON.stringify(normalizeResearchPdfExtraction(retriever.store,pdfArtifact,extraction)))}]);
 const sources=items;
 const passages=[];
 for(const s of sources){
  const pages=s.sourceHandle===items[2].sourceHandle?[1,5]:[];
  const read=await retriever.read([{sourceHandle:s.sourceHandle,findText:'',pages,maxCharacters:8000}]);
  if(!read.passages.length)throw Error('Official evidence passage unavailable: '+s.url);
  for(const passage of read.passages)passages.push({sourceHandle:s.sourceHandle,title:s.title,url:s.url,authority:s.issuingAuthority??'National Tax Agency Japan',rawContentHash:s.rawContentHash,locator:passage.locator,text:passage.text});
 }
 const prior=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'bigm-nikos-rule-candidate-final.json'),'utf8')).proposal;
 const sourceEvidence=[prior.sourceEvidence[0],prior.sourceEvidence[1],prior.sourceEvidence[3]].filter(Boolean).map(e=>({...e,quote:e.quote.slice(0,850)}));
 const parameters=[...prior.candidateRule.matchAll(/\{\s*"evidenceIndex"\s*:\s*(\d+)\s*,\s*"name"\s*:\s*"([A-Z_]+)"\s*,\s*"unit"\s*:\s*"([A-Z]+)"\s*,\s*"value"\s*:\s*"([0-9.]+)"\s*\}/g)].map(m=>({evidenceIndex:Number(m[1]),name:m[2],unit:m[3],value:m[4]}));
 if(parameters.length<6)throw Error('Muse numeric parameter extraction incomplete');
 const user=JSON.stringify({task:'Complete and correct the saved Muse candidate into executable BiG-M CountryPack JSON. Values already listed are Muse-extracted; derive any missing deduction-band thresholds from the official NTA quote, not memory. Return JSON only, no copied source quotations.',parameters:parameters.map(({name,value,unit,evidenceIndex})=>({name,value,unit,evidenceIndex})),sources:sourceEvidence.map(({sourceHandle,locator,quote})=>({sourceHandle,locator,quote})),uncertainty:'2025 estimate using October net annualized x12. Residence/treaty, other income and credits unresolved. Exact effective dates unavailable; null.'});
 const system=`You are Meta Muse, BiG-M regulatory worker. Output compact JSON: {"issuingAuthority":"National Tax Agency of Japan","propositionSupported":"...","applicabilityAssessment":{"status":"APPLICABILITY_UNRESOLVED","sourcePublicationDate":null,"sourceRevisionDate":null,"uncertainty":"..."},"evidenceBindings":[{"fieldPath":"pack.rules[0].taxBaseFormula","evidenceIndex":0}],"pack":PACK}. Do not output sourceEvidence or copy citations. Bind every parameter and the proposition/formulas to the provided source index.
PACK keys: packId,version,jurisdictionCode,currency,effectiveFrom,effectiveTo,evidenceRefs,rules,testOnly. Set JP,JPY,version 1, null dates, empty refs, testOnly false. One rule exact keys: ruleId,taxType,subjectTypes,incomeOrEventType,requiredFacts,applicabilityPredicate,taxBaseFormula,rateDefinition,amountFormula,parameters,finalRounding,effectiveFrom,effectiveTo,evidenceRefs,treatyRelevant. Use INCOME_TAX, INDIVIDUAL, BUSINESS_INCOME, requiredFacts {ANNUAL_NET_BUSINESS_INCOME:MONEY}, rateDefinition {kind:FORMULA_DERIVED}, finalRounding {mode:DOWN,precision:0}, null dates, empty refs, treatyRelevant false. Use only input parameters supported by official evidence.
For transport, each AST field (applicabilityPredicate, taxBaseFormula, amountFormula) must be a JSON-serialized string containing its DSL AST object. BiG-M parses it and validates it with the existing DSL validator. Inside that JSON use only: {op:INPUT,name:NAME}; {op:PARAMETER,code:NAME}; {op:LITERAL,valueType:NUMBER,value:"digits"}; {op:ADD|SUBTRACT|MULTIPLY|DIVIDE|GTE|LTE|GT|LT|AND,args:[...]}; {op:ROUND,args:[node],rule:{mode:DOWN,precision:0}}. Never use op "OP" as an operation or reverse INPUT fields.
The deduction table states a total-income interval for each deduction. Include two additional exact source parameters DEDUCTION_INCOME_LOW and DEDUCTION_INCOME_HIGH for the cited 580,000-yen deduction row; represent the source's strict lower comparison as GT and inclusive upper comparison as LTE. Tax base: ROUND DOWN ((annual income - basic deduction)/1000) then *1000. Predicate AND of annual income > DEDUCTION_INCOME_LOW and <= DEDUCTION_INCOME_HIGH, and TAX_BASE >= and <= bracket bounds. The amountFormula must use INPUT TAX_BASE for the bracket formula, then add ROUND DOWN(base tax*SURTAX_RATE). Use parameter references, not literals. Do not repeat source text. No markdown.`;
 const runtime=createMuseRuntime({maxRequests:1,maxRetries:0,timeoutMs:90000});if(!runtime.enabled)throw Error('Meta Muse is not configured');
 const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
 const parameter=object({valueType:{const:'NUMBER'},value:{type:'string'}}),parameterSchema=object(Object.fromEntries(['BASIC_DEDUCTION','DEDUCTION_INCOME_LOW','DEDUCTION_INCOME_HIGH','BRACKET_LOW','BRACKET_HIGH','RATE','FIXED_DEDUCTION','SURTAX_RATE'].map(k=>[k,parameter])));
 const rule=object({ruleId:{type:'string'},taxType:{const:'INCOME_TAX'},subjectTypes:{type:'array',items:{const:'INDIVIDUAL'},minItems:1,maxItems:1},incomeOrEventType:{const:'BUSINESS_INCOME'},requiredFacts:object({ANNUAL_NET_BUSINESS_INCOME:{const:'MONEY'}}),applicabilityPredicate:{type:'string'},taxBaseFormula:{type:'string'},rateDefinition:object({kind:{const:'FORMULA_DERIVED'}}),amountFormula:{type:'string'},parameters:parameterSchema,finalRounding:object({mode:{const:'DOWN'},precision:{const:0}}),effectiveFrom:{type:'null'},effectiveTo:{type:'null'},evidenceRefs:{type:'array',items:{type:'string'}},treatyRelevant:{const:false}});
 const pack=object({packId:{type:'string'},version:{const:1},jurisdictionCode:{const:'JP'},currency:{const:'JPY'},effectiveFrom:{type:'null'},effectiveTo:{type:'null'},evidenceRefs:{type:'array',items:{type:'string'}},rules:{type:'array',items:rule,minItems:1,maxItems:1},testOnly:{const:false}});
 const responseSchema={name:'jp_income_rule_candidate',schema:{type:'object',properties:{issuingAuthority:{type:'string'},propositionSupported:{type:'string'},applicabilityAssessment:object({status:{const:'APPLICABILITY_UNRESOLVED'},sourcePublicationDate:{type:'null'},sourceRevisionDate:{type:'null'},uncertainty:{type:'string'}}),evidenceBindings:{type:'array',items:object({fieldPath:{type:'string'},evidenceIndex:{type:'integer'}}),minItems:1,maxItems:20},pack},required:['issuingAuthority','propositionSupported','applicabilityAssessment','evidenceBindings','pack'],additionalProperties:false}};
 const outputPath=path.join(os.tmpdir(),'bigm-nikos-rule-revision.json'),originalFetch=runtime.adapter._fetch;
 runtime.adapter._fetch=async(url,options)=>{const response=await originalFetch(url,options);try{fs.writeFileSync(outputPath+'.envelope.json',JSON.stringify({status:response.status,body:await response.clone().json()},null,2),'utf8');}catch{}return response;};
 const started=Date.now();let proposal;
 try{proposal=await runtime.adapter._post('regulatory-rule-candidate-revision',{system,user},{maxOutputTokens:3072,cache:false,responseSchema});}
 catch(e){const metric=runtime.adapter.metrics().at(-1);fs.writeFileSync(outputPath+'.failure.json',JSON.stringify({provider:runtime.adapter.model,elapsedMs:Date.now()-started,error:e.message,metric},null,2),'utf8');throw e;}
 const metric=runtime.adapter.metrics().at(-1);for(const rule of proposal.pack.rules)for(const field of ['applicabilityPredicate','taxBaseFormula','amountFormula'])rule[field]=JSON.parse(rule[field]);
 const result={provider:runtime.adapter.model,httpStatus:metric?.httpStatus??null,responseStatus:metric?.responseStatus??null,elapsedMs:Date.now()-started,proposal,passages};
 fs.writeFileSync(outputPath,JSON.stringify(result,null,2),'utf8');
 console.log(JSON.stringify({provider:result.provider,httpStatus:result.httpStatus,responseStatus:result.responseStatus,elapsedMs:result.elapsedMs,proposal,outputPath},null,2));
}
main().catch(e=>{console.error(JSON.stringify({error:e.message,name:e.name}));process.exitCode=1;});
