'use strict';
const {getSource,lookupSource}=require('./registry');
const RAW_FIELDS=Object.freeze(['artifactId','sourceId','jurisdictionCode','authorityCode','sourceUrl','finalUrl','sourceType','retrievalMethod','retrievedAt','httpStatus','contentType','language','officialDocumentId','title','publishedAt','effectiveFrom','effectiveTo','rawContentHash','rawStorageRef','parserVersion']);
function validateRawArtifact(a){
 const errors=RAW_FIELDS.filter(k=>!Object.hasOwn(a??{},k)).map(k=>'Missing '+k),source=getSource(a?.sourceId);
 if(!source||source.jurisdictionCode!==a.jurisdictionCode||source.authorityCode!==a.authorityCode)errors.push('Registry identity mismatch');
 else if([a.sourceUrl,a.finalUrl].some(u=>lookupSource(a.jurisdictionCode,u)?.sourceId!==source.sourceId))errors.push('Unregistered URL');
 if(!/^[a-f0-9]{64}$/.test(a?.rawContentHash??'')||a?.rawStorageRef!=='blobs/'+a?.rawContentHash+'.bin')errors.push('Invalid content address');
 if(!Number.isInteger(a?.httpStatus)||a.httpStatus<100||a.httpStatus>599)errors.push('Invalid HTTP status');
 if(typeof a?.retrievedAt!=='string'||!Number.isFinite(Date.parse(a.retrievedAt)))errors.push('Invalid retrieval timestamp');
 return {ok:!errors.length,errors};
}
module.exports={RAW_FIELDS,validateRawArtifact};
