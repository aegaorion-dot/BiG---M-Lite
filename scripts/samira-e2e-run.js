'use strict';
// Runs one synthetic Samira scenario through BiG-M's real intake and Muse paths.
// Source fixture contents are uploaded as documents; no transaction observations
// or calculation answers are constructed here.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
require('../src/web/environment').loadEnvironment(path.resolve('.env'));
require('./samira-fixtures');
process.env.BIGM_REGULATORY_POLICY='HACKATHON_DEMO';
const {createMuseRuntime}=require('../src/ai/museRuntime'),{createServer}=require('../src/web/server');
const runtime=createMuseRuntime(),providerCalls=[],fetchBase=runtime.adapter._fetch;
runtime.adapter._fetch=async(url,options)=>{const startedAt=new Date().toISOString(),start=Date.now(),response=await fetchBase(url,options),raw=await response.clone().text();let body;try{body=JSON.parse(raw)}catch{};providerCalls.push({startedAt,elapsedMs:Date.now()-start,httpStatus:response.status,model:body?.model??runtime.adapter.model,status:body?.status??null,output:(body?.output??[]).flatMap(x=>x.content??[]).filter(x=>x.type==='output_text').map(x=>x.text??'').join('')});return response;};
const root=path.join(os.tmpdir(),'bigm-samira-france-'+crypto.randomUUID());fs.mkdirSync(root,{recursive:true});
const persistPath=path.join(root,'store.json'),artifactPath=path.join(root,'e2e.json'),app=createServer({port:0,persistPath,museRuntime:runtime}),auth=process.env.BIGM_API_TOKEN;
const fixtures=path.resolve(__dirname,'../test/fixtures/samira-france');
const profileMessage='السلام عليكم، سميتي سميرة العمراني. أنا مغربية وكنسكن بوحدي فليون، فرنسا من 10 يناير 2025. كنخدم دوام كامل عند RhoneLogistique SAS وكنبيع حلويات مغربية وكنقدم طلبات صغيرة ديال الطياب فالدار. ما عنديش شركة مسجلة ولا مستخدمين ولا حساب بنكي ديال النشاط. عندي مصاريف شخصية ومهنية مخلوطين.';
const profileDetails='من 10 يناير 2025 وأنا ساكنة فليون ففرنسا وباقية تما دابا. بغيت نسجلو الحسابات باليورو. الخدمة ديالي كموظفة منفصلة على نشاط الحلويات ديالي. نشاط الحلويات فالدار فليون، نشاط فردي صغير بلا شركة، بلا خدامة وبلا حساب بنكي خاص بالنشاط.';
const clarificationMessage='بالنسبة للمعدات: الروبو ديال الحلويات والفران كيتستعملو كاملين فخدمة الحلويات. التلفون والضو والمازوط كنستعملهم للحياة الشخصية وحتى لطلبات النشاط، وما عارفاش النسبة بالضبط. عشا المطعم كان شخصي مع أختي.';
// The source file and HTTP JSON body are UTF-8 already. Do not reinterpret
// Unicode code points as legacy Windows bytes: that destroys Arabic text.
function restoreDarija(value){return value;}
async function api(route,body={}){const response=await fetch('http://127.0.0.1:'+app.server.address().port+route,{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+auth}:{})},body:JSON.stringify(body)}),raw=await response.text();let parsed;try{parsed=JSON.parse(raw)}catch{parsed={raw}}return {httpStatus:response.status,raw,body:parsed};}
function save(extra={}){const payload={createdAt:new Date().toISOString(),provider:'meta',model:runtime.adapter.model,providerCalls,...extra};fs.writeFileSync(artifactPath,JSON.stringify(payload,null,2),'utf8');app.store.persist();return payload;}
(async()=>{
 await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(0,'127.0.0.1',resolve)});
 try{
  const locale=await api('/api/onboarding/language',{language:'ar-MA'});await api('/api/i18n/conversation',{locale:'ar-MA'});
  const profile=await api('/api/onboarding/turn',{text:restoreDarija(profileMessage)});
  const profileFollowup=await api('/api/onboarding/turn',{text:restoreDarija(profileDetails)});
  const documents=[];
  for(const [filename,mime] of [
   ['samira_october_2025_bulletin.jpg','image/jpeg'],
   ['samira_october_2025_receipts.jpg','image/jpeg'],
   ['samira_october_2025_sales.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
  ]){
   const bytes=fs.readFileSync(path.join(fixtures,filename));
   documents.push({filename,...await api('/api/intake/upload',{base64:bytes.toString('base64'),originalFilename:filename,declaredMimeType:mime})});
  }
  const clarification=await api('/api/intake/chat',{text:restoreDarija(clarificationMessage),requestId:'samira-clarification-'+Date.now()});
  const intake=app.store.intake.list(),candidates=intake.candidates;
  const traces=candidates.map(c=>{try{return app.store.intake.trace(c.candidateId)}catch(e){return {candidateId:c.candidateId,error:e.message}}});
  const output=save({locale:locale.body,profile:{status:profile.httpStatus,body:profile.body},profileFollowup:{status:profileFollowup.httpStatus,body:profileFollowup.body},documents:documents.map(d=>({filename:d.filename,httpStatus:d.httpStatus,body:d.body,trace:d.body.document?.documentId?app.store.intake.documentTrace(d.body.document.documentId):null})),clarification:{status:clarification.httpStatus,body:clarification.body},intake:{candidateCount:candidates.length,candidates:candidates.map(c=>({candidateId:c.candidateId,documentId:c.documentId,sourceChannel:c.sourceChannel,candidateType:c.candidateType,current:c.current,evidence:c.evidence,confirmationAuthority:c.confirmationAuthority??null,semanticProvenance:c.semanticProvenance??null,status:c.status,validation:c.validation??null})),traces},museActivity:app.store.museActivity(),persistPath,artifactPath});
  process.stdout.write(JSON.stringify({artifactPath,persistPath,providerCalls:providerCalls.map(c=>({startedAt:c.startedAt,elapsedMs:c.elapsedMs,httpStatus:c.httpStatus,model:c.model,status:c.status,output:c.output.slice(0,900)})),locale:output.locale,profileStatus:output.profile.status,profileResult:output.profile.body,profileFollowup:output.profileFollowup.body,documents:output.documents.map(d=>({filename:d.filename,httpStatus:d.httpStatus,status:d.body.status??null,candidateIds:d.body.candidateIds??null,error:d.body.error??null,document:{documentId:d.body.document?.documentId,processingStatus:d.body.document?.processingStatus,lastError:d.body.document?.lastError,sha256:d.body.document?.sha256,candidateCount:d.body.document?.candidates?.length??0}})),clarification:output.clarification,candidateCount:candidates.length,candidates:output.intake.candidates.map(c=>({candidateId:c.candidateId,documentId:c.documentId,sourceChannel:c.sourceChannel,candidateType:c.candidateType,current:c.current,evidence:c.evidence,status:c.status})),museActivity:output.museActivity.map(e=>({purpose:e.purpose,status:e.status,success:e.success,responseStatus:e.responseStatus,candidateCount:e.candidateCount,sourceId:e.sourceId,failure:e.failure,schemaFailure:e.schemaFailure}))},null,2)+'\n');
 }finally{await new Promise(resolve=>app.server.close(resolve));}
})().catch(e=>{process.stderr.write(JSON.stringify({error:{name:e.name,message:e.message,code:e.code??null,causeName:e.cause?.name??null,causeCode:e.cause?.code??null},providerCalls:providerCalls.map(c=>({httpStatus:c.httpStatus,elapsedMs:c.elapsedMs,model:c.model,status:c.status})),artifactPath,persistPath})+'\n');process.exitCode=1;});
