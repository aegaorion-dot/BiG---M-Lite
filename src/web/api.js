'use strict';
function json(data,status=200){return {status,headers:{'content-type':'application/json; charset=utf-8'},body:JSON.stringify(data)};}
function err(error,status=400){return json({ok:false,error},status);}
function publicResult(r){return {transactionId:r.transactionId,packId:r.packId,packVersion:r.packVersion,classification:r.classification,aiNote:r.aiNote,tax:r.tax,receipt:r.receipt,journal:r.journal,balances:r.balances};}
async function dispatch(store,method,path,query={},body={}){
 const {ctx}=store;
 try{
  const currency=query.currency||ctx.org?.baseCurrency;
  if(path.startsWith('/api/intake'))store.checkAuth(body?.authToken??query.token??null);
  if(method==='GET'){
   if(path==='/api/intake')return json({ok:true,...store.intake.list()});
   if(path==='/api/intake/trace')return json({ok:true,...store.intake.trace(query.candidateId)});
   if(path==='/api/intake/external/preview')return json({ok:true,...store.intake.external.preview(query.batchId)});
   if(path==='/api/intake/external/export')return {status:200,headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="reviewed-import-preview.csv"','cache-control':'no-store'},body:store.intake.external.exportCsv(query.batchId)};
   if(path==='/api/intake/external/original'){const original=store.intake.external.original(query.batchId);return {status:200,headers:{'content-type':'application/octet-stream','content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(original.filename),'cache-control':'no-store'},body:original.bytes};}
   if(path==='/api/intake/original'){const original=store.intake.original(query.documentId);return {status:200,headers:{'content-type':'application/octet-stream','content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(original.filename),'cache-control':'no-store'},body:original.bytes};}
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
   if(path==='/api/intake/duplicates/review')return json({ok:true,candidate:await store.intake.resolveDuplicate(body)});
   if(path==='/api/intake/external/source')return json({ok:true,source:await store.intake.external.registerSource(body)},201);
   if(path==='/api/intake/external/mapping')return json({ok:true,mapping:await store.intake.external.approveMapping(body)});
   if(path==='/api/intake/external/upload'){
    const encoded=body?.base64;if(typeof encoded!=='string'||encoded.length>Math.ceil(8*1024*1024/3)*4||!encoded.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))return err('Invalid external upload');
    const bytes=Buffer.from(encoded,'base64');if(bytes.toString('base64')!==encoded)return err('Malformed base64');return json({ok:true,...await store.intake.external.stage({...body,bytes})},201);
   }
   if(path==='/api/intake/external/confirm')return json({ok:true,...await store.intake.external.confirmBatch(body)});
   if(path==='/api/intake/upload'){
    const encoded=body?.base64;
    if(typeof encoded!=='string'||!encoded.length||encoded.length>Math.ceil(8*1024*1024/3)*4||encoded.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))return err('Invalid or oversized base64 upload');
    const bytes=Buffer.from(encoded,'base64');if(bytes.toString('base64')!==encoded)return err('Malformed base64 upload');
    return json({ok:true,...await store.intake.upload({bytes,originalFilename:body.originalFilename,declaredMimeType:body.declaredMimeType})},201);
   }
   if(path==='/api/intake/chat')return json({ok:true,...await store.intake.chat(body)},201);
   if(path==='/api/intake/edit')return json({ok:true,candidate:await store.intake.edit(body)});
   if(path==='/api/intake/reject')return json({ok:true,candidate:await store.intake.reject(body)});
   if(path==='/api/intake/confirm')return json({ok:true,candidate:await store.intake.confirm(body)});
   if(path==='/api/intake/retry')return json({ok:true,document:await store.intake.retry(body)});
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
