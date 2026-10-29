'use strict';
const {createHash}=require('node:crypto');
const REASON='THIRD_PARTY_CREDENTIAL_SHAPED_QUERY_PARAMETER';
const sensitive=name=>/^(?:key|api_key|apikey|token|access_token|secret|client_secret|session|session_token|sessionid|authorization|password|signature)$/i.test(name);
const digest=value=>createHash('sha256').update(value).digest('hex');
function sanitizeResearchUrl(input){
 const u=new URL(input),names=[];let changed=false;
 for(const name of [...u.searchParams.keys()])if(sensitive(name)){u.searchParams.delete(name);names.push(name);changed=true;}
 const fragment=new URLSearchParams(u.hash.slice(1));let fragmentChanged=false;
 for(const name of [...fragment.keys()])if(sensitive(name)){fragment.delete(name);names.push(name);changed=true;fragmentChanged=true;}
 if(fragmentChanged)u.hash=fragment.toString();
 const userInfo=Boolean(u.username||u.password);if(userInfo){u.username='';u.password='';changed=true;}
 if(!changed)return {url:input};
 return {url:u.href,credentialQueryParameterRedacted:names.length>0,...(userInfo?{credentialUserInfoRedacted:true}:{}),redactionReason:REASON,originalUrlSha256:digest(input)};
}
function sanitizeResearchText(input){
 return input.replace(/https?:\/\/[^\s"'<>\\]+/gi,value=>{
  try{const result=sanitizeResearchUrl(value.replace(/&amp;/gi,'&'));return result.redactionReason?result.url:value;}catch{return '[REDACTED_INVALID_RESEARCH_URL]';}
 }).replace(/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g,'[REDACTED_PRIVATE_KEY]')
 .replace(/\bBearer\s+[A-Za-z0-9_.~+\/-]{16,}=*/gi,'Bearer [REDACTED_CREDENTIAL]')
 .replace(/\b(?:AIza[0-9A-Za-z_-]{30,}|sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|(?:AKIA|ASIA)[A-Z0-9]{16}|EAA[A-Za-z0-9]{50,})\b/g,'[REDACTED_CREDENTIAL]');
}
function sanitizeResearchRecord(value){
 if(typeof value==='string')return sanitizeResearchText(value);
 if(Array.isArray(value))return value.map(sanitizeResearchRecord);
 if(!value||typeof value!=='object')return value;
 const result=Object.fromEntries(Object.entries(value).map(([key,v])=>[key,/^(?:api_key|apikey|token|access_token|client_secret|secret|password|session_token|authorization)$/i.test(key)&&typeof v==='string'&&v?'[REDACTED_CREDENTIAL]':sanitizeResearchRecord(v)]));
 if(typeof value.url==='string'&&/^https?:\/\//i.test(value.url)){const clean=sanitizeResearchUrl(value.url);if(clean.redactionReason)Object.assign(result,clean);}
 return result;
}
function sanitizeResearchBytes(bytes){
 if(!Buffer.isBuffer(bytes))throw Error('Research bytes required');
 const text=bytes.toString('utf8');let clean;
 let parsed,isJson=false;try{parsed=JSON.parse(text);isJson=true;}catch{/* Non-JSON text still passes URL/token redaction. */}
 if(isJson){const safe=sanitizeResearchRecord(parsed);clean=JSON.stringify(parsed)===JSON.stringify(safe)?text:JSON.stringify(safe,null,2)+'\n';}else clean=sanitizeResearchText(text);
 if(clean===text)return {bytes,redacted:false};
 if(!Buffer.from(text).equals(bytes)||bytes.includes(0)||bytes.subarray(0,5).toString()==='%PDF-'||bytes.subarray(0,2).toString()==='PK')throw Error('Credential-shaped binary research requires offline redaction before persistence');
 return {bytes:Buffer.from(clean),redacted:true,originalContentSha256:digest(bytes),redactionReason:REASON};
}
function assertPublicResearchUrl(input){if(sanitizeResearchUrl(input).redactionReason)throw Error('Credential-bearing research URL rejected before request');}
module.exports={sanitizeResearchUrl,sanitizeResearchText,sanitizeResearchRecord,sanitizeResearchBytes,assertPublicResearchUrl,REASON};
