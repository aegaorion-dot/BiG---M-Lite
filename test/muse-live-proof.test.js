'use strict';
// Opt-in live integration test: at most 2 live Meta calls, synthetic task only.
// Skips unless BIGM_META_LIVE_TEST=1. Never imported by routine tests.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),path=require('node:path');
test('muse live proof script gates without enablement',()=>{
 const r=spawnSync(process.execPath,[path.join(__dirname,'../scripts/muse-live-proof.js')],{env:{...process.env,BIGM_META_LIVE_TEST:'0'},encoding:'utf8'});
 assert.equal(r.status,0);
 assert.match(r.stdout,/skipped/i);
});
test('live muse proof (opt-in, max 2 calls, synthetic only)',{skip:process.env.BIGM_META_LIVE_TEST!=='1'},async()=>{
 const {runMuseLiveProof}=require('../src/ai/museLiveWire');
 const result=await runMuseLiveProof();
 assert.equal(result.ok,true);
 assert.equal(result.provider,'meta');
 assert.equal(result.fallbackUsed,false);
 assert.ok(result.calls>=1&&result.calls<=2,'at most 2 live calls, got '+result.calls);
 assert.equal(result.countryPackCreated,false);
 assert.equal(result.approved,false);
 assert.ok(result.systemHash.length===64);
 assert.ok(result.requestEcho.toolsSent.includes('web_search'));
});
