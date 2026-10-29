'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createServer}=require('../src/web/server');
const {activateStore}=require('./workspace-fixture');
async function serverFor(t){const {server,store}=createServer({authToken:'test-only-http-token'});activateStore(store);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));return {store,url:'http://127.0.0.1:'+server.address().port,headers:{'content-type':'application/json',authorization:'Bearer test-only-http-token'}};}
test('Phase 5 HTTP: upload -> download original -> confirm -> audit trace with real server',async t=>{
 const {store,url,headers}=await serverFor(t),bytes=fs.readFileSync('test/fixtures/intake/receipt-id.txt');
 const response=await fetch(url+'/api/intake/upload',{method:'POST',headers,body:JSON.stringify({originalFilename:'receipt.txt',declaredMimeType:'text/plain',base64:bytes.toString('base64')})});assert.equal(response.status,201);const {document}=await response.json();assert.equal(store.ctx.ledger.size,0);const c=document.candidates[0];
 const denied=await fetch(url+'/api/intake/original?documentId='+document.documentId);assert.equal(denied.status,401);await denied.text();
 const original=await fetch(url+'/api/intake/original?documentId='+document.documentId,{headers});assert.deepEqual(Buffer.from(await original.arrayBuffer()),bytes);assert.equal(original.headers.get('x-content-type-options'),'nosniff');
 const confirmed=await fetch(url+'/api/intake/confirm',{method:'POST',headers,body:JSON.stringify({candidateId:c.candidateId,revision:c.revision,reviewHash:c.reviewHash,idempotencyKey:'http-confirm',actor:'user'})});assert.equal(confirmed.status,200);assert.equal((await confirmed.json()).candidate.status,'POSTED');
 const trace=await fetch(url+'/api/intake/trace?candidateId='+c.candidateId,{headers});const data=await trace.json();assert.equal(data.posting.balanced,true);assert.equal(data.candidate.canonicalCommand.evidence.hash,document.sha256);assert.equal(store.ctx.ledger.size,1);
});
test('Phase 5 HTTP: document upload exceeds legacy JSON limit safely; malformed JSON is explicit 400',async t=>{
 const {url,headers}=await serverFor(t),pdf=fs.readFileSync('test/fixtures/intake/receipt.pdf'),index=pdf.indexOf('startxref'),large=Buffer.concat([pdf.subarray(0,index),Buffer.from('%'+'x'.repeat(600000)+'\n'),pdf.subarray(index)]);
 const response=await fetch(url+'/api/intake/upload',{method:'POST',headers,body:JSON.stringify({originalFilename:'large.pdf',declaredMimeType:'application/pdf',base64:large.toString('base64')})});assert.equal(response.status,201);const data=await response.json();assert.notEqual(data.document.processingStatus,'FAILED',data.document.lastError);assert.equal(data.document.candidates[0].current.amount,'850000');
 const bad=await fetch(url+'/api/intake/chat',{method:'POST',headers,body:'{broken'});assert.equal(bad.status,400);assert.equal((await bad.json()).ok,false);
});
