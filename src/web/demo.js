'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createWebStore}=require('./store'),{createMuseRuntime}=require('../ai/museRuntime'),{MetaModelAdapter}=require('../ai/aiAdapter');
const {DeterministicFxProvider}=require('../fx/rates');
const ROOT=path.resolve(__dirname,'../..'),journey=require('../../demo/journey.json');
const SAMPLES=Object.freeze({receipt:'receipt-id.txt',invoice:'invoice-sgd.txt'});
const taxReviewRequest=()=>({scopeId:'org-contoh',subjectId:'demo-owner',requestKey:'demo-individual-review',taxType:'INCOME_TAX',jurisdictionCode:'ID',jurisdictionBasis:'TAX_RESIDENCE',incomeOrEventType:'ANNUAL_ORDINARY_INDIVIDUAL_INCOME',currency:'IDR',period:{periodStart:'2026-01-01',periodEnd:'2026-12-31'},economicDate:'2026-06-01'});
function createDemoStore({persistPath=null,live=false,museRuntime=null,authToken=''}={}){
 const muse=museRuntime??(live?createMuseRuntime({maxRequests:12,maxRetries:0,timeoutMs:20000}):createMuseRuntime({adapter:new MetaModelAdapter({endpoint:'',apiKey:'',model:''})}));
 const provider=new DeterministicFxProvider({'SGD|IDR|2026-06-01':journey.recordedFx.rate},{name:'recorded-demo-fx'});
 const store=createWebStore({persistPath,museRuntime:muse,fxProvider:provider,authToken});
 store.demo={enabled:true,syntheticOnly:true,liveMuse:live&&muse.enabled,fxMode:'RECORDED_DEMO_FIXTURE',fxCapturedProvider:'frankfurter-v2',fxDate:'2026-06-01',requestCeiling:live?12:0,profileText:journey.profiling,localPaymentText:journey.localPayment,taxReviewRequest:taxReviewRequest()};
 store.demoDocument=sample=>{if(!Object.hasOwn(SAMPLES,sample))throw Error('Unknown demo document');return store.intake.upload({bytes:fs.readFileSync(path.join(ROOT,'demo',SAMPLES[sample])),originalFilename:SAMPLES[sample],declaredMimeType:'text/plain'});};
 return store;
}
function reviewProfile(store){
 for(const [slot,value]of [['org.name','Bali Design Demo'],['org.businessType','freelancer'],['user.nationality','AU'],['currency.functional','IDR'],['currency.transactions',['SGD']],['modules.enabled',['sales','purchase','accounting','reports','import']],['accounting.periodStart','2026-01-01'],['accounting.periodEnd','2026-12-31']])store.editProfile({slot,value,actor:'Demo operator'});
 for(const [basis,countryCode]of [['BUSINESS_WORK_LOCATION','ID'],['CUSTOMER_LOCATION','SG']])store.editProfile({basis,countryCode,actor:'Demo operator'});
 const p=store.onboardingPropose();if(!p.ok)throw Error('Demo proposal failed');const v=store.onboardingValidate();if(!v.ok)throw Error('Demo validation failed');store.onboardingConfirm({proposalHash:p.proposal.hash,actor:'Demo operator',decisionSource:'HUMAN'});store.onboardingActivate({activationKey:'demo:'+p.proposal.hash,actor:'Demo operator'});
}
async function reviewCandidate(store,c,changes={}){
 return store.intake.edit({candidateId:c.candidateId,revision:c.revision,actor:'Demo operator',changes:{transactionDate:'2026-06-01',description:c.current.description??'Synthetic design service',counterparty:c.current.counterparty??'Demo client',proposedTransactionType:c.current.proposedTransactionType??'REVENUE',classificationAccountId:c.current.proposedTransactionType==='EXPENSE'?'id-expense':'id-revenue',paymentAccountId:'id-cash',settlementStatus:'PAID',...changes}});
}
async function confirmCandidate(store,c){return store.intake.confirm({candidateId:c.candidateId,revision:c.revision,reviewHash:c.reviewHash,idempotencyKey:'demo:'+c.candidateId,actor:'Demo operator'});}
async function prepareDemo(store){
 reviewProfile(store);
 let r=await store.intake.chat({text:journey.localPayment,requestId:'demo-local'}),c=await reviewCandidate(store,r.candidates[0]);await confirmCandidate(store,c);
 r=await store.demoDocument('receipt');if(r.document.processingStatus==='FAILED')throw Error('Demo receipt failed');c=await reviewCandidate(store,r.document.candidates[0],{proposedTransactionType:'EXPENSE',classificationAccountId:'id-expense'});await confirmCandidate(store,c);
 r=await store.demoDocument('invoice');if(r.document.processingStatus==='FAILED')throw Error('Demo invoice failed');c=await reviewCandidate(store,r.document.candidates[0]);c=await store.intake.resolveFx({candidateId:c.candidateId,revision:c.revision});c=await store.intake.approveFx({candidateId:c.candidateId,revision:c.revision,quoteHash:c.fx.quoteHash,actor:'Demo operator'});await confirmCandidate(store,c);store.beginTaxReview(taxReviewRequest());return store;
}
function demoDirectory(projectRoot=ROOT){
 const project=fs.realpathSync.native(projectRoot),dir=path.join(project,'data','demo'),data=path.dirname(dir);if(fs.existsSync(data)&&fs.realpathSync.native(data).toLowerCase()!==path.resolve(data).toLowerCase())throw Error('Demo data directory must not redirect');fs.mkdirSync(dir,{recursive:true});
 if(fs.realpathSync.native(dir).toLowerCase()!==path.resolve(dir).toLowerCase())throw Error('Demo directory must not redirect outside the project');
 const marker=path.join(dir,'demo-workspace.json'),store=path.join(dir,'store.json');
 for(const target of [marker,store,path.join(dir,'server.lock')])if(fs.existsSync(target)&&fs.lstatSync(target).isSymbolicLink())throw Error('Demo files must not redirect');
 if(fs.existsSync(marker)){const m=JSON.parse(fs.readFileSync(marker,'utf8'));if(m.owner!=='bigm-lite-demo-v1'||m.syntheticOnly!==true)throw Error('Demo ownership marker mismatch');}
 else {if(fs.existsSync(store))throw Error('Refusing to replace an unmarked workspace');fs.writeFileSync(marker,JSON.stringify({owner:'bigm-lite-demo-v1',syntheticOnly:true})+'\n',{flag:'wx'});}
 return dir;
}
function assertDemoStopped(dir){const file=path.join(dir,'server.lock');if(!fs.existsSync(file))return;const lock=JSON.parse(fs.readFileSync(file,'utf8'));if(lock.owner!=='bigm-lite-demo-v1'||!Number.isInteger(lock.pid))throw Error('Invalid demo process marker');try{process.kill(lock.pid,0);}catch(e){if(e.code==='ESRCH'){fs.unlinkSync(file);return;}throw Error('Cannot establish demo process state');}throw Error('Stop the demo server before resetting');}
async function resetDemo({ready=false,projectRoot=ROOT}={}){
 const dir=demoDirectory(projectRoot);assertDemoStopped(dir);const temp=path.join(dir,'reset-'+crypto.randomUUID()+'.json');const store=createDemoStore({persistPath:temp});store.setUiLanguage('id-ID');if(ready)await prepareDemo(store);store.persist();fs.renameSync(temp,path.join(dir,'store.json'));return {mode:ready?'PREPARED':'FRESH',path:path.join(dir,'store.json'),journals:store.ctx.ledger.size,totals:store.summary().totals};
}
module.exports={ROOT,journey,taxReviewRequest,createDemoStore,reviewProfile,reviewCandidate,confirmCandidate,prepareDemo,demoDirectory,assertDemoStopped,resetDemo};
