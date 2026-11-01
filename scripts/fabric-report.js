'use strict';
// Offline: build review artifacts from already captured raw responses.
const fs=require('node:fs'),path=require('node:path');
const {SOURCES}=require('../src/fabric/registry');
const {RawArtifactStore,detectType,hash}=require('../src/fabric/artifacts');
const {normalizeArtifact}=require('../src/fabric/normalizer');
const {evidenceCandidate,countryPackCandidate}=require('../src/fabric/candidates');
const {sanitizeResearchRecord}=require('../src/fabric/researchSanitizer');
function main(){
 const root=path.resolve(__dirname,'../research/country-pack-fabric');
 const observations=fs.readFileSync(path.join(root,'observations.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 const store=new RawArtifactStore(path.join(root,'captures'));
 const fixtureRoot=path.join(root,'fixtures');fs.mkdirSync(path.join(fixtureRoot,'blobs'),{recursive:true});fs.mkdirSync(path.join(fixtureRoot,'artifacts'),{recursive:true});
 const pdfs=JSON.parse(fs.readFileSync(path.join(root,'pdf-observations.json'),'utf8'));
 const selected=[
  ['ID-DJPP','legislation'],['ID-DJP','guidance'],['ID-DJP','tax-page'],['ID-JDIH','json-feed'],['ID-JDIH','rss'],['ID-BPK','legislation-index'],
  ['SG-SSO','legislation'],['SG-IRAS','guidance'],['SG-IRAS','tax-page'],['SG-MOF','legislative-proposal-not-enacted'],
  ['US-ECFR','legislation-regulation'],['US-ECFR','api-titles'],['US-IRS','guidance'],['US-IRS','tax-page'],['US-USCODE','download-index'],
  ['AU-FRL','legislation-small-act'],['AU-FRL','legislation'],['AU-FRL','api-docs'],['AU-ATO','guidance-pdf'],['AU-ATO','tax-page'],['AU-ATO','content-endpoint'],
  ['GB-LEGISLATION','legislation'],['GB-LEGISLATION','feed'],['GB-GOVUK','guidance'],['GB-GOVUK','tax-page']
 ];
 const samples=[],envelopes=[],candidates=[];
 for(const [sourceId,kind] of selected){
  const row=observations.findLast(r=>r.sourceId===sourceId&&r.kind===kind&&r.artifact?.httpStatus===200)??observations.findLast(r=>r.sourceId===sourceId&&r.kind===kind&&r.artifact);
  if(!row)continue;const artifact=row.artifact,bytes=store.read(artifact),target=path.join(fixtureRoot,artifact.rawStorageRef);
  fs.writeFileSync(target,bytes);fs.writeFileSync(path.join(fixtureRoot,'artifacts',artifact.artifactId+'.json'),JSON.stringify(artifact,null,2)+'\n');const envelope=normalizeArtifact(store,artifact);envelopes.push(envelope);
  const pdf=pdfs.find(p=>p.rawContentHash===artifact.rawContentHash);
  samples.push({sourceId,kind,url:row.url,artifact,envelopeId:envelope.envelopeId,processingState:envelope.processingState,
   observedFormat:detectType(bytes),officialDocumentId:envelope.metadata.officialDocumentId,title:envelope.metadata.title,
   publication:envelope.temporal.publishedAt,effectiveDate:'NOT_ESTABLISHED',sourceTemporalAssertions:envelope.temporal.sourceTemporalAssertions,
   versionMetadata:envelope.sourceSpecificMetadata.versionLinks??null,citationGranularity:envelope.citationAnchors.map(a=>a.locator).slice(0,5),
   machineReadable:pdf?pdf.ocrAssessment:envelope.processingState==='NORMALIZED',ocr:pdf?pdf.ocrAssessment:artifact.sourceType==='PDF'?'ASSESSMENT_REQUIRED':'NOT_APPLICABLE'});
  if(envelope.processingState==='NORMALIZED'&&!['DISCOVERY_FEED','API_SCHEMA','STRUCTURED_DATA'].includes(envelope.metadata.documentKind)){
   const a=envelope.citationAnchors[0];if(a){const end=Math.min(a.end,a.start+300),e=evidenceCandidate(envelope,{anchorId:a.anchorId,start:a.start,end,quote:envelope.normalizedContent.text.slice(a.start,end)});candidates.push({evidence:e,candidate:countryPackCandidate([envelope],[e],{label:sourceId+' '+kind+' R&D candidate'})});}
  }
 }
 const matrix=SOURCES.map(source=>{
  const rows=observations.filter(r=>r.sourceId===source.sourceId),formats=[...new Set(rows.filter(r=>r.artifact?.httpStatus===200).map(r=>r.artifact.sourceType))];
  const links=[];for(const row of rows.filter(r=>r.artifact?.httpStatus===200&&r.artifact.sourceType==='HTML')){
   const text=store.read(row.artifact).toString('utf8');for(const m of text.matchAll(/(?:href|src)=["']([^"']+)["']/g)){
    if(!/api|\.xml|\.json|\.pdf|\.zip|rss|feed|search|[?&](?:page|limit|offset)=/i.test(m[1]))continue;
    try{const url=new URL(m[1].replaceAll('&amp;','&'),row.url).href;if(!links.includes(url))links.push(url);}catch{}
   }
  }
  return {sourceId:source.sourceId,jurisdiction:source.jurisdictionCode,sourceRole:source.sourceRole,baseUrl:source.baseUrl,
   testedRequests:rows.length,observedFormats:formats,documentedApis:source.apiEndpoints,
   workingStructured:rows.filter(r=>r.artifact?.httpStatus===200&&['API','FEED','STRUCTURED_DOWNLOAD'].includes(r.method)&&['JSON','XML','ZIP'].includes(r.artifact.sourceType)).map(r=>({url:r.url,format:r.artifact.sourceType,kind:r.kind})),
   checks:rows.map(r=>({url:r.url,kind:r.kind,method:r.method,httpStatus:r.artifact?.httpStatus??null,format:r.artifact?.sourceType??null,rawHash:r.artifact?.rawContentHash??null,status:r.artifact?.status??r.error,redirects:r.artifact?.redirects??r.redirects??[]})),
   discoveredLinks:links.slice(0,60).map(url=>({url,status:rows.some(r=>r.url===url)?'REQUEST_RECORDED':'LINK_OBSERVED_NOT_REQUESTED'})),
   metadataSamples:samples.filter(s=>s.sourceId===source.sourceId).map(s=>({kind:s.kind,documentId:s.officialDocumentId,publishedAt:s.publication,effectiveDate:s.effectiveDate,versionInfo:!!s.versionMetadata?.length,citationGranularity:s.citationGranularity,ocr:s.ocr})),
   limitations:'No API/format claim from absence. Homepage/sitemap success does not establish document or judgment availability. Discovered links are not automatically fetched or trusted. Publication, snapshot, amendment and commencement are distinct.'};
 });
 function write(file,value){fs.writeFileSync(path.join(root,file),JSON.stringify(sanitizeResearchRecord(value),null,2)+'\n');}
 write('sample-manifest.json',samples);write('fixtures/artifacts.json',samples.map(s=>s.artifact));write('access-matrix.json',matrix);
 // Candidate exports are review artifacts, deliberately separate from the runtime CountryPack registry.
 write('candidate-examples.json',candidates);
 write('canonical-envelopes.json',envelopes);
 // Remove only obsolete files generated by this script in these two exact directories.
 // Full raw captures are never deleted by report generation.
 const keepArtifacts=new Set(samples.map(s=>s.artifact.artifactId+'.json')),keepBlobs=new Set(samples.map(s=>s.artifact.rawContentHash+'.bin'));
 for(const [sub,keep,pattern] of [['artifacts',keepArtifacts,/^[a-f0-9-]{36}\.json$/],['blobs',keepBlobs,/^[a-f0-9]{64}\.bin$/]]){
  const directory=path.resolve(fixtureRoot,sub);if(path.dirname(directory)!==path.resolve(fixtureRoot))throw Error('Unsafe generated directory');
  for(const name of fs.readdirSync(directory)){const target=path.resolve(directory,name);if(path.dirname(target)!==directory)throw Error('Unsafe generated path');if(pattern.test(name)&&!keep.has(name))fs.unlinkSync(target);}
 }
 write('envelope-summaries.json',envelopes.map(e=>({summaryOnly:true,envelopeId:e.envelopeId,sourceId:e.sourceId,metadata:e.metadata,provenance:e.provenance,authority:e.authority,temporal:e.temporal,rawArtifactRef:e.rawArtifactRef,sourceSpecificMetadata:e.sourceSpecificMetadata,status:e.status,processingState:e.processingState,normalizedTextHash:hash(e.normalizedContent.text),normalizedTextCharacters:e.normalizedContent.text.length,anchorCount:e.citationAnchors.length,firstAnchors:e.citationAnchors.slice(0,5)})));
 const lines=['# Observed official-source access matrix','','Generated offline from observations.jsonl; each request has a timestamp, status/error and raw hash when captured. See access-matrix.json for full request evidence and sample-manifest.json for document structures.','','| Source | Role | Successful observed formats | Working structured requests | Other observations |','|---|---|---|---|---|'];
 for(const m of matrix){const errors=[...new Set(m.checks.filter(c=>c.httpStatus!==200).map(c=>c.httpStatus??c.status))];lines.push('| '+[m.sourceId,m.sourceRole,m.observedFormats.join(', ')||'None',m.workingStructured.map(r=>r.kind+' ('+r.format+')').join(', ')||'Not verified',errors.join('; ')||'No failure in tested requests'].map(s=>String(s).replaceAll('|','/')).join(' | ')+' |');}
 lines.push('','## Representative documents','','| Jurisdiction/source | Kind | Format | ID | Publication | Effective date | Version info | Citation | Machine/OCR |','|---|---|---|---|---|---|---|---|---|');
 for(const s of samples)lines.push('| '+[s.sourceId,s.kind,s.observedFormat,s.officialDocumentId??'Not extracted',s.publication??'Not extracted',s.effectiveDate,s.versionMetadata?.length?'Observed':'Not extracted',s.citationGranularity[0]??'Extraction/review needed',s.ocr==='NOT_APPLICABLE'?s.machineReadable:s.ocr].map(v=>String(v).replaceAll('|','/')).join(' | ')+' |');
 fs.writeFileSync(path.join(root,'ACCESS-MATRIX.md'),lines.join('\n')+'\n');
 console.log(JSON.stringify({families:matrix.length,requests:observations.length,rawFixtures:samples.length,candidateExamples:candidates.length}));
}
if(require.main===module)main();module.exports={main};
