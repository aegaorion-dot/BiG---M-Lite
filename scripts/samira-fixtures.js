'use strict';
// Synthetic Samira source documents only. Runtime extraction happens in BiG-M.
const fs=require('node:fs'),path=require('node:path');
const {createCanvas}=require('@napi-rs/canvas');
const out=path.resolve(__dirname,'../test/fixtures/samira-france');fs.mkdirSync(out,{recursive:true});
const sales=[
 ['SALE-001','2025-10-03','Nadia B.','Boîte de pâtisseries marocaines','95.00','espèces','payée'],
 ['SALE-002','2025-10-05','Famille Karim','Commande pâtisseries anniversaire','180.00','virement','payée'],
 ['SALE-003','2025-10-09','Association Atlas Lyon','Traiteur événement','350.00','virement','payée'],
 ['SALE-004','2025-10-12','Commandes à domicile','Ventes assorties pâtisseries','210.00','espèces','payée'],
 ['SALE-005','2025-10-16','Leila M.','Plateaux pâtisseries','145.00','application de paiement','payée'],
 ['SALE-006','2025-10-19','Groupe Amal','Traiteur événement familial','420.00','virement','payée'],
 ['SALE-007','2025-10-23','Commandes à domicile','Ventes assorties pâtisseries','170.00','espèces','payée'],
 ['SALE-008','2025-10-26','Youssef A.','Commande pâtisseries fiançailles','260.00','application de paiement','payée'],
 ['SALE-009','2025-10-29','Hana K.','Commande traiteur','120.00','facture non réglée','impayée fin de mois'],
 ['SALE-010','2025-10-31','Commandes du quartier','Ventes assorties pâtisseries','140.00','espèces','payée']
];
const headers=['transaction_id','date','vendor','description','currency','amount','type','payment','status'];
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function crc32(b){let c=0xffffffff;for(const x of b){c^=x;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function zip(entries){const locals=[],centrals=[];let offset=0;for(const [name,value]of Object.entries(entries)){const n=Buffer.from(name),d=Buffer.from(value),crc=crc32(d),lh=Buffer.alloc(30);lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt16LE(0,6);lh.writeUInt16LE(0,8);lh.writeUInt32LE(crc,14);lh.writeUInt32LE(d.length,18);lh.writeUInt32LE(d.length,22);lh.writeUInt16LE(n.length,26);locals.push(lh,n,d);const ch=Buffer.alloc(46);ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(0,8);ch.writeUInt16LE(0,10);ch.writeUInt32LE(crc,16);ch.writeUInt32LE(d.length,20);ch.writeUInt32LE(d.length,24);ch.writeUInt16LE(n.length,28);ch.writeUInt32LE(offset,42);centrals.push(ch,n);offset+=lh.length+n.length+d.length;}const centralSize=centrals.reduce((n,b)=>n+b.length,0),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(Object.keys(entries).length,8);end.writeUInt16LE(Object.keys(entries).length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,...centrals,end]);}
const rows=[headers,...sales.map(([id,date,customer,description,amount,payment,status])=>[id,date,customer,description,'EUR',amount,'income',payment,status])];
const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row,ri)=>`<row r="${ri+1}">${row.map((v,ci)=>{let n=ci+1,col='';while(n){let rem=(n-1)%26;col=String.fromCharCode(65+rem)+col;n=Math.floor((n-1)/26);}return `<c r="${col}${ri+1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;}).join('')}</row>`).join('')}</sheetData></worksheet>`;
const workbook={
 '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
 '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Ventes octobre" sheetId="1" r:id="rId1"/></sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
 'xl/worksheets/sheet1.xml':sheet
};
fs.writeFileSync(path.join(out,'samira_october_2025_sales.xlsx'),zip(workbook));

