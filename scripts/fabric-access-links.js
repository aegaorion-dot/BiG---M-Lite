'use strict';
// Offline discovery: inspecting a link never adds its host to the registry.
const fs=require('node:fs'),path=require('node:path');
const {SOURCES,classifyLink}=require('../src/fabric/registry');
const {RawArtifactStore}=require('../src/fabric/artifacts');
const root=path.resolve(__dirname,'../research/country-pack-fabric');
const rows=fs.readFileSync(path.join(root,'observations.jsonl'),'utf8').trim().split('\n').map(JSON.parse),store=new RawArtifactStore(path.join(root,'captures'));
const categories={API:/(?:\/|\.)api(?:\/|\.)|\/(?:swagger|openapi|odata)(?:\/|[?#]|$)|api\.w\.org/i,JSON:/\.json(?:[?#]|$)|jsonfeed/i,XML:/\.xml(?:[?#]|$)/i,RSS_ATOM:/rss|atom|feed/i,PDF:/\.pdf(?:[?#]|$)/i,ZIP:/\.zip(?:[?#]|$)/i,SEARCH:/search|pencarian|browse/i,PAGINATION:/[?&](?:page|offset|limit|pagesize)=/i};
const result=SOURCES.map(s=>{
 const links=[];
 for(const r of rows.filter(r=>r.sourceId===s.sourceId&&r.artifact?.httpStatus===200&&['HTML','XML'].includes(r.artifact.sourceType))){
  const raw=store.read(r.artifact).toString('utf8');
  for(const m of raw.matchAll(/(?:href|src)=["']([^"']+)["']/gi))try{const url=new URL(m[1].replaceAll('&amp;','&'),r.url).href;if(!links.includes(url))links.push(url);}catch{}
 }
 return {sourceId:s.sourceId,checks:Object.fromEntries(Object.entries(categories).map(([category,pattern])=>[category,links.filter(u=>pattern.test(u)).slice(0,15).map(url=>({url,classification:classifyLink(s.jurisdictionCode,url),access:rows.some(r=>r.url===url)?'SEE_REQUEST_OBSERVATIONS':'LINK_OBSERVED_NOT_REQUESTED'}))])),note:'Empty category means not observed in captured links, not proof of absence. Search/pagination links are discovery only, not tested search result semantics.'};
});
fs.writeFileSync(path.join(root,'access-link-discovery.json'),JSON.stringify(result,null,2)+'\n');console.log('Inspected captured links for',result.length,'registered families; no new trust added.');
