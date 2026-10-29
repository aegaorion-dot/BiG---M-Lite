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
    if(['[data-intake-form]','[data-intake-action]','[data-retry-document]','[data-ext-batch]','[data-ext-map]','[data-dup-id]'].includes(selector)){
     const attr=selector.slice(1,-1);const matches=[];
     for(const m of this.html.matchAll(new RegExp('<(form|button)\\b[^>]*'+attr+'="[^"]+"[^>]*>','g'))){
      const node=make('intake-node');for(const a of m[0].matchAll(/data-([a-z-]+)="([^"]*)"/g))node.dataset[a[1].replace(/-([a-z])/g,(_s,c)=>c.toUpperCase())]=a[2];
      if(m[1]==='form'){const start=m.index+m[0].length,end=this.html.indexOf('</form>',start),html=this.html.slice(start,end);node.fields={};for(const field of html.matchAll(/<input\b[^>]*name="([^"]+)"[^>]*value="([^"]*)"/g))node.fields[field[1]]=field[2];for(const field of html.matchAll(/<select\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g))node.fields[field[1]]=field[2].match(/value="([^"]*)" selected/)?.[1]??'';}
      if(m[1]==='button'){const form=this.intakeNodes?.['[data-intake-form]']?.find(f=>f.dataset.intakeForm===node.dataset.candidate);node.closest=()=>form;}
      matches.push(node);
     }
     this.intakeNodes??={};this.intakeNodes[selector]=matches;return matches;
    }
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
 const context=vm.createContext({document,fetch,console,Intl,Date,crypto:require('node:crypto').webcrypto,setTimeout:()=>0,FileReader:class{readAsDataURL(file){this.result='data:'+file.type+';base64,'+file.bytes.toString('base64');this.onload();}},FormData:class{constructor(form){this.form=form;}entries(){return Object.entries(this.form.fields??{});}[Symbol.iterator](){return this.entries()[Symbol.iterator]();}}});
 await vm.runInContext(fs.readFileSync('public/locale.js','utf8'),context);
 await vm.runInContext(fs.readFileSync('public/app.js','utf8'),context);
 return {context,elements,read:code=>vm.runInContext(code,context)};
}
describe('Phase 8 international SPA',()=>{
 it('changes locale while keeping profile, confirmation and active dashboard intact',async()=>{
  const store=createActiveStore(),h=await mount(store),before=JSON.stringify({profile:store.onboardingState().profileState,confirmation:store.onboardingState().confirmation,workspace:store.workspaceProfile(),audit:store.ctx.audit.list()});await h.elements.get('#topLang').handlers.change({target:{value:'id-ID'}});assert.equal(h.read('UILANG'),'id-ID');assert.equal(h.read('route'),'dashboard');assert.equal(h.read("money('1250000','IDR')"),'IDR 1.250.000');assert.equal(JSON.stringify({profile:store.onboardingState().profileState,confirmation:store.onboardingState().confirmation,workspace:store.workspaceProfile(),audit:store.ctx.audit.list()}),before);
 });
 it('configures a separate reporting role and displays explicit pending conversion',async()=>{
  const store=createWebStore();store.editProfile({slot:'currency.functional',value:'IDR'});store.onboardingPropose();const h=await mount(store);h.read("route='onboarding';render()");await h.elements.get('#setReportingCurrency').handlers.change({target:{value:'USD'}});assert.equal(store.onboardingState().proposal.reportingCurrency,'USD');assert.equal(store.onboardingState().proposal.functionalCurrency,'IDR');await h.elements.get('#obUse').handlers.click();h.read("route='reports';render()");assert.match(h.elements.get('#view').innerHTML,/Reporting currency: USD/);assert.match(h.elements.get('#view').innerHTML,/conversion is unavailable/);assert.equal(store.workspaceProfile().functionalCurrency,'IDR');
 });
 it('gets a dated FX quote, approves it, then separately confirms original SGD into IDR ledger',async()=>{
  const {DeterministicFxProvider}=require('../src/fx/rates'),store=createActiveStore({fxProvider:new DeterministicFxProvider({'SGD|IDR|2026-06-01':'12000'})});const r=await store.intake.chat({text:'Client paid me SGD 2,000 on 2026-06-01.',requestId:'fx-ui'}),c=r.candidates[0];await store.intake.edit({candidateId:c.candidateId,revision:c.revision,changes:{counterparty:'Client',description:'Consulting',proposedTransactionType:'REVENUE',classificationAccountId:'id-revenue',paymentAccountId:'id-cash',settlementStatus:'PAID'},actor:'user'});const h=await mount(store);h.read("route='intake';render()");const click=async action=>h.elements.get('#view').intakeNodes['[data-intake-action]'].find(b=>b.dataset.intakeAction===action).handlers.click();await click('fx/resolve');assert.equal(store.ctx.ledger.size,0);assert.match(h.elements.get('#view').innerHTML,/12000/);await click('fx/approve');assert.equal(store.ctx.ledger.size,0);await click('confirm');assert.equal(store.ctx.ledger.size,1);assert.equal(store.ctx.ledger.list()[0].currency,'IDR');assert.equal(store.intake.list().candidates[0].current.currency,'SGD');
 });
});

