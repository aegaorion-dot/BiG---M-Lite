'use strict';
const {describe,it}=require('node:test'),assert=require('node:assert/strict');
const {createServer}=require('../src/web/server');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{once}=require('node:events');
async function listen(t,options={}){
 const app=createServer(options);await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>app.server.close(resolve)));
 return {...app,base:'http://127.0.0.1:'+app.server.address().port};
}
async function call(base,path,body){
 const response=await fetch(base+path,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 return {status:response.status,...await response.json()};
}
async function confirm(base){
 const p=await call(base,'/api/onboarding/propose',{});assert.equal(p.status,200,JSON.stringify(p));
 assert.equal((await call(base,'/api/onboarding/validate',{})).status,200);
 assert.equal((await call(base,'/api/onboarding/confirm',{proposalHash:p.proposal.hash,actor:'HTTP test human',decisionSource:'HUMAN'})).status,200);
 const a=await call(base,'/api/onboarding/activate',{activationKey:'http-'+p.proposal.hash,actor:'HTTP test human'});assert.equal(a.status,201,JSON.stringify(a));return a;
}
describe('HTTP user journeys through real Node server',()=>{
 for(const scenario of [
  {name:'expat Bali',messages:["I'm Australian and I run a coffee shop in Bali. My customers pay in Indonesian rupiah, I sometimes import equipment, and I want the app in English.","My business is registered in Indonesia and I want to keep my books in IDR."],country:'ID',currency:'IDR',tax:'OUT_OF_PERIOD'},
  {name:'Indonesian freelancer with US clients',messages:["I'm an Indonesian freelance designer working with US clients. I prefer Indonesian for the app.",'Saya bekerja di Bandung. Pembukuan saya IDR.'],country:'ID',currency:'IDR',tax:'REVIEW_REQUIRED'},
  {name:'UMKM',messages:['Saya punya warung kopi di Bandung. Pelanggan bayar cash dan QRIS.','Pembukuan dalam IDR.'],country:'ID',currency:'IDR',tax:'REVIEW_REQUIRED'},
  {name:'Singapore company operated in Bali',messages:['My company is registered in Singapore. I operate in Bali. My customers are in the United States. My bank account is in Australia.','My business is called Island Coffee. I keep my books in SGD.'],country:'SG',currency:'SGD',tax:'MISSING_COUNTRY_PACK'},
 ]){
  it(scenario.name+': describe -> review -> confirm -> activate -> post -> report',async t=>{
   const {base}=await listen(t);const page=await fetch(base+'/');assert.equal(page.status,200);assert.ok((await page.text()).includes('id="view"'));
   const initial=await call(base,'/api/workspace');assert.equal(initial.workspace.activated,false);assert.equal(initial.workspace.functionalCurrency,null);
   assert.equal((await call(base,'/api/sales',{id:'premature',orgId:initial.workspace.organizationId})).status,400);
   for(const text of scenario.messages){const r=await call(base,'/api/onboarding/turn',{text});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.providerUsed,'fallback');}
   const p=await call(base,'/api/onboarding/propose',{});assert.equal(p.status,200);assert.equal((await call(base,'/api/onboarding/activate',{activationKey:'premature'})).status,400);
   const activation=await confirm(base);assert.equal(activation.record.countryPackResolution.status,scenario.tax);
   const ws=(await call(base,'/api/workspace')).workspace,settings=await call(base,'/api/settings');
   assert.equal(ws.activated,true);assert.equal(ws.jurisdiction,scenario.country);assert.equal(ws.functionalCurrency,scenario.currency);assert.equal(ws.taxReady,false);
   assert.equal(settings.org.name,ws.organizationName);assert.equal(settings.org.jurisdiction,ws.jurisdiction);assert.equal(settings.org.baseCurrency,ws.functionalCurrency);
   const sale=await call(base,'/api/sales',{id:'journey-income',orgId:ws.organizationId,date:'2026-08-01',jurisdiction:ws.jurisdiction,currency:ws.functionalCurrency,description:'Test income',amountMajor:scenario.currency==='SGD'?'10.50':'1050',customer:'Test customer',invoiceRef:'INV-J'});
   assert.equal(sale.status,201,JSON.stringify(sale));assert.equal(sale.result.tax.finalTotalMinor,null);assert.equal(sale.result.tax.finalLiabilityMinor,null);assert.equal(sale.result.tax.status,'requires_review');
   const summary=(await call(base,'/api/summary')).summary,monthly=await call(base,'/api/reports/monthly');
   assert.equal(summary.currency,scenario.currency);assert.equal(summary.totals.revenueMinor,'1050');assert.equal(monthly.months[0].revenueMinor,'1050');
   const oldHash=activation.record.proposalHash;
   await call(base,'/api/onboarding/edit',{slot:'org.name',value:'Corrected name'});
   assert.equal((await call(base,'/api/onboarding/confirm',{proposalHash:oldHash})).status,400);
   assert.equal((await call(base,'/api/workspace')).workspace.organizationName,ws.organizationName);
  });
 }
 it('restores confirmed configuration after stopping and starting a separate server process',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bigm-http-')),file=path.join(dir,'store.json'),children=[];
  t.after(async()=>{for(const c of children)if(c.exitCode===null&&!c.killed){const exit=once(c,'exit');c.kill();await exit;}if(path.dirname(dir)!==os.tmpdir())throw Error('unsafe cleanup');fs.rmSync(dir,{recursive:true,force:true});});
  async function start(){
   const script="const {createServer}=require('./src/web/server');const {server}=createServer({persistPath:process.argv[1]});server.listen(0,'127.0.0.1',()=>console.log(server.address().port));";
   const child=spawn(process.execPath,['-e',script,file],{cwd:path.join(__dirname,'..'),env:{...process.env,NODE_ENV:'test'},stdio:['ignore','pipe','pipe'],windowsHide:true});children.push(child);
   const port=await new Promise((resolve,reject)=>{child.once('error',reject);child.stdout.once('data',d=>resolve(Number(String(d).trim())));child.once('exit',code=>reject(Error('server exited '+code)));});
   return {child,base:'http://127.0.0.1:'+port};
  }
  const first=await start();await call(first.base,'/api/onboarding/turn',{text:'My company is registered in Singapore. I keep my books in SGD.'});const activation=await confirm(first.base);
  const original=(await call(first.base,'/api/workspace')).workspace,exit=once(first.child,'exit');first.child.kill();await exit;
  const second=await start(),restored=(await call(second.base,'/api/workspace')).workspace;
  assert.deepEqual(restored,original);const settings=await call(second.base,'/api/settings');assert.equal(settings.org.jurisdiction,'SG');
  const auditBefore=(await call(second.base,'/api/audit')).entries.length;
  const replay=await call(second.base,'/api/onboarding/activate',{activationKey:activation.record.activationKey});
  assert.equal(replay.status,201);assert.equal((await call(second.base,'/api/audit')).entries.length,auditBefore);
  assert.equal((await call(second.base,'/api/onboarding/history')).history.length,1);
 });
});
