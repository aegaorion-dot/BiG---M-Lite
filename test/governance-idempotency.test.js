'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createWebStore}=require('../src/web/store');
const {activateStore}=require('./workspace-fixture');
const {fingerprint}=require('../src/onboarding/canonical');

function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bigm-pack-restart-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}

test('restarting an activated workspace re-registers immutable packs idempotently',t=>{
 const dir=temp(t),persistPath=path.join(dir,'store.json');
 const first=activateStore(createWebStore({persistPath}));
 first.financialPosition();
 const second=createWebStore({persistPath});
 assert.doesNotThrow(()=>second.financialPosition(),'reload must not fail on already registered pack versions');
 assert.equal(second.workspaceProfile().activated,true);
 const third=createWebStore({persistPath});
 assert.doesNotThrow(()=>third.productState());
});

test('a different payload under an already registered pack version still fails',()=>{
 const {FabricGovernanceStore}=require('../src/fabric/governanceStore');
 const store=new FabricGovernanceStore({policyMode:'STRICT'});
 const base={candidateId:'candidate-a',contentKind:'COUNTRY_PACK',status:'CANDIDATE',provenance:[{rawContentHash:'hash-a'}],contentHash:'content-1',executableContent:{packId:'id-2026',version:'1',rules:[],evidenceRefs:[{evidenceId:'E1',rawContentHash:'lf-hash'}]}};
 const first=store.register(base);
 assert.equal(first.candidateId,'candidate-a');
 const replay=store.register({...base,candidateId:'candidate-b'});
 assert.equal(replay.candidateId,'candidate-a','identical immutable version replay returns the registered pack');
 const rehashed=store.register({...base,candidateId:'candidate-d',contentHash:'content-3',executableContent:{packId:'id-2026',version:'1',rules:[],evidenceRefs:[{evidenceId:'E1',rawContentHash:'crlf-source-hash'}]}});
 assert.equal(rehashed.candidateId,'candidate-a','line-ending raw source hashes do not change governed content');
 assert.throws(()=>store.register({...base,candidateId:'candidate-c',contentHash:'content-2',executableContent:{packId:'id-2026',version:'1',rules:[{ruleId:'CHANGED'}],evidenceRefs:[{evidenceId:'E1',rawContentHash:'lf-hash'}]}}),/different content/i);
});