describe('Phase 7 contextual assistant SPA',()=>{
 it('opens before activation and renders authoritative unavailable state',async()=>{
  const store=createWebStore(),h=await mount(store);await h.elements.get('#openAssistant').handlers.click();assert.equal(h.read('route'),'assistant');assert.match(h.elements.get('#view').innerHTML,/MUSE_UNAVAILABLE/);h.elements.get('#assistantText').handlers.input({target:{value:'How much revenue?'}});await h.elements.get('#assistantSend').handlers.click();assert.match(h.elements.get('#view').innerHTML,/unavailable before workspace activation/);assert.equal(store.ctx.ledger.size,0);
 });
 it('assistant discovery is advisory and cannot change the active ledger',async()=>{
  const store=createActiveStore(),h=await mount(store);h.read("route='assistant';render()");await h.elements.get('#assistantRules').handlers.click();assert.equal(h.read('assistantDiscovery.status'),'MUSE_UNAVAILABLE');assert.equal(store.ctx.ledger.size,0);assert.equal(h.elements.get('#assistantTrace'),undefined);
 });
});

describe('Phase 6 external intake SPA',()=>{
 it('registers source, uploads CSV, explicitly approves mappings and confirms through the same UI',async()=>{
  const store=createActiveStore(),h=await mount(store);h.read("route='intake';render()");for(const [id,value]of [['#extId','ui-source'],['#extName','UI source'],['#extCurrency','IDR']])h.elements.get(id).value=value;await h.elements.get('#extRegister').handlers.click();assert.equal(store.intake.list().externalSources.length,1);
  h.elements.get('#extSource').value='ui-source';h.elements.get('#extMode').value='TRANSACTION_IMPORT';const bytes=fs.readFileSync('test/fixtures/intake/external-transactions.csv');await h.elements.get('#extFile').handlers.change({target:{files:[{name:'office.csv',type:'text/csv',bytes,size:bytes.length}]}});assert.equal(store.ctx.ledger.size,0);
  const mappings=h.read('externalPreview.mappings');for(const m of mappings){h.elements.get('#map-'+m.mappingId).value=m.externalAccountCode==='BANK'?'id-cash':'id-expense';h.elements.get('#reason-'+m.mappingId).value='I checked source account meaning';await h.elements.get('#view').intakeNodes['[data-ext-map]'].find(b=>b.dataset.extMap===m.mappingId).handlers.click();}
  assert.equal(h.read('externalPreview.candidates[0].status'),'READY_TO_CONFIRM');await h.elements.get('#extConfirm').handlers.click();assert.equal(store.ctx.ledger.size,1);assert.equal(store.intake.list().candidates[0].canonicalCommand.intakeChannel,'EXTERNAL_TRANSACTION');
 });
 it('balanced journal review displays mapped lines and uses explicit confirmation',async()=>{
  const store=createActiveStore(),e=store.intake.external;await e.registerSource({externalSourceId:'journal-ui',name:'Journal UI',functionalCurrency:'IDR',actor:'user'});let p=await e.stage({externalSourceId:'journal-ui',mode:'JOURNAL_IMPORT',bytes:fs.readFileSync('test/fixtures/intake/external-journals.csv'),originalFilename:'journals.csv',actor:'user'});for(const m of p.mappings)await e.approveMapping({mappingId:m.mappingId,revision:m.revision,canonicalAccountId:m.externalAccountCode==='BANK'?'id-cash':'id-expense',actor:'user',reason:'Reviewed'});
  const h=await mount(store);h.read("route='intake';render()");await h.elements.get('#view').intakeNodes['[data-ext-batch]'][0].handlers.click();assert.ok(h.elements.get('#view').innerHTML.includes('EXTERNAL_JOURNAL'));assert.equal(store.ctx.ledger.size,0);await h.elements.get('#extConfirm').handlers.click();assert.equal(store.ctx.ledger.size,1);assert.ok(store.ctx.ledger.list()[0].isBalanced());
 });
 it('duplicate review preserves both sources and rejects the second posting explicitly',async()=>{
  const store=createActiveStore();await store.createPurchase({id:'ui-original',orgId:'org-contoh',date:'2026-10-20',jurisdiction:'ID',currency:'IDR',description:'Office supplies',amountMajor:'500000',supplier:'Synthetic Office Store',billRef:'OFFICE-001'});const e=store.intake.external;await e.registerSource({externalSourceId:'duplicate-ui',name:'Duplicate UI',functionalCurrency:'IDR',actor:'user'});let p=await e.stage({externalSourceId:'duplicate-ui',mode:'TRANSACTION_IMPORT',bytes:fs.readFileSync('test/fixtures/intake/external-transactions.csv'),originalFilename:'duplicate.csv',actor:'user'});for(const m of p.mappings)await e.approveMapping({mappingId:m.mappingId,revision:m.revision,canonicalAccountId:m.externalAccountCode==='BANK'?'id-cash':'id-expense',actor:'user',reason:'Reviewed'});
  const h=await mount(store);h.read("route='intake';render()");await h.elements.get('#view').intakeNodes['[data-ext-batch]'][0].handlers.click();const c=h.read('externalPreview.candidates[0]');assert.equal(c.duplicates.status,'POSSIBLE_DUPLICATE');h.elements.get('#dup-'+c.candidateId).value='This purchase is already in the ledger';await h.elements.get('#view').intakeNodes['[data-dup-id]'].find(b=>b.dataset.decision==='DUPLICATE').handlers.click();assert.equal(store.ctx.ledger.size,1);assert.equal(h.read('externalPreview.candidates[0].status'),'REJECTED');
 });
});

