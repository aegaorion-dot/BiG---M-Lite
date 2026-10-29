'use strict';
// Separate research reader; ordinary user-document page limits remain unchanged.
const fs=require('node:fs');
(async()=>{const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),bytes=fs.readFileSync(process.argv[2]);
 if(bytes.length>10*1024*1024)throw Error('PDF byte limit');
 const document=await pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:false,disableFontFace:true}).promise;
 if(document.numPages>1000)throw Error('PDF research page limit');
 const pages=[];let length=0;
 for(let n=1;n<=document.numPages;n++){const page=await document.getPage(n),content=await page.getTextContent();let text='';for(const item of content.items)if(typeof item.str==='string')text+=item.str+(item.hasEOL?'\n':' ');length+=text.length;if(length>10000000)throw Error('PDF research text limit');pages.push(text.trim());page.cleanup();}
 await document.destroy();fs.writeFileSync(process.argv[3],JSON.stringify({extractor:'pdfjs-dist/5.5.207',pages}));
})().catch(()=>{process.stderr.write('Bounded regulatory PDF extraction failed\n');process.exitCode=1;});
