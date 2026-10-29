'use strict';
// Complete source text stays in the trace. Context contains bounded, whole
// citation options; it never truncates an option into a different quotation.
function citationIndex(readings,budget=8000){
 const index=readings.map(({text,citationOptions,...p})=>({...p,citationOptions:[]})),reverse=[...readings.keys()].reverse();let used=0;
 for(let round=0;round<8;round++)for(const i of reverse){const option=readings[i].citationOptions?.[round];if(option&&used+option.quote.length<=budget){index[i].citationOptions.push(option);used+=option.quote.length;}}
 return index;
}
function compactFacts(value){if(Array.isArray(value))return value.map(compactFacts);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.entries(value).filter(([k])=>k!=='supportingQuote').map(([k,v])=>[k,compactFacts(v)]));}
function boundedResearchUser(input,system){
 const {readings,...base}=input;let budget=8000,user;
 do{user=JSON.stringify({...base,brief:{...base.brief,confirmedFacts:compactFacts(base.brief.confirmedFacts),factProvenance:'Full original supporting quotes retained under briefHash in the sanitized research trace.'},readPassageIndex:citationIndex(readings,budget)});if(user.length+system.length<=48000)return user;budget-=1000;}while(budget>=2000);
 throw Error('Bounded research context requires narrower passage selection');
}
module.exports={citationIndex,boundedResearchUser};
