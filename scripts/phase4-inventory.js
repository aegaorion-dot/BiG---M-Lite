'use strict';
// Read-only Git checks plus review artifacts; never stages, commits or pushes.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base='1be08511ff21079e6c2c8cc24fa953a94426561a';
function git(...args){return execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true}).trim();}
const corePaths=['src/domain','src/accounting','src/business','src/dashboard','src/tax/taxEngine.js','src/tax/dsl.js','src/tax/contracts.js','src/tax/contentRegistry.js','src/tax/treatyResolver.js','src/tax/facts.js','src/tax/determinationStore.js','src/tax/accountingBoundary.js','src/tax/legacyAdapter.js','src/fabric/governanceStore.js','src/fabric/candidates.js'];
const coreFiles=git('ls-tree','-r','--name-only',base,'--',...corePaths).split('\n').filter(Boolean);
const frozenCore=coreFiles.map(file=>({file,baselineBlob:git('rev-parse',base+':'+file),currentBlob:git('hash-object','--path='+file,file)}));
if(frozenCore.some(f=>f.baselineBlob!==f.currentBlob))throw Error('Frozen baseline core changed');
const research=path.join(root,'research/phase4-packs'),baseline={baselineCommit:base,branch:git('branch','--show-current'),mainCommit:git('rev-parse','main'),unchangedCoreFiles:frozenCore.length,frozenCore};
fs.writeFileSync(path.join(research,'baseline-lock.json'),JSON.stringify(baseline,null,2)+'\n');
const file=path.join(research,'file-changes.json');if(!fs.existsSync(file))fs.writeFileSync(file,'{}\n');
const changed=git('diff','--name-only',base,'--').split('\n'),created=git('ls-files','--others','--exclude-standard').split('\n'),files=[...new Set([...changed,...created].filter(Boolean))].sort();
fs.writeFileSync(file,JSON.stringify({baselineCommit:base,branch:baseline.branch,count:files.length,files},null,2)+'\n');
console.log(JSON.stringify({files:files.length,frozenCoreFiles:frozenCore.length,unchanged:true,mainCommit:baseline.mainCommit}));
