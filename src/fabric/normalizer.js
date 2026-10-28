'use strict';
const {getSource,lookupSource,classifyLink}=require('./registry');
const {hash,detectType,mimeMatches}=require('./artifacts');
const {deepFreeze}=require('../onboarding/canonical');
const VERSION='fabric-envelope/1';
const verifiedEnvelopes=new WeakSet();
function assertVerifiedEnvelope(envelope){if(!verifiedEnvelopes.has(envelope))throw Error('Envelope must be rebuilt from verified raw artifacts, not AI-supplied metadata');}
function parseEffectiveDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value:null;
}
function decode(text){return text.replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:x[\da-f]+|\d+);/gi,m=>{
 const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '};
 if(named[m.toLowerCase()])return named[m.toLowerCase()];const n=parseInt(m.slice(2,-1).replace(/^x/i,''),/^&#x/i.test(m)?16:10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'\uFFFD';
 });}
function inertText(value){return decode(String(value).replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style|template|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();}
function normalizeArtifact(store,artifact){
 const source=getSource(artifact.sourceId);
 if(!source||source.jurisdictionCode!==artifact.jurisdictionCode||source.authorityCode!==artifact.authorityCode||lookupSource(source.jurisdictionCode,artifact.finalUrl)?.sourceId!==source.sourceId||lookupSource(source.jurisdictionCode,artifact.sourceUrl)?.sourceId!==source.sourceId)throw Error('Artifact provenance does not match registry');
 const bytes=store.read(artifact),type=detectType(bytes),raw=bytes.toString('utf8');
 const base={schemaVersion:VERSION,sourceId:source.sourceId,jurisdictionCode:source.jurisdictionCode,
  metadata:{title:null,officialDocumentId:null,language:artifact.language,documentKind:'UNCLASSIFIED'},
  provenance:{artifactId:artifact.artifactId,rawContentHash:artifact.rawContentHash,sourceUrl:artifact.sourceUrl,finalUrl:artifact.finalUrl,retrievedAt:artifact.retrievedAt,normalizerVersion:VERSION},
  authority:{authorityCode:source.authorityCode,authorityName:source.authorityName,sourceRole:source.sourceRole,legalForce:'REVIEW_REQUIRED'},
  temporal:{publishedAt:null,effectiveFrom:null,effectiveTo:null,sourceTemporalAssertions:[],status:'REVIEW_REQUIRED'},
  rawArtifactRef:{rawStorageRef:artifact.rawStorageRef,rawContentHash:artifact.rawContentHash},sourceSpecificMetadata:{},
  normalizedContent:{text:'',blocks:[]},citationAnchors:[],discoveredLinks:[],status:'REVIEW_REQUIRED',processingState:'NORMALIZED',warnings:['Remote content is untrusted data. No instruction authority. No legal applicability inferred.']};
 function finish(){const envelopeId=hash(JSON.stringify(base)),envelope=deepFreeze({...base,envelopeId});verifiedEnvelopes.add(envelope);return envelope;}
 if(artifact.httpStatus<200||artifact.httpStatus>=300){base.processingState='HTTP_ERROR';return finish();}
 if(!mimeMatches(type,artifact.contentType)){base.processingState='MIME_MISMATCH';return finish();}
 if(type==='PDF'){
  // This is triage only. Compressed text and mixed scans require a real extractor.
  base.processingState=/\/Subtype\s*\/Image/.test(raw)&&!/\bBT\b/.test(raw)?'OCR_REQUIRED':'PDF_TEXT_EXTRACTION_REQUIRED';
  base.warnings.push('PDF triage is heuristic, not a scan diagnosis. See separately hash-bound pypdf R&D observations. No PDF text fabricated.');return finish();
 }
 if(type==='ZIP'||type==='UNSUPPORTED'){base.processingState='UNSUPPORTED_FORMAT';return finish();}
 const blocks=[];
 function block(locator,text){const clean=inertText(text);if(clean)blocks.push({locator,text:clean});}
 if(type==='JSON'){
  const j=JSON.parse(raw);base.sourceSpecificMetadata={format:'JSON',topLevelKeys:Object.keys(j),payloadRef:base.rawArtifactRef};
  if(source.sourceId==='GB-GOVUK'&&typeof j.content_id==='string'){
   base.metadata={title:typeof j.title==='string'?j.title:null,officialDocumentId:j.content_id,language:j.locale??null,documentKind:'GUIDANCE'};
   base.temporal.publishedAt=typeof j.first_published_at==='string'&&Number.isFinite(Date.parse(j.first_published_at))?j.first_published_at:null;
   base.sourceSpecificMetadata={...base.sourceSpecificMetadata,basePath:j.base_path,documentType:j.document_type,publicUpdatedAt:j.public_updated_at,withdrawnNotice:j.withdrawn_notice,publisherLinks:j.links?.organisations??[]};
   if(typeof j.details?.body==='string')block('#/details/body',j.details.body);
   for(const [i,part] of (j.details?.parts??[]).entries())if(typeof part.body==='string')block('#/details/parts/'+i+'/body',part.body);
  }else if(j.version?.startsWith?.('https://jsonfeed.org/')){
   base.metadata.title=j.title??null;base.metadata.documentKind='DISCOVERY_FEED';
   for(const [i,item] of (j.items??[]).entries()){block('#/items/'+i,item.title+' '+(item.content_text??item.content_html??''));if(item.url)base.discoveredLinks.push({url:item.url,classification:classifyLink(source.jurisdictionCode,item.url)});}
  }else{base.metadata.documentKind=j.openapi?'API_SCHEMA':'STRUCTURED_DATA';block('#',JSON.stringify(j));}
 }else if(type==='XML'){
  if(/<!ENTITY|<!DOCTYPE[^>]*\bSYSTEM\b/i.test(raw)){base.processingState='UNSUPPORTED_XML_DECLARATION';return finish();}
  base.sourceSpecificMetadata={format:'XML',payloadRef:base.rawArtifactRef};
  if(source.sourceId==='GB-LEGISLATION'&&/<Legislation\b/.test(raw)){
   base.metadata.title=inertText(raw.match(/<dc:title>([\s\S]*?)<\/dc:title>/)?.[1]??'')||null;
   base.metadata.officialDocumentId=inertText(raw.match(/<dc:identifier>([\s\S]*?)<\/dc:identifier>/)?.[1]??'')||null;base.metadata.documentKind='LEGISLATION';
   const version=parseEffectiveDate(raw.match(/<Legislation\b[^>]*RestrictStartDate="([^"]+)"/)?.[1]);
   const enactment=parseEffectiveDate(raw.match(/<ukm:EnactmentDate\b[^>]*Date="([^"]+)"/)?.[1]);
   base.temporal.sourceTemporalAssertions=[{locator:'/Legislation/@RestrictStartDate',semantic:'VERSION_START_NOT_UNIVERSAL_COMMENCEMENT',value:version},{locator:'//ukm:EnactmentDate/@Date',semantic:'ENACTMENT_NOT_UNIVERSAL_COMMENCEMENT',value:enactment}].filter(a=>a.value);
   base.sourceSpecificMetadata.versionLinks=[...raw.matchAll(/<atom:link\b[^>]*rel="http:\/\/purl.org\/dc\/terms\/(hasVersion|replaces)"[^>]*href="([^"]+)"/g)].map(m=>({relation:m[1],url:decode(m[2])}));
  }else if(source.sourceId==='US-ECFR'&&/<DIV8\b/.test(raw)){
   base.metadata.title=inertText(raw.match(/<HEAD>([\s\S]*?)<\/HEAD>/)?.[1]??'')||null;
   base.metadata.officialDocumentId=raw.match(/<DIV8\b[^>]*N="([^"]+)"/)?.[1]??null;base.metadata.documentKind='REGULATION';
  }else if(/<(?:rss|feed)\b/i.test(raw))base.metadata.documentKind='DISCOVERY_FEED';
  // Conservative section/paragraph anchors; preserve entire original XML separately.
  for(const m of raw.matchAll(/<(Text|P|p|summary|title|dc:title)\b[^>]*>([\s\S]*?)<\/\1>/g))block('xml:'+m.index,m[2]);
  if(!blocks.length)block('xml:document',raw);
 }else if(type==='HTML'){
  base.metadata.title=inertText(raw.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]??'')||null;
  base.metadata.language=raw.match(/<html\b[^>]*lang=["']([^"']+)/i)?.[1]??base.metadata.language;
  base.sourceSpecificMetadata={format:'HTML',payloadRef:base.rawArtifactRef,metaTags:[...raw.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]).slice(0,100)};
  const main=raw.match(/<(main|article)\b[^>]*>([\s\S]*?)<\/\1>/i);
  block(main?'html:'+main[1]+':'+main.index:'html:document',main?main[2]:raw);base.warnings.push('HTML text may include navigation and incomplete tables; document/authority review required.');
  for(const m of raw.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)){
   try{const u=new URL(decode(m[1]),artifact.finalUrl);if(u.protocol==='https:')base.discoveredLinks.push({url:u.href,classification:classifyLink(source.jurisdictionCode,u.href)});}catch{}
  }
 }
 let text='';for(const b of blocks){if(text)text+='\n';const start=text.length;text+=b.text;
  const anchor={anchorId:hash(artifact.rawContentHash+'|'+b.locator),locator:b.locator,start,end:text.length,quoteHash:hash(b.text),rawContentHash:artifact.rawContentHash};
  base.citationAnchors.push(anchor);base.normalizedContent.blocks.push({...b,anchorId:anchor.anchorId});
 }
 base.normalizedContent.text=text;if(!text)base.processingState='NO_TEXT_REVIEW_REQUIRED';
 return finish();
}
module.exports={normalizeArtifact,parseEffectiveDate,inertText,VERSION,assertVerifiedEnvelope};
