'use strict';
const {inspectFile,textOf,csvRows,hash,LIMITS}=require('./files');
const {Money}=require('../domain/money');
const {assertDate}=require('../domain/organization');
const {isKnownCurrency}=require('../global/currencies');
const {fingerprint}=require('../onboarding/canonical');
const copy=x=>structuredClone(x),now=()=>new Date().toISOString();
const MAX_ROWS=2000,MODES=['TRANSACTION_IMPORT','JOURNAL_IMPORT'];
const text=(v,label,max=120)=>{if(typeof v!=='string'||!v.trim()||v.length>max||['__proto__','constructor','prototype'].includes(v))throw Error('Invalid '+label);return v.trim();};
const human=actor=>{text(actor,'human actor',100);if(/^(ai|model|muse|meta|system)(?:$|[: -])/i.test(actor))throw Error('Human review required');};
function safeCsvCell(value){let s=String(value??'');if(/^\s*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
function blankExternalState(){return {sources:{},mappings:{},batches:{},identities:{}};}
function parseFile(bytes,filename,mime,mode){
 // Reuse filename/byte limits without confusing JSON with a document semantic input.
 inspectFile({bytes:Buffer.from('safe text'),originalFilename:filename,declaredMimeType:'text/plain'});
 if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>LIMITS.fileBytes)throw Error('External file byte limit (8 MiB)');
 const raw=textOf(bytes);if(raw.length>2000000)throw Error('External text limit');let headers,rows,format;
 if(/^\s*[\[{]/.test(raw)){
  format='application/json';let parsed;try{parsed=JSON.parse(raw);}catch{throw Error('Malformed JSON import');}
  if(!Array.isArray(parsed)||!parsed.length||parsed.length>MAX_ROWS||parsed.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw Error('JSON import must be a bounded array of row objects');
  headers=[...new Set(parsed.flatMap(r=>Object.keys(r)))];rows=parsed.map(r=>headers.map(k=>Object.hasOwn(r,k)?r[k]:''));
 }else{format='text/csv';[headers,...rows]=csvRows(raw,{maxRows:MAX_ROWS,preserveRaw:true,allowRagged:true});}
 if(mime&&!['application/octet-stream',format].includes(mime.split(';')[0]))throw Error('MIME mismatch for external import');
 headers=headers.map(h=>h.trim());if(headers.length>30||new Set(headers).size!==headers.length||headers.some(h=>!h||h.length>100||['__proto__','constructor','prototype'].includes(h)))throw Error('Invalid import headers');
 const required=mode==='JOURNAL_IMPORT'?['journal_id','line_id','date','account_code','debit','credit','currency','description']:['external_id','date','amount','currency','transaction_type','description','counterparty','account_code','payment_account_code','settlement_status'];
 if(required.some(k=>!headers.includes(k)))throw Error('Missing required columns: '+required.filter(k=>!headers.includes(k)).join(', '));
 return {headers,rows,format,schemaHash:fingerprint({headers,format,mode})};
}
function createExternalIntake({state,getContext,atomic,registerCandidate,refreshIndex,view,confirm,humanReviewHash}){
 let data=state.external;
 const mappingCandidates=new Map();
 function indexMappings(c){for(const b of c.importRef?.bindings??[]){if(!mappingCandidates.has(b.mappingId))mappingCandidates.set(b.mappingId,new Set());mappingCandidates.get(b.mappingId).add(c.candidateId);}}
 function rebuildMappings(){mappingCandidates.clear();for(const c of Object.values(state.candidates))indexMappings(c);}
 rebuildMappings();
 function source(id){const s=Object.hasOwn(data.sources,id)?data.sources[id]:null;if(!s)throw Error('Unknown external source');return s;}
 function batch(id){const b=data.batches[id];if(!b)throw Error('Unknown import batch');return b;}
 function registerSource({externalSourceId,name,sourceType='GENERIC',schemaVersion='1',functionalCurrency,actor}){
  human(actor);text(externalSourceId,'source identity');text(name,'source name');text(schemaVersion,'schema version');if(!['GENERIC','LEGACY_LEDGER','CSV_EXPORT','JSON_EXPORT'].includes(sourceType)||!isKnownCurrency(functionalCurrency))throw Error('Invalid external source profile');
  const existing=data.sources[externalSourceId];if(existing){if(fingerprint([existing.name,existing.sourceType,existing.schemaVersion,existing.functionalCurrency])!==fingerprint([name,sourceType,schemaVersion,functionalCurrency]))throw Error('Source identity conflict: register a distinct source/version');return copy(existing);}
  return atomic(()=>{const s={externalSourceId,name,sourceType,schemaVersion,functionalCurrency,accountMappingVersion:0,createdAt:now(),actor};data.sources[externalSourceId]=s;return copy(s);});
 }
 function ensureMapping(s,schemaHash,code,label){
  if(!code)return null;const mappingId='mapping-'+fingerprint([s.externalSourceId,s.schemaVersion,schemaHash,code]);let m=data.mappings[mappingId];
  if(!m){const proposed=getContext().chart?.list().filter(a=>a.code===code||label&&a.name.toLowerCase()===label.toLowerCase()).map(a=>a.id)??[];m={mappingId,externalSourceId:s.externalSourceId,schemaVersion:s.schemaVersion,schemaHash,externalAccountCode:code,observedNames:label?[label]:[],proposedAccountIds:proposed,canonicalAccountId:null,status:proposed.length===1?'PROPOSED':proposed.length>1?'CONFLICT':'UNMAPPED',revision:1,approval:null,history:[]};data.mappings[mappingId]=m;}
  else if(label&&!m.observedNames.includes(label)){m.observedNames.push(label);m.history.push({revision:m.revision,status:m.status,approval:copy(m.approval),canonicalAccountId:m.canonicalAccountId});m.status='CONFLICT';m.revision++;}
  return mappingId;
 }
 function mappingIssues(c){const issues=[];for(const binding of c.mappingRefs??[]){const m=data.mappings[binding.mappingId];if(!m?.approval||m.status!=='MATCHED'||binding.mappingRevision!==m.revision)issues.push('ACCOUNT_MAPPING_REQUIRES_REVIEW: '+(m?.externalAccountCode??'unknown'));}
  for(const binding of c.importRef?.bindings??[]){const m=data.mappings[binding.mappingId],actual=binding.line!=null?c.current.journalLines[binding.line].accountId:c.current[binding.field];if(m?.approval&&m.status==='MATCHED'&&actual!==m.canonicalAccountId)issues.push('ACCOUNT_MAPPING_CONFLICT: candidate differs from reviewed source mapping');}return issues;}
 function applyMappings(c){
  if(['CONFIRMED','POSTED','REJECTED'].includes(c.status))return;
  const before=fingerprint(c.current),refs=[];
  for(const binding of c.importRef.bindings){const m=data.mappings[binding.mappingId],accountId=m?.status==='MATCHED'&&m.approval?m.canonicalAccountId:null;refs.push({mappingId:binding.mappingId,mappingRevision:m?.revision??0,canonicalAccountId:accountId,approval:copy(m?.approval??null)});
   if(binding.line!=null)c.current.journalLines[binding.line].accountId=accountId;else c.current[binding.field]=accountId;
  }
  const changed=before!==fingerprint(c.current)||fingerprint(refs)!==fingerprint(c.mappingRefs??[]);c.mappingRefs=refs;
  if(changed){c.revision++;c.revisions.push({revision:c.revision,source:'MAPPING_REVIEW',at:now(),fields:copy(c.current),mappingRefs:copy(refs)});refreshIndex(c);}
 }
 function approveMapping({mappingId,revision,canonicalAccountId,actor,reason}){
  human(actor);text(reason,'mapping review reason',500);const m=data.mappings[mappingId];if(!m||m.revision!==revision)throw Error('Unknown or stale mapping revision');if(!getContext().chart?.has(canonicalAccountId))throw Error('Unknown canonical account');
  return atomic(()=>{m.history.push({revision:m.revision,status:m.status,canonicalAccountId:m.canonicalAccountId,approval:copy(m.approval)});m.revision++;m.canonicalAccountId=canonicalAccountId;m.status='MATCHED';m.approval={actor,reason,decisionSource:'HUMAN',at:now(),revision:m.revision};source(m.externalSourceId).accountMappingVersion++;
   for(const id of mappingCandidates.get(mappingId)??[])applyMappings(state.candidates[id]);return copy(m);});
 }
 function stage({externalSourceId,mode,bytes,originalFilename,declaredMimeType='application/octet-stream',actor}){
  human(actor);const s=source(externalSourceId);if(!MODES.includes(mode))throw Error('Invalid import mode');const parsed=parseFile(bytes,originalFilename,declaredMimeType,mode),fileHash=hash(bytes),batchId='batch-'+fingerprint([externalSourceId,s.schemaVersion,mode,fileHash]);
  if(data.batches[batchId])return {duplicate:true,...preview(batchId)};
  if(Object.values(data.batches).reduce((n,b)=>n+b.sizeBytes,0)+bytes.length>LIMITS.totalBytes)throw Error('External retained byte limit (64 MiB)');
  atomic(()=>{
   const b={batchId,externalSourceId,mode,fileHash,originalFilename,declaredMimeType,detectedMimeType:parsed.format,sizeBytes:bytes.length,originalBase64:bytes.toString('base64'),importedAt:now(),schemaHash:parsed.schemaHash,schemaVersion:s.schemaVersion,rowCount:parsed.rows.length,status:'REQUIRES_REVIEW',warnings:[],rows:[],confirmations:{}};data.batches[batchId]=b;
   const groups=new Map();
   for(let i=0;i<parsed.rows.length;i++){
    const cells=parsed.rows[i],raw=Object.fromEntries(parsed.headers.map((k,n)=>[k,cells[n]??''])),normalized={},errors=[];
    for(const [k,v]of Object.entries(raw)){if(typeof v!=='string'||v.length>2000){errors.push('Invalid or oversized cell: '+k);normalized[k]='';}else normalized[k]=v.trim();}
    if(cells.length!==parsed.headers.length)errors.push('CSV row width mismatch');
    const row={row:i+2,raw,originalCells:copy(cells),normalized,errors,status:'REQUIRES_REVIEW',candidateId:null,duplicate:false};b.rows.push(row);
    const id=mode==='JOURNAL_IMPORT'?normalized.journal_id:normalized.external_id;if(!id||id.length>120)errors.push('Source record identity required');
    try{assertDate(normalized.date,'external date');}catch{errors.push('Invalid external date');}if(!isKnownCurrency(normalized.currency))errors.push('Unsupported currency');if(!normalized.description)errors.push('Description required');
    if(!normalized.account_code)errors.push('External account code required');
    const key=id||'invalid-row-'+i;let group=groups.get(key);if(!group){group=[];groups.set(key,group);}group.push(row);
   }
   for(const [externalId,rows]of groups){
    if(mode==='TRANSACTION_IMPORT'&&rows.length>1){const same=rows.every(r=>fingerprint(r.normalized)===fingerprint(rows[0].normalized));if(same)for(const r of rows.slice(1)){r.duplicate=true;r.status='DUPLICATE';}else rows.forEach(r=>r.errors.push('Conflicting duplicate source identity'));}
    const first=rows[0],n=first.normalized,errors=[...new Set(rows.flatMap(r=>r.errors))],bindings=[],journalLines=[];
    let amount=n.amount??null,kind=['EXPENSE','PURCHASE'].includes(n.transaction_type)?'EXPENSE':['REVENUE','SALE'].includes(n.transaction_type)?'REVENUE':null;
    const rowHash=fingerprint(mode==='JOURNAL_IMPORT'?rows.map(r=>r.normalized).sort((a,b)=>String(a.line_id).localeCompare(String(b.line_id))):n),identity=fingerprint([s.externalSourceId,mode,externalId]),existing=data.identities[identity];
    if(existing&&existing.rowHash===rowHash){for(const r of rows){r.candidateId=existing.candidateId;r.duplicate=true;r.status='DUPLICATE';}continue;}
    if(existing)errors.push('EXTERNAL_IDENTITY_CONFLICT: same source record changed');
    if(mode==='JOURNAL_IMPORT'){
     const lineIds=new Set();let debit=0n,credit=0n;
     for(const r of rows){const v=r.normalized;if(!v.line_id||lineIds.has(v.line_id)){r.errors.push('Missing or duplicate journal line identity');errors.push('Missing or duplicate journal line identity');}lineIds.add(v.line_id);
      if(v.date!==n.date||v.currency!==n.currency)errors.push('Inconsistent journal date/currency');
      let d=0n,k=0n;try{for(const value of [v.debit||'0',v.credit||'0'])if(!/^\d+(?:\.\d+)?$/.test(value))throw Error();d=Money.fromMajor(v.debit||'0',v.currency).amountMinor;k=Money.fromMajor(v.credit||'0',v.currency).amountMinor;if(d<0n||k<0n||Boolean(d)===Boolean(k))throw Error();}catch{r.errors.push('Invalid debit/credit');errors.push('Invalid debit/credit');}
      debit+=d;credit+=k;const mappingId=ensureMapping(s,parsed.schemaHash,v.account_code,v.account_name);bindings.push({mappingId,line:journalLines.length});journalLines.push({accountId:null,externalAccountCode:v.account_code,side:d>0n?'DEBIT':'CREDIT',amount:isKnownCurrency(n.currency)?Money.fromMinor(d>0n?d:k,n.currency).toMajorString():'0',sourceRow:r.row,lineId:v.line_id});
     }
     if(rows.length<2||debit!==credit||debit<=0n)errors.push('UNBALANCED_JOURNAL');amount=isKnownCurrency(n.currency)?Money.fromMinor(debit,n.currency).toMajorString():null;kind='JOURNAL';
    }else{
     try{if(typeof amount!=='string'||!/^\d+(?:\.\d+)?$/.test(amount)||Money.fromMajor(amount,n.currency).amountMinor<=0n)throw Error();}catch{errors.push('Invalid exact amount');}
     if(!kind)errors.push('Explicit transaction classification required');
     bindings.push({mappingId:ensureMapping(s,parsed.schemaHash,n.account_code,n.account_name),field:'classificationAccountId'},{mappingId:ensureMapping(s,parsed.schemaHash,n.payment_account_code,n.payment_account_name),field:'paymentAccountId'});
    }
    const candidateId='candidate-'+fingerprint([batchId,externalId]),current={transactionDate:n.date,description:n.description,counterparty:n.counterparty||null,amount,currency:n.currency,proposedTransactionType:kind,classificationAccountId:null,paymentAccountId:null,paymentMethod:n.payment_method||null,referenceNumber:n.reference||externalId,settlementStatus:n.settlement_status||null,taxAmount:n.tax_amount||null,subtotal:n.subtotal||null,...(mode==='JOURNAL_IMPORT'?{journalLines}:{})};
    const c=registerCandidate({candidateId,sourceChannel:mode==='JOURNAL_IMPORT'?'EXTERNAL_JOURNAL':'EXTERNAL_TRANSACTION',sourceId:externalId,candidateType:mode==='JOURNAL_IMPORT'?'EXTERNAL_JOURNAL':'TRANSACTION',current,evidence:Object.fromEntries(['amount','transactionDate','currency','description','counterparty'].map(field=>[field,{batchId,row:first.row,quote:JSON.stringify(first.raw).slice(0,2000)}])),sourceRef:{externalSourceId,batchId,externalId,fileHash,schemaHash:parsed.schemaHash},importRef:{batchId,externalSourceId,externalId,rows:rows.map(r=>r.row),bindings,sourceFunctionalCurrency:s.functionalCurrency,errors:[...new Set(errors)]}});
    indexMappings(c);applyMappings(c);for(const row of rows){row.candidateId=candidateId;row.status=row.errors.length?'INVALID':row.duplicate?'DUPLICATE':'REQUIRES_REVIEW';}if(!existing)data.identities[identity]={candidateId,rowHash};
   }
  });
  return {duplicate:false,...preview(batchId)};
 }
 function preview(batchId){
  const b=batch(batchId),ctx=getContext(),ids=[...new Set(b.rows.map(r=>r.candidateId).filter(Boolean))],candidates=ids.map(id=>view(state.candidates[id],ctx)),byId=new Map(candidates.map(c=>[c.candidateId,c]));
  const rows=b.rows.map(r=>{const c=byId.get(r.candidateId),errors=[...new Set([...r.errors,...(c?.importRef.errors??[])])];return {...copy(r),errors,warnings:copy(c?.validation?.conflicts??c?.conflicts??[]),status:r.duplicate?'DUPLICATE':errors.length?'INVALID':c?.status==='POSTED'?'POSTED':c?.status==='REJECTED'?'DUPLICATE':c?.status==='READY_TO_CONFIRM'?'VALID':'REQUIRES_REVIEW'};});
  const {originalBase64,...metadata}=b,mappingIds=new Set(ids.flatMap(id=>state.candidates[id].importRef?.bindings.map(b=>b.mappingId)??[])),mappings=[...mappingIds].map(id=>copy(data.mappings[id])).filter(Boolean),previewHash=fingerprint({batchId,rows:rows.map(r=>[r.row,r.status,r.errors]),candidates:candidates.map(c=>[c.candidateId,c.revision,c.reviewHash,c.status]),mappings:mappings.map(m=>[m.mappingId,m.revision,m.status])});
  return {batch:{...copy(metadata),rows,status:rows.every(r=>['POSTED','DUPLICATE'].includes(r.status))?'COMPLETED':'REQUIRES_REVIEW',period:[...new Set(rows.map(r=>r.normalized.date?.slice(0,7)))],currencies:[...new Set(rows.map(r=>r.normalized.currency))]},mappings,candidates,previewHash};
 }
 async function confirmBatch({batchId,previewHash,candidateIds,idempotencyKey,actor}){
  human(actor);text(idempotencyKey,'batch confirmation key',160);const b=batch(batchId);if(!Array.isArray(candidateIds)||!candidateIds.length||candidateIds.length>MAX_ROWS||new Set(candidateIds).size!==candidateIds.length)throw Error('Select distinct candidates for confirmation');
  const key=fingerprint(idempotencyKey),requestHash=fingerprint({batchId,previewHash,candidateIds}),previous=b.confirmations[key];
  if(previous&&previous.requestHash!==requestHash)throw Error('Batch confirmation replay has different payload');
  if(!previous){const p=preview(batchId);if(p.previewHash!==previewHash)throw Error('Stale batch preview');const byId=new Map(p.candidates.map(c=>[c.candidateId,c]));const requests=candidateIds.map(candidateId=>{const c=byId.get(candidateId);if(!c||c.importRef.batchId!==batchId||c.status!=='READY_TO_CONFIRM')throw Error('Selected import requires review');return {candidateId,revision:c.revision,reviewHash:c.reviewHash,idempotencyKey:'batch:'+key+':'+candidateId,actor};});atomic(()=>{b.confirmations[key]={requestHash,actor,at:now(),requests};});}
  const outcomes=[];for(const request of b.confirmations[key].requests){try{const c=await confirm(request);outcomes.push({candidateId:c.candidateId,status:c.status,postingId:c.posting.receipt.postingId});}catch(e){outcomes.push({candidateId:request.candidateId,status:'REQUIRES_REVIEW',error:e.message});}}
  return {outcomes,...preview(batchId)};
 }
 function original(batchId){const b=batch(batchId),bytes=Buffer.from(b.originalBase64,'base64');if(hash(bytes)!==b.fileHash)throw Error('Import original hash mismatch');return {bytes,filename:b.originalFilename};}
 function trace(c){if(!c.importRef)return null;const b=batch(c.importRef.batchId),wanted=new Set(c.importRef.rows);return {batchId:b.batchId,externalSourceId:b.externalSourceId,fileHash:b.fileHash,originalFilename:b.originalFilename,schemaHash:b.schemaHash,rows:copy(b.rows.filter(r=>wanted.has(r.row))),mappingRefs:copy(c.mappingRefs),mappingHistory:copy(c.importRef.bindings.map(b=>data.mappings[b.mappingId])),confirmations:copy(b.confirmations)};}
 function exportCsv(batchId){const p=preview(batchId),headers=['row','status',...Object.keys(p.batch.rows[0].normalized)];return headers.map(safeCsvCell).join(',')+'\r\n'+p.batch.rows.map(r=>[r.row,r.status,...headers.slice(2).map(k=>r.normalized[k])].map(safeCsvCell).join(',')).join('\r\n');}
 return {registerSource,approveMapping,stage,preview,confirmBatch,mappingIssues,original,trace,exportCsv,rebind:()=>{data=state.external;rebuildMappings();},sources:()=>copy(Object.values(data.sources)),batches:()=>Object.keys(data.batches).map(id=>{const b=data.batches[id];return {batchId:id,externalSourceId:b.externalSourceId,mode:b.mode,originalFilename:b.originalFilename,rowCount:b.rowCount};})};
}
module.exports={blankExternalState,createExternalIntake,parseFile,MAX_ROWS,safeCsvCell};
