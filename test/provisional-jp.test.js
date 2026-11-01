'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { evaluate, createProvisionalJp, PACK } = require('../src/web/provisionalJp');
const position=(income,expense,journals=17)=>({currency:'JPY',period:{periodStart:'2026-01-01',periodEnd:'2026-12-31'},recognizedBusinessIncome:{amountMinor:String(income),currency:'JPY'},confirmedBusinessExpenses:{amountMinor:String(expense),currency:'JPY'},accounting:{journalCount:journals}});
const facts={taxYear:2026,residence:'JP',incomeScope:'BUSINESS_ONLY',expenseTreatment:'DEDUCTIBLE_BUSINESS',basicDeduction:'580000'};

describe('provisional Japan estimate',()=>{
  it('uses the official 20 percent bracket that covers the posted base',()=>{
    const r=evaluate(facts,position(5627290,780632));
    assert.equal(r.status,'PROVISIONAL_ESTIMATE');
    assert.deepEqual(r.estimate,{amountMinor:'434773',currency:'JPY'});
    assert.equal(r.coverage.ruleId,'JP_IT_BUS_3300K_6949K_20PCT');
    assert.equal(r.coverage.rate,'0.2');
    assert.equal(r.coverage.fixedDeduction,'427500');
    assert.equal(r.figures.taxableBaseMinor,'4266658');
    assert.equal(r.figures.journalCount,17);
    assert.equal(r.provisionalOnly,true);
    assert.equal(r.approvalStatus,'CANDIDATE_NOT_APPROVED_LAW');
  });
  it('uses the 40 percent bracket for a higher base without annualising',()=>{
    const r=evaluate(facts,position(19053000,0));
    assert.equal(r.status,'PROVISIONAL_ESTIMATE');
    assert.equal(r.estimate.amountMinor,'4689657');
    assert.equal(r.coverage.ruleId,'JP_IT_BUS_18000K_39999K_40PCT');
  });
  it('applies the lowest statutory bracket and still refuses to invent an amount for a foreign residence',()=>{
    const r=evaluate({...facts,basicDeduction:'0'},position(1000000,0));
    assert.equal(r.status,'PROVISIONAL_ESTIMATE');
    assert.equal(r.estimate.amountMinor,'51050');
    assert.equal(r.coverage.ruleId,'JP_IT_BUS_0_1950K_5PCT');
    assert.equal(r.coverage.rate,'0.05');
    const foreign=evaluate({...facts,residence:'OTHER'},position(5627290,780632));
    assert.equal(foreign.status,'INFORMATION_REQUIRED');
    assert.equal(foreign.estimate,null);
    assert.ok(foreign.blockers.some((b)=>b.code==='TAX_RESIDENCE_OUTSIDE_JP'));
  });
  it('is deterministic and keyed to the journal binding',()=>{
    assert.equal(evaluate(facts,position(5627290,780632)).evaluationHash,evaluate(facts,position(5627290,780632)).evaluationHash);
    assert.notEqual(evaluate(facts,position(5627290,780632)).evaluationHash,evaluate(facts,position(5627290,780632,18)).evaluationHash);
  });
  it('records corrections and recalculations without touching journals',()=>{
    const state={provisionalJp:null};let persisted=0;
    const s=createProvisionalJp({state,financial:()=>position(5627290,780632),persist:()=>{persisted+=1;},now:()=>'2026-11-01T00:00:00.000Z'});
    const before=s.view();
    const after=s.correct({changes:{expenseTreatment:'NONE'}});
    assert.equal(after.facts.expenseTreatment,'NONE');
    assert.equal(after.figures.usedExpenseMinor,'0');
    assert.equal(after.figures.incomeMinor,before.figures.incomeMinor);
    assert.equal(after.figures.journalCount,17);
    assert.equal(state.provisionalJp.revisions.length,1);
    assert.ok(state.provisionalJp.revisions[0].factHash);
    const recalc=s.recalculate({});
    assert.equal(recalc.status,'PROVISIONAL_ESTIMATE');
    assert.equal(state.provisionalJp.revisions.length,2);
    assert.ok(persisted>=2);
  });
  it('keeps provisional results isolated from approved legal rules',()=>{
    const state={provisionalJp:null};
    const s=createProvisionalJp({state,financial:()=>position(5627290,780632),persist:()=>{}});
    assert.throws(()=>s.correct({changes:{inventedRate:'0.1'}}),/Unsupported fact/);
    assert.throws(()=>s.correct({changes:{residence:'MARS'}}),/Unsupported value/);
    assert.equal(s.view().approvalStatus,'CANDIDATE_NOT_APPROVED_LAW');
    assert.ok(!JSON.stringify(s.view()).includes('APPROVED_EXECUTABLE'));
    const src=fs.readFileSync('src/web/provisionalJp.js','utf8');
    assert.doesNotMatch(src,/autoApproveDemo|governanceStore|approveContent/);
    assert.ok(PACK.rules.length>=2);
  });
});
