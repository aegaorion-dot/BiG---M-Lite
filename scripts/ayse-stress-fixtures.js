'use strict';
// Synthetic source documents for the Ayşe stress demonstration. These are
// source fixtures only; uploaded-document observations are produced by BiG-M.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createCanvas}=require('@napi-rs/canvas');
const out=path.join(os.tmpdir(),'bigm-ayse-synthetic-fixtures');fs.mkdirSync(out,{recursive:true});
function page(title,subtitle,lines,{width=1500,height=2100,quality=0.94}={}){
 const canvas=createCanvas(width,height),ctx=canvas.getContext('2d');ctx.fillStyle='#f1f1ef';ctx.fillRect(0,0,width,height);ctx.fillStyle='#fff';ctx.fillRect(55,55,width-110,height-110);ctx.strokeStyle='#555';ctx.lineWidth=3;ctx.strokeRect(65,65,width-130,height-130);ctx.fillStyle='#111';ctx.font='bold 46px Arial';ctx.fillText(title,100,150);ctx.font='24px Arial';ctx.fillText(subtitle,100,200);let y=275;
 for(const line of lines){ctx.font=line.bold?'bold 26px Arial':'24px Arial';ctx.fillStyle='#171717';ctx.fillText(line,100,y);y+=54;}
 return canvas.toBuffer('image/jpeg',{quality});
}
const receiptLines=[
 ['2025-10-01','Makro Barcelona','Business ingredients','EUR 310.00'],['2025-10-03','Pack&Go','Food containers and packaging','EUR 85.00'],
 ['2025-10-05','Anadolu Gıda','Turkish specialty ingredients invoice','TRY 18,000.00'],['2025-10-07','OrderBook SaaS','Online ordering and booking software','USD 79.00'],
 ['2025-10-09','Móvil Barcelona','Mobile service, personal and customer use','EUR 55.00'],['2025-10-11','Endesa','Home electricity, cooking workspace','EUR 120.00'],
 ['2025-10-13','Fibra Internet','Home internet, personal and business use','EUR 48.00'],['2025-10-16','Repsol','Fuel, personal driving and catering deliveries','EUR 90.00'],
 ['2025-10-17','Cocina Compartida','Commercial kitchen day rental','EUR 160.00'],['2025-10-19','Hostelería Pro','Commercial countertop oven','EUR 650.00'],
 ['2025-10-21','Kitchen Tools BCN','Commercial mixer','EUR 260.00'],['2025-10-23','La Mesa','Dinner with a friend','EUR 72.00'],
 ['2025-10-24','Mensajería BCN','Catering delivery courier','EUR 65.00'],['2025-10-26','Mercat Permit Office','Food-market stall permit','EUR 40.00'],
 ['2025-10-28','Cocina Compartida','Kitchen/workspace security deposit','EUR 600.00'],['2025-10-30','Banc Barcelona','Business transaction fee','EUR 12.00']
];
function receiptPage(records,blur=false){
 const cols=2,rows=Math.ceil(records.length/cols),cw=690,ch=360,g=34,w=1450,h=rows*(ch+g)+130,c=createCanvas(w,h),x=c.getContext('2d');x.fillStyle='#e7e6e3';x.fillRect(0,0,w,h);x.fillStyle='#111';x.font='bold 34px Arial';x.fillText('TICKETS ET FACTURES — OCTOBRE 2025',35,50);
 records.forEach((r,i)=>{const col=i%cols,row=Math.floor(i/cols),left=25+col*(cw+g),top=85+row*(ch+g);x.fillStyle='#fff';x.fillRect(left,top,cw,ch);x.strokeStyle='#555';x.strokeRect(left+5,top+5,cw-10,ch-10);x.fillStyle='#111';x.font='bold 25px Arial';x.fillText('RECEIPT / INVOICE',left+25,top+45);x.font='20px Arial';x.fillText('Date: '+r[0],left+25,top+92);x.fillText('Vendor: '+r[1],left+25,top+137);x.fillText('Description: '+r[2],left+25,top+182,{maxWidth:cw-50});x.font='bold 24px Arial';x.fillText('TOTAL: '+r[3],left+25,top+245);if(blur&&i===0){x.fillStyle='rgba(240,240,240,.68)';x.fillRect(left+15,top+70,cw-30,215);x.fillStyle='#444';x.font='18px Arial';x.fillText('low-quality scan',left+28,top+310);}});
 return c.toBuffer('image/jpeg',{quality:blur?0.12:0.94});
}
const payroll=page('NÓMINA / RECIBO DE SALARIOS','CostaConnect SL — Octubre de 2025',[
 'Trabajadora: Ayşe Demir','Periodo de pago: octubre de 2025','Fecha de pago: 31/10/2025',
 'Salario base: 3.200,00 EUR','Complemento de rendimiento: 250,00 EUR','Salario bruto: 3.450,00 EUR',
 'Cotización a la Seguridad Social (trabajadora): 221,40 EUR','Retención IRPF: 517,50 EUR',
 'Reembolso de transporte: 50,00 EUR','Líquido transferido: 2.761,10 EUR','Transferencia bancaria efectuada el 31/10/2025'
]);
const duplicatePack=page('RECIBO','Pack&Go — 03/10/2025',['Food containers and packaging','Total: 85.00 EUR']);
const sales=[
 ['SALE-001','2025-10-02','Local customer','Cash','Turkish food order','EUR','180.00','PAID','',''],
 ['SALE-002','2025-10-04','Local customer','Card','Catering order','EUR','320.00','PAID','9.60','310.40'],
 ['SALE-003','2025-10-06','Local customer','Bank transfer','Catering','EUR','450.00','PAID','',''],
 ['SALE-004','2025-10-08','Customer in France','Bank transfer','Catering','EUR','600.00','PAID','',''],
 ['SALE-005','2025-10-10','Customer in United Kingdom','Invoice','Catering','GBP','500.00','PAID','2025-10-15',''],
 ['SALE-006','2025-10-12','Local customer','Cash','Food order','EUR','275.00','PAID','',''],
 ['SALE-007','2025-10-14','Local customer','Card','Catering','EUR','390.00','PAID','11.70','378.30'],
 ['SALE-008','2025-10-18','Local customer','Invoice','Catering','EUR','240.00','UNPAID_AT_MONTH_END','',''],
 ['SALE-009','2025-10-20','Local customer','Bank transfer','Food order','EUR','150.00','PAID','',''],
 ['REFUND-009','2025-10-25','Local customer','Refund','Full refund for SALE-009','EUR','150.00','REFUND','',''],
 ['SALE-010','2025-10-22','Local customer','Card','Catering','EUR','210.00','PAID','',''],
 ['CHARGEBACK-010','2025-10-29','Local customer','Chargeback','Chargeback for SALE-010','EUR','210.00','CHARGEBACK','15.00',''],
 ['SALE-011','2025-10-27','Local catering order','Bank transfer','Catering','EUR','520.00','PAID','',''],
 ['SALE-012','2025-10-30','Marketplace customer','Marketplace','Marketplace order gross','EUR','340.00','PAID','34.00','306.00']
];
const bank=[['2025-10-02','Transfer from own savings account','1000.00','EUR'],['2025-10-05','Family support from mother','500.00','EUR'],['2025-10-15','Personal loan received from friend','2000.00','EUR'],['2025-10-31','Loan principal repayment','-300.00','EUR'],['2025-10-13','Cash deposit from existing catering sales','400.00','EUR'],['2025-10-05','Card settlement 2025-10-04','310.40','EUR'],['2025-10-15','Card settlement 2025-10-14','378.30','EUR'],['2025-10-31','Payroll net transfer CostaConnect SL','2761.10','EUR'],['2025-10-06','Anadolu Gıda invoice payment','-18000','TRY']];
const processor=[['2025-10-04','Card sale gross','320.00','EUR','9.60','310.40'],['2025-10-14','Card sale gross','390.00','EUR','11.70','378.30'],['2025-10-22','Card sale gross','210.00','EUR','0.00','210.00'],['2025-10-29','Chargeback','-210.00','EUR','15.00','-225.00'],['2025-10-30','Marketplace order gross','340.00','EUR','34.00','306.00']];
const csv=(rows)=>rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n')+'\r\n';
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function zip(entries){const local=[],central=[];let offset=0;for(const [name,value]of Object.entries(entries)){const n=Buffer.from(name),d=Buffer.from(value),crc=crc32(d),lh=Buffer.alloc(30);lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt32LE(crc,14);lh.writeUInt32LE(d.length,18);lh.writeUInt32LE(d.length,22);lh.writeUInt16LE(n.length,26);local.push(lh,n,d);const ch=Buffer.alloc(46);ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt32LE(crc,16);ch.writeUInt32LE(d.length,20);ch.writeUInt32LE(d.length,24);ch.writeUInt16LE(n.length,28);ch.writeUInt32LE(offset,42);central.push(ch,n);offset+=lh.length+n.length+d.length;}const centralSize=central.reduce((n,b)=>n+b.length,0),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(Object.keys(entries).length,8);end.writeUInt16LE(Object.keys(entries).length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,...central,end]);}
const xlsxRows=[['transaction_id','date','vendor','description','currency','amount','type','payment_method','status','fee_or_payment_date','net_settlement'],...sales.map(r=>[r[0],r[1],r[2],r[4],r[5],r[6],'income',r[3],r[7],r[8],r[9]])];
const sheet=`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xlsxRows.map((row,ri)=>`<row r="${ri+1}">${row.map((v,ci)=>{let n=ci+1,col='';while(n){const rem=(n-1)%26;col=String.fromCharCode(65+rem)+col;n=Math.floor((n-1)/26);}return `<c r="${col}${ri+1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;}).join('')}</row>`).join('')}</sheetData></worksheet>`;
const xlsx=zip({'[Content_Types].xml':'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>','_rels/.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>','xl/workbook.xml':'<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sales October" sheetId="1" r:id="rId1"/></sheets></workbook>','xl/_rels/workbook.xml.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>','xl/worksheets/sheet1.xml':sheet});
const files={
 'ayse-payroll.jpg':payroll,
 'ayse-receipts-1.jpg':receiptPage(receiptLines.slice(0,8)),
 'ayse-receipts-2-blurry.jpg':receiptPage(receiptLines.slice(8),true),
 'ayse-packgo-duplicate.jpg':duplicatePack,
 'ayse-sales.xlsx':xlsx,
 'ayse-bank.csv':Buffer.from(csv([['date','description','amount','currency'],...bank]),'utf8'),
 'ayse-processor.csv':Buffer.from(csv([['date','description','amount','currency','feeAmount','netAmount'],...processor]),'utf8')
};
for(const [name,bytes]of Object.entries(files))fs.writeFileSync(path.join(out,name),bytes);
console.log(JSON.stringify({directory:out,documents:Object.keys(files),receiptObservations:receiptLines.length,salesObservations:sales.length,bankEvents:bank.length,processorEvents:processor.length}));
