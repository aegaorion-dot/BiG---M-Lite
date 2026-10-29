'use strict';
// Synthetic evidence only. Explicit regeneration; never runs on application startup.
const fs=require('node:fs'),path=require('node:path');
const {createCanvas}=require('@napi-rs/canvas');
const out=path.join(__dirname,'..','test','fixtures','intake');
const lines=['RECEIPT','Date: 2026-10-20','Vendor: Synthetic Coffee','Description: Coffee beans','Total IDR 850000','Payment: bank'];
const canvas=createCanvas(1300,650),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1300,650);ctx.fillStyle='black';ctx.font='38px Arial';lines.forEach((s,i)=>ctx.fillText(s,40,70+i*80));
const png=canvas.toBuffer('image/png'),jpg=canvas.toBuffer('image/jpeg');fs.writeFileSync(path.join(out,'receipt.png'),png);fs.writeFileSync(path.join(out,'receipt.jpg'),jpg);
function pdf(objects){
 const chunks=[Buffer.from('%PDF-1.4\n')],offsets=[0];let length=chunks[0].length;
 for(let i=0;i<objects.length;i++){offsets.push(length);const buf=Buffer.concat([Buffer.from((i+1)+' 0 obj\n'),Buffer.isBuffer(objects[i])?objects[i]:Buffer.from(objects[i]),Buffer.from('\nendobj\n')]);chunks.push(buf);length+=buf.length;}
 const xref=length;chunks.push(Buffer.from('xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n'));return Buffer.concat(chunks);
}
const stream='BT /F1 18 Tf 30 750 Td '+lines.map((s,i)=>(i?'0 -40 Td ':'')+'('+s+') Tj').join('\n')+' ET';
fs.writeFileSync(path.join(out,'receipt.pdf'),pdf(['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count 1 /Kids [3 0 R] >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 850] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream']));
const imageStream='q 650 0 0 325 0 0 cm /Im0 Do Q';
fs.writeFileSync(path.join(out,'receipt-scan.pdf'),pdf(['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count 1 /Kids [3 0 R] >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 650 325] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>',Buffer.concat([Buffer.from('<< /Type /XObject /Subtype /Image /Width 1300 /Height 650 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpg.length+' >>\nstream\n'),jpg,Buffer.from('\nendstream')]),'<< /Length '+imageStream.length+' >>\nstream\n'+imageStream+'\nendstream']));
fs.writeFileSync(path.join(out,'malformed.pdf'),'%PDF-1.4\nnot a valid document\n%%EOF\n');
console.log('Generated synthetic PDF, scanned PDF, PNG, JPEG and malformed PDF fixtures.');
