'use strict';
const {deepFreeze}=require('../onboarding/canonical');
const rows=[
 ['MA','FINANCE','Morocco Ministry of Economy and Finance / DGI publications','PRIMARY_LEGISLATION','finances.gov.ma','fr'],
 ['MA','DGI','Morocco Direction Generale des Impots','TAX_AUTHORITY','tax.gov.ma','fr'],
 ['MA','CRI','Casablanca-Settat Regional Investment Centre (public institution), official DGI document mirror','OFFICIAL_GUIDANCE','casainvest.ma','fr'],
 ['AE','FTA','United Arab Emirates Federal Tax Authority','TAX_AUTHORITY','tax.gov.ae','en'],
 ['AE','GOV','United Arab Emirates official government portal','OFFICIAL_GUIDANCE','u.ae','en'],
 ['AE','ADRO','Abu Dhabi Residents Office, government guidance','OFFICIAL_GUIDANCE','adro.gov.ae','en'],
 ['ID','DJP','Direktorat Jenderal Pajak','TAX_AUTHORITY','pajak.go.id','id'],
 ['ID','FISCAL','Indonesia Ministry of Finance fiscal tax exchange-rate decisions','FINANCE_MINISTRY','fiskal.kemenkeu.go.id','id'],
 ['ID','BPK','Badan Pemeriksa Keuangan legislation database','PRIMARY_LEGISLATION','peraturan.bpk.go.id','id'],
 ['ID','JDIH','Ministry of Finance legal documentation','SECONDARY_LEGISLATION','jdih.kemenkeu.go.id','id'],
 ['ID','DJPP','Directorate General of Legislation','OFFICIAL_GAZETTE','peraturan.go.id','id'],
 ['ID','CORETAX','DJP Coretax service','TAX_AUTHORITY','coretaxdjp.pajak.go.id','id'],
 ['ID','MA','Supreme Court Indonesia','COURT','mahkamahagung.go.id','id'],
 ['ID','SETPP','Tax Court secretariat','TRIBUNAL','setpp.kemenkeu.go.id','id'],
 ['SG','IRAS','Inland Revenue Authority of Singapore','TAX_AUTHORITY','iras.gov.sg','en'],
 ['SG','SSO','Attorney-General Chambers Singapore Statutes Online','PRIMARY_LEGISLATION','sso.agc.gov.sg','en'],
 ['SG','MOF','Ministry of Finance Singapore','FINANCE_MINISTRY','mof.gov.sg','en'],
 ['SG','JUDICIARY','Singapore Courts','COURT','judiciary.gov.sg','en'],
 ['US','IRS','Internal Revenue Service','TAX_AUTHORITY','irs.gov','en'],
 ['US','USCODE','Office of the Law Revision Counsel','PRIMARY_LEGISLATION','uscode.house.gov','en'],
 ['US','ECFR','Office of the Federal Register eCFR','SECONDARY_LEGISLATION','ecfr.gov','en'],
 ['US','CONGRESS','Library of Congress Congress.gov','PRIMARY_LEGISLATION','congress.gov','en'],
 ['US','TAXCOURT','United States Tax Court','COURT','ustaxcourt.gov','en'],
 ['US','COURTS','Administrative Office of the US Courts','COURT','uscourts.gov','en'],
 ['US','TREASURY','United States Department of the Treasury','FINANCE_MINISTRY','treasury.gov','en'],
 ['JP','NTA','Japan National Tax Agency','TAX_AUTHORITY','nta.go.jp','ja'],
 ['JP','MOF','Japan Ministry of Finance','FINANCE_MINISTRY','mof.go.jp','ja'],
 ['JP','EGOV','e-Gov Japanese law search','PRIMARY_LEGISLATION','elaws.e-gov.go.jp','ja'],
 ['AU','ATO','Australian Taxation Office','TAX_AUTHORITY','ato.gov.au','en'],
 ['AU','FRL','Office of Parliamentary Counsel Federal Register','PRIMARY_LEGISLATION','legislation.gov.au','en'],
 ['AU','TREASURY','Australian Treasury','FINANCE_MINISTRY','treasury.gov.au','en'],
 ['AU','ART','Administrative Review Tribunal','TRIBUNAL','art.gov.au','en'],
 ['AU','FEDCOURT','Federal Court of Australia','COURT','fedcourt.gov.au','en'],
 ['AU','HCOURT','High Court of Australia','COURT','hcourt.gov.au','en'],
 ['GB','GOVUK','GOV.UK departments (document publisher must be checked)','OFFICIAL_GUIDANCE','gov.uk','en'],
 ['GB','LEGISLATION','The National Archives legislation.gov.uk','PRIMARY_LEGISLATION','legislation.gov.uk','en'],
 ['GB','JUDICIARY','Courts and Tribunals Judiciary','COURT','judiciary.uk','en'],
 ['GB','SUPREME','Supreme Court UK','COURT','supremecourt.uk','en'],
];
const api={
 'GB-GOVUK':[{url:'https://www.gov.uk/api/content/',method:'API',documentation:'https://docs.publishing.service.gov.uk/apis/content-api.html'}],
 'GB-LEGISLATION':[{url:'https://www.legislation.gov.uk/',method:'API',documentation:'https://www.legislation.gov.uk/developer',notes:'CLML data.xml; search/list data.feed. See /openapi.'}],
 'AU-FRL':[{url:'https://api.prod.legislation.gov.au/v1/',method:'API',documentation:'https://api.prod.legislation.gov.au/swagger/index.html',notes:'OData; explicitly registered API host, not wildcard subdomain trust.'}],
 'US-ECFR':[{url:'https://www.ecfr.gov/api/',method:'API',documentation:'https://www.ecfr.gov/developers/documentation/api/v1'}],
 'US-CONGRESS':[{url:'https://api.congress.gov/v3/',method:'API',documentation:'https://api.congress.gov/',notes:'API key required; no keys bundled or acquired.'}],
};
const structured={
 'ID-JDIH':[{url:'https://jdih.kemenkeu.go.id/feed.json',method:'FEED',format:'JSON_FEED'},{url:'https://jdih.kemenkeu.go.id/rss.xml',method:'FEED',format:'RSS'}],
 'GB-LEGISLATION':[{url:'https://www.legislation.gov.uk/ukpga/data.feed',method:'FEED',format:'ATOM'}],
 'US-USCODE':[{url:'https://uscode.house.gov/download.html',method:'STRUCTURED_DOWNLOAD',format:'DOWNLOAD_INDEX',notes:'Links observed; named release ZIPs returned 404 during this run. Not verified downloads.'}]
};
const SOURCES=deepFreeze(rows.map(([jurisdictionCode,authorityCode,authorityName,sourceRole,domain,language])=>{
 const sourceId=jurisdictionCode+'-'+authorityCode;
 const hosts=[domain,'www.'+domain];if(sourceId==='AU-FRL')hosts.push('api.prod.legislation.gov.au');if(sourceId==='US-CONGRESS')hosts.push('api.congress.gov');
 return {sourceId,jurisdictionCode,authorityCode,authorityName,sourceRole,baseUrl:'https://'+domain+'/',officialDomains:hosts,
  preferredAccessMethods:['API','STRUCTURED_DOWNLOAD','FEED','HTML','PDF_TEXT','PDF_OCR'],apiEndpoints:api[sourceId]??[],structuredEndpoints:structured[sourceId]??[],
  contentTypes:['application/json','application/feed+json','application/xml','text/xml','application/atom+xml','application/rss+xml','text/html','application/xhtml+xml','application/pdf','application/zip'],languages:[language],trustLevel:'OFFICIAL_SOURCE_ONLY',
  seed:sourceId==='AU-TREASURY'?'USER_PHASE2_ADDITION':'ORIGINAL_JURISDICTION_TS',
  notes:'Registration authenticates source origin, not legal effect. Authority/commencement/version require document review. Availability is recorded separately in research observations.'};
}));
function getSource(sourceId){return SOURCES.find(s=>s.sourceId===sourceId)??null;}
function listSources(jurisdiction){return SOURCES.filter(s=>s.jurisdictionCode===jurisdiction);}
function lookupSource(jurisdiction,input){
 let u;try{u=new URL(input);}catch{return null;}
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')return null;
 return listSources(jurisdiction).find(s=>s.officialDomains.includes(u.hostname))??null;
}
function classifyLink(jurisdiction,input,{registryVersion=null}={}){
 const registered=lookupSource(jurisdiction,input);
 // Normalizer v1 discovery labels are historical data. Adding an authority must
 // not mutate old normalized envelopes or silently upgrade previously seen links.
 if(registered&&!(registryVersion===1&&['MA-DGI','ID-FISCAL','US-TREASURY','JP-NTA','JP-MOF','JP-EGOV'].includes(registered.sourceId)))return 'REGISTERED_OFFICIAL_SOURCE';
 let u;try{u=new URL(input);}catch{return 'REJECTED_SOURCE';}
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')return 'REJECTED_SOURCE';
 if(registryVersion===1)return /(?:\.go\.id|\.gov\.sg|\.gov\.au|\.gov\.uk|\.gov)$/.test(u.hostname)?'UNREGISTERED_OFFICIAL_SOURCE_CANDIDATE':'REJECTED_SOURCE';
 return /(?:\.go\.id|\.go\.jp|\.gov\.sg|\.gov\.au|\.gov\.uk|\.gov)$/.test(u.hostname)?'UNREGISTERED_OFFICIAL_SOURCE_CANDIDATE':'REJECTED_SOURCE';
}
function preferAccess(options){const order=SOURCES[0].preferredAccessMethods;return [...options].filter(o=>o.verified===true&&order.includes(o.method)).sort((a,b)=>order.indexOf(a.method)-order.indexOf(b.method))[0]??null;}
module.exports={SOURCES,getSource,listSources,lookupSource,classifyLink,preferAccess};
