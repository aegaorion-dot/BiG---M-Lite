'use strict';
const {describe,it}=require('node:test');
const assert=require('node:assert/strict');
const {createWebStore}=require('../src/web/store');
const {handleApi}=require('../src/web/api');
const {createActiveStore}=require('./workspace-fixture');

const call=(store,method,pathname,body=null,query={})=>handleApi(store,method,pathname,query,body);
const json=(response)=>JSON.parse(response.body);

describe('configuration API',()=>{
 it('exposes an empty English-fallback configuration before onboarding',async()=>{
  const store=createWebStore();
  const response=await call(store,'GET','/api/configuration');
  assert.equal(response.status,200);
  const body=json(response);
  assert.equal(body.configuration.language,'en');
  assert.equal(body.configuration.fallbackLanguage,'en');
  assert.equal(body.configuration.requirements.length,0);
  assert.equal(body.configuration.questions.length,4);
  assert.equal(body.research.status,'NOT_STARTED');
  assert.equal(body.estimates.status,'UNAVAILABLE');
  assert.equal(body.estimates.authoritativeFiling,false);
 });

 it('surfaces the configuration summary in the product projection',async()=>{
  const store=createWebStore();
  const response=await call(store,'GET','/api/product');
  const body=json(response);
  assert.equal(body.configuration.language,'en');
  assert.equal(body.configuration.fallbackLanguage,'en');
  assert.equal(body.configuration.requirementCount,0);
  assert.equal(body.tax.amount,null);
 });

 it('derives requirements and research questions for an activated workspace',async()=>{
  const store=createActiveStore();
  store.editProfile({slot:'org.subjectType',value:'INDIVIDUAL',actor:'owner'});
  store.editProfile({slot:'org.businessType',value:'kuliner',actor:'owner'});
  const response=await call(store,'GET','/api/configuration');
  const body=json(response);
  assert.ok(body.configuration.requirements.length>=1);
  assert.ok(body.configuration.jurisdictions.workLocations.includes('ID'));
  assert.ok(body.plans.plans.length>=1);
  assert.equal(body.plans.plans[0].jurisdiction,'ID');
  assert.ok(body.plans.deferred.length>=1);
  assert.ok(body.proposal.proposalHash);
  assert.equal(body.proposal.schemaVersion,'configuration-proposal/1');
 });

 it('requires a human to confirm the exact current configuration proposal',async()=>{
  const store=createActiveStore();
  const proposal=json(await call(store,'POST','/api/configuration/propose')).proposal;
  const rejected=await call(store,'POST','/api/configuration/confirm',{proposalHash:'deadbeef',actor:'owner'});
  assert.equal(rejected.status,400);
  const sandboxHuman=await call(store,'POST','/api/configuration/confirm',{proposalHash:proposal.proposalHash,actor:'muse'});
  assert.equal(sandboxHuman.status,400);
  const accepted=await call(store,'POST','/api/configuration/confirm',{proposalHash:proposal.proposalHash,actor:'owner'});
  assert.equal(accepted.status,200);
  assert.equal(json(accepted).confirmation.proposalHash,proposal.proposalHash);
 });

 it('reports research unavailability without fabricating candidates when Muse is not configured',async()=>{
  const store=createWebStore();
  const response=await call(store,'POST','/api/configuration/research',{actor:'owner'});
  assert.equal(response.status,200);
  const body=json(response);
  assert.equal(body.research.status,'PROFILE_INCOMPLETE');
  assert.deepEqual(body.research.candidateIds,[]);
  assert.equal(body.candidates.filter((candidate)=>candidate.researchProduced).length,0);
 });

 it('prepares estimates only from posted records and never claims an authoritative filing',async()=>{
  const store=createActiveStore();
  const response=await call(store,'POST','/api/tax/estimates/refresh');
  assert.equal(response.status,200);
  const {estimates}=json(response);
  assert.equal(estimates.authoritativeFiling,false);
  assert.equal(estimates.postingPerformed,false);
  assert.ok(['NO_GOVERNED_RULE','UNAVAILABLE','REVIEW_REQUIRED','PROFILE_INCOMPLETE'].includes(estimates.status));
  assert.deepEqual(estimates.estimates,[]);
 });

 it('rejects an unknown estimate confirmation snapshot',async()=>{
  const store=createActiveStore();
  const response=await call(store,'POST','/api/tax/estimates/confirm',{snapshotHash:'0'.repeat(64),actor:'owner'});
  assert.equal(response.status,400);
 });

 it('keeps governed candidate review human-only',async()=>{
  const store=createActiveStore();
  const response=await call(store,'POST','/api/configuration/candidate/review',{candidateId:'missing',actor:'muse',decision:'APPROVED',reason:'self approval'});
  assert.equal(response.status,400);
  assert.match(json(response).error,/human/i);
 });

 it('preserves human configuration confirmation across a real process restart',async(t)=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bigm-configuration-persist-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const persistPath=path.join(dir,'store.json');
  const store=createActiveStore({persistPath});
  const proposal=json(await call(store,'POST','/api/configuration/propose')).proposal;
  await call(store,'POST','/api/configuration/confirm',{proposalHash:proposal.proposalHash,actor:'owner'});
  const restored=createWebStore({persistPath});
  const view=restored.configuration.view();
  assert.equal(view.confirmation.proposalHash,proposal.proposalHash);
  assert.equal(view.confirmation.actor,'owner');
  assert.equal(view.configuration.configurationHash,proposal.configurationHash);
 });

 it('calculates an estimate view automatically after a transaction is posted',async()=>{
  const store=createActiveStore();
  const sale=await call(store,'POST','/api/sales',{id:'cfg-sale-1',orgId:'org-contoh',date:'2026-08-01',jurisdiction:'ID',currency:'IDR',customer:'PT Config',invoiceRef:'INV-CFG',description:'Jasa',amountMajor:'1000000'});
  assert.equal(sale.status,201);
  const estimates=json(await call(store,'GET','/api/tax/estimates')).estimates;
  assert.ok(estimates.financialSnapshotHash);
  assert.equal(estimates.authoritativeFiling,false);
  assert.equal(estimates.postingPerformed,false);
  assert.ok(['CALCULATED','PARTIAL','REVIEW_REQUIRED','NO_GOVERNED_RULE','UNAVAILABLE','PROFILE_INCOMPLETE'].includes(estimates.status));
 });
});
