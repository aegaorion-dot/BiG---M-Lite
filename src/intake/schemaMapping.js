'use strict';
// CSV schema discovery: Muse proposes a column mapping for an unknown export,
// the engine validates it deterministically, and the user approves it in the UI.
// No accounting rules live here; rows become ordinary intake candidates.
const {isKnownCurrency}=require('../global/currencies');
const {fingerprint}=require('../onboarding/canonical');

const TARGETS=Object.freeze(['date','description','counterparty','reference','amount','amountIn','amountOut','currency','direction','sourceRowId','settlement','account','category']);
const BLOCKING=Object.freeze(['DATE_INVALID','AMOUNT_MISSING','AMOUNT_AMBIGUOUS','CURRENCY_UNSUPPORTED','DIRECTION_UNKNOWN']);
const SYNONYMS=Object.freeze({
 date:[/^date$/i,/^(posting|posted|transaction|value|entry|book|txn)_?date$/i,/date$/i,/^tanggal$/i],
 description:[/^description$/i,/desc/i,/narrative/i,/detail/i,/memo/i,/particular/i,/keterangan/i,/remark/i],
 counterparty:[/counter_?part/i,/^payee$/i,/merchant/i,/vendor/i,/customer/i,/supplier/i,/^party$/i,/name$/i],
 reference:[/^reference$/i,/ref(erence)?_?(no|id|number)?$/i,/invoice/i,/document/i,/voucher/i],
 amount:[/^amount$/i,/^value$/i,/^total$/i,/^nominal$/i,/^gross$/i,/^net$/i,/amount$/i],
 amountIn:[/money_?in/i,/^credit$/i,/inflow/i,/^deposit$/i,/credit_?amount/i,/masuk/i],
 amountOut:[/money_?out/i,/^debit$/i,/outflow/i,/^withdrawal$/i,/debit_?amount/i,/keluar/i],
 currency:[/currency/i,/^ccy$/i,/mata_?uang/i],
 direction:[/direction/i,/dr_?cr/i,/in_?out/i],
 sourceRowId:[/row_?id/i,/^statement_?row/i,/record_?id/i,/line_?id/i,/^id$/i],
 settlement:[/status/i,/settle/i],
 account:[/account/i,/rekening/i,/wallet/i],
 category:[/category/i,/kategori/i,/^class$/i],
});

function text(value,max=300){const s=String(value??'').trim();return s.length>max?s.slice(0,max):s;}
function headerList(headers){return [...new Set((headers??[]).map(h=>text(h,100)).filter(Boolean))];}

function findColumn(list,patterns,exclude=null){
 return list.find(h=>(!exclude||!exclude.test(h))&&patterns.some(p=>p.test(h)));
}

function heuristicMapping(headers){
 const list=headerList(headers),columns={},notes=[];
 const EXCLUDE={settlement:/amount|jpy|currency|original|date/i,account:/guess|category|type|name/i,description:/type|status|guess|currency|amount/i,reference:/date|amount|currency/i};
 for(const target of TARGETS){
  const patterns=SYNONYMS[target]??[],column=findColumn(list,patterns,EXCLUDE[target]??null);
  if(column)columns[target]=column;
 }
 if(columns.amount&&(columns.amountIn||columns.amountOut)){delete columns.amount;notes.push('Single amount column ignored because in/out columns are present.');}
 if(!columns.amount&&!columns.amountIn&&!columns.amountOut){
  const inCol=findColumn(list,[/money_?in/i,/credit/i,/deposit/i,/masuk/i],/date|currency/i),outCol=findColumn(list,[/money_?out/i,/debit/i,/withdrawal/i,/keluar/i],/date|currency/i);
  if(inCol&&outCol){columns.amountIn=inCol;columns.amountOut=outCol;notes.push('In/out columns inferred from header wording.');}
 }
 if(!columns.sourceRowId)columns.sourceRowId=null;
 return {version:1,columns,currencyDefault:null,source:'HEURISTIC',confidence:null,notes};
}

function validateMapping(mapping,headers){
 const list=headerList(headers),columns=mapping?.columns??{},issues=[];
 for(const [target,column] of Object.entries(columns)){
  if(column==null)continue;
  if(!list.includes(column))issues.push({code:'UNKNOWN_COLUMN',target,column});
 }
 const has=target=>typeof columns[target]==='string'&&list.includes(columns[target]);
 if(!has('date'))issues.push({code:'MISSING_DATE_COLUMN',target:'date'});
 if(!has('description')&&!has('counterparty'))issues.push({code:'MISSING_DESCRIPTION_COLUMN',target:'description'});
 if(!has('amount')&&!(has('amountIn')||has('amountOut')))issues.push({code:'MISSING_AMOUNT_COLUMN',target:'amount'});
 if(has('amount')&&(has('amountIn')||has('amountOut')))issues.push({code:'AMBIGUOUS_AMOUNT_MODE',target:'amount'});
 return {ok:issues.length===0,issues};
}

