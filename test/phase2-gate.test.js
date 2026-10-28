'use strict';
const {it}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
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
