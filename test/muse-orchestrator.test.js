'use strict';
const assert=require('node:assert/strict');
const {describe,it}=require('node:test');
const W=require('../src/ai/researchWorkflow');

describe('muse orchestrator scaffolding',()=>{
 it('creates bounded need and plan reusing brief',()=>{
  const need=W.createResearchNeed({objective:'Residence for ID freelancer',profile:{businessType:'FREELANCER'},transactions:[{kind:'SERVICE_INCOME'}],questionsToResolve:['residence']});
  const {brief,plan}=W.createResearchPlan(need,{jurisdictions:['ID'],taxPeriod:{start:'2026-01-01',end:'2026-12-31'}});
  assert.equal(plan.kind,'ResearchPlan');
  assert.ok(brief.briefHash);
  assert.ok(plan.stopReasons.includes('MISSING_FACT'));
 });
 it('maps every validator code to Muse feedback, never self-repair',()=>{
  for(const code of W.VALIDATOR_CODES){
   const step=W.museNextStep(code);
   assert.equal(step.action,'FEEDBACK_TO_MUSE');
   assert.ok(step.museInstruction.length>10);
  }
 });
 it('orchestrator never researches or approves',()=>{
  assert.ok(W.ORCHESTRATOR_SYSTEM_PROMPT.includes('MUST NOT'));
  for(const f of W.ORCHESTRATOR_FORBIDDEN)assert.ok(W.ORCHESTRATOR_FORBIDDEN.includes(f));
  const act=W.nextOrchestratorAction({turn:0,maxTurns:5});
  assert.equal(act.action,'ASK_MUSE');
  const stop=W.nextOrchestratorAction({turn:5,maxTurns:5});
  assert.equal(stop.reason,'BUDGET_EXHAUSTED');
 });
 it('workflow state survives restart with integrity',()=>{
  const saved=W.serializeWorkflowState({turn:2,maxTurns:5,evidence:['a']});
  const restored=W.restoreWorkflowState(JSON.parse(JSON.stringify(saved)));
  assert.equal(restored.turn,2);
  assert.throws(()=>W.restoreWorkflowState({...saved,state:{turn:9}}),/integrity/);
 });
});
