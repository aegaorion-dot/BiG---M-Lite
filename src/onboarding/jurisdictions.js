'use strict';
const { isKnownJurisdiction } = require('../global/jurisdictions');
const { verifyQuote } = require('./evidence');
const BASES=Object.freeze(['ACCOUNT_LOCATION','INCORPORATION','TAX_RESIDENCE','SOURCE','REGISTRATION','BUSINESS_WORK_LOCATION','CUSTOMER_LOCATION','WITHHOLDING','POSSIBLE_PE']);
const COUNTRIES=[
  ['ID',/\b(?:Indonesia|Indonesian|Bali|Bandung|Jakarta|Yogyakarta)\b/gi],
  ['SG',/\b(?:Singapore|Singapura|Singaporean)\b/gi],
  ['US',/\b(?:united states|america|amerika|usa|u\.s\.a?\.?)\b/gi],
  ['US',/\bUS\b/g],
  ['AU',/\b(?:Australia|Australian)\b/gi],
  ['GB',/\b(?:United Kingdom|Britain|British|Inggris|UK)\b/gi],
];
function countryMentions(text) {
  const out=[]; for(const [code,re] of COUNTRIES) { const r=new RegExp(re.source,re.flags);for(const m of text.matchAll(r))out.push({code,index:m.index,text:m[0]}); }
  return out.sort((a,b)=>a.index-b.index);
}
function blankJurisdictionState(){return {candidates:[]};}
function addJurisdictionCandidate(state,f,userText=''){
  const cc=f.countryCode==null?null:String(f.countryCode).toUpperCase(),errors=[];
  if(!BASES.includes(f.basis))errors.push('unknown jurisdiction basis');
  if(cc&&!isKnownJurisdiction(cc))errors.push('unknown country');
  if(f.status&&!['CANDIDATE','UNKNOWN','REJECTED'].includes(f.status))errors.push('jurisdiction must remain candidate-only');
  if(cc&&!verifyQuote(f.supportingQuote,userText))errors.push('verbatim supportingQuote required');
  if(errors.length)return {ok:false,errors};
  const candidates=(state?.candidates??[]).filter(x=>!(x.basis===f.basis&&x.countryCode===cc));
  candidates.push({...f,countryCode:cc,status:cc?(f.status??'CANDIDATE'):'UNKNOWN',source:'USER'});
  return {ok:true,state:{candidates}};
}
function getBasis(state,basis){return (state?.candidates??[]).find(c=>c.basis===basis&&c.status!=='REJECTED')??null;}
// The local clause determines the role. A bare country never writes registration.
function extractJurisdictionCandidates(text) {
  const result=[],clauses=String(text??'').split(/(?<=[.!?;])\s+|,\s*|\s+(?:and|but|dan|tetapi)\s+/i);
  for(const clause of clauses){
    const t=clause.trim();if(!t||/\b(?:maybe|perhaps|not sure|unsure|mungkin|belum tahu|tidak yakin)\b/i.test(t))continue;
    const mentions=countryMentions(t);if(!mentions.length)continue;
    let basis=null;
    if(/\b(?:bank|bank account|rekening)\b/i.test(t))basis='ACCOUNT_LOCATION';
    else if(/\b(?:customers?|clients?|pelanggan|klien)\b/i.test(t))basis='CUSTOMER_LOCATION';
    else if(/\b(?:registered|registration|terdaftar|pendaftaran)\b/i.test(t))basis='REGISTRATION';
    else if(/\b(?:incorporated|incorporation|didirikan|badan hukum)\b/i.test(t))basis='INCORPORATION';
    else if(/\b(?:tax resident|tax residence|residen pajak|domisili pajak)\b/i.test(t))basis='TAX_RESIDENCE';
    else if(/\b(?:withholding|potong pajak|pemotongan)\b/i.test(t))basis='WITHHOLDING';
    else if(/\b(?:permanent establishment|possible pe|bentuk usaha tetap)\b/i.test(t))basis='POSSIBLE_PE';
    else if(/\b(?:source income|income sourced|penghasilan bersumber)\b/i.test(t))basis='SOURCE';
    else if(/\b(?:run|operate|operating|work|working|based|coffee shop|cafe|warung|usaha|bisnis|perusahaan|perdagangan|company|shop|bekerja|operasi|beroperasi)\b/i.test(t)
      && /\b(?:in|di|from|dari|based)\b/i.test(t))basis='BUSINESS_WORK_LOCATION';
    if(!basis)continue;
    const negative=/\b(?:not|never|no longer|belum|tidak|bukan)\b/i.test(t);
    for(const m of mentions){
      if(/(?:Indonesian|Singapore|Australian|US)/i.test(m.text)&&/^\s+(?:rupiah|dollars?|language)\b/i.test(t.slice(m.index+m.text.length)))continue;
      if(basis==='CUSTOMER_LOCATION'&&!/\b(?:in|from|di|dari)\s+(?:the\s+)?$/i.test(t.slice(0,m.index))&&!/^\s+(?:clients?|customers?|pelanggan|klien)\b/i.test(t.slice(m.index+m.text.length)))continue;
      if(basis==='BUSINESS_WORK_LOCATION'&&!/\b(?:in|di|from|dari)\s+(?:the\s+)?$/i.test(t.slice(0,m.index)))continue;
      result.push({basis,countryCode:m.code,supportingQuote:t.slice(0,200),source:'USER',status:negative?'REJECTED':'CANDIDATE'});
    }
  }
  return result;
}
module.exports={BASES,COUNTRIES,countryMentions,blankJurisdictionState,addJurisdictionCandidate,getBasis,extractJurisdictionCandidates};
