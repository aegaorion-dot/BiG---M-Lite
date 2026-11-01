'use strict';
const {Money,decimalsFor}=require('../domain/money');
const OPS=Object.freeze({ADD:[2,32],SUBTRACT:[2,2],MULTIPLY:[2,32],DIVIDE:[2,2],MIN:[2,32],MAX:[2,32],GT:[2,2],GTE:[2,2],LT:[2,2],LTE:[2,2],EQ:[2,2],AND:[2,32],OR:[2,32],NOT:[1,1],IF:[3,3],ROUND:[1,1]});
const NAME=/^[A-Z][A-Z0-9_]{0,79}$/;
function gcd(a,b){a=a<0n?-a:a;while(b){const r=a%b;a=b;b=r;}return a||1n;}
function rational(n,d=1n){if(d===0n)throw Error('Division by zero');if(String(n).length>512||String(d).length>512)throw Error('Numeric size limit');if(d<0n){n=-n;d=-d;}const g=gcd(n,d);return {n:n/g,d:d/g};}
function decimal(value){
 if(typeof value!=='string'||value.length>120||!/^[-+]?\d+(?:\.\d{1,18})?$/.test(value))throw Error('Exact decimal string required');
 const negative=value.startsWith('-'),parts=value.replace(/^[-+]/,'').split('.'),fraction=parts[1]??'';
 return rational(BigInt((parts[0]+fraction)||'0')*(negative?-1n:1n),10n**BigInt(fraction.length));
}
function numberValue(v){if(typeof v==='string')return decimal(v);if(v&&typeof v==='object'&&typeof v.numerator==='string'&&typeof v.denominator==='string'&&/^-?\d{1,120}$/.test(v.numerator)&&/^\d{1,120}$/.test(v.denominator))return rational(BigInt(v.numerator),BigInt(v.denominator));throw Error('Exact numeric input required');}
const encoded=v=>v&&typeof v==='object'&&typeof v.n==='bigint'?{numerator:String(v.n),denominator:String(v.d)}:v;
const cmp=(a,b)=>a.n*b.d-b.n*a.d;
function roundNumber(v,mode,precision){
 const scale=10n**BigInt(precision),negative=v.n<0n,absolute=negative?-v.n:v.n,product=absolute*scale,q=product/v.d,r=product%v.d;
 const increment=r!==0n&&(mode==='UP'||mode==='HALF_UP'&&r*2n>=v.d)?1n:0n;
 return rational((negative?-1n:1n)*(q+increment),scale);
}
function toMoney(v,currency,rounding){
 const decimals=decimalsFor(currency);if(!rounding||!['DOWN','UP','HALF_UP'].includes(rounding.mode)||!Number.isInteger(rounding.precision)||rounding.precision<0||rounding.precision>decimals)throw Error('Governed monetary rounding required');
 const scale=10n**BigInt(decimals),step=10n**BigInt(decimals-rounding.precision);
 const units=Money.fromMinor(v.n*scale,currency).multiplyRational(1n,v.d*step,rounding.mode);
 return units.multiplyRational(step,1n,rounding.mode);
}
function fromMoney(value,currency){
 if(!value||typeof value.amountMinor!=='string'||!/^[-]?\d{1,100}$/.test(value.amountMinor)||value.currency!==currency)throw Error('Money input must match calculation currency; no implicit FX');
 const money=Money.fromMinor(value.amountMinor,currency);return rational(money.amountMinor,10n**BigInt(money.decimals));
}
function typedInputs(declarations,facts,currency){const result={};for(const [name,type]of Object.entries(declarations)){const f=facts.get(name);if(!f)continue;if(f.type!==type)throw Error('Fact type mismatch: '+name);result[name]=type==='MONEY'?fromMoney(f.value,currency):type==='NUMBER'?numberValue(f.value):f.value;}return result;}
const typedParameters=rule=>Object.fromEntries(Object.entries(rule.parameters).map(([k,p])=>[k,p.valueType==='NUMBER'?numberValue(p.value):p.value]));
function assertJsonData(value){
 let count=0;function walk(v,depth){if(++count>30000||depth>48)throw Error('Data size/depth limit');if(v===null||typeof v==='boolean')return;if(typeof v==='string'){if(v.length>20000)throw Error('String limit');return;}if(typeof v==='number'&&Number.isSafeInteger(v))return;
  if(!v||typeof v!=='object'||(!Array.isArray(v)&&![Object.prototype,null].includes(Object.getPrototypeOf(v))))throw Error('Plain JSON data only');
  for(const [k,desc]of Object.entries(Object.getOwnPropertyDescriptors(v))){if(['__proto__','prototype','constructor'].includes(k)||!Object.hasOwn(desc,'value'))throw Error('Unsafe data property');if(k!=='length')walk(desc.value,depth+1);}
 }walk(value,0);
}
function validateAst(node,{inputs={},parameters={},expected=null}={}){
 assertJsonData(node);let count=0;
 function check(n,depth){
  if(++count>1024||depth>32||!n||Array.isArray(n)||typeof n!=='object')throw Error('Invalid/bounded AST required');
  if(n.op==='INPUT'||n.op==='PARAMETER'){
   const key=n.op==='INPUT'?'name':'code',table=n.op==='INPUT'?inputs:parameters;if(Object.keys(n).some(k=>!['op',key].includes(k))||!NAME.test(n[key]??'')||!Object.hasOwn(table,n[key]))throw Error('Undeclared AST reference');
   return table[n[key]];
  }
  if(n.op==='LITERAL'){
   if(Object.keys(n).some(k=>!['op','value','valueType'].includes(k)))throw Error('Unexpected AST property');
   if(n.valueType==='NUMBER'){numberValue(n.value);return 'NUMBER';}
   if(n.valueType==='BOOLEAN'&&typeof n.value==='boolean')return 'BOOLEAN';
   if(n.valueType==='STRING'&&typeof n.value==='string')return 'STRING';throw Error('Typed literal required');
  }
  if(!Object.hasOwn(OPS,n.op)||Object.keys(n).some(k=>!['op','args',...(n.op==='ROUND'?['rule']:[])].includes(k)))throw Error('AST operation/property not allowed');
  const bounds=OPS[n.op];if(!Array.isArray(n.args)||n.args.length<bounds[0]||n.args.length>bounds[1])throw Error('Invalid AST arity');
  const types=n.args.map(a=>check(a,depth+1));
  if(n.op==='IF'){if(types[0]!=='BOOLEAN'||types[1]!==types[2])throw Error('IF type mismatch');return types[1];}
  if(['AND','OR','NOT'].includes(n.op)){if(types.some(t=>t!=='BOOLEAN'))throw Error('Boolean operands required');return 'BOOLEAN';}
  if(n.op==='EQ'){if(types[0]!==types[1])throw Error('EQ type mismatch');return 'BOOLEAN';}
  if(types.some(t=>t!=='NUMBER'))throw Error('Numeric operands required');
  if(n.op==='ROUND'&&(!n.rule||Object.keys(n.rule).some(k=>!['mode','precision'].includes(k))||!['DOWN','UP','HALF_UP'].includes(n.rule.mode)||!Number.isInteger(n.rule.precision)||n.rule.precision<0||n.rule.precision>6))throw Error('Explicit bounded rounding rule required');
  return ['GT','GTE','LT','LTE'].includes(n.op)?'BOOLEAN':'NUMBER';
 }
 const result=check(node,0);if(expected&&result!==expected)throw Error('AST output type mismatch');return result;
}
function evaluateAst(ast,{inputs,parameters={},trace=[],label='expression'}={}){
 let budget=4096;
 function run(n,path){
  if(--budget<0||trace.length>=12000)throw Error('Execution budget exceeded');let result;
  if(n.op==='INPUT'){if(!Object.hasOwn(inputs,n.name)){const error=Error('Missing required fact: '+n.name);error.missingFact=n.name;throw error;}result=inputs[n.name];}
  else if(n.op==='PARAMETER')result=parameters[n.code];
  else if(n.op==='LITERAL')result=n.valueType==='NUMBER'?numberValue(n.value):n.value;
  else if(n.op==='IF'){const condition=run(n.args[0],path+'.0');if(typeof condition!=='boolean')throw Error('Boolean predicate required');result=run(n.args[condition?1:2],path+(condition?'.1':'.2'));}
  else if(n.op==='AND'||n.op==='OR'){
   result=n.op==='AND';for(let i=0;i<n.args.length;i++){const value=run(n.args[i],path+'.'+i);if(typeof value!=='boolean')throw Error('Boolean predicate required');result=value;if(n.op==='AND'&&!value||n.op==='OR'&&value)break;}
  }else{
   const a=n.args.map((v,i)=>run(v,path+'.'+i));
   switch(n.op){
    case 'ADD':result=a.reduce((x,y)=>rational(x.n*y.d+y.n*x.d,x.d*y.d));break;
    case 'SUBTRACT':result=rational(a[0].n*a[1].d-a[1].n*a[0].d,a[0].d*a[1].d);break;
    case 'MULTIPLY':result=a.reduce((x,y)=>rational(x.n*y.n,x.d*y.d));break;
    case 'DIVIDE':result=rational(a[0].n*a[1].d,a[0].d*a[1].n);break;
    case 'MIN':case 'MAX':result=a.reduce((x,y)=>(n.op==='MIN'?cmp(x,y)<=0:cmp(x,y)>=0)?x:y);break;
    case 'GT':result=cmp(a[0],a[1])>0n;break;case 'GTE':result=cmp(a[0],a[1])>=0n;break;case 'LT':result=cmp(a[0],a[1])<0n;break;case 'LTE':result=cmp(a[0],a[1])<=0n;break;
    case 'EQ':result=typeof a[0]==='object'?cmp(a[0],a[1])===0n:a[0]===a[1];break;
    case 'NOT':result=!a[0];break;case 'ROUND':result=roundNumber(a[0],n.rule.mode,n.rule.precision);break;
    default:throw Error('Unvalidated AST operation');
   }
  }
  if(result===undefined)throw Error('Missing executable input');trace.push({expression:label,path,op:n.op,result:encoded(result)});return result;
 }
 return run(ast,'root');
}
module.exports={OPS,NAME,rational,decimal,numberValue,encoded,fromMoney,toMoney,typedInputs,typedParameters,assertJsonData,validateAst,evaluateAst};
