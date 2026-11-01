'use strict';
// Explicit public-source acquisition. Never loads application credentials.
const fs=require('node:fs'),path=require('node:path');
const {RawArtifactStore}=require('../src/fabric/artifacts'),{SourceConnector}=require('../src/fabric/connector'),{normalizeArtifact}=require('../src/fabric/normalizer');
async function main(){
 const root=path.resolve(__dirname,'../research/moroccan-tax'),store=new RawArtifactStore(path.join(root,'raw')),connector=new SourceConnector({store,maxBytes:8*1024*1024,timeoutMs:60000}),sources=[
 ['PP55_2022','https://www.pajak.go.id/id/peraturan/penyesuaian-pengaturan-di-bidang-pajak-penghasilan'],
 ['PP20_2026','https://pajak.go.id/id/peraturan/perubahan-atas-peraturan-pemerintah-nomor-55-tahun-2022-tentang-penyesuaian-pengaturan-di'],
 ['UU7_2021','https://www.pajak.go.id/id/peraturan/harmonisasi-peraturan-perpajakan'],
 ['ID_RESIDENCE_2025','https://www.pajak.go.id/id/peraturan/penentuan-subjek-pajak-dalam-negeri-dan-subjek-pajak-luar-negeri-0'],
 ['ID_RENT_PP34_2017','https://www.pajak.go.id/id/pajak-penghasilan-atas-penghasilan-dari-persewaan-tanah-danatau-bangunan'],
 ['ID_FTC_PMK192_2018','https://www.pajak.go.id/index.php/en/node/63184'],
 ['ID_AE_RATIFICATION','https://pajak.go.id/id/peraturan/pengesahan-persetujuan-antara-pemerintah-republik-indonesia-dan-pemerintah-persatuan'],
 ['ID_GB_TREATY_MLI','https://www.pajak.go.id/index.php/id/p3b/mli-inggris'],
 ['UK_OVERSEAS_EMPLOYMENT','https://www.gov.uk/government/publications/globally-mobile-employees/effect-of-residence-on-an-employees-liability-to-uk-income-tax','GB-GOVUK'],
 ['AE_WAGES','https://www.tax.gov.ae/en/taxes/corporate.tax/faqs.aspx','AE-FTA'],
 ['AE_WAGE_SCOPE','https://www.tax.gov.ae/en/taxes/corporate.tax/corporate.tax.topics/basis.of.taxation.natural.person.aspx','AE-FTA'],
 ['MA_CRI_IDENTITY','https://www.casainvest.ma/fr/mentions-l%C3%A9galesCRICS','MA-CRI'],
 ['MA_CGI_2026','https://casainvest.ma/sites/default/files/2026-02/Code%20impo%CC%82ts%202026.pdf','MA-CRI','PDF_TEXT'],
 ['AE_PERSONAL_TAX','https://u.ae/en/information-and-services/finance-and-investment/taxation','AE-GOV'],
 ['UK_RESIDENCE','https://www.gov.uk/tax-foreign-income/residence','GB-GOVUK'],
 ['AE_PERSONAL_GUIDANCE','https://adro.gov.ae/en/Living-in-Abu-Dhabi/Money-And-Taxation','AE-ADRO']
 ];const records=[];
 fs.mkdirSync(path.join(root,'normalized'),{recursive:true});
 const previous=fs.existsSync(path.join(root,'sources.json'))?JSON.parse(fs.readFileSync(path.join(root,'sources.json'))).records:[];
 for(const [identity,url,sourceId='ID-DJP',method='HTML']of sources){const old=previous.find(r=>r.identity===identity&&r.sourceUrl===url);if(old){store.read(JSON.parse(fs.readFileSync(path.join(root,'raw/artifacts',old.artifactId+'.json'))));records.push(old);continue;}const artifact=await connector.retrieve({sourceId,url,method});if(artifact.status!=='DISCOVERED')throw Error('Official source acquisition failed: '+identity);const envelope=normalizeArtifact(store,artifact);if(artifact.sourceType!=='PDF'&&envelope.processingState!=='NORMALIZED')throw Error('Official source normalization failed: '+identity);fs.writeFileSync(path.join(root,'normalized',identity+'.json'),JSON.stringify(envelope,null,2)+'\n');records.push({identity,artifactId:artifact.artifactId,rawContentHash:artifact.rawContentHash,envelopeId:envelope.envelopeId,retrievedAt:artifact.retrievedAt,sourceUrl:artifact.sourceUrl});fs.writeFileSync(path.join(root,'sources.json'),JSON.stringify({schemaVersion:'moroccan-official-tax-evidence/1',records:[...previous.filter(p=>!records.some(r=>r.identity===p.identity)),...records]},null,2)+'\n');}
 fs.writeFileSync(path.join(root,'sources.json'),JSON.stringify({schemaVersion:'moroccan-official-tax-evidence/1',records},null,2)+'\n');console.log(JSON.stringify({officialArtifacts:records.length,status:'PRESERVED_UNAPPROVED'}));
}
main().catch(()=>{console.error('Official tax evidence acquisition failed. No application environment was loaded.');process.exitCode=1;});