function page(title,subtitle,lines,{width=1650,height=2300}={}){const c=createCanvas(width,height),x=c.getContext('2d');x.fillStyle='#f2f0eb';x.fillRect(0,0,width,height);x.fillStyle='#fff';x.fillRect(65,65,width-130,height-130);x.strokeStyle='#333';x.lineWidth=3;x.strokeRect(75,75,width-150,height-150);x.fillStyle='#17212b';x.font='bold 50px Arial';x.fillText(title,125,175);x.font='26px Arial';x.fillText(subtitle,125,225);x.strokeStyle='#888';x.lineWidth=2;x.beginPath();x.moveTo(125,260);x.lineTo(width-125,260);x.stroke();let y=330;for(const line of lines){x.fillStyle='#111';x.font=line.bold?'bold 32px Arial':'30px Arial';x.fillText(line.text,130,y);y+=line.gap??68;}return c.toBuffer('image/jpeg',{quality:0.94});}
const payLines=[
 {text:'Employeur : RhoneLogistique SAS',bold:true},{text:'Salariée : Samira El Amrani'},{text:'Période de paie : Octobre 2025'},{text:'Date de paiement : 31 octobre 2025'},
 {text:'RÉMUNÉRATION',bold:true,gap:78},{text:'Salaire de base : EUR 2 650,00'},{text:'Prime : EUR 180,00'},{text:'Salaire brut : EUR 2 830,00',bold:true},
 {text:'COTISATIONS ET IMPÔT',bold:true,gap:78},{text:'Cotisations salariales : EUR 612,40'},{text:'Prélèvement à la source : EUR 168,75'},{text:'Remboursement transport employeur : EUR 42,00'},
 {text:'NET À PAYER',bold:true,gap:90},{text:'Net versé : EUR 2 090,85',bold:true},{text:'Virement bancaire effectué le 31/10/2025'}
];
fs.writeFileSync(path.join(out,'samira_october_2025_bulletin.jpg'),page('BULLETIN DE PAIE','Document de paie — exemplaire synthétique — Octobre 2025',payLines));
const receipts=[
 ['2025-10-02','Carrefour','Farine, beurre, sucre, chocolat, amandes','EUR 86.40'],
 ['2025-10-04','EmbalPro Lyon','Boîtes à pâtisserie et emballages alimentaires','EUR 38.50'],
 ['2025-10-07','Carrefour','Courses maison et ingrédients de pâtisserie','EUR 145.20'],
 ['2025-10-10','TotalEnergies','Carburant — déplacements personnels et livraisons','EUR 72.00'],
 ['2025-10-11','Boulanger','Robot pâtissier — modèle sur socle','EUR 239.00'],
 ['2025-10-14','EDF','Électricité du logement','EUR 112.00'],
 ['2025-10-17','Metro France','Farine, beurre, chocolat, contenants alimentaires','EUR 126.80'],
 ['2025-10-21','Orange','Téléphone mobile — usage personnel et commandes','EUR 39.99'],
 ['2025-10-24','Restaurant Le Sud','Dîner avec ma sœur','EUR 68.00'],
 ['2025-10-28','Darty','Petit four électrique — production de pâtisseries','EUR 479.00'],
 ['2025-10-30','EmbalPro Lyon','Boîtes et étiquettes','EUR 41.60']
];
const W=1350,cardW=1220,cardH=405,gap=50,cols=1,rowsN=receipts.length,canvas=createCanvas(W,rowsN*(cardH+gap)+100),ctx=canvas.getContext('2d');ctx.fillStyle='#e7e5e1';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#111';ctx.font='bold 42px Arial';ctx.fillText('REÇUS ET FACTURES — OCTOBRE 2025',70,65);
receipts.forEach(([date,vendor,desc,amount],i)=>{const col=i%cols,row=Math.floor(i/cols),x=60+col*(cardW+gap),y=105+row*(cardH+gap);ctx.fillStyle='#fff';ctx.fillRect(x,y,cardW,cardH);ctx.strokeStyle='#444';ctx.lineWidth=3;ctx.strokeRect(x+8,y+8,cardW-16,cardH-16);ctx.fillStyle='#101820';ctx.font='bold 34px Arial';ctx.fillText('TICKET / FACTURE',x+40,y+62);ctx.font='29px Arial';ctx.fillText(`Date : ${date}`,x+40,y+128);ctx.fillText(`Commerçant : ${vendor}`,x+40,y+190);ctx.fillText(`Description :`,x+40,y+260);wrapText(ctx,desc,x+40,y+305,cardW-80,38);ctx.font='bold 34px Arial';ctx.fillText(`TOTAL TTC : ${amount}`,x+40,y+370);});
function wrapText(c,text,x,y,max,lineH){const words=text.split(' ');let s='';for(const w of words){const next=s?s+' '+w:w;if(c.measureText(next).width>max&&s){c.fillText(s,x,y);y+=lineH;s=w;}else s=next;}if(s)c.fillText(s,x,y);}
fs.writeFileSync(path.join(out,'samira_october_2025_receipts.jpg'),canvas.toBuffer('image/jpeg',{quality:0.96}));
console.log(JSON.stringify({directory:out,workbook:path.join(out,'samira_october_2025_sales.xlsx'),payroll:path.join(out,'samira_october_2025_bulletin.jpg'),receipts:path.join(out,'samira_october_2025_receipts.jpg'),salesRows:sales.length,receiptRegions:receipts.length}));
