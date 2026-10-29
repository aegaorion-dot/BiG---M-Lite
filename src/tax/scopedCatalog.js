'use strict';
const fs=require('node:fs'),path=require('node:path');
const {RawArtifactStore,hash}=require('../fabric/artifacts'),{normalizeArtifact}=require('../fabric/normalizer'),{lookupSource}=require('../fabric/registry'),{evidenceCandidate}=require('../fabric/candidates'),{fingerprint}=require('../onboarding/canonical');
// Rebuild all source anchors from sanitized preserved bytes before registration.
// No approval is performed here. The existing Fabric human review remains required.
function loadScopedCatalog({root=path.resolve(__dirname,'../..')}={}){
 const dir=path.join(root,'research/moroccan-tax'),catalog=JSON.parse(fs.readFileSync(path.join(root,'research/moroccan-tax/reference/company-catalog.json'),'utf8')),store=new RawArtifactStore(path.join(dir,'raw')),c=catalog.candidate,refs=c.executableContent.evidenceRefs;
 if(catalog.schemaVersion!=='moroccan-tax-catalog/1'||c.status!=='CANDIDATE'||c.reviewHistory.length||c.runtimeExecutable||c.contentHash!==fingerprint(c.executableContent))throw Error('Fresh scoped legal candidate required');
 require('./contracts').validateCountryPack(c.executableContent);
 for(const s of catalog.sources){const a=JSON.parse(fs.readFileSync(path.join(dir,'raw/artifacts',s.artifactId+'.json'),'utf8'));if(a.httpStatus!==200||a.status!=='DISCOVERED'||a.rawContentHash!==s.rawContentHash||a.sourceUrl!==s.sourceUrl||!lookupSource('ID',a.sourceUrl))throw Error('Scoped official artifact binding mismatch');const e=normalizeArtifact(store,a),ref=refs.find(r=>r.rawContentHash===a.rawContentHash);if(e.envelopeId!==s.envelopeId||hash(e.normalizedContent.text)!==s.normalizedTextHash||!ref)throw Error('Scoped normalized evidence mismatch');const bound=evidenceCandidate(e,{anchorId:ref.anchorId,start:ref.start,end:ref.end,quote:ref.quote});if(bound.evidenceId!==ref.evidenceId||!c.evidenceIds.includes(bound.evidenceId)||!c.provenance.some(p=>p.rawContentHash===s.rawContentHash&&p.quoteHash===ref.quoteHash))throw Error('Scoped citation chain mismatch');}
 return catalog;
}
function registerScopedCatalog(registry,{developmentReferenceOnly=false}={}){if(!developmentReferenceOnly)throw Error('Manually researched reference content is excluded from the primary Muse acceptance path');const catalog=loadScopedCatalog();if(!registry.governance.get(catalog.candidate.candidateId))registry.register(catalog.candidate);return catalog;}
module.exports={loadScopedCatalog,registerScopedCatalog};
