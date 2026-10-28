'use strict';
// Executes the actual SPA against real API contracts with a minimal DOM host.
// This verifies interaction/state contracts, not browser layout or accessibility.
const {describe,it}=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const {createWebStore}=require('../src/web/store'),{handleApi}=require('../src/web/api');
const {createActiveStore}=require('./workspace-fixture');
async function mount(store){
 const elements=new Map();
 function make(id){
  const el={id,hidden:false,disabled:false,value:'',dataset:{},handlers:{},textContent:'',scrollTop:0,scrollHeight:100,
   addEventListener(name,handler){this.handlers[name]=handler;},appendChild(){},remove(){},showModal(){this.open=true;},close(){this.open=false;},
   querySelectorAll(selector){
    if(selector==='[data-route]')return [...this.html.matchAll(/data-route="([^"]+)"/g)].map(m=>{const b=make('route-'+m[1]);b.dataset.route=m[1];return b;});
    return [];
   },querySelector(){return make('submit');},html:'',owned:[]};
  Object.defineProperty(el,'innerHTML',{get(){return this.html;},set(html){this.html=html;for(const key of this.owned)elements.delete(key);this.owned=[];for(const m of html.matchAll(/\bid="([^"]+)"/g)){const key='#'+m[1];elements.set(key,make(key));this.owned.push(key);}}});
  return el;
 }
 for(const key of ['#view','#tabs','#topLang','#auditPill','#demoBtn','#demoNote','#toasts','#txDialog','#revDialog'])elements.set(key,make(key));
 const document={documentElement:{},querySelector:key=>elements.get(key)??null,createElement:()=>make('created')};
 const fetch=async(url,options)=>{
  if(url.startsWith('/i18n/'))return {ok:true,json:async()=>JSON.parse(fs.readFileSync('public'+url,'utf8'))};
  const parsed=new URL(url,'http://test'),r=await handleApi(store,options?.method??'GET',parsed.pathname,Object.fromEntries(parsed.searchParams),options?.body?JSON.parse(options.body):null);
  return {ok:r.status<400,json:async()=>JSON.parse(r.body)};
 };
 const context=vm.createContext({document,fetch,console,Intl,Date,setTimeout:()=>0,FormData:class{constructor(form){this.form=form;}entries(){return Object.entries(this.form.fields??{});}[Symbol.iterator](){return this.entries()[Symbol.iterator]();}}});
 await vm.runInContext(fs.readFileSync('public/app.js','utf8'),context);
 return {context,elements,read:code=>vm.runInContext(code,context)};
}
describe('Actual SPA interaction contracts',()=>{
 it('fresh boot renders a translated greeting and hides runtime navigation',async()=>{
  const h=await mount(createWebStore());assert.equal(h.elements.get('#tabs').hidden,true);
  assert.ok(h.elements.get('#view').innerHTML.includes('Welcome to BiG-M.'));
  assert.ok(!h.elements.get('#view').innerHTML.includes('<p>ob.greeting</p>'));
  assert.ok(h.elements.get('#view').innerHTML.includes('Fallback mode'));
 });
 it('describe -> proposal -> human click -> workspace opens with confirmed module navigation',async()=>{
  const store=createWebStore(),h=await mount(store);
  const input=h.elements.get('#obInput');input.handlers.input({target:{value:'My company is registered in Singapore. I keep my books in SGD.'}});
  await h.elements.get('#obSend').handlers.click();
  assert.ok(h.elements.get('#view').innerHTML.includes('Use this setup'));
  assert.equal(store.workspaceProfile().activated,false);
  await h.elements.get('#obUse').handlers.click();
  assert.equal(store.workspaceProfile().activated,true);assert.equal(h.elements.get('#tabs').hidden,false);
  assert.ok(h.elements.get('#tabs').innerHTML.includes('data-route="sales"'));assert.equal(h.read('route'),'dashboard');
  assert.ok(h.elements.get('#view').innerHTML.includes('SGD'));
 });
 it('bookkeeping currency editor updates the intended field and invalidates stale approval',async()=>{
  const store=createWebStore(),h=await mount(store);
  h.elements.get('#obInput').handlers.input({target:{value:'I keep my books in IDR.'}});await h.elements.get('#obSend').handlers.click();
  const old=store.onboardingState().proposal.hash;
  await h.elements.get('#setCur').handlers.change({target:{value:'USD'}});
  assert.equal(store.onboardingState().slots['currency.functional'].value,'USD');assert.notEqual(store.onboardingState().proposal.hash,old);assert.equal(store.onboardingState().confirmation,null);
 });
 it('restored activated workspace opens dashboard and formats currency without precision loss',async()=>{
  const store=createActiveStore({}, {country:'SG',currency:'SGD',name:'Singapore Coffee'}),h=await mount(store);
  assert.equal(h.read('route'),'dashboard');assert.equal(h.elements.get('#tabs').hidden,false);
  assert.equal(h.read("money('1050','SGD')"),'SGD 10.50');
  assert.equal(h.read("money('900719925474099312','SGD')"),'SGD 9,007,199,254,740,993.12');
  assert.equal(h.read("money('1000','IDR')"),'IDR 1,000');
 });
 it('transaction dialog submits the active organization, jurisdiction and selected currency',async()=>{
  const store=createActiveStore({}, {country:'SG',currency:'SGD',name:'Coffee'}),h=await mount(store);
  h.read("openTx('SALE')");
  assert.ok(h.elements.get('#txDialog').innerHTML.includes('value="SGD" selected'));
  const form=h.elements.get('#txForm');form.fields={id:'ui-income',date:'2026-08-01',currency:'SGD',description:'UI contract income',amountMajor:'10.50',counterparty:'Customer',reference:'INV-UI'};
  await form.handlers.submit({preventDefault(){},target:form});
  const journal=store.ctx.ledger.list()[0];assert.equal(journal.orgId,store.workspaceProfile().organizationId);assert.equal(journal.currency,'SGD');assert.equal(journal.lines[0].money.amountMinor,1050n);
  assert.equal(store.summary().totals.revenueMinor,'1050');
 });
 it('refresh mid-onboarding resumes the saved question without raw translation keys',async()=>{
  const store=createWebStore();await store.onboardingTurn('I run a coffee shop in Bali.');
  const h=await mount(store);assert.ok(h.elements.get('#view').innerHTML.includes('Your setup was saved.'));
  assert.ok(h.elements.get('#view').innerHTML.includes('Which currency'));
 });
});
