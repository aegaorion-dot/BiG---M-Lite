'use strict';
// Offline trusted-local CLI. Review/confirmation are explicit human actions, never AI defaults.
const fs=require('node:fs'),path=require('node:path');
const {createTaxSystem,candidateTaxFacts,confirmTaxFacts}=require('../src/tax');
function flag(name){return process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);}
function read(file){if(!file)throw Error('JSON file path required');if(fs.statSync(file).size>1024*1024)throw Error('Input JSON exceeds limit');return JSON.parse(fs.readFileSync(file,'utf8'));}
function main(){
 const command=process.argv[2],state=path.resolve(flag('state')??'data/tax'),system=createTaxSystem({governancePath:path.join(state,'fabric.json'),determinationPath:path.join(state,'determinations.json')});let output;
 if(command==='catalog')output={kind:'GOVERNED_CANDIDATES_NOT_AUTOMATIC_APPROVAL',candidates:system.governance.list()};
 else if(command==='inspect'){
  const candidate=system.governance.get(process.argv[3]);if(!candidate)throw Error('Unknown candidate');
  const {reviewStage}=require('../src/tax/phase4Catalog');output={stage:reviewStage(candidate,system.registry),contentHash:candidate.contentHash??null,sourceHashes:[...new Set(candidate.provenance.map(p=>p.rawContentHash))].sort(),candidate,approvalInstructions:'After evidence review, use review with exact candidate ID, content hash, every source hash, human actor and reason. Research/treaty dossiers with incomplete coverage remain non-executable even after source review.'};
 }
 else if(command==='verify-sources'){const {loadPhase4Catalog,verifyPhase4Evidence}=require('../src/tax/phase4Catalog');output=verifyPhase4Evidence(loadPhase4Catalog());}
 else if(command==='questions')output=require('../src/tax/readiness').planTaxReadiness({registry:system.registry,request:read(process.argv[3]),snapshot:read(process.argv[4]),...(flag('profile-revision')?{profileRevision:Number(flag('profile-revision'))}:{})});
 else if(command==='review-proposal')output=require('../src/tax/readiness').taxReadinessProposal({registry:system.registry,request:read(process.argv[3]),snapshot:read(process.argv[4]),profileState:read(process.argv[5])});
 else if(command==='candidate-facts')output=candidateTaxFacts(read(process.argv[3]));
 else if(command==='confirm-facts')output=confirmTaxFacts(read(process.argv[3]),{decisionSource:'HUMAN',actor:flag('actor'),reviewedSnapshotHash:flag('snapshot-hash')});
 else if(command==='review'){
  const candidate=system.governance.get(process.argv[3]);if(!candidate||flag('content-hash')!==candidate.contentHash)throw Error('Exact current content hash required');
  output=system.governance.review(candidate.candidateId,{decisionSource:'HUMAN',actor:flag('actor'),decision:flag('decision')??'APPROVED',reason:flag('reason'),reviewedHashes:flag('source-hashes')?.split(',')});
 }else if(command==='determine')output=system.engine.determine(read(process.argv[3]),read(process.argv[4]));
 else if(command==='replay'){
  const record=system.determinations.get(process.argv[3],{scopeId:flag('scope'),subjectId:flag('subject')});if(!record)throw Error('Unknown scoped determination');output=system.engine.replay(record);
 }else throw Error('Commands: catalog, inspect, verify-sources, questions, review-proposal, candidate-facts, confirm-facts, review, determine, replay. All commands are offline.');
 const serialized=JSON.stringify(output,null,2)+'\n',file=flag('out');if(file){fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});fs.writeFileSync(file,serialized);console.log(JSON.stringify({outputFile:path.resolve(file),status:output.status??output.kind}));}else console.log(serialized);
}
if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={main};
