'use strict';
function json(data,status=200){return {status,headers:{'content-type':'application/json; charset=utf-8'},body:JSON.stringify(data)};}
function err(error,status=400){return json({ok:false,error},status);}
function publicResult(r){return {transactionId:r.transactionId,packId:r.packId,packVersion:r.packVersion,classification:r.classification,aiNote:r.aiNote,tax:r.tax,receipt:r.receipt,journal:r.journal,balances:r.balances};}
async function dispatch(store,method,path,query={},body={}){
 const {ctx}=store;
 try{
  const currency=query.currency||ctx.org?.baseCurrency;
  if(method==='GET'){
   if(path==='/api/health')return json({ok:true,service:'bigm-lite-web',framework:'0.1.0'});
   if(path==='/api/summary')return json({ok:true,summary:store.summary(currency)});
   if(path==='/api/transactions')return json({ok:true,transactions:store.listTransactions()});
   if(path==='/api/journals')return json({ok:true,journals:ctx.ledger.list().map(store.serializeJournal)});
   if(path==='/api/ledger')return json({ok:true,currency:currency??null,balances:currency?[...ctx.ledger.balances(currency)].map(([accountId,money])=>({accountId,netMinor:String(money.amountMinor),netMajor:money.toMajorString()})):[]});
   if(path==='/api/audit')return json({ok:true,verify:ctx.audit.verifyChain(),entries:ctx.audit.list()});
   if(path==='/api/reports/monthly')return json({ok:true,currency:currency??null,months:store.monthlyReport(currency),fxConversionApplied:false});
   if(path==='/api/tax'||path==='/api/country-packs')return json({ok:true,...store.countryPackState(),note:'Tax settings need review. Reference content does not authorize tax execution.'});
   if(path==='/api/onboarding/state')return json({ok:true,...store.onboardingState()});
   if(path==='/api/onboarding/readiness')return json({ok:true,readiness:store.onboardingReadiness()});
   if(path==='/api/onboarding/history')return json({ok:true,history:store.onboardingHistory(),ai:store.aiStatus()});
   if(path==='/api/workspace')return json({ok:true,workspace:store.workspaceProfile()});
   if(path==='/api/i18n')return json({ok:true,state:{uiLanguage:store.workspaceProfile().activated?store.workspaceProfile().language:store.onboardingState().uiLanguage}});
   if(path==='/api/settings')return json({ok:true,org:ctx.org,periods:ctx.periods.list(),chart:ctx.chart?.list()??[],pack:ctx.pack?{id:ctx.pack.manifest.id,version:ctx.pack.manifest.version,kind:'BOOKKEEPING_TEMPLATE'}:null,countryPackResolution:store.workspaceProfile().countryPackResolution});
  }
  if(method==='POST'){
   const token=body?.authToken??query.token??null;store.checkAuth(token);
   if(path==='/api/onboarding/turn')return json({ok:true,...await store.onboardingTurn(body?.text)});
   if(path==='/api/onboarding/edit')return json({ok:true,...store.editProfile(body)});
   if(path==='/api/onboarding/language')return json({ok:true,language:store.setUiLanguage(body?.language??body?.tag)});
   if(path==='/api/onboarding/propose'){const r=store.onboardingPropose();return r.ok?json(r):err(r.errors.join('; '));}
   if(path==='/api/onboarding/validate'){const r=store.onboardingValidate();return r.ok?json(r):err(r.errors.join('; '));}
   if(path==='/api/onboarding/confirm')return json(store.onboardingConfirm({proposalHash:body?.proposalHash??body?.hash,actor:body?.actor??'user',decisionSource:body?.decisionSource??'HUMAN',packIds:body?.packIds??[]}));
   if(path==='/api/onboarding/activate')return json({ok:true,record:store.onboardingActivate({activationKey:body?.activationKey,actor:body?.actor??'user'})},201);
   if(path==='/api/country-packs/approve')return json({ok:true,approval:store.approvePack(body)});
   if(path==='/api/sales')return json({ok:true,result:publicResult(await store.createSale(body,{authToken:token}))},201);
   if(path==='/api/purchases')return json({ok:true,result:publicResult(await store.createPurchase(body,{authToken:token}))},201);
   if(path==='/api/reversals')return json({ok:true,...store.reverseJournal({...body,authToken:token})},201);
   if(path==='/api/import/csv'){if(typeof body?.csv!=='string')return err('body.csv (string) is required');return json({ok:true,report:await store.importCsvText(body.csv,{authToken:token})},201);}
   if(path==='/api/demo/seed')return json({ok:true,...await store.seedDemo()},201);
  }
  return err('Unknown route '+method+' '+path,404);
 }catch(e){const msg=e.message??String(e);return err(msg,/Unauthorized/.test(msg)?401:/could not be saved/.test(msg)?503:/Unknown/.test(msg)?404:400);}
}
function handleApi(store,method,path,query={},body=null){
 return method==='GET'?dispatch(store,method,path,query,body):store.serializeMutation(()=>dispatch(store,method,path,query,body));
}
module.exports={handleApi};
