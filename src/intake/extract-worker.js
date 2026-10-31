'use strict';
// Untrusted binary decoding stays in a bounded, time-limited child process.
// No network, credentials, tools, or posting capability is supplied to it.
const fs=require('node:fs');
const {LIMITS}=require('./files');
globalThis.fetch=async()=>{throw Error('Extraction is offline');};
let worker,languageDir;
async function recognize(bytes,page,blocks){
 if(!worker){
  const {createWorker}=require('tesseract.js');
  const path=require('node:path');
  for(const code of ['eng','ind']){const pkg=require('@tesseract.js-data/'+code);fs.copyFileSync(path.join(pkg.langPath,code+'.traineddata.gz'),path.join(languageDir,code+'.traineddata.gz'));}
  worker=await createWorker('eng+ind',1,{langPath:languageDir,cacheMethod:'none',gzip:true,logger:()=>{},errorHandler:()=>{}});
 }
 const {data}=await worker.recognize(bytes,{}, {text:true,blocks:true});
 for(const block of data.blocks??[])for(const paragraph of block.paragraphs??[])for(const line of paragraph.lines??[]){
  const b=line.bbox;blocks.push({blockId:'b'+blocks.length,page,text:line.text.trim(),bbox:[b.x0,b.y0,b.x1-b.x0,b.y1-b.y0],confidence:line.confidence/100});
 }
 return data.confidence/100;
}
process.once('message',async({base64,mime,workDir})=>{
 try{
  languageDir=workDir;
  const bytes=Buffer.from(base64,'base64'),textBlocks=[],pages=[],warnings=[];let ocr=false,pdfText=false,confidence=1;
  const canvas=require('@napi-rs/canvas');
  if(mime==='application/pdf'){
   const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
   const pdf=await getDocument({data:new Uint8Array(bytes),isEvalSupported:false,disableFontFace:true,useSystemFonts:true,stopAtErrors:true,disableAutoFetch:true,useWorkerFetch:false,maxImageSize:LIMITS.pixels}).promise;
   if(pdf.numPages>LIMITS.pages)throw Error('PDF page limit exceeded (20)');
   if(await pdf.getJSActions()||Object.keys(await pdf.getAttachments()??{}).length)throw Error('Active PDF content or attachments are unsupported');
   for(let n=1;n<=pdf.numPages;n++){
    const page=await pdf.getPage(n);if(await page.getJSActions())throw Error('Active PDF content is unsupported');
    const items=(await page.getTextContent()).items.filter(i=>typeof i.str==='string'&&i.str.trim());
    if(items.length){
     pdfText=true;pages.push({page:n,method:'PDF_TEXT'});const lines=[];
     for(const item of items){let line=lines.find(l=>Math.abs(l.y-item.transform[5])<2);if(!line){line={y:item.transform[5],items:[]};lines.push(line);}line.items.push(item);}
     for(const line of lines.sort((a,b)=>b.y-a.y)){line.items.sort((a,b)=>a.transform[4]-b.transform[4]);const x=line.items[0].transform[4],end=Math.max(...line.items.map(i=>i.transform[4]+i.width)),height=Math.max(...line.items.map(i=>i.height));textBlocks.push({blockId:'b'+textBlocks.length,page:n,text:line.items.map(i=>i.str).join(' '),bbox:[x,line.y,end-x,height],coordinateSystem:'PDF_POINTS_BOTTOM_LEFT'});}
    }
    else {
     ocr=true;const v=page.getViewport({scale:2});if(v.width*v.height>LIMITS.pixels)throw Error('PDF render pixel limit exceeded');
     const target=canvas.createCanvas(Math.ceil(v.width),Math.ceil(v.height));await page.render({canvasContext:target.getContext('2d'),viewport:v}).promise;
     confidence=Math.min(confidence,await recognize(target.toBuffer('image/png'),n,textBlocks));pages.push({page:n,method:'OCR'});
    }
    if(textBlocks.length>20000||textBlocks.reduce((s,b)=>s+b.text.length,0)>LIMITS.textChars)throw Error('Extraction output limit exceeded');
    page.cleanup();
   }
   await pdf.destroy();
  }else{
   const image=await canvas.loadImage(bytes);if(!image.width||!image.height||image.width*image.height>LIMITS.pixels)throw Error('Image pixel limit exceeded');
   ocr=true;pages.push({page:1,method:'OCR',width:image.width,height:image.height,coordinateSystem:'IMAGE_PIXELS'});confidence=await recognize(bytes,1,textBlocks);
  }
  if(worker)await worker.terminate();
  if(!textBlocks.length)warnings.push('No readable text; supply a clearer document');
  if(ocr)warnings.push('OCR is fallible; verify every proposed financial field');
  process.send({result:{extractor:'pdfjs+tesseract-local',extractorVersion:'pdfjs-5.5.207/tesseract-7.0.0',method:ocr?(pdfText?'MIXED':'OCR'):'PDF_TEXT',pages,textBlocks,tables:[],detectedLanguage:ocr?'eng+ind':null,confidence,warnings}});
 }catch{if(worker)await worker.terminate().catch(()=>{});process.send({error:'Document extraction failed: malformed, active, encrypted, unsupported, or resource limit exceeded'});}
});
