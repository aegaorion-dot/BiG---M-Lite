'use strict';
const fs=require('node:fs'),path=require('node:path'),{fingerprint}=require('../onboarding/canonical'),{officialEvidence}=require('../fabric/officialEvidence'),{evidenceCandidate}=require('../fabric/candidates');
function loadExpandedCatalog(root=path.resolve(__dirname,'../..')){
 const catalog=JSON.parse(fs.readFileSync(path.join(root,'research/moroccan-tax/expanded-catalog.json'),'utf8')),official=officialEvidence(root),records=JSON.parse(fs.readFileSync(path.join(root,'research/moroccan-tax/sources.json'),'utf8')).records;
 function validateReference(ref){const source=records.find(r=>r.sourceUrl===ref.sourceUrl&&r.rawContentHash===ref.rawContentHash);if(!source)throw Error('Expanded source record required');const {envelope}=official.source(source.identity),e=evidenceCandidate(envelope,{anchorId:ref.anchorId,start:ref.start,end:ref.end,quote:ref.quote});if(e.evidenceId!==ref.evidenceId||e.provenance.quoteHash!==ref.quoteHash)throw Error('Expanded exact citation mismatch');}
 for(const c of catalog.candidates){if(c.status!=='CANDIDATE'||c.reviewHistory.length||c.runtimeExecutable||fingerprint(c.executableContent)!==c.contentHash)throw Error('Fresh unapproved expanded candidate required');for(const r of c.executableContent.evidenceRefs)validateReference(r);}
 for(const r of [catalog.residenceEvidence,catalog.uaeExclusionEvidence,...catalog.fx.map(q=>q.reference)])validateReference(r);
 return catalog;
}
function registerExpandedCatalog(registry){const c=loadExpandedCatalog();for(const candidate of c.candidates)if(!registry.governance.get(candidate.candidateId))registry.register(candidate);return c;}
module.exports={loadExpandedCatalog,registerExpandedCatalog};