function schemaHash({headers,mapping}){
 return fingerprint({headers:headerList(headers),columns:Object.fromEntries(Object.entries(mapping?.columns??{}).filter(([,v])=>v!=null))});
}

function amountOf(raw){
 const s=String(raw??'').trim().replace(/\s|,/g,'').replace(/^\((.*)\)$/,'-$1');
 if(!s||!/-?\d+(\.\d{1,4})?/.test(s))return null;
 if(!/^-?\d+(\.\d{1,4})?$/.test(s))return null;
 return s;
}

function isIsoDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const [y,m,d]=value.split('-').map(Number),probe=new Date(Date.UTC(y,m-1,d));
 return probe.getUTCFullYear()===y&&probe.getUTCMonth()===m-1&&probe.getUTCDate()===d;
}

function directionOf(raw){
 const s=String(raw??'').trim().toUpperCase();
 if(!s)return null;
 if(['IN','CR','CREDIT','INFLOW','DEPOSIT','RECEIPT','MASUK'].includes(s))return 'IN';
 if(['OUT','DR','DEBIT','OUTFLOW','WITHDRAWAL','PAYMENT','KELUAR'].includes(s))return 'OUT';
 return null;
}

function normalizeRows({headers,rows,mapping,functionalCurrency}){
 const list=headerList(headers),index=new Map(list.map((h,i)=>[h,i])),columns=mapping?.columns??{};
 const value=(row,target)=>{const column=columns[target];if(!column||!index.has(column))return '';return text(row[index.get(column)],500);};
 const defaultCurrency=text(mapping?.currencyDefault||functionalCurrency||'JPY',12).toUpperCase();
 const out=[],issues=[],duplicates=[],seenIds=new Map(),seenContent=new Map();
 let valid=0,invalid=0,attention=0;

 for(let i=0;i<rows.length;i++){
  const row=rows[i]??[],rowNumber=i+2;
  const rowIssues=[],rawDate=value(row,'date'),rawDescription=value(row,'description'),rawCounterparty=value(row,'counterparty'),rawReference=value(row,'reference');
  const rawCurrency=value(row,'currency').toUpperCase(),currency=rawCurrency||defaultCurrency;
  const single=mapping?.columns?.amount?amountOf(value(row,'amount')):null;
  const amountIn=mapping?.columns?.amountIn?amountOf(value(row,'amountIn')):null;
  const amountOut=mapping?.columns?.amountOut?amountOf(value(row,'amountOut')):null;
  let amount=null,direction=directionOf(value(row,'direction'));

  if(mapping?.columns?.amountIn||mapping?.columns?.amountOut){
   const inn=amountIn&&Number(amountIn)!==0?amountIn:null,outg=amountOut&&Number(amountOut)!==0?amountOut:null;
   if(inn&&outg)rowIssues.push({code:'AMOUNT_AMBIGUOUS',detail:'Both in and out amounts are present'});
   else if(!inn&&!outg)rowIssues.push({code:'AMOUNT_MISSING',detail:'No in or out amount'});
   else{amount=inn??outg;direction=direction??(inn?'IN':'OUT');}
  }else if(single){
   amount=single;
   if(direction===null)direction=/^-/.test(single)?'OUT':'IN';
   amount=single.replace(/^-/,'');
  }else rowIssues.push({code:'AMOUNT_MISSING',detail:'Amount is missing or not numeric'});

  if(!direction&&amount)rowIssues.push({code:'DIRECTION_UNKNOWN',detail:'Direction could not be established'});
  if(!isIsoDate(rawDate))rowIssues.push({code:'DATE_INVALID',detail:'Date is not an unambiguous YYYY-MM-DD value'});
  if(!isKnownCurrency(currency))rowIssues.push({code:'CURRENCY_UNSUPPORTED',detail:'Unsupported currency '+currency});
  if(!rawDescription)rowIssues.push({code:'MISSING_DESCRIPTION',detail:'Description is empty',soft:true});
  if(!rawCounterparty)rowIssues.push({code:'MISSING_COUNTERPARTY',detail:'Counterparty is empty',soft:true});

  const sourceRowId=value(row,'sourceRowId')||('ROW-'+(i+1));
  const blocking=rowIssues.some(x=>BLOCKING.includes(x.code));
  let duplicateOf=null;
  if(!blocking){
   if(seenIds.has(sourceRowId))duplicateOf=seenIds.get(sourceRowId);
   else{
    const content=[rawDate,amount??'',currency,direction??'',rawReference||rawCounterparty].join('|').toUpperCase();
    if(rawReference&&seenContent.has(content))duplicateOf=seenContent.get(content);
    else{seenIds.set(sourceRowId,i+2);if(rawReference)seenContent.set(content,i+2);}
   }
  }
  if(duplicateOf!=null)duplicates.push({row:rowNumber,sourceRowId,duplicateOf});

  for(const issue of rowIssues){
   issues.push({row:rowNumber,sourceRowId,code:issue.code,detail:issue.detail});
   if(!issue.soft)attention++;
  }
  if(blocking)invalid++;else if(duplicateOf==null)valid++;

  out.push({
   rowNumber,sourceRowId,duplicateOf,
   blocking,
   normalized:blocking?null:{
    transactionDate:rawDate,
    description:rawDescription||rawCounterparty||rawReference||('Row '+rowNumber),
    counterparty:rawCounterparty||null,
    referenceNumber:rawReference||sourceRowId,
    amount:amount??null,
    currency,
    direction,
    settlementStatus:/^(PAID|SETTLED|COMPLETED|CLEARED)/i.test(value(row,'settlement'))?'PAID':'UNPAID',
    sourceAccount:value(row,'account')||null,
    categoryHint:value(row,'category')||null,
   },
   issues:rowIssues,
  });
 }
 const stats={rows:rows.length,valid,invalid,duplicates:duplicates.length,attention,unique:valid};
 return {rows:out,issues,duplicates,stats};
}

