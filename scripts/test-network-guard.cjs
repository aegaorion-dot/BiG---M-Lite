'use strict';
const original=globalThis.fetch;
globalThis.fetch=async function(input,options){
 const url=new URL(typeof input==='string'?input:input.url);
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Routine tests cannot access external networks: use a fixture');
 return original(input,options);
};
