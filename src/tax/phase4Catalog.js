'use strict';
// Verified offline content loading. This module never approves legal content.
const fs=require('node:fs'),path=require('node:path');
const {hash,RawArtifactStore}=require('../fabric/artifacts');
const {lookupSource}=require('../fabric/registry');
const {normalizeArtifact,normalizePdfExtraction}=require('../fabric/normalizer');
const {validateCountryPack,validateTreatyPack}=require('./contracts');
const {fingerprint,deepFreeze}=require('../onboarding/canonical');
const ROOT=path.resolve(__dirname,'../..');
function researchPath(relative,root=ROOT){
 const absolute=path.resolve(root,relative),allowed=path.resolve(root,'research/phase4-packs')+path.sep;
 if(typeof relative!=='string'||!absolute.startsWith(allowed))throw Error('Evidence path outside Phase 4 research');
 return absolute;
}
function verifyPhase4Evidence(catalog,{root=ROOT}={}){
 const store=new RawArtifactStore(path.resolve(root,'research/phase4-packs/raw')),checked=new Map();
 const refs=[...catalog.candidates.flatMap(c=>c.executableContent.evidenceRefs),...catalog.researchCandidates.flatMap(c=>c.provenance)];
 for(const ref of refs){
  const key=ref.artifactId+'|'+ref.envelopeId,binding=checked.get(key);let env=binding?.env;
  if(binding&&['sourceUrl','rawStorageRef','envelopeStorageRef','extractionStorageRef','extractionHash'].some(k=>binding[k]!==ref[k]))throw Error('Cached evidence reference binding mismatch');
  if(!env){
   const artifactFile=researchPath('research/phase4-packs/raw/artifacts/'+ref.artifactId+'.json',root),a=JSON.parse(fs.readFileSync(artifactFile,'utf8'));
   if(a.rawContentHash!==ref.rawContentHash||a.httpStatus!==200||a.status!=='DISCOVERED'||a.sourceUrl!==ref.sourceUrl||!lookupSource(a.jurisdictionCode,a.sourceUrl)||ref.rawStorageRef!=='research/phase4-packs/raw/'+a.rawStorageRef)throw Error('Official evidence artifact binding mismatch');
   store.read(a);
   if(a.sourceType==='PDF'){
    const bytes=fs.readFileSync(researchPath(ref.extractionStorageRef,root));if(hash(bytes)!==ref.extractionHash)throw Error('PDF extraction hash mismatch');
    env=normalizePdfExtraction(store,a,JSON.parse(bytes));
   }else env=normalizeArtifact(store,a);
   const retained=JSON.parse(fs.readFileSync(researchPath(ref.envelopeStorageRef,root),'utf8'));
   if(fingerprint(retained)!==fingerprint(env)||env.envelopeId!==ref.envelopeId||env.processingState!=='NORMALIZED')throw Error('Normalized evidence changed or incomplete');
   checked.set(key,{env,sourceUrl:ref.sourceUrl,rawStorageRef:ref.rawStorageRef,envelopeStorageRef:ref.envelopeStorageRef,extractionStorageRef:ref.extractionStorageRef,extractionHash:ref.extractionHash});
  }
  if(hash(env.normalizedContent.text)!==ref.normalizedTextHash||env.provenance.rawContentHash!==ref.rawContentHash||env.normalizedContent.text.slice(ref.start,ref.end)!==ref.quote||hash(ref.quote)!==ref.quoteHash||!env.citationAnchors.some(a=>a.locator===ref.locator&&a.start<=ref.start&&a.end>=ref.end))throw Error('Citation/hash chain mismatch');
 }
 for(const c of catalog.candidates){
  (c.contentKind==='COUNTRY_PACK'?validateCountryPack:validateTreatyPack)(c.executableContent);
  if(c.status!=='CANDIDATE'||c.runtimeExecutable||c.reviewHistory.length||c.contentHash!==fingerprint(c.executableContent))throw Error('Fresh unapproved content required');
 }
 return {verifiedArtifacts:checked.size,verifiedReferences:refs.length};
}
function loadPhase4Catalog(options={}){
 const catalog=JSON.parse(fs.readFileSync(path.resolve(options.root??ROOT,'src/tax/content/phase4-catalog.json'),'utf8'));
 if(catalog.schemaVersion!=='phase4-governed-catalog/1')throw Error('Unknown Phase 4 catalog');
 verifyPhase4Evidence(catalog,options);return deepFreeze(catalog);
}
function registerPhase4Catalog(registry,{catalog=loadPhase4Catalog()}={}){
 for(const candidate of catalog.candidates)if(!registry.governance.get(candidate.candidateId))registry.register(candidate);
 for(const candidate of catalog.researchCandidates)if(!registry.governance.get(candidate.candidateId))registry.governance.register(candidate);
 return catalog;
}
function reviewStage(candidate,registry){
 return registry.approved(candidate)?'APPROVED_EXECUTABLE':candidate.executableContent?.coverageStatus==='REVIEW_REQUIRED'||candidate.contentKind==='RESEARCH'?'REVIEW_REQUIRED':'READY_FOR_REVIEW';
}
module.exports={loadPhase4Catalog,registerPhase4Catalog,verifyPhase4Evidence,reviewStage};
