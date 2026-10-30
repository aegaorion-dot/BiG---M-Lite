'use strict';
// Thin live wiring: existing Muse orchestrator pipeline -> existing Meta Muse runtime.
// No new workflow states, no new pack format, no new engine, no tax research.
// Muse stays cognitive; orchestrator (code here + RegulatoryResearchWorker) stays procedural.
const {MetaModelAdapter}=require('./aiAdapter');
const {SYSTEM,tools}=require('./researchInstructions');
const {ORCHESTRATOR_SYSTEM_PROMPT,createResearchNeed,createResearchPlan,toValidationFeedback}=require('./researchWorkflow');
const {inspectEnvelope,searchObservation,replayItems}=require('./regulatoryResearch');

function createLiveMuseAdapter({maxRequests=2}={}){
 const adapter=new MetaModelAdapter({allowLive:true,maxRequests,maxRetries:0,timeoutMs:45000});
 if(!adapter.endpoint||!adapter.apiKey||!adapter.model)throw Error('Meta configuration missing');
 if(!/^muse-spark(?:-[\w.-]+)?$/.test(adapter.model))throw Error('Muse Spark model required');
 return adapter;
}

function buildProofTask({researchRunId}){
 const need=createResearchNeed({objective:'TEST ONLY live plumbing proof; no tax law',profile:null,transactions:[],questionsToResolve:['Prove live Muse request/response plumbing without tax research']});
 return {need,planRef:'synthetic-only; no ResearchBrief jurisdictions requested',researchRunId,testOnly:true,
  instruction:'TEST ONLY. Do NOT research tax law, jurisdictions, rates or regulations. Do NOT use web_search or retrieval tools. Return a direct assistant message with JSON text {"status":"CANDIDATE","testOnly":true,"note":"live plumbing proof"}. No CountryPack, no approval.'};
}

async function runMuseLiveProof({adapter=null}={}){
 const live=adapter??createLiveMuseAdapter({maxRequests:2});
 if(!(live instanceof MetaModelAdapter))throw Error('Live Muse requires MetaModelAdapter; no fallback model allowed');
 const before=live.requestCount;
 const researchRunId='muse-live-proof-'+Date.now();
 const task=buildProofTask({researchRunId});
 const system=SYSTEM+'\n\nOrchestrator contract governs this loop; orchestrator never repairs, approves or interprets law:\n'+ORCHESTRATOR_SYSTEM_PROMPT.slice(0,2000);
 const request={system,user:JSON.stringify(task)};
 const body1=await live.researchTurn(request,{tools:structuredClone(tools),continuation:[],maxOutputTokens:1024,validate:inspectEnvelope});
 const parsed1=searchObservation(body1);
 const callsAfterFirst=live.requestCount;
 let body2=null,feedbackSent=null;
 if(callsAfterFirst-before<2){
  feedbackSent=toValidationFeedback({code:'RULE_SCHEMA_INVALID',message:'TEST ONLY synthetic feedback; re-emit synthetic candidate shape'});
  const cont=[...replayItems(body1)];
  const follow={system,user:JSON.stringify({researchRunId,testOnly:true,previousValidation:feedbackSent,instruction:'TEST ONLY correction turn. Re-emit {"status":"CANDIDATE","testOnly":true}. No tax law, no tools.'})};
  body2=await live.researchTurn(follow,{tools:structuredClone(tools),continuation:cont,maxOutputTokens:1024,validate:inspectEnvelope});
 }
 const calls=live.requestCount-before;
 if(calls>2)throw Error('Live call budget exceeded');
 return {ok:true,researchRunId,systemHash:require('../onboarding/canonical').fingerprint(system),requestEcho:{systemLength:system.length,toolsSent:tools.map(t=>t.type+(t.name?':'+t.name:'')),userBytes:request.user.length},
  turn1:{searchCalls:parsed1.calls.length,results:parsed1.results.length},feedbackSent:feedbackSent?.code??null,turn2:body2?{parsed:true}:null,
  calls,model:live.model,provider:'meta',fallbackUsed:false,countryPackCreated:false,approved:false};
}

module.exports={createLiveMuseAdapter,runMuseLiveProof,buildProofTask};
