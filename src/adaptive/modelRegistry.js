'use strict';
const fs=require('node:fs'),{fingerprint}=require('../onboarding/canonical');
const {safeData}=require('./contracts');
const STATES=['CANDIDATE','EVALUATED','APPROVED','REJECTED','ACTIVE','RETIRED'];
class ModelRegistry{
 constructor(file=null){this.file=file;this.models=file&&fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];for(const m of this.models)if(!STATES.includes(m.state))throw Error('Invalid model registry state');}
 save(){if(this.file)fs.writeFileSync(this.file,JSON.stringify(this.models,null,2)+'\n');}
 register(record){safeData(record);if(record.name!=='Muse-BiG-M Regulatory v0.1'||!record.datasetHash||!record.baseModel)throw Error('Only the governed regulatory specialist is in scope');if(this.models.some(m=>m.name===record.name))return this.models.find(m=>m.name===record.name);const model={...record,state:'CANDIDATE',active:false,trainingStatus:record.trainingStatus??'NOT_SUBMITTED',providerModelId:record.providerModelId??null,history:[]};this.models.push(model);this.save();return model;}
 evaluate(name,report){const m=this.models.find(x=>x.name===name);if(!m||m.state!=='CANDIDATE'||m.trainingStatus!=='SUCCEEDED'||!m.providerModelId||report.status!=='MEASURED_RETROSPECTIVE_COMPARISON')throw Error('Real trained model and matched measured evaluation required');m.state='EVALUATED';m.evaluationHash=fingerprint(report);m.improved=report.overallImproved;m.history.push({decision:'EVALUATED',reportHash:m.evaluationHash});this.save();return m;}
 review(name,{decision,actor,decisionSource,evaluationHash}){const m=this.models.find(x=>x.name===name);if(!m||m.state!=='EVALUATED'||!['APPROVED','REJECTED'].includes(decision)||decisionSource!=='HUMAN'||!actor||/^(?:muse|meta|ai|model|system)(?:$|[ :_-])/i.test(actor)||evaluationHash!==m.evaluationHash||decision==='APPROVED'&&!m.improved)throw Error('Independent explicit review of measured improvement required');m.state=decision;m.history.push({decision,actor,decisionSource,evaluationHash});this.save();return m;}
 activate(name,{actor,decisionSource,explicitActivation}={}){const m=this.models.find(x=>x.name===name);if(!m||m.state!=='APPROVED'||decisionSource!=='HUMAN'||!actor||explicitActivation!==true)throw Error('Separate explicit activation required');m.state='ACTIVE';m.active=true;this.save();return m;}
 retire(name,{actor,decisionSource}={}){const m=this.models.find(x=>x.name===name);if(!m||decisionSource!=='HUMAN'||!actor||m.state==='RETIRED')throw Error('Explicit retirement required');m.state='RETIRED';m.active=false;this.save();return m;}
}
module.exports={STATES,ModelRegistry};
