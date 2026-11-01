'use strict';
require('../src/web/environment').loadEnvironment(require('node:path').join(__dirname,'..','.env'));
async function main(){
 if(process.env.BIGM_META_LIVE_TEST!=='1'){console.log('SKIP: set BIGM_META_LIVE_TEST=1 for one paid document semantic call.');return;}
 if(!process.env.BIGM_META_API_URL||!process.env.BIGM_META_API_KEY||!process.env.BIGM_META_MODEL){console.log('SKIP: Meta endpoint, key, or model absent.');return;}
 const {LocalExtractionProvider}=require('../src/intake/extraction');
 const {MetaSemanticDocumentProvider,validateSemantics}=require('../src/intake/semantics');
 const bytes=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','test','fixtures','intake','receipt-id.txt'));
 const extraction=await new LocalExtractionProvider().extract({bytes,mime:'text/plain'});
 const provider=new MetaSemanticDocumentProvider({optIn:true,allowLive:true});
 const result=validateSemantics(await provider.interpret({extraction,sourceChannel:'DOCUMENT',receivedAt:'2026-10-29T00:00:00.000Z'}),extraction);
 console.log(JSON.stringify({provider:'meta-muse',calls:1,transactionCandidates:result.transactions.length,profileCandidates:result.profileFacts.length,posted:false}));
}
main().catch(()=>{console.error('Document semantic smoke failed; no accounting posting attempted.');process.exitCode=1;});
