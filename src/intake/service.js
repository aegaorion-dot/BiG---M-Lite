'use strict';
const {inspectFile,hash,LIMITS}=require('./files');
const {LocalExtractionProvider,validateExtraction}=require('./extraction');
const {DeterministicSemanticProvider,validateSemantics}=require('./semantics');
const {Money}=require('../domain/money');
const {assertDate}=require('../domain/organization');
const {isKnownCurrency}=require('../global/currencies');
const {fingerprint}=require('../onboarding/canonical');
const clone=x=>structuredClone(x),now=()=>new Date().toISOString();
const EDITABLE=['transactionDate','amount','currency','counterparty','proposedTransactionType','description','paymentMethod','referenceNumber','settlementStatus','classificationAccountId','paymentAccountId'];
function blankIntakeState(){return {version:1,documents:{},extractions:{},interpretations:{},candidates:{},chats:{},keys:{},events:[]};}
function human(actor){if(typeof actor!=='string'||!actor.trim()||actor.length>100||/^(ai|model|muse|meta|system)(?:$|[: -])/i.test(actor))throw Error('Explicit human actor required');}
function createIntakeService({state,getContext,persist,commitPosting,applyProfileFacts,extractionProvider=new LocalExtractionProvider(),semanticProvider=new DeterministicSemanticProvider()}){
 let queue=Promise.resolve();
 const serial=fn=>(...args)=>{const task=queue.then(()=>fn(...args));queue=task.catch(()=>{});return task;};
 function event(type,id,detail={}){state.events.push({type,id,at:now(),detail:clone(detail)});}
 function atomic(fn){const before=clone(state);try{const result=fn();persist();return result;}catch(e){for(const k of Object.keys(state))delete state[k];Object.assign(state,before);throw e;}}
 function candidate(id){const c=state.candidates[id];if(!c)throw Error('Unknown candidate');return c;}
 function validate(c){
  const f=c.current,ctx=getContext(),missingFields=[],conflicts=[];
  for(const key of ['transactionDate','counterparty','description','amount','currency','proposedTransactionType','classificationAccountId','paymentAccountId'])if(!f[key])missingFields.push(key);
  if(f.transactionDate)try{assertDate(f.transactionDate,'transactionDate');}catch{conflicts.push('Date must be an unambiguous valid YYYY-MM-DD');}
  if(/yesterday|kemarin/i.test(c.evidence?.transactionDate?.quote??'')&&!c.revisions.some(r=>r.source==='USER_EDIT'&&Object.hasOwn(r.changes??{},'transactionDate')))conflicts.push('Relative date is a UTC-based proposal; enter an explicit transaction date to resolve timezone ambiguity');
  if(!ctx.org)conflicts.push('Activate a workspace before posting');
  if(f.currency&&!isKnownCurrency(f.currency))conflicts.push('Unsupported currency');
  if(ctx.org&&f.currency&&f.currency!==ctx.org.baseCurrency)conflicts.push('FX_UNAVAILABLE: transaction currency differs from functional currency; review required');
  if(f.amount&&f.currency)try{const m=Money.fromMajor(f.amount,f.currency);if(m.amountMinor<=0n)conflicts.push('Amount must be positive');}catch{conflicts.push('Amount must be an exact positive decimal for this currency');}
  if(f.proposedTransactionType&&!['REVENUE','EXPENSE'].includes(f.proposedTransactionType))conflicts.push('Unsupported classification; transfers require a later reviewed workflow');
  if(f.settlementStatus!=='PAID')missingFields.push('settlementStatus: confirm paid cash/bank transaction; unpaid invoices are review-only');
  const expected=f.proposedTransactionType==='REVENUE'?'REVENUE':'EXPENSE';
  for(const [key,type]of [['classificationAccountId',expected],['paymentAccountId','ASSET']])if(f[key]&&(!ctx.chart?.has(f[key])||ctx.chart.get(f[key]).type!==type||key==='paymentAccountId'&&ctx.chart.get(f[key]).code!=='101'))conflicts.push('Invalid '+key+' for existing chart / cash-bank posting path');
  if(ctx.org&&f.transactionDate)try{ctx.periods.getPostingPeriod(ctx.org.id,f.transactionDate);}catch(e){conflicts.push(e.message);}
  if(ctx.org&&!ctx.modules.includes(f.proposedTransactionType==='REVENUE'?'sales':'purchase'))conflicts.push('Required workspace module is not enabled');
  if(f.amount&&f.currency&&f.taxAmount&&f.subtotal)try{if(!Money.fromMajor(f.subtotal,f.currency).add(Money.fromMajor(f.taxAmount,f.currency)).equals(Money.fromMajor(f.amount,f.currency)))conflicts.push('Subtotal plus observed tax differs from total');}catch{conflicts.push('Invalid observed subtotal/tax');}
  const reviewHash=fingerprint({candidateId:c.candidateId,revision:c.revision,current:f,workspace:ctx.workspace});
  return {missingFields,conflicts,reviewHash,status:missingFields.length||conflicts.length?'REQUIRES_REVIEW':'READY_TO_CONFIRM'};
 }
 function view(c){return {...clone(c),...(['POSTED','REJECTED','CONFIRMED'].includes(c.status)?{validation:validate(c),reviewHash:validate(c).reviewHash}:validate(c))};}
 function documentStatus(id){const d=state.documents[id];if(!d)return;const cs=Object.values(state.candidates).filter(c=>c.documentId===id);d.processingStatus=cs.length&&cs.every(c=>c.status==='POSTED')?'POSTED':cs.length&&cs.every(c=>c.status==='REJECTED')?'REJECTED':'REQUIRES_REVIEW';}
 function addCandidates(interpretation,documentId,sourceChannel,sourceId){
  const ctx=getContext();let n=0;
  for(const proposal of interpretation.result.transactions){
   const id='candidate-'+hash(Buffer.from(sourceId+':'+n++)).slice(0,32);if(state.candidates[id])continue;
   const current=clone(proposal);delete current.evidence;delete current.confidence;delete current.proposedAccounts;
   current.classificationAccountId=proposal.proposedAccounts?.classificationAccountId??(proposal.proposedTransactionType?ctx.chart?.list().find(a=>a.code===(proposal.proposedTransactionType==='REVENUE'?'401':'501'))?.id:null)??null;
   current.paymentAccountId=proposal.proposedAccounts?.paymentAccountId??(proposal.paymentMethod?ctx.chart?.list().find(a=>a.code==='101')?.id:null)??null;
   const c={candidateId:id,documentId,sourceChannel,sourceId,extractionId:interpretation.extractionId,interpretationId:interpretation.interpretationId,candidateType:proposal.candidateType,current,evidence:clone(proposal.evidence),confidence:proposal.confidence,status:'CANDIDATE',revision:1,revisions:[{revision:1,source:'SEMANTIC_PROPOSAL',at:now(),fields:clone(current)}],confirmation:null,canonicalCommand:null,posting:null,lastError:null};
   c.status=validate(c).status;state.candidates[id]=c;event('CANDIDATE_CREATED',id);
  }
 }
 async function interpret(extraction,{documentId=null,sourceId,sourceChannel,receivedAt}){
  const interpretationId='interpretation-'+sourceId;
  const raw=await semanticProvider.interpret({extraction:clone(extraction),sourceChannel,receivedAt});
  const result=validateSemantics(raw,extraction);
  const record={interpretationId,extractionId:extraction.extractionId,documentId,provider:semanticProvider.name??semanticProvider.constructor.name,createdAt:now(),raw:clone(raw),result};
  // Profile mutations and intake state share the same durable web-store snapshot.
  const before=clone(state);
  try{
   state.interpretations[interpretationId]=record;addCandidates(record,documentId,sourceChannel,sourceId);
   if(documentId)documentStatus(documentId);
   event('INTERPRETED',sourceId,{interpretationId});
   applyProfileFacts(result.profileFacts.map(f=>({...f,source:documentId?'DOCUMENT':'USER',documentId,sourceChatId:documentId?null:sourceId,extractionId:extraction.extractionId})),persist);
  }catch(e){Object.assign(state,before);throw e;}
 }
 async function processDocument(id){
  const d=state.documents[id];if(!d)throw Error('Unknown document');
  try{
   atomic(()=>{d.processingStatus='EXTRACTING';d.lastError=null;event('EXTRACTING',id);});
   let extraction=state.extractions['extraction-'+id];
   if(!extraction){const raw=validateExtraction(await extractionProvider.extract({bytes:Buffer.from(d.originalBase64,'base64'),mime:d.detectedMimeType}));
    extraction={...raw,extractionId:'extraction-'+id,documentId:id,createdAt:now()};
    atomic(()=>{state.extractions[extraction.extractionId]=extraction;state.documents[id].processingStatus='EXTRACTED';event('EXTRACTED',id,{extractionId:extraction.extractionId});});
   }
   atomic(()=>{state.documents[id].processingStatus='INTERPRETING';event('INTERPRETING',id);});
   await interpret(extraction,{documentId:id,sourceId:id,sourceChannel:'DOCUMENT',receivedAt:d.uploadedAt});
  }catch(e){atomic(()=>{state.documents[id].processingStatus='FAILED';state.documents[id].lastError=e.message;event('FAILED',id,{error:e.message});});}
  return documentView(id);
 }
 function documentView(id){const d=state.documents[id];if(!d)throw Error('Unknown document');const {originalBase64,...metadata}=d,extraction=state.extractions['extraction-'+id],interpretation=state.interpretations['interpretation-'+id];return {...clone(metadata),warnings:clone(extraction?.warnings??[]),extraction:extraction?{extractionId:extraction.extractionId,method:extraction.method,pages:clone(extraction.pages),confidence:extraction.confidence}:null,profileFacts:clone(interpretation?.result.profileFacts??[]).map(f=>({...f,documentId:id,status:'CANDIDATE'})),candidates:Object.values(state.candidates).filter(c=>c.documentId===id).map(view)};}
 async function upload({bytes,originalFilename,declaredMimeType='application/octet-stream'}){
  const inspected=inspectFile({bytes,originalFilename,declaredMimeType});const existing=Object.values(state.documents).find(d=>d.sha256===inspected.sha256);
  if(existing)return {duplicate:true,document:documentView(existing.documentId)};
  if(Object.values(state.documents).reduce((sum,d)=>sum+d.sizeBytes,0)+bytes.length>LIMITS.totalBytes)throw Error('Workspace document storage limit exceeded (64 MiB)');
  const id='document-'+inspected.sha256;
  atomic(()=>{state.documents[id]={documentId:id,originalFilename,declaredMimeType,...inspected,uploadedAt:now(),sourceChannel:'DOCUMENT',storageRef:'intake://sha256/'+inspected.sha256,processingStatus:'UPLOADED',originalBase64:bytes.toString('base64'),lastError:null};event('UPLOADED',id);});
  return {duplicate:false,document:await processDocument(id)};
 }
 async function chat({text,requestId}){
  if(typeof text!=='string'||!text.trim()||text.length>10000||typeof requestId!=='string'||!requestId.trim()||requestId.length>100||['__proto__','constructor','prototype'].includes(requestId))throw Error('Chat text and stable requestId required (max 10000 / 100 characters)');
  if(state.chats[requestId]){if(state.chats[requestId].text!==text)throw Error('Chat idempotency replay has different text');return chatView(requestId);}
  const receivedAt=now(),extractionId='extraction-chat-'+hash(Buffer.from(requestId)),extraction={extractionId,documentId:null,extractor:'chat-text',extractorVersion:'1',method:'TEXT',pages:[{page:1,method:'TEXT'}],textBlocks:text.split(/\r?\n/).map((text,i)=>({blockId:'b'+i,page:1,text})),tables:[],confidence:1,warnings:[],detectedLanguage:null,createdAt:receivedAt};
  atomic(()=>{state.chats[requestId]={requestId,text,receivedAt,status:'INTERPRETING'};state.extractions[extractionId]=extraction;event('CHAT_RECEIVED',requestId);});
  try{await interpret(extraction,{sourceId:'chat-'+hash(Buffer.from(requestId)),sourceChannel:'CHAT',receivedAt});atomic(()=>{state.chats[requestId].status='REQUIRES_REVIEW';});}
  catch(e){atomic(()=>{state.chats[requestId].status='FAILED';state.chats[requestId].lastError=e.message;});}
  return chatView(requestId);
 }
 function chatView(id){return {...clone(state.chats[id]),candidates:Object.values(state.candidates).filter(c=>c.sourceId==='chat-'+hash(Buffer.from(id))).map(view)};}
 function edit({candidateId,revision,changes,actor}){
  human(actor);const c=candidate(candidateId);if(!['CANDIDATE','REQUIRES_REVIEW','READY_TO_CONFIRM'].includes(c.status))throw Error('Candidate is not editable');if(c.revision!==revision)throw Error('Stale candidate revision');
  if(!changes||!Object.keys(changes).length||Object.keys(changes).some(k=>!EDITABLE.includes(k))||Object.values(changes).some(v=>v!==null&&(typeof v!=='string'||v.length>500)))throw Error('Invalid candidate correction');
  return atomic(()=>{Object.assign(c.current,changes);c.revision++;c.revisions.push({revision:c.revision,source:'USER_EDIT',actor,at:now(),changes:clone(changes),fields:clone(c.current)});c.status=validate(c).status;event('CANDIDATE_EDITED',candidateId,{revision:c.revision,actor});return view(c);});
 }
 function reject({candidateId,revision,actor}){
  human(actor);const c=candidate(candidateId);if(['POSTED','CONFIRMED'].includes(c.status))throw Error('Confirmed or posted candidates cannot be rejected; use existing reversal workflow');if(c.revision!==revision)throw Error('Stale candidate revision');
  return atomic(()=>{c.status='REJECTED';c.rejection={actor,at:now(),revision};if(c.documentId)documentStatus(c.documentId);event('REJECTED',candidateId,{actor});return view(c);});
 }
 async function confirm({candidateId,revision,reviewHash,idempotencyKey,actor}){
  human(actor);if(typeof idempotencyKey!=='string'||!idempotencyKey.trim()||idempotencyKey.length>180||['__proto__','constructor','prototype'].includes(idempotencyKey))throw Error('Confirmation idempotencyKey required');
  const c=candidate(candidateId),key=state.keys[idempotencyKey];
  if(key&&(key.candidateId!==candidateId||key.revision!==revision))throw Error('Confirmation key replay has different payload');
  if(c.confirmation){if(c.confirmation.idempotencyKey!==idempotencyKey||c.confirmation.revision!==revision||c.confirmation.reviewHash!==reviewHash)throw Error('Confirmation replay has different payload');if(c.status==='POSTED')return view(c);}
  else {
   if(c.status==='REJECTED'||c.revision!==revision)throw Error('Rejected or stale candidate');
   const checked=validate(c);if(checked.status!=='READY_TO_CONFIRM')throw Error('Candidate requires review: '+[...checked.missingFields,...checked.conflicts].join('; '));if(checked.reviewHash!==reviewHash)throw Error('Stale candidate review hash');
   atomic(()=>{
    const ctx=getContext(),f=c.current;
    c.confirmation={actor,at:now(),revision,reviewHash,idempotencyKey,decisionSource:'HUMAN'};
    c.canonicalCommand={id:'intake-'+candidateId,orgId:ctx.org.id,date:f.transactionDate,jurisdiction:ctx.org.jurisdiction,currency:f.currency,kind:f.proposedTransactionType,items:[{description:f.description,amountMajor:f.amount}],evidence:{kind:c.candidateType==='BANK_ROW'?'BANK_STATEMENT':c.documentId?'RECEIPT':'OTHER',reference:c.documentId??c.sourceId,hash:c.documentId?state.documents[c.documentId].sha256:null},idempotencyKey:'document-intake:'+candidateId,memo:f.description,accountSelection:{classificationAccountId:f.classificationAccountId,paymentAccountId:f.paymentAccountId},provenance:{candidateId,revision,documentId:c.documentId,extractionId:c.extractionId,interpretationId:c.interpretationId},taxCandidates:{taxAmount:f.taxAmount??null,subtotal:f.subtotal??null,status:'REQUIRES_GOVERNED_TAX_REVIEW'}};
    c.status='CONFIRMED';state.keys[idempotencyKey]={candidateId,revision};event('CONFIRMED',candidateId,c.confirmation);
   });
  }
  // The confirmation is durable BEFORE calling the sole accounting pipeline.
  const before=clone(state);
  try{
   c.status='POSTING';event('POSTING',candidateId);
   await commitPosting(clone(c.canonicalCommand),actor,result=>{c.status='POSTED';c.posting=clone(result);c.lastError=null;if(c.documentId)documentStatus(c.documentId);event('POSTED',candidateId,{postingId:result.receipt.postingId});});
  }catch(e){Object.assign(state,before);const restored=candidate(candidateId);restored.lastError=e.message;event('POSTING_FAILED',candidateId,{error:e.message});persist();throw e;}
  return view(candidate(candidateId));
 }
 function retry({documentId}){const d=state.documents[documentId];if(!d||d.processingStatus!=='FAILED')throw Error('Only failed documents can be retried');return processDocument(documentId);}
 function list(){return {documents:Object.keys(state.documents).map(documentView),chats:Object.keys(state.chats).map(chatView),candidates:Object.values(state.candidates).map(view)};}
 function trace(id){const c=candidate(id);return {candidate:view(c),document:c.documentId?documentView(c.documentId):null,extraction:clone(state.extractions[c.extractionId]),interpretation:clone(state.interpretations[c.interpretationId]),events:clone(state.events.filter(e=>[c.candidateId,c.documentId,c.sourceId].includes(e.id))),posting:c.posting?getContext().journals.find(j=>j.id===c.posting.receipt.postingId):null};}
 function original(id){const d=state.documents[id];if(!d)throw Error('Unknown document');const bytes=Buffer.from(d.originalBase64,'base64');if(hash(bytes)!==d.sha256)throw Error('Original document hash mismatch');return {bytes,mime:d.detectedMimeType,filename:d.originalFilename};}
 function recover(){let changed=false;for(const d of Object.values(state.documents))if(['UPLOADED','EXTRACTING','EXTRACTED','INTERPRETING'].includes(d.processingStatus)){d.processingStatus='FAILED';d.lastError='Processing interrupted by restart; retry explicitly';changed=true;}for(const c of Object.values(state.chats))if(c.status==='INTERPRETING'){c.status='FAILED';c.lastError='Interpretation interrupted by restart';changed=true;}if(changed)persist();}
 return {upload:serial(upload),chat:serial(chat),edit:serial(edit),reject:serial(reject),confirm:serial(confirm),retry:serial(retry),list,trace,original,recover};
}
module.exports={blankIntakeState,createIntakeService};
