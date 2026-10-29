'use strict';
const {createHash}=require('node:crypto');
const LIMITS=Object.freeze({fileBytes:8*1024*1024,totalBytes:64*1024*1024,textChars:200000,pages:20,rows:500,pixels:16000000});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function textOf(bytes){try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');}catch{throw Error('Malformed UTF-8 document');}}
function csvRows(text){
 const rows=[];let row=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
  else if(c==='"'){if(cell||closed)throw Error('Malformed CSV quoting');quoted=true;}
  else if(c===','||c==='\n'){row.push(cell.trim());cell='';closed=false;if(c==='\n'){if(row.some(Boolean))rows.push(row);row=[];}}
  else if(c==='\r'&&text[i+1]==='\n')continue;
  else {if(closed)throw Error('Malformed CSV quoting');cell+=c;}
  if(cell.length>2000||row.length>30||rows.length>LIMITS.rows+1)throw Error('CSV content limit exceeded');
 }
 if(quoted)throw Error('Malformed CSV quoting');row.push(cell.trim());if(row.some(Boolean))rows.push(row);
 if(rows.length>LIMITS.rows+1||rows.length<2||new Set(rows[0]).size!==rows[0].length||rows.some(r=>r.length!==rows[0].length))throw Error('Malformed CSV rows');
 return rows;
}
function inspectFile({bytes,originalFilename,declaredMimeType}){
 if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>LIMITS.fileBytes)throw Error('Empty file or file size limit exceeded (8 MiB)');
 if(typeof originalFilename!=='string'||!originalFilename.trim()||originalFilename.length>180||/[\x00-\x1f<>:"/\\|?*]/.test(originalFilename)||originalFilename.includes('..')||/[. ]$/.test(originalFilename)||/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(originalFilename))throw Error('Suspicious filename');
 let mime;
 if(bytes.subarray(0,5).toString()==='%PDF-'){if(!bytes.subarray(-1024).includes(Buffer.from('%%EOF')))throw Error('Malformed PDF');mime='application/pdf';}
 else if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){if(bytes.length<33||bytes.subarray(12,16).toString()!=='IHDR')throw Error('Malformed PNG');const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);if(!w||!h||w*h>LIMITS.pixels)throw Error('Image pixel limit exceeded');mime='image/png';}
 else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255){
  let i=2,dimensions=false;while(i+8<bytes.length){if(bytes[i++]!==255)throw Error('Malformed JPEG');let marker=bytes[i++];while(marker===255)marker=bytes[i++];if(marker===217||marker===218)break;const len=bytes.readUInt16BE(i);if(len<2||i+len>bytes.length)throw Error('Malformed JPEG');if([192,193,194].includes(marker)){const h=bytes.readUInt16BE(i+3),w=bytes.readUInt16BE(i+5);if(!w||!h||w*h>LIMITS.pixels)throw Error('Image pixel limit exceeded');dimensions=true;}i+=len;}
  if(!dimensions||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)throw Error('Malformed JPEG');mime='image/jpeg';
 } else {
  const text=textOf(bytes);if(/[\x00-\x08\x0b\x0e-\x1f]/.test(text)||/^\s*(?:<|MZ|#!|PK\x03)/.test(text))throw Error('Unsupported file type');
  if(!text.trim()||text.length>LIMITS.textChars)throw Error('Empty or oversized text');
  const header=text.split(/\r?\n/)[0].toLowerCase().split(',').map(s=>s.trim().replace(/^"|"$/g,''));
  mime=header.includes('date')&&header.includes('description')&&(header.includes('amount')||header.includes('debit')||header.includes('credit'))?'text/csv':'text/plain';
  if(mime==='text/csv')csvRows(text);
 }
 const declared=String(declaredMimeType??'application/octet-stream').split(';')[0].toLowerCase();
 if(declared!=='application/octet-stream'&&declared!==mime&&!(declared==='text/plain'&&mime==='text/csv'))throw Error('MIME mismatch: detected '+mime);
 return {detectedMimeType:mime,sizeBytes:bytes.length,sha256:hash(bytes)};
}
module.exports={LIMITS,hash,textOf,csvRows,inspectFile};