function applyColumnTargets(mapping,columnTargets,headers){
 const list=headerList(headers),columns={...mapping?.columns??{}};
 if(columnTargets&&typeof columnTargets==='object'){
  for(const [column,target] of Object.entries(columnTargets)){
   if(!list.includes(column))continue;
   for(const [key,value] of Object.entries(columns))if(value===column)delete columns[key];
   if(typeof target==='string'&&TARGETS.includes(target))columns[target]=column;
  }
 }
 return {...mapping,columns};
}

const TARGET_HELP=[
 {name:'date',hint:'Transaction date in YYYY-MM-DD form'},
 {name:'description',hint:'Narrative of the transaction'},
 {name:'counterparty',hint:'Customer, supplier, merchant or owner'},
 {name:'reference',hint:'Bank, invoice or processor reference used for matching'},
 {name:'amount',hint:'Single signed or absolute amount column'},
 {name:'amountIn',hint:'Money received column when in/out are separate'},
 {name:'amountOut',hint:'Money paid column when in/out are separate'},
 {name:'currency',hint:'ISO currency code when the export is multi-currency'},
 {name:'direction',hint:'IN/OUT, credit/debit or similar direction column'},
 {name:'sourceRowId',hint:'Stable source row identifier for audit and duplicate control'},
 {name:'settlement',hint:'Settlement status column'},
 {name:'account',hint:'Source account or wallet column'},
 {name:'category',hint:'Previous category label supplied by the client'},
];

async function museMapping({adapter,headers,sampleRows,functionalCurrency}){
 if(!adapter||typeof adapter._post!=='function')return {mapping:null,failure:'MUSE_UNAVAILABLE'};
 const list=headerList(headers).slice(0,30);
 const sample=(sampleRows??[]).slice(0,20).map(row=>row.slice(0,list.length).map(cell=>text(cell,120)));
 const system='You map accounting export columns to a canonical transaction schema. Use only header names that exist. Return JSON only; do not invent values, do not classify tax.';
 const user=JSON.stringify({
  task:'csv-schema-discovery',
  functionalCurrency,
  headers:list,
  sampleRows:sample,
  targetFields:TARGET_HELP,
  rules:[
   'Map a date column that yields ISO YYYY-MM-DD values.',
   'Prefer separate amountIn/amountOut columns over a single amount column when both exist.',
   'Map sourceRowId to the most stable unique row identifier.',
   'Set a target to null when no column fits; report it in ambiguities.',
  ],
 });
 const raw=await adapter._post('csv-schema-discovery',{system,user},{maxOutputTokens:1500});
 if(typeof raw==='string')return {mapping:JSON.parse(raw),failure:null};
 return {mapping:raw,failure:null};
}

