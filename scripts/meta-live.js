'use strict';
// Explicit, finite, synthetic journeys through the real web store. Never imported by the app.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const role=process.argv[2]??'acceptance';
async function main(){
 if(process.env.BIGM_META_LIVE_TEST!=='1'){console.log('SKIPPED: set BIGM_META_LIVE_TEST=1 explicitly to use Meta credits.');return;}
 require('../src/web/environment').loadEnvironment(path.join(__dirname,'../.env'));
 if(!['acceptance','profiling','document','assistant'].includes(role))throw Error('Unknown live verification role');
 if(!process.env.BIGM_META_API_URL||!process.env.BIGM_META_API_KEY||!process.env.BIGM_META_MODEL){console.log('SKIPPED: Meta configuration incomplete.');return;}
 const {MetaModelAdapter}=require('../src/ai/aiAdapter'),{createMuseRuntime}=require('../src/ai/museRuntime'),{createWebStore}=require('../src/web/store');
 const model=process.env.BIGM_META_MODEL;if(!/^muse-spark(?:-[\w.-]+)?$/.test(model))throw Error('Muse Spark model required');
 const adapter=new MetaModelAdapter({allowLive:true,maxRequests:role==='acceptance'?8:4,maxRetries:0,timeoutMs:45000}),runtime=createMuseRuntime({adapter,traceEnabled:true});
 const store=createWebStore({museRuntime:runtime}),journeys=[];let failure=null;
 try{
  if(['acceptance','profiling'].includes(role)){
   const text="I'm an Australian living in Bali. I run a small coffee shop here and also have clients in Singapore.";
   const r=await store.onboardingTurn(text),state=store.onboardingState();assert.equal(r.providerUsed,'meta','Live profiling must use Meta, not fallback');
   assert.ok(state.slots['user.nationality'].value==='AU','Australian nationality candidate expected');
   for(const basis of ['REGISTRATION','TAX_RESIDENCE','SOURCE'])assert.ok(!state.jurisdictionCandidates.some(f=>f.basis===basis&&f.countryCode),'Unsupported jurisdiction inference');
   assert.equal(store.workspaceProfile().activated,false);assert.equal(r.question.provider,'meta','Next real requirement must be phrased by Muse');
   journeys.push({journey:'business-profiling',integrationPath:'onboardingTurn -> shared Meta client -> evidenced candidate validator -> profileState -> question planner -> Muse',result:{facts:Object.entries(state.slots).filter(([,f])=>f.value!=null&&(!Array.isArray(f.value)||f.value.length)).map(([semanticRole,f])=>({semanticRole,value:f.value,quote:f.supportingQuote,confidence:f.confidence,status:f.status})),jurisdictionFacts:state.jurisdictionCandidates,question:r.question}});
   // A proposal exists before the correction to prove invalidation. This is a synthetic in-memory store.
   store.editProfile({slot:'currency.functional',value:'IDR'});assert.equal(store.onboardingPropose().ok,true);store.onboardingValidate();
   const correction=await store.onboardingTurn('No, the coffee shop is registered under an Indonesian company.');assert.equal(correction.providerUsed,'meta');const corrected=store.onboardingState();assert.ok(corrected.jurisdictionCandidates.some(f=>f.basis==='REGISTRATION'&&f.countryCode==='ID'));assert.equal(corrected.proposal,null);assert.equal(corrected.validated,null);
   journeys.push({journey:'profile-correction',integrationPath:'onboardingTurn -> Muse correction -> applyFacts -> stale proposal invalidation',result:{jurisdictionFacts:corrected.jurisdictionCandidates,proposalInvalidated:corrected.proposal===null,question:correction.question}});
  }
  if(['acceptance','document'].includes(role)){
   const result=await store.intake.upload({bytes:fs.readFileSync(path.join(__dirname,'../test/fixtures/intake/receipt.png')),originalFilename:'synthetic-live-receipt.png',declaredMimeType:'image/png'}),doc=result.document;assert.notEqual(doc.processingStatus,'FAILED',doc.lastError);assert.ok(doc.candidates.length);assert.ok(doc.candidates[0].semanticProvenance?.success);assert.equal(store.ctx.ledger.size,0);
   journeys.push({journey:'document-understanding',integrationPath:'upload PNG -> local bundled OCR -> Muse semantics -> evidence validator -> review candidate',result:{documentId:doc.documentId,extraction:doc.extraction,status:doc.processingStatus,candidates:doc.candidates.map(c=>({candidateId:c.candidateId,current:c.current,evidence:c.evidence,status:c.status,confirmation:c.confirmation,provenance:c.semanticProvenance})),postingPerformed:false}});
  }
  if(['acceptance','assistant'].includes(role)){
   // All confirmations/postings here are explicit synthetic fixture submissions, never model actions.
   for(const [slot,value]of [['currency.functional','IDR'],['modules.enabled',['sales','purchase','accounting','reports']],['accounting.periodStart','2026-01-01'],['accounting.periodEnd','2026-12-31']])store.editProfile({slot,value});
   const p=store.onboardingPropose();assert.equal(p.ok,true);store.onboardingValidate();store.onboardingConfirm({proposalHash:p.proposal.hash,actor:'Live verification operator'});store.onboardingActivate({activationKey:'synthetic-live',actor:'Live verification operator'});
   await store.createSale({id:'synthetic-live-revenue',orgId:'org-contoh',date:'2026-10-20',jurisdiction:store.workspaceProfile().jurisdiction??'ZZ',currency:'IDR',description:'Synthetic revenue',amountMajor:'80000000',customer:'Synthetic customer',invoiceRef:'LIVE-REVENUE'});
   await store.createPurchase({id:'synthetic-live-expense',orgId:'org-contoh',date:'2026-10-20',jurisdiction:store.workspaceProfile().jurisdiction??'ZZ',currency:'IDR',description:'Synthetic expense',amountMajor:'30000000',supplier:'Synthetic supplier',billRef:'LIVE-EXPENSE'});
   for(const question of ['Why is my tax not ready?','Explain my business results in simple language.']){const result=await store.museAssistant({question});assert.equal(result.status,'MUSE_UNDERSTOOD','Live assistant must use Meta, not fallback');if(question.startsWith('Explain'))assert.ok(result.sections.some(s=>s.kind==='CALCULATED_RESULT'),'Assistant must select the authoritative report results');journeys.push({journey:question.startsWith('Explain')?'accounting-explanation':'tax-readiness-explanation',integrationPath:'user Q -> deterministic minimized context -> Muse structured selection -> authoritative fact renderer',question,result});}
  }
 }catch(e){failure=String(e.message).slice(0,300);}
 const output={verification:'Phase 7 controlled live Meta verification',role,at:new Date().toISOString(),model,success:!failure,failure,journeys,metrics:adapter.metrics(),requests:adapter.requestCount,requestCeiling:adapter.maxRequests,syntheticOnly:true,liveEndpoint:'https://api.meta.ai/v1/responses',credentialsRecorded:false};
 const dir=path.join(__dirname,'../research/phase7-muse');fs.mkdirSync(dir,{recursive:true});const outputPath=path.join(dir,'live-'+role+'.json');fs.writeFileSync(outputPath,JSON.stringify(output,null,2)+'\n');
 console.log(JSON.stringify({success:output.success,role,model,requests:adapter.requestCount,journeys:journeys.map(j=>j.journey),output:path.relative(path.join(__dirname,'..'),outputPath),failure}));if(failure)process.exitCode=1;
}
main().catch(()=>{console.error('Live verification could not run; check local configuration. No credential details are logged.');process.exitCode=1;});
