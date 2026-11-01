'use strict';
const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),crypto=require('node:crypto');
require('../src/web/environment').loadEnvironment(path.resolve('.env'));
const {createMuseRuntime}=require('../src/ai/museRuntime'),{createServer}=require('../src/web/server');
const runtime=createMuseRuntime(),providerResponses=[],originalFetch=runtime.adapter._fetch;
runtime.adapter._fetch=async(url,options)=>{
 const startedAt=new Date().toISOString(),start=Date.now(),response=await originalFetch(url,options),raw=await response.clone().text();
 let envelope=null;try{envelope=JSON.parse(raw);}catch{}
 providerResponses.push({purpose:providerResponses.length===0?'transaction-understanding':'document-understanding',startedAt,elapsedMs:Date.now()-start,httpStatus:response.status,model:envelope?.model??runtime.adapter.model,responseStatus:envelope?.status??null,responseId:envelope?.id??null,usage:envelope?.usage??null,assistantOutput:(envelope?.output??[]).flatMap(x=>x.content??[]).filter(x=>x.type==='output_text').map(x=>x.text??'').join('')});
 return response;
};
const text=`Έχω επίσης τα έσοδά μου για τον Οκτώβριο του 2025.

Στις 2 Οκτωβρίου εξέδωσα τιμολόγιο 3.200 δολαρίων ΗΠΑ σε πελάτη στις Ηνωμένες Πολιτείες και πληρώθηκα ολόκληρο το ποσό στις 10 Οκτωβρίου.

Στις 5 Οκτωβρίου εξέδωσα άλλο τιμολόγιο 1.800 δολαρίων ΗΠΑ. Μέχρι το τέλος του μήνα είχα λάβει μόνο 900 δολάρια και τα υπόλοιπα 900 παρέμεναν απλήρωτα.

Στις 8 Οκτωβρίου εξέδωσα τιμολόγιο 280.000 γιεν σε Ιάπωνα πελάτη και πληρώθηκα ολόκληρο το ποσό.

Στις 12 Οκτωβρίου εξέδωσα τιμολόγιο 1.600 δολαρίων Σιγκαπούρης σε πελάτη στη Σιγκαπούρη. Η πλατφόρμα κράτησε προμήθεια 80 δολαρίων Σιγκαπούρης και έλαβα καθαρά 1.520.

Στις 17 Οκτωβρίου εξέδωσα τιμολόγιο 2.000 δολαρίων Αυστραλίας σε πελάτη στην Αυστραλία και πληρώθηκα ολόκληρο το ποσό.

Στις 24 Οκτωβρίου εξέδωσα τιμολόγιο 1.250 λιρών Αγγλίας σε πελάτη στο Ηνωμένο Βασίλειο. Δεν είχε πληρωθεί μέχρι το τέλος Οκτωβρίου.`;
const xlsxPath=process.env.NIKOS_TRANSACTIONS_XLSX,jpegPath=process.env.NIKOS_RECEIPTS_JPEG;
if(!xlsxPath||!jpegPath)throw Error('Set NIKOS_TRANSACTIONS_XLSX and NIKOS_RECEIPTS_JPEG to the supplied demo files.');
const persistPath=path.join(os.tmpdir(),'bigm-nikos-e2e-store-'+Date.now()+'.json'),capturePath=path.join(os.tmpdir(),'bigm-nikos-e2e-capture-'+crypto.randomUUID()+'.json');
const app=createServer({port:0,persistPath,museRuntime:runtime});
const auth=process.env.BIGM_API_TOKEN;
async function api(pathname,body){const r=await fetch('http://127.0.0.1:'+app.server.address().port+pathname,{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+auth}:{})},body:JSON.stringify(body)});const raw=await r.text();let parsed;try{parsed=JSON.parse(raw)}catch{parsed={raw}}return {httpStatus:r.status,body:parsed,raw};}
function traceCandidates(ids){return ids.map(candidateId=>{try{const t=app.store.intake.trace(candidateId);return {candidateId,candidate:t.candidate,validation:t.interpretation?.result,raw:t.interpretation?.raw};}catch(e){return {candidateId,error:e.message};}});}
function save(output){fs.writeFileSync(capturePath,JSON.stringify(output,null,2),'utf8');app.store.persist();}
(async()=>{
 await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(0,'127.0.0.1',resolve);});
 try{
  const startedAt=new Date().toISOString(),start=Date.now();
  const revenue=await api('/api/intake/chat',{text,requestId:'nikos-october-2025-revenue-'+Date.now()});
  const revenueCandidates=revenue.body.candidates??[],revenueIds=revenueCandidates.map(c=>c.candidateId).filter(Boolean);
  const revenueTrace=traceCandidates(revenueIds);
  const revenueOut={httpStatus:revenue.httpStatus,elapsedMs:Date.now()-start,body:revenue.body,provider:runtime.adapter.model,metric:runtime.adapter.metrics().at(-1)??null,providerOutput:providerResponses.at(-1)??null,candidateIds:revenueIds,observations:revenueCandidates.map(c=>({candidateId:c.candidateId,candidateType:c.candidateType,current:c.current,evidence:c.evidence,confirmationAuthority:c.confirmationAuthority,semanticProvenance:c.semanticProvenance,validation:c.validation??null})),trace:revenueTrace};
  if(!revenueCandidates.length||revenue.body.status==='FAILED'){save({startedAt,revenue:revenueOut,stoppedAfterRevenue:true,persistPath,capturePath});process.stdout.write('REVENUE '+JSON.stringify(revenueOut)+'\nARTIFACT '+capturePath+'\n');return;}
  const jpeg=fs.readFileSync(jpegPath),xlsx=fs.readFileSync(xlsxPath);
  const imageResult=await api('/api/intake/upload',{base64:jpeg.toString('base64'),originalFilename:path.basename(jpegPath),declaredMimeType:'image/jpeg'});
  const excelResult=await api('/api/intake/upload',{base64:xlsx.toString('base64'),originalFilename:path.basename(xlsxPath),declaredMimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const intake=app.store.intake.list(),allIds=intake.candidates.map(c=>c.candidateId),traces=traceCandidates(allIds);
  const output={startedAt,revenue:revenueOut,documentUploads:{jpeg:{httpStatus:imageResult.httpStatus,document:imageResult.body.document??imageResult.body,error:imageResult.body.error??null},xlsx:{httpStatus:excelResult.httpStatus,document:excelResult.body.document??excelResult.body,error:excelResult.body.error??null}},intake:{candidateCount:intake.candidates.length,candidates:intake.candidates.map(c=>({candidateId:c.candidateId,sourceChannel:c.sourceChannel,candidateType:c.candidateType,status:c.status,current:c.current,evidence:c.evidence,confirmationAuthority:c.confirmationAuthority,validation:c.validation})),traces},museActivity:app.store.museActivity(),providerResponses,persistPath};
  save(output);process.stdout.write('E2E_INTAKE '+JSON.stringify(output)+'\nARTIFACT '+capturePath+'\nPERSISTED_STORE '+persistPath+'\n');
 }finally{await new Promise(resolve=>app.server.close(resolve));}
})().catch(e=>{process.stderr.write(JSON.stringify({error:{name:e.name,message:e.message,code:e.code??null,causeName:e.cause?.name??null,causeCode:e.cause?.code??null}})+'\n');process.exitCode=1;});
