'use strict';
// Independent research foundation. No import into posting, accounting or runtime tax execution.
const {SourceConnector}=require('./connector');
const {RawArtifactStore}=require('./artifacts');
const {normalizeArtifact}=require('./normalizer');
const {evidenceCandidate,countryPackCandidate}=require('./candidates');
async function discoverCandidate({root,sourceId,url,method,fetchImpl}){
 const store=new RawArtifactStore(root),connector=new SourceConnector({store,fetchImpl});
 const artifact=await connector.retrieve({sourceId,url,method}),envelope=normalizeArtifact(store,artifact);
 const discoveryOnly=['DISCOVERY_FEED','API_SCHEMA','STRUCTURED_DATA'].includes(envelope.metadata.documentKind);
 const evidence=discoveryOnly?[]:envelope.citationAnchors.map(a=>evidenceCandidate(envelope,{anchorId:a.anchorId,start:a.start,end:a.end,quote:envelope.normalizedContent.text.slice(a.start,a.end)}));
 const candidate=evidence.length?countryPackCandidate([envelope],evidence):null;
 return {artifact,envelope,evidence,candidate};
}
module.exports={discoverCandidate,SourceConnector,RawArtifactStore,normalizeArtifact,...require('./registry'),...require('./candidates')};
