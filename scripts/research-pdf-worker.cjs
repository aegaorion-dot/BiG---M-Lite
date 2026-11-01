'use strict';
// Separate research reader; ordinary user-document page limits remain unchanged.
const fs=require('node:fs');
(async()=>{const {createCanvas,DOMMatrix,ImageData,Path2D}=require('@napi-rs/canvas');Object.assign(global,{DOMMatrix,ImageData,Path2D});const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),bytes=fs.readFileSync(process.argv[2]);
 if(bytes.length>16*1024*1024)throw Error('PDF byte limit');
 const document=await pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:false,disableFontFace:true}).promise;
 if(document.numPages>1000)throw Error('PDF research page limit');
 const pages=[],ocrPages=[];let length=0,ocrWorker=null;
 for(let n=1;n<=document.numPages;n++){const page=await document.getPage(n),content=await page.getTextContent();let text='';for(const item of content.items)if(typeof item.str==='string')text+=item.str+(item.hasEOL?'\n':' ');text=text.trim();
  // Some official tax tables are embedded as page images. OCR provides raw text
  // only; the regulatory worker remains responsible for semantic interpretation.
  if(text.replace(/\D/g,'').length<=3&&text.length<40){if(!ocrWorker){const tesseract=require('tesseract.js'),english=require('@tesseract.js-data/eng');ocrWorker=await tesseract.createWorker('eng',1,{langPath:english.langPath,gzip:true,corePath:require.resolve('tesseract.js-core/tesseract-core-lstm.wasm.js')});}const viewport=page.getViewport({scale:1.8}),canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvasContext:canvas.getContext('2d'),viewport,canvas}).promise;const recognized=await ocrWorker.recognize(canvas.toBuffer('image/png'));text=String(recognized.data.text??'').trim();ocrPages.push({page:n,tool:'tesseract.js',language:'eng',confidence:Math.round(recognized.data.confidence??0)});}
  length+=text.length;if(length>10000000)throw Error('PDF research text limit');pages.push(text);page.cleanup();}
 if(ocrWorker)await ocrWorker.terminate();await document.destroy();fs.writeFileSync(process.argv[3],JSON.stringify({extractor:'pdfjs-dist/5.5.207',pages,ocrPages}));
})().catch(()=>{process.stderr.write('Bounded regulatory PDF extraction failed\n');process.exitCode=1;});