describe('Phase 5 SPA intake interactions',()=>{
 it('opens intake before activation and renders document profile proposals safely',async()=>{
  const store=createWebStore(),h=await mount(store);await h.elements.get('#openIntake').handlers.click();assert.equal(h.read('route'),'intake');assert.ok(h.elements.get('#intakeFile'));assert.ok(h.elements.get('#intakeChat'));assert.ok(h.elements.get('#view').innerHTML.includes('Chat &amp; documents'));
 });
 it('chat -> candidate review -> save correction -> explicit confirm -> one journal',async()=>{
  const store=createActiveStore(),h=await mount(store);h.read("route='intake';render()");h.elements.get('#intakeChat').handlers.input({target:{value:'Client paid me Rp5 juta for website design.'}});await h.elements.get('#intakeSend').handlers.click();assert.equal(store.ctx.ledger.size,0);
  const view=h.elements.get('#view'),form=view.intakeNodes['[data-intake-form]'][0];form.fields.transactionDate='2026-10-20';form.fields.paymentAccountId='id-cash';await form.handlers.submit({preventDefault(){}});
  const confirm=view.intakeNodes['[data-intake-action]'].find(b=>b.dataset.intakeAction==='confirm');assert.ok(confirm);await confirm.handlers.click();assert.equal(store.ctx.ledger.size,1);assert.ok(view.innerHTML.includes('Posted journal:'));assert.ok(view.innerHTML.includes('POSTED'));
 });
 it('upload control retains receipt and duplicate notification without posting',async()=>{
  const store=createActiveStore(),h=await mount(store);h.read("route='intake';render()");const file={name:'receipt.txt',type:'text/plain',bytes:fs.readFileSync('test/fixtures/intake/receipt-id.txt')};file.size=file.bytes.length;
  await h.elements.get('#intakeFile').handlers.change({target:{files:[file]}});await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(store.intake.list().documents.length,1);assert.equal(store.ctx.ledger.size,0);assert.ok(h.elements.get('#view').innerHTML.includes('Download original'));
  await h.elements.get('#intakeFile').handlers.change({target:{files:[file]}});await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));assert.equal(store.intake.list().candidates.length,1);assert.ok(h.elements.get('#view').innerHTML.includes('Duplicate document found'));
 });
 it('reject control persists rejection and removes confirm action',async()=>{
  const store=createActiveStore();await store.intake.upload({bytes:fs.readFileSync('test/fixtures/intake/receipt-id.txt'),originalFilename:'receipt.txt'});const h=await mount(store);h.read("route='intake';render()");const view=h.elements.get('#view'),button=view.intakeNodes['[data-intake-action]'].find(b=>b.dataset.intakeAction==='reject');await button.handlers.click();assert.equal(store.intake.list().candidates[0].status,'REJECTED');assert.equal(store.ctx.ledger.size,0);assert.equal(view.intakeNodes['[data-intake-action]'].length,0);
 });
 it('unsaved visible edits cannot confirm an older server candidate',async()=>{
  const store=createActiveStore();await store.intake.upload({bytes:fs.readFileSync('test/fixtures/intake/receipt-id.txt'),originalFilename:'receipt.txt'});const h=await mount(store);h.read("route='intake';render()");const view=h.elements.get('#view');view.intakeNodes['[data-intake-form]'][0].fields.amount='1';await view.intakeNodes['[data-intake-action]'].find(b=>b.dataset.intakeAction==='confirm').handlers.click();assert.equal(store.ctx.ledger.size,0);assert.ok(h.read('lastError').includes('Save your corrections'));
 });
});

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
