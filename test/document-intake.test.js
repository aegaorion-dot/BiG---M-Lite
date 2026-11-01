'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {createActiveStore}=require('./workspace-fixture');
const {createWebStore}=require('../src/web/store');
const {handleApi}=require('../src/web/api');
const {inspectFile,hash,LIMITS,csvRows}=require('../src/intake/files');
const {ExtractionProvider,LocalExtractionProvider,validateExtraction}=require('../src/intake/extraction');
const {SemanticDocumentProvider,DeterministicSemanticProvider,MetaSemanticDocumentProvider,validateSemantics,decimal}=require('../src/intake/semantics');
const fixtures=path.join(__dirname,'fixtures','intake');
const bytes=name=>fs.readFileSync(path.join(fixtures,name));
const upload=(store,name='receipt-id.txt',extra={})=>store.intake.upload({bytes:bytes(name),originalFilename:name,declaredMimeType:'application/octet-stream',...extra});
const confirmation=c=>({candidateId:c.candidateId,revision:c.revision,reviewHash:c.reviewHash,idempotencyKey:'test-confirm:'+c.candidateId+':'+c.revision,actor:'test human'});
async function receipt(s=createActiveStore()){const r=await upload(s);assert.notEqual(r.document.processingStatus,'FAILED',r.document.lastError);return {s,c:r.document.candidates[0],r};}
function tempStore(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bigm-phase5-test-'));t.after(()=>{const target=path.resolve(dir);assert.equal(path.dirname(target),path.resolve(os.tmpdir()));assert.ok(path.basename(target).startsWith('bigm-phase5-test-'));fs.rmSync(target,{recursive:true,force:true});});return path.join(dir,'store.json');}

test('Phase 5: receipt retains original bytes, hash, MIME and evidence without posting',async()=>{
 const {s,c,r}=await receipt();assert.equal(s.ctx.ledger.size,0);assert.equal(c.current.amount,'850000');assert.equal(c.current.currency,'IDR');assert.equal(c.current.proposedTransactionType,'EXPENSE');assert.equal(c.status,'READY_TO_CONFIRM');
 assert.equal(r.document.sha256,hash(bytes('receipt-id.txt')));assert.equal(r.document.sizeBytes,bytes('receipt-id.txt').length);assert.equal(r.document.detectedMimeType,'text/plain');
 assert.deepEqual(s.intake.original(r.document.documentId).bytes,bytes('receipt-id.txt'));assert.equal(c.evidence.amount.page,1);assert.ok(c.evidence.amount.quote.includes('850.000'));assert.ok(c.evidence.amount.row>0);
 assert.ok(!JSON.stringify(s.intake.list()).includes('originalBase64'));assert.equal(c.confirmation,null);
});
test('Phase 5: only explicit human confirmation reaches existing PostingService and balanced ledger',async()=>{
 const {s,c}=await receipt();let calls=0;const post=s.ctx.posting.post.bind(s.ctx.posting);s.ctx.posting.post=(...args)=>{calls++;return post(...args);};
 await assert.rejects(s.intake.confirm({...confirmation(c),actor:'meta'}),/human/);await assert.rejects(s.intake.confirm({...confirmation(c),reviewHash:'fabricated'}),/Stale/);assert.equal(calls,0);
 const posted=await s.intake.confirm(confirmation(c));assert.equal(calls,1);assert.equal(posted.status,'POSTED');assert.equal(s.ctx.ledger.size,1);assert.ok(posted.posting.journal.balanced);assert.equal(posted.posting.journal.lines[0].accountId,'id-expense');assert.equal(s.ctx.audit.verifyChain().ok,true);assert.equal(posted.canonicalCommand.provenance.candidateId,c.candidateId);
});
test('Phase 5: duplicate upload and concurrent confirmation cannot duplicate candidates or journals',async()=>{
 const {s,c,r}=await receipt();const dup=await upload(s,'receipt-id.txt',{originalFilename:'same-bytes-renamed.pdf'});assert.equal(dup.duplicate,true);assert.equal(dup.document.documentId,r.document.documentId);
 const results=await Promise.all([s.intake.confirm(confirmation(c)),s.intake.confirm(confirmation(c))]);assert.equal(results[0].posting.receipt.postingId,results[1].posting.receipt.postingId);assert.equal(s.ctx.ledger.size,1);assert.equal(s.intake.list().candidates.length,1);
 await assert.rejects(s.intake.confirm({...confirmation(c),idempotencyKey:'different'}),/different payload/);
});
test('Phase 5: content sniffing wins over filename extension and rejects MIME mismatch',()=>{
 assert.equal(inspectFile({bytes:bytes('receipt-id.txt'),originalFilename:'actually-text.pdf',declaredMimeType:'application/octet-stream'}).detectedMimeType,'text/plain');
 assert.throws(()=>inspectFile({bytes:bytes('receipt-id.txt'),originalFilename:'receipt.pdf',declaredMimeType:'application/pdf'}),/MIME mismatch/);
 assert.equal(inspectFile({bytes:bytes('receipt.png'),originalFilename:'hidden.txt',declaredMimeType:'image/png'}).detectedMimeType,'image/png');
 assert.equal(inspectFile({bytes:bytes('statement.csv'),originalFilename:'statement.txt',declaredMimeType:'text/plain'}).detectedMimeType,'text/csv');
});
test('Phase 5: suspicious filenames, unsupported binary/active text, empty and oversized inputs fail explicitly',async()=>{
 const s=createActiveStore();for(const originalFilename of ['../receipt.txt','..\\receipt.txt','C:\\evil.txt','x:evil.txt','CON.txt','a\n.txt','x.'])await assert.rejects(upload(s,'receipt-id.txt',{originalFilename}),/filename/);
 for(const input of [Buffer.from([0,1,2,3]),Buffer.from('MZ executable'),Buffer.from('<script>alert(1)</script>'),Buffer.alloc(0),Buffer.alloc(LIMITS.fileBytes+1)])await assert.rejects(s.intake.upload({bytes:input,originalFilename:'file.txt'}));assert.equal(s.intake.list().documents.length,0);
});
test('Phase 5: image dimensions and truncated magic signatures are checked before decoding',()=>{
 const png=Buffer.from(bytes('receipt.png'));png.writeUInt32BE(100000,16);assert.throws(()=>inspectFile({bytes:png,originalFilename:'bomb.png'}),/pixel/);
 assert.throws(()=>inspectFile({bytes:Buffer.from([137,80,78,71,13,10,26,10]),originalFilename:'bad.png'}),/Malformed/);
 assert.throws(()=>inspectFile({bytes:Buffer.from([255,216,255,217]),originalFilename:'bad.jpg'}),/Malformed/);
});
test('Phase 5: extraction and semantic providers are separate validated contracts',async()=>{
 await assert.rejects(new ExtractionProvider().extract(),/not implemented/);await assert.rejects(new SemanticDocumentProvider().interpret(),/not implemented/);
 const extraction=validateExtraction(await new LocalExtractionProvider().extract({bytes:bytes('receipt-id.txt'),mime:'text/plain'}));const raw=await new DeterministicSemanticProvider().interpret({extraction,sourceChannel:'DOCUMENT',receivedAt:'2026-10-29T00:00:00Z'});assert.equal(validateSemantics(raw,extraction).transactions.length,1);
 assert.throws(()=>validateExtraction({...extraction,confidence:2}),/contract/);assert.throws(()=>validateExtraction({...extraction,textBlocks:[{blockId:'x',page:99,text:'bad'}]}),/block/);
});
test('Phase 5: provider cannot approve, fabricate evidence or inject posting commands',async()=>{
 const extraction=await new LocalExtractionProvider().extract({bytes:bytes('receipt-id.txt'),mime:'text/plain'}),raw=await new DeterministicSemanticProvider().interpret({extraction,sourceChannel:'DOCUMENT'});
 for(const change of [r=>{r.post=true;},r=>{r.transactions[0].status='CONFIRMED';},r=>{r.transactions[0].evidence.amount.quote='invented';},r=>{r.transactions[0].evidence.amount.blockId='not-a-block';},r=>{r.transactions[0].confidence=NaN;}]){const r=structuredClone(raw);change(r);assert.throws(()=>validateSemantics(r,extraction),/contract|evidence/);}
});
test('Phase 5: invalid account proposals stay review-required and never reach posting',async()=>{
 const deterministic=new DeterministicSemanticProvider();const semanticProvider={async interpret(i){const r=await deterministic.interpret(i);r.transactions[0].proposedAccounts={classificationAccountId:'invented-account',paymentAccountId:'id-cash'};return r;}};
 const s=createActiveStore({semanticProvider}),r=await upload(s),c=r.document.candidates[0];assert.ok(c.conflicts.some(x=>x.includes('Invalid classificationAccountId')));await assert.rejects(s.intake.confirm(confirmation(c)),/requires review/);assert.equal(s.ctx.ledger.size,0);
});
test('Phase 5: supplier invoice keeps document/invoice date distinct and unpaid invoice cannot post',async()=>{
 const s=createActiveStore(),r=await upload(s,'supplier-invoice.txt'),c=r.document.candidates[0];assert.equal(c.candidateType,'SUPPLIER_INVOICE');assert.equal(c.current.invoiceDate,'2026-10-19');assert.equal(c.current.transactionDate,null);assert.equal(c.current.settlementStatus,null);assert.equal(c.current.proposedTransactionType,'EXPENSE');await assert.rejects(s.intake.confirm(confirmation(c)),/requires review/);
});
test('Phase 5: paid customer invoice uses explicit payment date and revenue proposal',async()=>{
 const s=createActiveStore(),r=await upload(s,'customer-invoice.txt'),c=r.document.candidates[0];assert.equal(c.current.invoiceDate,'2026-10-18');assert.equal(c.current.paymentDate,'2026-10-22');assert.equal(c.current.transactionDate,'2026-10-22');assert.equal(c.current.proposedTransactionType,'REVENUE');const p=await s.intake.confirm(confirmation(c));assert.equal(p.posting.journal.lines[1].accountId,'id-revenue');
});
test('Phase 5: SGD invoice never changes IDR functional or reporting currency and missing FX blocks posting',async()=>{
 const s=createActiveStore(),before=s.workspaceProfile(),r=await upload(s,'invoice-sgd.txt'),c=r.document.candidates[0];assert.equal(c.current.currency,'SGD');assert.equal(s.workspaceProfile().functionalCurrency,'IDR');assert.equal(s.workspaceProfile().reportingCurrency,before.reportingCurrency);assert.ok(c.conflicts.some(x=>x.includes('FX_UNAVAILABLE')));await assert.rejects(s.intake.confirm(confirmation(c)),/FX_UNAVAILABLE/);assert.equal(s.ctx.ledger.size,0);
});
test('Phase 5: simple bank statement creates multiple evidenced candidates from one artifact/extraction',async()=>{
 const s=createActiveStore(),r=await upload(s,'statement.csv');assert.equal(r.document.candidates.length,2);assert.equal(s.intake.list().documents.length,1);const [a,b]=r.document.candidates;assert.equal(a.extractionId,b.extractionId);assert.equal(a.current.amount,'850000');assert.equal(b.current.amount,'5000000');assert.equal(a.evidence.amount.row,2);assert.equal(b.evidence.amount.row,3);assert.equal(a.current.proposedTransactionType,null);assert.equal(s.ctx.ledger.size,0);
 const edited=await s.intake.edit({candidateId:a.candidateId,revision:a.revision,actor:'user',changes:{proposedTransactionType:'EXPENSE',classificationAccountId:'id-expense',paymentAccountId:'id-cash',settlementStatus:'PAID'}});assert.equal(edited.status,'READY_TO_CONFIRM');await s.intake.confirm(confirmation(edited));assert.equal(s.ctx.ledger.size,1);
});
test('Phase 5: bounded CSV parser supports quoted commas and rejects malformed/duplicate headers',()=>{
 assert.deepEqual(csvRows('date,description,amount\n2026-10-20,"coffee, beans",850000')[1],['2026-10-20','coffee, beans','850000']);for(const text of ['a,a\n1,2','a,b\n"oops,2','a,b\n1','a,b\n"x"evil,2'])assert.throws(()=>csvRows(text),/Malformed/);
 const max='date,description,amount\n'+Array.from({length:500},()=> '2026-10-20,Coffee,1').join('\n');assert.equal(csvRows(max).length,501);assert.throws(()=>csvRows(max+'\n2026-10-20,Extra,1'),/limit|Malformed/);
});
test('Phase 5: ambiguous date requires human correction; corrections preserve OCR and semantic history',async()=>{
 const s=createActiveStore(),r=await upload(s,'ambiguous-date.txt'),c=r.document.candidates[0],before=s.intake.trace(c.candidateId);assert.equal(c.current.documentDate,'10/11/2026');assert.equal(c.current.transactionDate,null);await assert.rejects(s.intake.confirm(confirmation(c)),/requires review/);
 const edited=await s.intake.edit({candidateId:c.candidateId,revision:c.revision,actor:'user',changes:{transactionDate:'2026-11-10',amount:'550000',counterparty:'Corrected synthetic vendor',description:'Corrected purchase',currency:'IDR',paymentAccountId:'id-cash'}});assert.equal(edited.revisions.length,2);assert.equal(edited.revisions[0].fields.amount,'500000');assert.equal(edited.current.amount,'550000');assert.deepEqual(s.intake.trace(c.candidateId).extraction,before.extraction);assert.deepEqual(s.intake.trace(c.candidateId).interpretation,before.interpretation);await assert.rejects(s.intake.confirm(confirmation(c)),/stale/i);await s.intake.confirm(confirmation(edited));
});
test('Phase 5: reject prevents confirmation and confirmed candidates cannot be edited',async()=>{
 const {s,c}=await receipt();await s.intake.reject({candidateId:c.candidateId,revision:c.revision,actor:'user'});await assert.rejects(s.intake.confirm(confirmation(c)),/Rejected/);assert.equal(s.ctx.ledger.size,0);
 const other=createActiveStore(),{c:d}=await receipt(other);await other.intake.confirm(confirmation(d));await assert.rejects(other.intake.edit({candidateId:d.candidateId,revision:d.revision,changes:{amount:'1'},actor:'user'}),/not editable/);
});
test('Phase 5: document profile facts enter profileState with provenance and preserve established values',async()=>{
 const s=createActiveStore(),before=s.workspaceProfile(),r=await upload(s,'profile-conflict.txt');assert.equal(r.document.processingStatus,'REQUIRES_REVIEW');assert.equal(r.document.candidates.length,0);
 const slots=s.onboardingState().slots;assert.equal(slots['org.name'].value,'Test business');assert.equal(slots['org.name'].status,'CONFLICT');assert.ok(slots['org.name'].alternatives.includes('Different Synthetic Business'));
 const fact=slots['org.taxRegistrationNumber'];assert.equal(fact.source,'DOCUMENT');assert.equal(fact.documentId,r.document.documentId);assert.equal(fact.status,'CANDIDATE');assert.ok(fact.evidenceLocation.blockId);assert.equal(s.workspaceProfile().functionalCurrency,before.functionalCurrency);assert.equal(s.workspaceProfile().organizationName,before.organizationName);
 const registration=s.onboardingState().profileState.jurisdictionFacts.find(f=>f.basis==='REGISTRATION');assert.equal(registration.source,'DOCUMENT');assert.equal(registration.documentId,r.document.documentId);assert.equal(registration.status,'CANDIDATE');
});
test('Phase 5: documents cannot silently infer bookkeeping currency',async()=>{
 const deterministic=new DeterministicSemanticProvider(),semanticProvider={async interpret(i){const r=await deterministic.interpret(i);r.profileFacts.push({slot:'currency.functional',value:'SGD',confidence:1,evidence:{blockId:i.extraction.textBlocks[0].blockId,quote:i.extraction.textBlocks[0].text}});return r;}};
 const s=createActiveStore({semanticProvider}),r=await upload(s);assert.equal(r.document.processingStatus,'FAILED');assert.equal(s.workspaceProfile().functionalCurrency,'IDR');assert.equal(s.intake.list().candidates.length,0);
});
test('Phase 5: chat convergence, exact decimal scaling and request idempotency',async()=>{
 const s=createActiveStore(),r=await s.intake.chat({text:'Client paid me Rp5 juta for website design.',requestId:'chat-test-1'}),c=r.candidates[0];assert.equal(c.sourceChannel,'CHAT');assert.equal(c.documentId,null);assert.equal(c.current.amount,'5000000');assert.equal(c.current.proposedTransactionType,'REVENUE');assert.equal(s.ctx.ledger.size,0);
 assert.equal((await s.intake.chat({text:r.text,requestId:'chat-test-1'})).candidates[0].candidateId,c.candidateId);await assert.rejects(s.intake.chat({text:'different',requestId:'chat-test-1'}),/different text/);
 const edited=await s.intake.edit({candidateId:c.candidateId,revision:c.revision,actor:'user',changes:{transactionDate:'2026-10-20',paymentAccountId:'id-cash'}});await s.intake.confirm(confirmation(edited));assert.equal(s.ctx.ledger.size,1);assert.equal(s.intake.list().documents.length,0);
 assert.equal(decimal('Rp1.2 million','IDR'),'1200000');assert.equal(decimal('Rp850,000','IDR'),'850000');assert.equal(decimal('9007199254740993','IDR'),'9007199254740993');assert.equal(decimal('1.234','SGD'),null);
});
test('Phase 5: chat yesterday is grounded in received time; SGD customer payment remains foreign',async()=>{
 const s=createActiveStore(),a=await s.intake.chat({text:'I bought coffee beans for Rp850,000 yesterday.',requestId:'yesterday'});const d=new Date(a.receivedAt);d.setUTCDate(d.getUTCDate()-1);assert.equal(a.candidates[0].current.transactionDate,d.toISOString().slice(0,10));assert.equal(a.candidates[0].current.amount,'850000');assert.ok(a.candidates[0].conflicts.some(x=>x.includes('timezone')));
 const b=await s.intake.chat({text:'Client in Singapore paid me SGD 2,000.',requestId:'foreign'});assert.equal(b.candidates[0].current.currency,'SGD');assert.equal(s.workspaceProfile().functionalCurrency,'IDR');
});
test('Phase 5: document prompt injection is retained as data and cannot post or grant tax authority',async()=>{
 const s=createActiveStore(),r=await upload(s,'prompt-injection.txt'),c=r.document.candidates[0],trace=s.intake.trace(c.candidateId);assert.ok(trace.extraction.textBlocks.some(b=>b.text.includes('IGNORE ALL PREVIOUS')));assert.equal(c.current.amount,'850000');assert.equal(c.current.proposedTransactionType,'EXPENSE');assert.equal(c.confirmation,null);assert.equal(s.ctx.ledger.size,0);assert.equal(s.onboardingState().readiness.taxReady,false);
});
test('Phase 5: semantic failure stays visible; explicit retry reuses original and extraction',async()=>{
 let calls=0;const deterministic=new DeterministicSemanticProvider(),s=createActiveStore({semanticProvider:{async interpret(i){if(calls++===0)throw Error('Test semantic outage');return deterministic.interpret(i);}}});
 const r=await upload(s);assert.equal(r.document.processingStatus,'FAILED');assert.equal(r.document.lastError,'Test semantic outage');const a=s.intake.list();assert.equal(a.candidates.length,0);
 const retry=await s.intake.retry({documentId:r.document.documentId});assert.equal(retry.candidates.length,1);assert.equal(s.intake.list().documents.length,1);assert.equal(s.intake.trace(retry.candidates[0].candidateId).events.filter(e=>e.type==='EXTRACTED').length,1);
});
test('Phase 5: provider extraction failures retain the immutable artifact with explicit FAILED state',async()=>{
 const s=createActiveStore({extractionProvider:{async extract(){return {confidence:1,method:'OCR'};}}}),r=await upload(s);assert.equal(r.document.processingStatus,'FAILED');assert.ok(r.document.lastError.includes('contract'));assert.deepEqual(s.intake.original(r.document.documentId).bytes,bytes('receipt-id.txt'));assert.equal(s.ctx.ledger.size,0);
});
test('Phase 5: originals, extraction, edits, confirmation, journal and replay survive a fresh OS process',async t=>{
 const persistPath=tempStore(t),s=createActiveStore({persistPath}),{c}=await receipt(s);const edited=await s.intake.edit({candidateId:c.candidateId,revision:c.revision,changes:{description:'Reviewed coffee'},actor:'user'});await s.intake.confirm(confirmation(edited));
 const script="const {createWebStore}=require('./src/web/store');const s=createWebStore({persistPath:process.env.TEST_STATE});const c=s.intake.list().candidates[0];s.intake.confirm({candidateId:c.candidateId,revision:c.revision,...c.confirmation}).then(p=>console.log(JSON.stringify({count:s.ctx.ledger.size,trace:s.intake.trace(c.candidateId),hash:require('./src/intake/files').hash(s.intake.original(c.documentId).bytes)})));";
 const run=spawnSync(process.execPath,['-e',script],{cwd:path.join(__dirname,'..'),env:{...process.env,TEST_STATE:persistPath},encoding:'utf8'});assert.equal(run.status,0,run.stderr);const out=JSON.parse(run.stdout);assert.equal(out.count,1);assert.equal(out.trace.candidate.revisions.length,2);assert.equal(out.trace.candidate.confirmation.actor,'test human');assert.equal(out.trace.posting.balanced,true);assert.equal(out.hash,hash(bytes('receipt-id.txt')));assert.equal(out.trace.candidate.canonicalCommand.provenance.extractionId,out.trace.extraction.extractionId);
});
test('Phase 5: posting persistence failure rolls back journal and retries the durable confirmation once',async t=>{
 const persistPath=tempStore(t),s=createActiveStore({persistPath}),{c}=await receipt(s);const write=fs.renameSync;let remaining=2;
 fs.renameSync=function(...args){if(args[1]===persistPath&&--remaining===0)throw Error('Injected save failure');return write(...args);};
 try{await assert.rejects(s.intake.confirm(confirmation(c)),/could not be saved/);}finally{fs.renameSync=write;}
 assert.equal(s.ctx.ledger.size,0);const restored=createWebStore({persistPath}),pending=restored.intake.list().candidates[0];assert.equal(pending.status,'CONFIRMED');assert.ok(pending.lastError);await restored.intake.confirm({...confirmation(c)});assert.equal(restored.ctx.ledger.size,1);
});
test('Phase 5: closed accounting period blocks confirmation',async()=>{
 const {s,c}=await receipt();s.ctx.periods.replace(s.ctx.periods.list()[0].close());const current=s.intake.list().candidates[0];assert.ok(current.conflicts.length);await assert.rejects(s.intake.confirm(confirmation(current)),/requires review/);assert.equal(s.ctx.ledger.size,0);
});
test('Phase 5: interrupted extraction is visible after restart and resumes without duplicate artifacts',async t=>{
 const persistPath=tempStore(t),s=createActiveStore({persistPath}),{r}=await receipt(s),raw=JSON.parse(fs.readFileSync(persistPath,'utf8'));
 raw.intake.documents[r.document.documentId].processingStatus='INTERPRETING';raw.intake.interpretations={};raw.intake.candidates={};fs.writeFileSync(persistPath,JSON.stringify(raw));
 const restored=createWebStore({persistPath});assert.equal(restored.intake.list().documents[0].processingStatus,'FAILED');const retry=await restored.intake.retry({documentId:r.document.documentId});assert.equal(retry.candidates.length,1);assert.equal(restored.intake.list().documents.length,1);assert.equal(restored.ctx.ledger.size,0);
});
test('Phase 5: candidate-confirmation save failure never calls PostingService',async t=>{
 const persistPath=tempStore(t),s=createActiveStore({persistPath}),{c}=await receipt(s),rename=fs.renameSync;let calls=0;s.ctx.posting.post=()=>{calls++;throw Error('Must not post');};
 fs.renameSync=function(...args){if(args[1]===persistPath)throw Error('Injected failure');return rename(...args);};try{await assert.rejects(s.intake.confirm(confirmation(c)),/could not be saved/);}finally{fs.renameSync=rename;}assert.equal(calls,0);assert.equal(s.intake.list().candidates[0].confirmation,null);assert.equal(s.ctx.ledger.size,0);
});
test('Phase 5: chosen existing expense account is validated and used by the same journal builder',async()=>{
 const {Account}=require('../src/domain/chartOfAccounts'),{s,c}=await receipt();s.ctx.chart.add(new Account({id:'id-office',code:'502',name:'Office costs',type:'EXPENSE'}));const edited=await s.intake.edit({candidateId:c.candidateId,revision:c.revision,actor:'user',changes:{classificationAccountId:'id-office'}});const posted=await s.intake.confirm(confirmation(edited));assert.equal(posted.posting.journal.lines[0].accountId,'id-office');assert.equal(s.listTransactions()[0].totalMinor,'850000');
});
test('Phase 5: subtotal and observed tax mismatch block confirmation without inventing tax treatment',async()=>{
 const s=createActiveStore(),r=await s.intake.upload({bytes:Buffer.from('RECEIPT\nDate: 2026-10-20\nVendor: Synthetic Seller\nSubtotal: IDR 1000\nTax: IDR 100\nTotal IDR 1200\nPayment: bank'),originalFilename:'tax.txt'}),c=r.document.candidates[0];
 // Only explicit labeled observations are retained; no tax rule or rate is inferred.
 assert.equal(c.current.taxAmount,'100');assert.equal(c.current.subtotal,'1000');assert.ok(c.conflicts.some(x=>x.includes('Subtotal')));await assert.rejects(s.intake.confirm(confirmation(c)),/Subtotal/);assert.equal(s.ctx.ledger.size,0);
 const edited=await s.intake.edit({candidateId:c.candidateId,revision:c.revision,actor:'user',changes:{amount:'1100'}}),posted=await s.intake.confirm(confirmation(edited));assert.equal(posted.canonicalCommand.taxCandidates.taxAmount,'100');assert.equal(posted.posting.tax.finalLiabilityMinor,null);assert.equal(posted.posting.journal.lines.length,2);
});
test('Phase 5: read responses cannot mutate source, extraction, revisions or canonical objects',async()=>{
 const {s,c}=await receipt(),trace=s.intake.trace(c.candidateId);trace.extraction.textBlocks[0].text='tampered';trace.candidate.current.amount='1';trace.candidate.revisions[0].fields.amount='1';const actual=s.intake.trace(c.candidateId);assert.equal(actual.candidate.current.amount,'850000');assert.equal(actual.extraction.textBlocks[0].text,'STRUK / RECEIPT');
});
test('Phase 5: confirmations bind current review hash, candidate revision and existing accounts',async()=>{
 const {s,c}=await receipt();const edited=await s.intake.edit({candidateId:c.candidateId,revision:c.revision,actor:'user',changes:{classificationAccountId:'id-revenue'}});assert.equal(edited.status,'REQUIRES_REVIEW');await assert.rejects(s.intake.confirm(confirmation(edited)),/Invalid classification/);await assert.rejects(s.intake.edit({candidateId:c.candidateId,revision:edited.revision,actor:'user',changes:{status:'CONFIRMED'}}),/Invalid candidate/);
});
test('Phase 5: API validates uploads and protects document state, evidence and download with configured auth',async()=>{
 const s=createActiveStore({authToken:'test-only-local-token'});
 assert.equal((await handleApi(s,'GET','/api/intake')).status,401);assert.equal((await handleApi(s,'POST','/api/intake/upload',{}, {base64:'%%%'})).status,401);
 const body={authToken:'test-only-local-token',originalFilename:'receipt.txt',declaredMimeType:'text/plain',base64:bytes('receipt-id.txt').toString('base64')};const r=await handleApi(s,'POST','/api/intake/upload',{},body);assert.equal(r.status,201);const d=JSON.parse(r.body).document;
 assert.equal((await handleApi(s,'GET','/api/intake/original',{documentId:d.documentId})).status,401);const download=await handleApi(s,'GET','/api/intake/original',{documentId:d.documentId,token:body.authToken});assert.equal(download.headers['content-type'],'application/octet-stream');assert.match(download.headers['content-disposition'],/^attachment/);assert.deepEqual(download.body,bytes('receipt-id.txt'));
 assert.equal((await handleApi(s,'POST','/api/intake/upload',{}, {...body,base64:'%%%='})).status,400);
});
test('Phase 5: routine tests and default provider never call a paid endpoint',async()=>{
 const fetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No live calls');};try{
  await receipt();await assert.rejects(new MetaSemanticDocumentProvider({endpoint:'https://example.invalid',apiKey:'test-only',model:'test-only'}).interpret({}),/opt-in/);
  await assert.rejects(new MetaSemanticDocumentProvider({optIn:true,endpoint:'https://example.invalid',apiKey:'test-only',model:'test-only'}).interpret({}),/routine tests/);assert.equal(calls,0);
 }finally{globalThis.fetch=fetch;}
});
test('Phase 5: Meta mock transport receives a data-only envelope and has no posting capability',async()=>{
 let calls=0,body;const extraction=await new LocalExtractionProvider().extract({bytes:bytes('receipt-id.txt'),mime:'text/plain'}),provider=new MetaSemanticDocumentProvider({optIn:true,endpoint:'https://example.invalid',apiKey:'test-only',model:'test-only',fetchImpl:async(_url,options)=>{calls++;body=JSON.parse(options.body);return {ok:true,json:async()=>({output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({transactions:[],profileFacts:[]})}]}]})};}});
 const result=await provider.interpret({extraction,sourceChannel:'DOCUMENT',receivedAt:'2026-10-29'});assert.equal(calls,1);assert.deepEqual(result,{transactions:[],profileFacts:[]});assert.ok(body.input[0].content[0].text.includes('untrusted'));assert.ok(JSON.parse(body.input[1].content[0].text).untrustedData);assert.equal(body.tools,undefined);assert.equal(body.store,false);
});
test('Phase 5: live smoke command skips without opt-in even when routine credentials are inherited',()=>{
 const run=spawnSync(process.execPath,['scripts/meta-document-smoke.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,BIGM_META_LIVE_TEST:'0'},encoding:'utf8'});assert.equal(run.status,0);assert.ok(run.stdout.includes('SKIP'));
});
for(const [file,method]of [['receipt.pdf','PDF_TEXT'],['receipt.png','OCR'],['receipt.jpg','OCR'],['receipt-scan.pdf','OCR']])test('Phase 5: real offline '+file+' extraction yields evidenced receipt candidate',async()=>{
 const s=createActiveStore(),r=await upload(s,file);assert.notEqual(r.document.processingStatus,'FAILED',r.document.lastError);const c=r.document.candidates[0];assert.equal(c.current.amount,'850000');assert.equal(c.current.transactionDate,'2026-10-20');assert.equal(c.current.proposedTransactionType,'EXPENSE');const trace=s.intake.trace(c.candidateId);assert.equal(trace.extraction.method,method);assert.ok(c.evidence.amount.bbox);assert.equal(trace.extraction.pages.length,1);assert.equal(s.ctx.ledger.size,0);
});
test('Phase 5: real malformed PDF fails explicitly without candidates or journal',async()=>{
 const s=createActiveStore(),r=await upload(s,'malformed.pdf');assert.equal(r.document.processingStatus,'FAILED');assert.ok(r.document.lastError);assert.equal(r.document.candidates.length,0);assert.equal(s.ctx.ledger.size,0);
});
