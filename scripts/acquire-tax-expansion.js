'use strict';
// Bounded official downloads only; no application credentials or model calls.
const fs=require('node:fs'),path=require('node:path'),{RawArtifactStore}=require('../src/fabric/artifacts'),{SourceConnector}=require('../src/fabric/connector'),{normalizeArtifact}=require('../src/fabric/normalizer');
async function main(){
 const dir=path.resolve(__dirname,'../research/moroccan-tax'),file=path.join(dir,'sources.json'),sources=JSON.parse(fs.readFileSync(file,'utf8')),store=new RawArtifactStore(path.join(dir,'raw')),connector=new SourceConnector({store,maxBytes:10*1024*1024,timeoutMs:25000});
 const plans=[
 ['ID_FX_2025_OCT01','ID-FISCAL','https://fiskal.kemenkeu.go.id/files/kurs/file/1759223725_nilai_kurs_01_-_07_oct_2025.pdf'],
 ['ID_FX_2025_OCT08','ID-FISCAL','https://fiskal.kemenkeu.go.id/files/kurs/file/1759832174_nilai_kurs_08_-_14_okt_2025.pdf'],
 ['ID_FX_2025_OCT15','ID-FISCAL','https://fiskal.kemenkeu.go.id/files/kurs/file/1760431613_nilai_kurs_15_-_21_okt_2025.pdf'],
 ['ID_FX_2025_OCT29','ID-FISCAL','https://fiskal.kemenkeu.go.id/files/kurs/file/1761638206_nilai_kurs_29_okt_-_04_nov_2025.pdf'],
 ['ID_RESIDENCE_2011','ID-DJP','https://www.pajak.go.id/id/peraturan/penentuan-subjek-pajak-dalam-negeri-dan-subjek-pajak-luar-negeri'],
 ['ID_FX_2025_OCT28','ID-FISCAL','https://fiskal.kemenkeu.go.id/files/kurs/file/1761030247_nilai_kurs_22_-_28_okt_2025.pdf'],
 ['MA_CGI_2025_PRIMARY','MA-DGI','https://www.tax.gov.ma/wps/wcm/connect/d15709dd-1125-4da5-9700-d75522763d52/CGI+2025+FR..pdf'],
 ['MA_CGI_2024_PRIMARY','MA-FINANCE','https://www.finances.gov.ma/Publication/dgi/2024/CG-2024-fr.pdf'],
 ['MA_CGI_2026_PRIMARY','MA-FINANCE','https://www.finances.gov.ma/Publication/dgi/2025/CGI-2026-FR.pdf'],
 ['ID_MA_TREATY','ID-DJP','https://pajak.go.id/id/p3b/maroko'],
 ['AE_NATURAL_2023','AE-FTA','https://tax.gov.ae/Datafolder/Files/Guides/CT/Taxation%20of%20natural%20persons%20-%2025%2011%202023.pdf']
 ].filter(p=>!process.argv.includes('--fx-only')||p[0].startsWith('ID_FX_'));const outcomes=await Promise.all(plans.map(async([identity,sourceId,url])=>{if(sources.records.some(r=>r.identity===identity))return{identity,status:'CACHED'};try{const artifact=await connector.retrieve({sourceId,url,method:'HTML'});if(artifact.status!=='DISCOVERED')return{identity,status:artifact.status,httpStatus:artifact.httpStatus};const envelope=normalizeArtifact(store,artifact);fs.writeFileSync(path.join(dir,'normalized',identity+'.json'),JSON.stringify(envelope,null,2)+'\n');sources.records.push({identity,artifactId:artifact.artifactId,rawContentHash:artifact.rawContentHash,envelopeId:envelope.envelopeId,retrievedAt:artifact.retrievedAt,sourceUrl:artifact.sourceUrl});return{identity,status:artifact.sourceType==='PDF'?'PRESERVED_REQUIRES_EXTRACTION':'NORMALIZED'};}catch{return{identity,status:'RETRIEVAL_FAILED'};}}));
 fs.writeFileSync(file,JSON.stringify(sources,null,2)+'\n');const log=path.join(dir,'expansion-acquisition.json'),prior=fs.existsSync(log)?JSON.parse(fs.readFileSync(log,'utf8')):[];fs.writeFileSync(log,JSON.stringify([...prior,...outcomes],null,2)+'\n');console.log(JSON.stringify(outcomes));
}
if(require.main===module)main().catch(()=>{console.error('Official expansion acquisition failed; no application configuration loaded');process.exitCode=1});
