'use strict';
const fs=require('node:fs');
// Small explicit loader: no interpolation, shell execution or credential logging.
function loadEnvironment(file){
 if(!fs.existsSync(file))return;
 for(const line of fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/)){
  const match=line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);if(!match||process.env[match[1]]!==undefined)continue;
  let value=match[2];if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);else value=value.replace(/\s+#.*$/,'');
  process.env[match[1]]=value;
 }
}
module.exports={loadEnvironment};
