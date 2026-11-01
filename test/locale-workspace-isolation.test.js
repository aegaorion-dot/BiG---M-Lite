'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createWebStore}=require('../src/web/store');
const {createServer}=require('../src/web/server');
const {activateStore}=require('./workspace-fixture');
const {LanguagePackService,Locale}=require('../src/i18n/languagePacks');

function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bigm-locale-isolation-'));t.after(()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});});return dir;}

test('confirmed onboarding language is the initial UI locale; explicit override persists without changing tax or financial setup',t=>{
 const dir=temp(t),persistPath=path.join(dir,'store.json'),store=createWebStore({persistPath});
 store.editProfile({slot:'user.language',value:'id'});
 activateStore(store,{country:'ID',currency:'IDR',name:'Locale test'});
 assert.equal(store.currentLocale(),'id-ID');
 const before={profile:store.onboardingState().profileState,workspace:store.workspaceProfile(),readiness:store.taxReadiness(),summary:store.summary(),audit:store.ctx.audit.list()};
 store.setUiLanguage('en-AU');
 assert.equal(store.onboardingState().uiLocale,'en-AU');
 assert.equal(store.onboardingState().uiLocaleSource,'USER_OVERRIDE');
 assert.deepEqual({profile:store.onboardingState().profileState,workspace:store.workspaceProfile(),readiness:store.taxReadiness(),summary:store.summary(),audit:store.ctx.audit.list()},before);
 const restored=createWebStore({persistPath});
 assert.equal(restored.currentLocale(),'en-AU');
 assert.equal(restored.onboardingState().uiLocaleSource,'USER_OVERRIDE');
 assert.equal(restored.workspaceProfile().functionalCurrency,'IDR');
 assert.equal(restored.workspaceProfile().jurisdiction,'ID');
});

test('Nikos scenario header selects a separate persisted workspace and conversation locale',async t=>{
 const dir=temp(t),{server,store,nikosStore}=createServer({persistPath:path.join(dir,'ethan','store.json')});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 async function call(path,{scenario,method='GET',body}={}){
  const headers={...(scenario?{'x-bigm-scenario':scenario}:{}),...(body?{'content-type':'application/json'}:{})};
  const response=await fetch(base+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json()};
 }
 await call('/api/onboarding/edit',{method:'POST',body:{slot:'org.name',value:'Ethan workspace'}});
 await call('/api/onboarding/edit',{scenario:'nikos',method:'POST',body:{slot:'org.name',value:'Nikos demo workspace'}});
 await call('/api/i18n/conversation',{scenario:'nikos',method:'POST',body:{locale:'el-GR'}});
 const primary=(await call('/api/onboarding/state')).data;
 const nikos=(await call('/api/onboarding/state',{scenario:'nikos'})).data;
 assert.equal(primary.slots['org.name'].value,'Ethan workspace');
 assert.equal(nikos.slots['org.name'].value,'Nikos demo workspace');
 assert.equal((await call('/api/i18n')).data.state.conversationLocale,'en');
 assert.equal((await call('/api/i18n',{scenario:'nikos'})).data.state.conversationLocale,'el-GR');
 assert.notEqual(store.workspaceProfile().organizationId,nikosStore.workspaceProfile().organizationId);
 assert.ok(fs.existsSync(path.join(dir,'ethan','nikos-demo','store.json')));
});

test('language registry, dropdown contract and dictionary provider share one list; unsupported translations disclose fallback',async()=>{
 const {supportedLanguages}=require('../src/i18n/languages');
 assert.deepEqual(supportedLanguages().map(x=>x.tag),Locale.LANGUAGE_REGISTRY.map(x=>x.tag));
 for(const item of Locale.LANGUAGE_REGISTRY)assert.equal(Locale.supported(item.tag),true);
 const service=new LanguagePackService(),indonesian=await service.ensure('id-ID'),greek=await service.ensure('el-GR');
 assert.deepEqual(indonesian.fallbackKeys,[]);
 assert.ok(greek.fallbackKeys.length>0);
 assert.equal(greek.strings['assistant.welcomeTitle'],require('../public/i18n/en.json')['assistant.welcomeTitle']);
 assert.equal(Locale.languageInfo('el-GR').fallback,'en');
});
