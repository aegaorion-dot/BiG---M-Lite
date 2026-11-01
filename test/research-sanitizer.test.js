'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {sanitizeResearchUrl,sanitizeResearchRecord,sanitizeResearchText,sanitizeResearchBytes,REASON}=require('../src/fabric/researchSanitizer');
const {RawArtifactStore,hash}=require('../src/fabric/artifacts');
const {SourceConnector}=require('../src/fabric/connector');
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bigm-research-security-'));t.after(()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});});return dir;}
test('Research URL sanitizer removes all required query names, including duplicates, case and empty values',()=>{
 for(const name of ['key','api_key','apikey','token','access_token','secret','client_secret','KEY','Api_Key','session_token']){const input='https://example.test/resource?'+name+'=fixture-sensitive&'+name+'=&libraries=places&page=2',r=sanitizeResearchUrl(input);assert.equal(r.url,'https://example.test/resource?libraries=places&page=2');assert.equal(r.credentialQueryParameterRedacted,true);assert.equal(r.redactionReason,REASON);assert.equal(r.originalUrlSha256,createHash('sha256').update(input).digest('hex'));assert.ok(!JSON.stringify(r).includes('fixture-sensitive'));}
});
test('Research ordinary query parameters and URL representation stay byte-identical',()=>{
 const input='https://example.test/resource?q=tax%20law&page=2&libraries=places&format=json#article';assert.deepEqual(sanitizeResearchUrl(input),{url:input});const bytes=Buffer.from('<html><a href="'+input+'">Law</a></html>');assert.deepEqual(sanitizeResearchBytes(bytes),{bytes,redacted:false});
});
test('Research sanitizer removes userinfo and secret fragments while preserving ordinary anchors',()=>{
 const r=sanitizeResearchUrl('https://user:fixture-password@example.test/?page=2#access_token=fixture-sensitive&section=3');assert.equal(r.url,'https://example.test/?page=2#section=3');assert.equal(r.credentialUserInfoRedacted,true);assert.equal(r.credentialQueryParameterRedacted,true);
});
test('Research sanitizer handles percent-encoded parameter names and HTML escaped separators',()=>{
 const text='<script src="https://maps.googleapis.com/maps/api/js?libraries=places&amp;%61pi_key=fixture-sensitive"></script>',r=sanitizeResearchText(text);assert.ok(r.includes('?libraries=places'));assert.ok(!r.includes('fixture-sensitive'));assert.ok(!r.includes('%61pi_key'));
});
test('Research record redaction preserves classification/status and is idempotent',()=>{
 const input={url:'https://maps.googleapis.com/maps/api/js?key=fixture-sensitive&libraries=places',classification:'REJECTED_SOURCE',status:'LINK_OBSERVED_NOT_REQUESTED'},r=sanitizeResearchRecord({nested:[input]});assert.equal(r.nested[0].url,'https://maps.googleapis.com/maps/api/js?libraries=places');assert.equal(r.nested[0].classification,input.classification);assert.equal(r.nested[0].status,input.status);assert.equal(r.nested[0].credentialQueryParameterRedacted,true);assert.deepEqual(sanitizeResearchRecord(r),r);assert.ok(!JSON.stringify(r).includes('fixture-sensitive'));
});
test('Research raw persistence stores sanitized bytes and truthful hashes, never the original credential',async t=>{
 const store=new RawArtifactStore(temp(t)),source=new SourceConnector({store,fetchImpl:async()=>new Response('<html><script src="https://maps.googleapis.com/maps/api/js?key=fixture-sensitive&libraries=places"></script><p>Law.</p></html>',{headers:{'content-type':'text/html'}})}),a=await source.retrieve({sourceId:'US-COURTS',url:'https://www.uscourts.gov/'});const bytes=store.read(a);assert.ok(!bytes.includes(Buffer.from('fixture-sensitive')));assert.equal(hash(bytes),a.rawContentHash);assert.ok(a.securityRedaction.originalContentSha256);assert.notEqual(a.securityRedaction.originalContentSha256,a.rawContentHash);assert.equal(a.securityRedaction.redactionReason,REASON);for(const file of fs.readdirSync(path.join(store.root,'blobs')))assert.ok(!fs.readFileSync(path.join(store.root,'blobs',file)).includes(Buffer.from('fixture-sensitive')));
});
test('Research connector rejects credential-bearing URLs before any network request',async t=>{
 let calls=0;const c=new SourceConnector({store:new RawArtifactStore(temp(t)),fetchImpl:async()=>{calls++;}});await assert.rejects(c.retrieve({sourceId:'GB-GOVUK',url:'https://www.gov.uk/?api_key=fixture-sensitive'}),/before request/);assert.equal(calls,0);
});
test('Research redirects cannot send credential values to a second request',async t=>{
 const calls=[],c=new SourceConnector({store:new RawArtifactStore(temp(t)),fetchImpl:async u=>{calls.push(u);return new Response(null,{status:302,headers:{location:'https://www.gov.uk/next?token=fixture-sensitive'}});}});await assert.rejects(c.retrieve({sourceId:'GB-GOVUK',url:'https://www.gov.uk/'}),/before request/);assert.deepEqual(calls,['https://www.gov.uk/']);
});
test('Research sanitizer removes JSON secret fields, bearer tokens and known provider shapes',()=>{
 const token='AIza'+'x'.repeat(35),r=sanitizeResearchRecord({api_key:'fixture-sensitive',access_token:'fixture-sensitive',message:'Bearer '+'x'.repeat(30),text:token,ordinary:'annual turnover'});assert.equal(r.ordinary,'annual turnover');assert.ok(!JSON.stringify(r).includes(token));assert.ok(!JSON.stringify(r).includes('fixture-sensitive'));const bytes=sanitizeResearchBytes(Buffer.from(JSON.stringify(r)));assert.equal(bytes.redacted,false);
});
test('Research binary artifacts containing credential URLs fail before persistence',()=>{
 for(const bytes of [Buffer.from('%PDF-1.7\nhttps://example.test/?key=fixture-sensitive'),Buffer.concat([Buffer.from([0]),Buffer.from('https://example.test/?token=fixture-sensitive')])])assert.throws(()=>sanitizeResearchBytes(bytes),/offline redaction/);
});
test('Research sanitizer removes complete private key blocks without retaining reversible material',()=>{
 const input='-----BEGIN '+'PRIVATE KEY-----\nfixture-sensitive\n-----END '+'PRIVATE KEY-----';assert.equal(sanitizeResearchText(input),'[REDACTED_PRIVATE_KEY]');
});
test('Sanitized historical research links retain rejection/observation and one-way source identity',()=>{
 for(const [file,field,status]of [['access-link-discovery.json','classification','REJECTED_SOURCE'],['access-matrix.json','status','LINK_OBSERVED_NOT_REQUESTED']]){const data=JSON.parse(fs.readFileSync('research/country-pack-fabric/'+file,'utf8'));const matches=[];function walk(x){if(!x||typeof x!=='object')return;if(x.url==='https://maps.googleapis.com/maps/api/js?libraries=places')matches.push(x);Object.values(x).forEach(walk);}walk(data);assert.equal(matches.length,1);assert.equal(matches[0][field],status);assert.equal(matches[0].credentialQueryParameterRedacted,true);assert.equal(matches[0].redactionReason,REASON);assert.match(matches[0].originalUrlSha256,/^[a-f0-9]{64}$/);}
});