function resolveColumn(value,list){
 const raw=Array.isArray(value)?value[0]:value;
 if(typeof raw!=='string')return null;
 const s=raw.trim();if(!s)return null;
 if(list.includes(s))return s;
 for(const token of s.split(/[^A-Za-z0-9_]+/).filter(Boolean))if(list.includes(token))return token;
 const lower=s.toLowerCase();
 return list.find(h=>lower.includes(h.toLowerCase()))??null;
}

function pickMuseColumns(raw){
 if(!raw||typeof raw!=='object')return null;
 const candidate=raw.columns??raw.mappings??raw.mapping??raw.columnMapping??raw.schema?.columns??null;
 if(!candidate||typeof candidate!=='object')return null;
 const list=raw.__headers??null;
 const out={};
 if(Array.isArray(candidate)){
  for(const entry of candidate){
   if(!entry||typeof entry!=='object')continue;
   const target=String(entry.target??entry.field??entry.canonical??'').trim();
   if(TARGETS.includes(target))out[target]=entry.column??entry.source??entry.header??null;
  }
  return out;
 }
 // column -> target shape (reverse of the canonical contract)
 const reversed=Object.entries(candidate).some(([k,v])=>typeof v==='string'&&TARGETS.includes(v.trim()))&&!Object.keys(candidate).some(k=>TARGETS.includes(k));
 for(const target of TARGETS){
  if(reversed){
   const hit=Object.entries(candidate).find(([,v])=>String(v).trim()===target);
   if(hit)out[target]=hit[0];
   continue;
  }
  const value=candidate[target];
  if(typeof value==='string')out[target]=value;
  else if(Array.isArray(value))out[target]=typeof value[0]==='string'?value[0]:null;
  else if(value&&typeof value==='object'){const column=value.column??value.sourceColumn??value.header??value.name;out[target]=typeof column==='string'?column:null;}
  else out[target]=null;
 }
 void list;
 return out;
}
function normalizeAmbiguities(raw){
 const list=raw?.ambiguities??raw?.notes??[];
 if(!Array.isArray(list))return [];
 return list.map(x=>typeof x==='string'?{target:'mapping',reason:x.slice(0,300)}:(x&&typeof x==='object'?{target:String(x.target??'mapping').slice(0,60),reason:String(x.reason??x.note??'').slice(0,300)}:null)).filter(Boolean);
}

async function discoverMapping({adapter,headers,sampleRows,functionalCurrency}){
 const heuristic=heuristicMapping(headers);
 let muse=null,failure=null;
 try{const result=await museMapping({adapter,headers,sampleRows,functionalCurrency});muse=result.mapping;failure=result.failure;}catch(e){failure=String(e.message).slice(0,200);}
 let mapping={version:1,columns:{...heuristic.columns},currencyDefault:functionalCurrency||null,source:failure?'HEURISTIC':'HEURISTIC',confidence:null,notes:[...heuristic.notes]};
 if(muse&&typeof muse==='object'){
  const proposed=pickMuseColumns(muse);
  if(proposed){
   const list=headerList(headers),clean={};
   for(const target of TARGETS){const column=resolveColumn(proposed[target],list);if(column&&list.includes(column))clean[target]=column;}
   if(Object.keys(clean).length){mapping.columns=clean;mapping.source='MUSE';mapping.confidence=Number.isFinite(muse.confidence)?muse.confidence:null;if(typeof muse.currencyDefault==='string'&&isKnownCurrency(muse.currencyDefault))mapping.currencyDefault=muse.currencyDefault;}
  }
 }
 const check=validateMapping(mapping,headers);
 if(!check.ok&&mapping.source==='MUSE'){
  const merged={...mapping.columns};for(const [k,v] of Object.entries(heuristic.columns))if(!(k in merged))merged[k]=v;
  mapping={...mapping,columns:merged,source:'MUSE_PLUS_HEURISTIC'};
 }
 const finalCheck=validateMapping(mapping,headers);
 const provenance={
  source:finalCheck.ok?mapping.source:(failure?'HEURISTIC_INCOMPLETE':'MAPPING_INCOMPLETE'),
  model:adapter?.model??null,
  failure,
  requestId:adapter?.lastRequest?.requestId??null,
  latencyMs:adapter?.lastRequest?.latencyMs??null,
  confidence:mapping.confidence??null,
  at:new Date().toISOString(),
  responseKeys:muse&&typeof muse==='object'?Object.keys(muse).slice(0,12):[],
 };
 return {mapping,provenance,ambiguities:[...finalCheck.issues,...normalizeAmbiguities(muse)]};
}

module.exports={TARGETS,BLOCKING,heuristicMapping,validateMapping,normalizeRows,applyColumnTargets,discoverMapping,schemaHash,isIsoDate,amountOf,museMapping};
