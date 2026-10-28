'use strict';
const {it}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const os=require('node:os'),{spawnSync}=require('node:child_process');
const {createWebStore}=require('../src/web/store');
const {createActiveStore}=require('./workspace-fixture');
const {Money}=require('../src/domain/money'),{Ledger}=require('../src/domain/ledger');
const {PostingService}=require('../src/accounting/postingService');
const {JournalEntry}=require('../src/domain/journal');
it('acceptance: exactly one authoritative implementation in production source',()=>{
 const files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(p.endsWith('.js'))files.push(p);}}walk(path.join(__dirname,'../src'));
 for(const name of ['Money','Ledger','JournalEntry','PostingService','FinancialPeriod','PeriodRegistry']){
  const found=files.filter(f=>new RegExp('class\\s+'+name+'\\b').test(fs.readFileSync(f,'utf8')));assert.equal(found.length,1,name+': '+found.join(','));
 }
});
for(const [country,currency] of [['ID','IDR'],['SG','SGD'],['AU','AUD'],['US','USD'],['GB','GBP']])it('acceptance: '+country+' uses the same posting, ledger, period and report source',async()=>{
 const s=createActiveStore({},{country,currency});assert.ok(s.ctx.ledger instanceof Ledger);assert.ok(s.ctx.posting instanceof PostingService);
 const posting=s.ctx.posting,ledger=s.ctx.ledger,org=s.ctx.org;
 await s.createSale({id:'gate-'+country,orgId:org.id,date:'2026-08-01',jurisdiction:country,currency,customer:'Customer',invoiceRef:'GATE',description:'Income',amountMajor:'100'});
 assert.equal(s.ctx.posting,posting);assert.equal(s.ctx.ledger,ledger);assert.equal(ledger.size,1);
 assert.ok(ledger.list()[0] instanceof JournalEntry);assert.ok(ledger.list()[0].lines[0].money instanceof Money);
 assert.equal(s.workspaceProfile().functionalCurrency,org.baseCurrency);assert.equal(s.summary().currency,currency);
 assert.equal(s.summary().totals.revenueMinor,s.monthlyReport()[0].revenueMinor);
 assert.equal(s.workspaceProfile().taxReady,false);
});
it('acceptance: a payment or reporting discussion cannot create a shorthand bookkeeping correction',async()=>{
 for(const text of ['Customers pay in IDR.','My reporting currency is IDR.']){
  const s=createWebStore();await s.onboardingTurn('I keep my books in USD.');await s.onboardingTurn(text);await s.onboardingTurn('Actually use SGD.');assert.equal(s.onboardingState().slots['currency.functional'].value,'USD');
 }
});
it('acceptance: pending bookkeeping question cannot turn an AI payment-currency inference into bookkeeping evidence',async()=>{
 const {isDirectCurrencyAnswer}=require('../src/onboarding/currencyContext');assert.equal(isDirectCurrencyAnswer('CHF','currency.functional','CHF'),true);assert.equal(isDirectCurrencyAnswer('CHF','currency.functional','USD'),false);
 const provider={extractProfile:async()=>({facts:[{slot:'currency.functional',value:'IDR',source:'AI_INFERENCE',supportingQuote:'Customers pay in IDR.',status:'CANDIDATE',operation:'SET'}],jurisdictionFacts:[]})};
 const s=createWebStore();await s.onboardingTurn('My customers are in Singapore.');assert.equal(s.onboardingState().question.key,'currency.functional');
 const result=await s.onboardingTurn('Customers pay in IDR.',{aiProvider:provider});
 assert.equal(s.onboardingState().slots['currency.functional'].value,null);assert.deepEqual(s.onboardingState().slots['currency.transactions'].value,['IDR']);
 assert.equal(result.providerUsed,'fallback');assert.equal(result.fallbackReason,'AI_SCHEMA_VALIDATION_FAILED');
 await s.onboardingTurn('IDR');assert.equal(s.onboardingState().slots['currency.functional'].value,'IDR');
 const mismatched={extractProfile:async()=>({facts:[{slot:'currency.functional',value:'USD',source:'AI_INFERENCE',supportingQuote:'Actually use SGD.',status:'CANDIDATE',operation:'REPLACE'}],jurisdictionFacts:[]})};
 const correction=await s.onboardingTurn('Actually use SGD.',{aiProvider:mismatched});assert.equal(correction.fallbackReason,'AI_SCHEMA_VALIDATION_FAILED');assert.equal(s.onboardingState().slots['currency.functional'].value,'SGD');
});
it('acceptance: exact shorthand correction invalidates previous proposal, validation and confirmation',async()=>{
 const s=createWebStore();await s.onboardingTurn('I keep my books in IDR.');
 const old=s.onboardingPropose().proposal;s.onboardingValidate();s.onboardingConfirm({proposalHash:old.hash});
 const revision=s.onboardingState().profileState.revision;await s.onboardingTurn('Actually use SGD.');
 assert.equal(s.onboardingState().slots['currency.functional'].value,'SGD');assert.ok(s.onboardingState().profileState.revision>revision);
 assert.equal(s.onboardingReadiness().workspaceReady,false);assert.throws(()=>s.onboardingConfirm({proposalHash:old.hash}));assert.throws(()=>s.onboardingActivate({activationKey:'stale'}));
 const fresh=s.onboardingPropose().proposal;assert.notEqual(fresh.hash,old.hash);
});
it('acceptance: each cross-border statement supplies only its own jurisdiction basis',async()=>{
 for(const [text,basis] of [['My customers are in Singapore.','CUSTOMER_LOCATION'],['My bank account is in Singapore.','ACCOUNT_LOCATION'],['My business is registered in Singapore.','REGISTRATION']]){
  const s=createWebStore();await s.onboardingTurn(text);assert.deepEqual(s.onboardingState().jurisdictionCandidates.map(x=>[x.basis,x.countryCode]),[[basis,'SG']]);
 }
 const s=createWebStore();await s.onboardingTurn("I'm Australian and run a coffee shop in Bali. Customers pay in IDR.");
 assert.equal(s.onboardingState().slots['user.nationality'].value,'AU');assert.deepEqual(s.onboardingState().jurisdictionCandidates.map(x=>[x.basis,x.countryCode]),[['BUSINESS_WORK_LOCATION','ID']]);assert.deepEqual(s.onboardingState().slots['currency.transactions'].value,['IDR']);
});
it('acceptance: fresh OS process restores profile, confirmation, runtime, CLOSED periods, history and idempotency',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bigm-gate-process-')),file=path.join(dir,'store.json');
 t.after(()=>{if(path.dirname(dir)!==os.tmpdir())throw Error('Unsafe cleanup');fs.rmSync(dir,{recursive:true,force:true});});
 const script=`
 const {createWebStore}=require('./src/web/store');
 const {createActiveStore}=require('./test/workspace-fixture');
 const {FinancialPeriod}=require('./src/domain/organization');
 (async()=>{
 const file=process.argv[1],seed=process.argv[2]==='seed';
 const s=seed?createActiveStore({persistPath:file},{country:'ID',currency:'IDR'}):createWebStore({persistPath:file});
 if(seed){await s.createSale({id:'restart-sale',orgId:s.ctx.org.id,date:'2026-08-01',jurisdiction:'ID',currency:'IDR',customer:'Client',invoiceRef:'P',description:'Income',amountMajor:'100'});s.ctx.periods.replace(new FinancialPeriod({...s.ctx.periods.list()[0],status:'CLOSED'}));s.persist();}
 const state=s.onboardingState(),record=s.onboardingHistory()[0],n=s.ctx.audit.size;
 s.onboardingActivate({activationKey:record.activationKey,actor:'test human'});
 let closed=false;try{s.ctx.periods.getPostingPeriod(s.ctx.org.id,'2026-08-02');}catch(e){closed=/CLOSED/.test(e.message);}
 console.log(JSON.stringify({profile:state.profileState,revision:state.profileRevision,confirmation:state.confirmation,active:state.active,pack:s.workspaceProfile().countryPackResolution,periods:s.ctx.periods.list(),history:s.onboardingHistory(),idempotency:s.ctx.idempotency.toJSON(),org:s.ctx.org,summary:s.summary(),replayAuditStable:s.ctx.audit.size===n,closed}));
 })().catch(e=>{console.error(e);process.exitCode=1;});`;
 function run(mode){const r=spawnSync(process.execPath,['-e',script,file,mode],{cwd:path.join(__dirname,'..'),encoding:'utf8',env:{...process.env,NODE_ENV:'test'},windowsHide:true,timeout:15000});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);}
 const before=run('seed'),after=run('restore');assert.deepEqual(after,before);assert.equal(after.closed,true);assert.equal(after.replayAuditStable,true);assert.ok(Object.keys(after.idempotency).length);assert.equal(after.pack.status,'REVIEW_REQUIRED');
});
