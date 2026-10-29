(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BigmLocale=factory();})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const SUPPORTED=['en','id-ID','en-AU','en-SG','en-GB'];
 function canonical(tag){if(tag==='id')return 'id-ID';if(typeof tag!=='string'||tag.length>40)throw Error('Invalid locale');try{return Intl.getCanonicalLocales(tag)[0];}catch{throw Error('Invalid locale');}}
 function supported(tag){try{return SUPPORTED.includes(canonical(tag));}catch{return false;}}
 function base(tag){return canonical(tag).split('-')[0];}
 function money(minor,currency,locale='en',decimals=2){
  if(!/^-?\d+$/.test(String(minor))||!Number.isInteger(decimals)||decimals<0||decimals>6)throw Error('Invalid display money');locale=canonical(locale);
  const negative=String(minor).startsWith('-'),digits=String(minor).replace(/^-/,'').padStart(decimals+1,'0'),whole=decimals?digits.slice(0,-decimals):digits,fraction=decimals?digits.slice(-decimals):'';
  const integer=BigInt(whole),parts=new Intl.NumberFormat(locale,{style:'currency',currency,currencyDisplay:'code',minimumFractionDigits:0,maximumFractionDigits:0}).formatToParts(negative?-(integer||1n):integer);
  if(negative&&integer===0n)for(const p of parts)if(p.type==='integer')p.value='0';
  let last=-1;parts.forEach((p,i)=>{if(p.type==='integer')last=i;});if(fraction){const decimal=new Intl.NumberFormat(locale,{minimumFractionDigits:1}).formatToParts(1.1).find(p=>p.type==='decimal').value;parts[last].value+=decimal+fraction;}
  return parts.map(p=>p.value).join('').replace(/[\u00a0\u202f]/g,' ');
 }
 function date(value,locale='en'){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('Invalid date display');return new Intl.DateTimeFormat(canonical(locale),{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z'));}
 function region(code,locale='en'){return new Intl.DisplayNames([canonical(locale)],{type:'region'}).of(code);}
 function language(tag,locale='en'){return new Intl.DisplayNames([canonical(locale)],{type:'language'}).of(canonical(tag));}
 function plural(count,locale='en'){return new Intl.PluralRules(canonical(locale)).select(count);}
 return {SUPPORTED,canonical,supported,base,money,date,region,language,plural};
});
