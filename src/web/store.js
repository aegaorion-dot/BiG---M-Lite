'use strict';
const fs=require('node:fs'),path=require('node:path');
const {Organization,FinancialPeriod,PeriodRegistry,assertDate}=require('../domain/organization');
const {Account,ChartOfAccounts}=require('../domain/chartOfAccounts');
const {JournalEntry,JournalLine}=require('../domain/journal');
const {Money}=require('../domain/money');
const {Ledger}=require('../domain/ledger');
const {AuditTrail,IdempotencyStore}=require('../domain/audit');
const {PostingService}=require('../accounting/postingService');
const {ReversalService}=require('../accounting/reversalService');
const {getSummary}=require('../dashboard/dashboard');
const {parseCsv}=require('../import/csvImporter');
const {createMuseRuntime}=require('../ai/museRuntime');
const {listJurisdictions}=require('../global/jurisdictions');
const {listCurrencies,isKnownCurrency}=require('../global/currencies');
const {supportedLanguages}=require('../i18n/languages');
const {t}=require('../i18n/strings');
const {SYSTEM_PROMPT,RESPONSE_SCHEMA,ALLOWED_MODULES,blankProfileState,validateExtractorPayload,applyFacts,gapAnalysis,planQuestion,planConfiguration,validateConfiguration,slotValue}=require('../onboarding/profiler');
const {detectSignals}=require('../onboarding/conversation');
const {fingerprint,deepFreeze}=require('../onboarding/canonical');
const {ContentRegistry,resolveCountryPacks,approveContent}=require('../countrypack/resolver');
const {proposeConfiguration,validateProposal}=require('../onboarding/configurator');
const {hashProposal:proposalHash,evaluateReadiness}=require('../onboarding/readiness');
const {blankIntakeState,createIntakeService}=require('../intake/service');
const clone=x=>JSON.parse(JSON.stringify(x));
function human(actor,decisionSource='HUMAN'){
 if(decisionSource!=='HUMAN'||typeof actor!=='string'||!actor.trim()||/^(ai|model|muse|meta|system)(?:$|[: -])/i.test(actor))throw Error('Explicit human confirmation required');
}
function createWebStore({persistPath=null,orgId=null,authToken=null,profileProvider=null,taxSystem=null,extractionProvider,semanticProvider,museRuntime=null}={}){
 const muse=museRuntime??createMuseRuntime();
 profileProvider??=muse.enabled?muse.profileProvider:null;semanticProvider??=muse.enabled?muse.semanticProvider:undefined;
 let museState={events:[],conversations:[],lastQuestion:null,discovery:null};
 const scopeOrgId=orgId??'org-contoh',requiredToken=authToken??process.env.BIGM_API_TOKEN??null;
 const periods=new PeriodRegistry(),ledger=new Ledger(),audit=new AuditTrail(),idempotency=new IdempotencyStore();
 const posting=new PostingService({ledger,periods,audit,idempotency}),reversal=new ReversalService({posting});
 const ctx={org:null,periods,ledger,audit,idempotency,posting,reversal,chart:null,pack:null,registry:null,modules:[],countryPackResolution:null};
 const contentRegistry=new ContentRegistry(),txMeta=new Map();
 const intakeState=blankIntakeState();
 let profileState=blankProfileState(),lastProposal=null,lastValidation=null,confirmation=null,activeConfig=null,history=[],packApprovals=[],proposalVersion=0;
 let lastTurn={providerConfigured:false,providerUsed:'fallback',model:null,fallbackReason:'PROVIDER_NOT_CONFIGURED'},aiCalls=0,aiSuccesses=0,migrationNotice=null;
 let turnQueue=Promise.resolve(),mutationQueue=Promise.resolve();
 let taxReviewContext=null,lastTaxProposal=null;
 function taxServices(){
  if(!taxSystem){const dir=persistPath?path.join(path.dirname(persistPath),'tax'):null;taxSystem=require('../tax').createTaxSystem({governancePath:dir?path.join(dir,'fabric.json'):null,determinationPath:dir?path.join(dir,'determinations.json'):null});}return taxSystem;
 }
 function profileFingerprint(){return fingerprint({slots:profileState.slots,jurisdictionFacts:profileState.jurisdictionFacts});}
 function taxReadiness(){
  if(!taxReviewContext)return null;
  const plan=require('../tax/readiness').planTaxReadiness({registry:taxServices().registry,request:taxReviewContext.request,snapshot:taxReviewContext.snapshot,profileRevision:profileState.revision});
  if(taxReviewContext.profileFingerprint!==profileFingerprint())return {...plan,status:'PROFILE_REVISION_CHANGED',questions:[],taxReady:false,proposalCurrent:false};
  return {...plan,proposalCurrent:lastTaxProposal?require('../tax/readiness').isTaxProposalCurrent(lastTaxProposal,{registry:taxServices().registry,...taxReviewContext,profileState}):false};
 }
 function beginTaxReview(request){
  checkOrg(request.scopeId);require('../tax/contracts').validateCalculationRequest(request);
  const {profileTaxFactCandidates,candidateTaxFacts}=require('../tax/facts');
  const initial=profileTaxFactCandidates(profileState,request),snapshot=candidateTaxFacts({...initial,facts:[...initial.facts,{name:'INCOME_TYPE',type:'STRING',value:request.incomeOrEventType,evidenceReference:'Explicit tax-review event selection: '+request.incomeOrEventType}]});
  const before={taxReviewContext,lastTaxProposal};taxReviewContext={request:clone(request),snapshot,profileFingerprint:profileFingerprint()};lastTaxProposal=null;
  try{const plan=taxReadiness();persist();return plan;}catch(e){({taxReviewContext,lastTaxProposal}=before);throw e;}
 }
 function answerTaxReview({answers,userText}){
  if(!taxReviewContext||taxReadiness().status==='PROFILE_REVISION_CHANGED')throw Error('Start or refresh the tax-review context first');
  const snapshot=require('../tax/readiness').acceptTaxFactCandidates({registry:taxServices().registry,...taxReviewContext,answers,userText,profileRevision:profileState.revision});
  const before={taxReviewContext,lastTaxProposal};taxReviewContext={...taxReviewContext,snapshot};lastTaxProposal=null;
  try{persist();return taxReadiness();}catch(e){({taxReviewContext,lastTaxProposal}=before);throw e;}
 }
 function proposeTaxReview(){
  if(!taxReviewContext||taxReadiness().status==='PROFILE_REVISION_CHANGED')throw Error('Current tax review required');
  const before=lastTaxProposal;lastTaxProposal=require('../tax/readiness').taxReadinessProposal({registry:taxServices().registry,...taxReviewContext,profileState});
  try{persist();return lastTaxProposal;}catch(e){lastTaxProposal=before;throw e;}
 }
 function serializeMutation(work){const next=mutationQueue.then(work);mutationQueue=next.catch(()=>{});return next;}
 function checkAuth(token){if(requiredToken&&token!==requiredToken)throw Error('Unauthorized: invalid API token');}
 function checkOrg(id){if(!id)throw Error('orgId is required');if(id!==scopeOrgId)throw Error('Unknown org scope: '+id);}
 function requireActive(module=null){if(!activeConfig)throw Error('Workspace activation required');if(module&&!activeConfig.proposal.modules.includes(module))throw Error('Module is not enabled: '+module);}
 function bookkeepingTemplate(config){
  const jurisdiction=config.domicile??'ZZ',prefix=jurisdiction==='ID'?'id':jurisdiction==='SG'?'sg':'book';
  const chart=new ChartOfAccounts();
  const definitions=[['cash','101','Cash / bank','ASSET'],['receivable','102','Receivables','ASSET'],['payable','201','Payables','LIABILITY'],['capital','301','Equity','EQUITY'],['revenue','401','Income','REVENUE'],['expense','501','Expenses','EXPENSE']];
  for(const [id,code,name,type] of definitions)chart.add(new Account({id:prefix+'-'+id,code,name,type}));
  const pack=deepFreeze({manifest:{id:'bookkeeping-'+jurisdiction,version:'1.0.0',jurisdiction,currency:config.functionalCurrency,validFrom:config.period.periodStart,validTo:config.period.periodEnd},accounts:chart.list(),taxCategories:[],rules:[],bookkeepingOnly:true});
  return {chart,pack};
 }
 function applyActiveConfiguration(config,resolution=config.countryPackResolution){
  const valid=validateConfiguration(config);if(!valid.ok)throw Error('Cannot apply configuration: '+valid.errors.join('; '));
  if(config.organizationId!==scopeOrgId)throw Error('Configuration organization scope mismatch');
  if(ledger.size&&ctx.org&&(ctx.org.baseCurrency!==config.functionalCurrency||ctx.org.jurisdiction!==(config.domicile??'ZZ')))throw Error('Changing currency/jurisdiction with posted entries requires a reviewed migration');
  const org=new Organization({id:scopeOrgId,name:config.organizationName,jurisdiction:config.domicile??'ZZ',baseCurrency:config.functionalCurrency});
  const {chart,pack}=bookkeepingTemplate(config),requestedPeriodId='per-'+config.period.periodStart+'-'+config.period.periodEnd;
  const existing=periods.list().find(p=>p.orgId===scopeOrgId&&(p.id===requestedPeriodId||p.start===config.period.periodStart&&p.end===config.period.periodEnd));
  const periodId=existing?.id??requestedPeriodId;
  if(periods.list().some(p=>p.id!==periodId&&p.orgId===scopeOrgId&&p.start<=config.period.periodEnd&&p.end>=config.period.periodStart))throw Error('Accounting periods overlap; review the period setup before activation');
  const period=existing??new FinancialPeriod({id:periodId,orgId:scopeOrgId,code:config.period.periodStart.slice(0,4),start:config.period.periodStart,end:config.period.periodEnd});
  const registry={select:(code,date)=>{assertDate(date,'transaction date');return code===org.jurisdiction?pack:null;},list:()=>[pack]};
  if(!existing)periods.add(period);
  Object.assign(ctx,{org,chart,pack,registry,modules:Object.freeze([...config.modules]),countryPackResolution:deepFreeze(clone(resolution))});
  return ctx;
 }
 function pipelineDepsFor(input){
  requireActive();checkOrg(input.orgId);
  assertDate(input.date,'transaction date');
  if(input.date<activeConfig.proposal.period.periodStart||input.date>activeConfig.proposal.period.periodEnd)throw Error('Transaction date is outside the active accounting period');
  if(input.jurisdiction!==ctx.org.jurisdiction)throw Error('Transaction jurisdiction must match active workspace; record customer/bank countries separately');
  if(!isKnownCurrency(input.currency))throw Error('Unsupported transaction currency');
  return {...ctx};
 }
 function serializeJournal(e){return {id:e.id,orgId:e.orgId,date:e.date,currency:e.currency,transactionId:e.transactionId,reversalOf:e.reversalOf??null,memo:e.memo??null,periodId:e.periodId??null,finalized:e.finalized,finalizedAt:e.finalizedAt??null,balanced:e.isBalanced(),lines:e.lines.map(l=>({accountId:l.accountId,side:l.side,amountMinor:l.money.amountMinor.toString(),currency:l.money.currency}))};}
 function deserializeJournal(o){
  const entry=new JournalEntry({...o,lines:o.lines.map(l=>new JournalLine({accountId:l.accountId,side:l.side,money:Money.fromMinor(l.amountMinor,l.currency??o.currency)}))});
  entry.finalize(()=>o.finalizedAt??new Date().toISOString());return entry;
 }
 function snapshot(){return {version:2,scopeOrgId,org:ctx.org,periods:periods.list(),journals:ledger.list().map(serializeJournal),audit:audit.list(),idempotency:idempotency.toJSON(),txMeta:[...txMeta.values()],profileState,lastProposal,lastValidation,confirmation,active:activeConfig,history,packApprovals,proposalVersion,lastTurn,aiCalls,aiSuccesses,taxReviewContext,lastTaxProposal,intake:intakeState,muse:museState,savedAt:new Date().toISOString()};}
 function persist(){
  if(!persistPath)return;
  const data=JSON.stringify(snapshot(),null,2),tmp=persistPath+'.tmp';
  fs.mkdirSync(path.dirname(persistPath),{recursive:true});
  try{fs.writeFileSync(tmp,data,'utf8');fs.renameSync(tmp,persistPath);}catch{throw Error('State could not be saved; retry before continuing');}
 }
 function invalidate(){lastProposal=null;lastValidation=null;confirmation=null;lastTaxProposal=null;}
 function resolve(state=profileState,confirmedPackIds=[]){
  const plan=planConfiguration(state,{organizationId:scopeOrgId});
  return resolveCountryPacks({jurisdictionFacts:state.jurisdictionFacts,subjectType:plan.subjectType,period:plan.period,effectiveDate:plan.period.periodStart,registry:contentRegistry,approvals:packApprovals,confirmedPackIds,profileRevision:state.revision});
 }
 function onboardingDraft(){
  const p=planConfiguration(profileState,{organizationId:scopeOrgId}),v=k=>slotValue(profileState,k);
  return {userProfile:{displayName:v('user.displayName')??'',preferredLanguage:p.language,nationality:v('user.nationality')},
   organizationProfile:{id:scopeOrgId,name:v('org.name')??'',domicile:p.entityJurisdiction??'',businessField:v('org.businessType')??''},
   entityProfiles:p.entityJurisdiction?[{id:'ent-1',name:p.organizationName,jurisdiction:p.entityJurisdiction}]:[],
   jurisdictionProfiles:p.entityJurisdiction?[{code:p.entityJurisdiction,packStatus:'pending-validation',taxStatus:'pending-verification'}]:[],
   currencyProfile:{functional:p.functionalCurrency??'',otherCurrencies:p.transactionCurrencies.filter(c=>c!==p.functionalCurrency)},
   languageProfile:{ui:p.language},accountingConfiguration:p.period,taxConfiguration:{status:'pending-verification'},moduleConfiguration:v('modules.enabled')??[]};
 }
 async function performTurn(userText,{aiProvider=null}={}){
  const text=String(userText??'').trim();if(!text||text.length>6000)throw Error('Message must contain 1..6000 characters');
  let provider=aiProvider??profileProvider,extracted=null,taxSnapshotCandidate=null;
  const configured=Boolean(provider||(process.env.BIGM_META_API_URL&&process.env.BIGM_META_API_KEY&&process.env.BIGM_META_MODEL));
  const diagnostic={providerConfigured:configured,providerUsed:'fallback',model:provider?.model??process.env.BIGM_META_MODEL??null,fallbackReason:configured?null:'PROVIDER_NOT_CONFIGURED'};
  if(!provider&&configured)diagnostic.fallbackReason=(process.env.NODE_TEST_CONTEXT||process.env.NODE_ENV==='test')?'LIVE_AI_DISABLED_IN_TESTS':'MUSE_UNAVAILABLE';
  if(provider){
   try{
    aiCalls++;
    const taxPlan=taxReadiness(),responseSchema=taxPlan?{...RESPONSE_SCHEMA,properties:{...RESPONSE_SCHEMA.properties,taxFacts:{type:'array',items:{type:'object',required:['name','type','value','supportingQuote','status'],additionalProperties:false,properties:{name:{enum:Object.keys(taxPlan.declarations)},type:{enum:['MONEY','NUMBER','BOOLEAN','STRING','COUNTRY']},value:{},supportingQuote:{type:'string'},status:{enum:['CANDIDATE']},operation:{enum:['SET','REPLACE','REMOVE']}}}}}}:RESPONSE_SCHEMA;
    const raw=await provider.extractProfile({system:SYSTEM_PROMPT+'\nIf active tax requirements are supplied, ask only their questions. Tax answers use declared names/types, exact current-message quotes and CANDIDATE status. Never approve law, eligibility or facts.',user:JSON.stringify({message:text,previousCandidates:profileState,pendingQuestion:profileState.pendingQuestion,responseSchema,capabilities:{modules:ALLOWED_MODULES,jurisdictions:listJurisdictions().map(j=>j.code),currencies:listCurrencies().map(c=>c.code),...(taxPlan?{activeTaxRequirements:{status:taxPlan.status,questions:taxPlan.questions,declarations:taxPlan.declarations,authority:'CANDIDATE_ONLY'}}:{})}})});
    const checked=validateExtractorPayload(raw,{userText:text,pendingQuestion:profileState.pendingQuestion,previousCurrencyRole:profileState.lastCurrencyRole});
    if(!checked.ok)throw Error('AI_SCHEMA_VALIDATION_FAILED');
    if(raw.taxFacts?.length){if(!taxReviewContext)throw Error('Tax review context required');taxSnapshotCandidate=require('../tax/readiness').acceptTaxFactCandidates({registry:taxServices().registry,...taxReviewContext,answers:raw.taxFacts,userText:text,profileRevision:profileState.revision});}
    extracted=checked.extracted;diagnostic.providerUsed='meta';diagnostic.fallbackReason=null;aiSuccesses++;
   }catch(e){diagnostic.fallbackReason=e.message==='AI_SCHEMA_VALIDATION_FAILED'?'AI_SCHEMA_VALIDATION_FAILED':'PROVIDER_UNAVAILABLE_OR_INVALID_RESPONSE';recordMuse({purpose:'business-profiling',status:'MUSE_UNAVAILABLE',fallbackUsed:true,at:new Date().toISOString()});}
  }
  if(!extracted){
   const fallback=detectSignals(text,{pendingQuestion:profileState.pendingQuestion,previousCurrencyRole:profileState.lastCurrencyRole});
   const checked=validateExtractorPayload(fallback,{userText:text,pendingQuestion:profileState.pendingQuestion,previousCurrencyRole:profileState.lastCurrencyRole});
   if(!checked.ok)throw Error('Fallback validation failed: '+checked.errors.join('; '));
   extracted=checked.extracted;
  }
  const before={profileState,lastProposal,lastValidation,confirmation,lastTurn,taxReviewContext,lastTaxProposal},oldQuestion=museState.lastQuestion,oldRevision=profileState.revision,auditCount=audit.size;
  profileState=applyFacts(profileState,extracted.facts,'USER',{jurisdictionFacts:extracted.jurisdictionFacts});
  profileState.turnCount++;profileState.aiCalls=aiCalls;lastTurn=diagnostic;
  if(taxSnapshotCandidate&&profileState.revision===oldRevision&&taxReviewContext.profileFingerprint===profileFingerprint()){taxReviewContext={...taxReviewContext,snapshot:taxSnapshotCandidate};lastTaxProposal=null;}
  const requirement=deterministicQuestion(),question=muse.enabled?await muse.naturalQuestion(requirement,{profileRevision:profileState.revision,language:slotValue(profileState,'user.language')??'en',governedRequirements:taxReadiness()?.requirements??null}):requirement;profileState.pendingQuestion=question.key;
  museState.lastQuestion={requirementHash:fingerprint(requirement),profileRevision:profileState.revision,question};
  if(profileState.revision!==oldRevision){
   invalidate();audit.record({actor:'user',action:'onboarding.profile.revised',entityType:'profile',entityId:scopeOrgId,detail:{profileRevision:profileState.revision,slots:extracted.facts.map(f=>f.slot),jurisdictionBases:extracted.jurisdictionFacts.map(f=>f.basis),providerUsed:diagnostic.providerUsed}});
  }
  try{persist();}catch(e){({profileState,lastProposal,lastValidation,confirmation,lastTurn,taxReviewContext,lastTaxProposal}=before);museState.lastQuestion=oldQuestion;while(audit.size>auditCount)audit._rollbackLast(audit.size);throw e;}
  return {draft:onboardingDraft(),question,complete:question.key==='done',aiLabel:diagnostic.providerUsed==='meta'?'ai-tervalidasi':'deterministik',...diagnostic,profileRevision:profileState.revision};
 }
 function onboardingTurn(text,options){const next=turnQueue.then(()=>performTurn(text,options));turnQueue=next.catch(()=>{});return next;}
 function editProfile({slot=null,value=null,basis=null,countryCode=null,actor='user'}={}){
  human(actor);const phrase=basis?'My business '+(basis==='REGISTRATION'?'is registered':basis==='BUSINESS_WORK_LOCATION'?'operates':basis.toLowerCase().replaceAll('_',' '))+' in '+countryCode+'.':slot==='currency.functional'?'Bookkeeping currency is '+value+'.':slot==='org.name'?'Business name is '+value+'.':slot==='org.businessType'?'Business type is '+value+'.':'User selected '+slot+': '+JSON.stringify(value);
  const raw={facts:slot?[{slot,value,source:'USER',supportingQuote:phrase,status:value==null?'UNKNOWN':'CANDIDATE',operation:value==null?'REMOVE':'REPLACE'}]:[],jurisdictionFacts:basis?[{basis,countryCode,source:'USER',supportingQuote:phrase,status:countryCode==null?'UNKNOWN':'CANDIDATE',operation:countryCode==null?'REMOVE':'REPLACE'}]:[]};
  const checked=validateExtractorPayload(raw,{userText:phrase});if(!checked.ok)throw Error(checked.errors.join('; '));
  const before={profileState,lastProposal,lastValidation,confirmation,lastTaxProposal},n=audit.size;profileState=applyFacts(profileState,checked.extracted.facts,'USER',{jurisdictionFacts:checked.extracted.jurisdictionFacts});invalidate();
  if(profileState.revision!==before.profileState.revision)audit.record({actor,action:'onboarding.profile.edited',entityType:'profile',entityId:scopeOrgId,detail:{slot,basis,profileRevision:profileState.revision}});
  try{persist();}catch(e){({profileState,lastProposal,lastValidation,confirmation,lastTaxProposal}=before);while(audit.size>n)audit._rollbackLast(audit.size);throw e;}return onboardingState();
 }
 function setUiLanguage(tag){if(!['en','id'].includes(tag))throw Error('Unsupported language');editProfile({slot:'user.language',value:tag});return tag;}
 function onboardingPropose(){
  if(gapAnalysis(profileState).length)return {ok:false,errors:['Bookkeeping currency needs your answer']};
  const conflict=Object.values(profileState.slots).some(s=>s.status==='CONFLICT');if(conflict)return {ok:false,errors:['Conflicting answers need clarification']};
  if(lastProposal&&lastProposal.profileRevision===profileState.revision)return {ok:true,proposal:clone(lastProposal)};
  const built=proposeConfiguration(profileState,{organizationId:scopeOrgId,version:proposalVersion+1,countryPackResolution:resolve()});if(!built.ok)return built;
  const proposal=built.proposal;
  const before={lastProposal,lastValidation,confirmation,proposalVersion};lastProposal=deepFreeze(proposal);lastValidation=null;confirmation=null;proposalVersion=proposal.version;
  try{persist();}catch(e){({lastProposal,lastValidation,confirmation,proposalVersion}=before);throw e;}
  return {ok:true,proposal:clone(lastProposal)};
 }
 function onboardingValidate(){
  if(!lastProposal||lastProposal.profileRevision!==profileState.revision)return {ok:false,errors:['Latest proposal required']};
  const valid=validateProposal(lastProposal);if(!valid.ok){lastValidation=null;return valid;}
  if(lastProposal.hash!==proposalHash(lastProposal))throw Error('Proposal hash mismatch');
  const before=lastValidation;lastValidation=deepFreeze({...clone(lastProposal),validatedAt:new Date().toISOString()});try{persist();}catch(e){lastValidation=before;throw e;}return {ok:true,validated:clone(lastValidation)};
 }
 function onboardingConfirm({proposalHash:hash,actor='user',decisionSource='HUMAN',packIds=[]}={}){
  human(actor,decisionSource);
  if(!lastProposal||hash!==lastProposal.hash||lastProposal.profileRevision!==profileState.revision)throw Error('Confirmation must reference the latest proposal hash and profile revision');
  if(!lastValidation||lastValidation.hash!==hash)throw Error('Latest proposal validation required');
  const eligible=lastProposal.countryPackResolution.candidates.filter(c=>c.status==='CANDIDATE').map(c=>c.packId);
  if(!Array.isArray(packIds)||packIds.some(id=>!eligible.includes(id)))throw Error('Only applicable reviewed pack versions can be explicitly selected');
  const record={proposalHash:hash,profileRevision:profileState.revision,effectiveDate:lastProposal.period.periodStart,selectedPackIds:[...new Set(packIds)],packVersions:lastProposal.countryPackResolution.candidates.filter(c=>c.packId).map(c=>({packId:c.packId,contentHash:c.contentHash,status:c.status})),actor,decisionSource,timestamp:new Date().toISOString()};
  const before=confirmation,n=audit.size;confirmation=deepFreeze(record);audit.record({actor,action:'onboarding.confirm',entityType:'configuration',entityId:hash,detail:record});
  try{persist();}catch(e){confirmation=before;audit._rollbackLast(n+1);throw e;}return {ok:true,...clone(record)};
 }
 function onboardingReadiness(){
  const r=activeConfig&&lastProposal&&activeConfig.proposalHash===lastProposal.hash?activeConfig.countryPackResolution:lastProposal?.countryPackResolution??resolve();
  return evaluateReadiness({profileState,proposal:lastProposal,validated:lastValidation,confirmation,resolution:r});
 }
 function onboardingActivate({activationKey,actor='user'}={}){
  human(actor);
  if(typeof activationKey!=='string'||!activationKey.trim())throw Error('activationKey is required');
  const previous=history.find(r=>r.activationKey===activationKey);
  if(previous){if(lastProposal&&previous.proposal.hash!==lastProposal.hash)throw Error('Activation key replay with different proposal');return clone(previous);}
  if(!onboardingReadiness().workspaceReady)throw Error('Workspace not ready: current validation and explicit confirmation required');
  const config=clone(lastValidation);delete config.validatedAt;
  const confirmedState=clone(profileState);for(const f of confirmedState.jurisdictionFacts)if(f.status==='CANDIDATE')f.status='CONFIRMED';
  const eligible=confirmation.selectedPackIds??[];
  const resolution=resolve(confirmedState,eligible);
  // Bind the evaluated confirmation without changing the approved proposal payload/hash.
  const record=deepFreeze({activationKey,version:history.length+1,proposal:config,profileSnapshot:clone(profileState),confirmation:clone(confirmation),profileRevision:profileState.revision,proposalHash:config.hash,countryPackResolution:resolution,activatedAt:new Date().toISOString(),actor});
  const runtimeBefore={...ctx},oldActive=activeConfig,auditCount=audit.size,periodCount=periods.list().length,historyCount=history.length;
  try{
   applyActiveConfiguration(config,resolution);activeConfig=record;history.push(record);
   audit.record({actor,action:'onboarding.activate',entityType:'configuration',entityId:activationKey,detail:{version:record.version,profileRevision:record.profileRevision,proposalHash:record.proposalHash,effectiveDate:config.period.periodStart,packVersions:confirmation.packVersions}});
   persist();
  }catch(e){Object.assign(ctx,runtimeBefore);activeConfig=oldActive;history.splice(historyCount);while(audit.size>auditCount)audit._rollbackLast(audit.size);periods._periods.splice(periodCount);throw e;}
  return clone(record);
 }
 function approvePack(input){human(input.actor,input.decisionSource);const approval=approveContent(contentRegistry,input);const before={packApprovals,lastProposal,lastValidation,confirmation,lastTaxProposal};packApprovals=[...packApprovals.filter(a=>a.packId!==approval.packId),approval];invalidate();
  const n=audit.size;audit.record({actor:input.actor,action:'country-pack.source-review',entityType:'country-pack',entityId:approval.packId,detail:approval});
  try{persist();}catch(e){({packApprovals,lastProposal,lastValidation,confirmation,lastTaxProposal}=before);audit._rollbackLast(n+1);throw e;}return approval;
 }
 function workspaceProfile(){
  const p=activeConfig?.proposal;
  return {activated:Boolean(p),language:p?.language??slotValue(profileState,'user.language')??'en',organizationId:p?.organizationId??scopeOrgId,organizationName:p?.organizationName??null,
   domicile:p?.domicile??null,jurisdiction:p?.domicile??null,jurisdictionBasis:p?.jurisdictionBasis??null,functionalCurrency:p?.functionalCurrency??null,reportingCurrency:p?.reportingCurrency??null,
   transactionCurrencies:p?.transactionCurrencies??[],foreignPurchaseCurrencies:p?.foreignPurchaseCurrencies??[],fxSource:p?.fxSource??null,period:p?.period??null,modules:p?.modules??[],
   countryPackResolution:activeConfig?.countryPackResolution??resolve(),taxReady:Boolean(p&&activeConfig.countryPackResolution.status==='RESOLVED'),taxNote:t(p?.language??'en','ob.taxNote'),fxNote:t(p?.language??'en','ob.fxNote')};
 }
 function deterministicQuestion(){return planQuestion(profileState,slotValue(profileState,'user.language')??'en',{taxReadiness:taxReadiness()});}
 function currentQuestion(){const q=deterministicQuestion(),saved=museState.lastQuestion;return saved?.profileRevision===profileState.revision&&saved.requirementHash===fingerprint(q)?clone(saved.question):q;}
 function aiStatus(){return {...lastTurn,configured:Boolean(process.env.BIGM_META_API_URL&&process.env.BIGM_META_API_KEY&&process.env.BIGM_META_MODEL),mode:lastTurn.providerUsed,calls:aiCalls,successes:aiSuccesses,muse:muse.status()};}
 function onboardingState(){return {draft:onboardingDraft(),profileState:clone(profileState),profileRevision:profileState.revision,slots:clone(profileState.slots),missingSlots:gapAnalysis(profileState),readyForProposal:gapAnalysis(profileState).length===0,readiness:onboardingReadiness(),jurisdictionCandidates:clone(profileState.jurisdictionFacts),countryPackResolution:resolve(),uiLanguage:slotValue(profileState,'user.language')??'en',languages:supportedLanguages(),jurisdictions:listJurisdictions(),currencies:listCurrencies(),proposal:lastProposal?clone(lastProposal):null,validated:lastValidation?clone(lastValidation):null,confirmation:confirmation?clone(confirmation):null,active:activeConfig?clone(activeConfig):null,history:clone(history),question:currentQuestion(),taxReadiness:taxReadiness(),taxProposal:lastTaxProposal?clone(lastTaxProposal):null,ai:aiStatus(),migrationNotice};}
 function rememberMeta(kind,draft,result){
  const line=result.journal.lines.find(l=>l.accountId===ctx.chart.getByCode(kind==='SALE'?'401':'501').id);
  txMeta.set(result.transactionId,{id:result.transactionId,kind,date:draft.date,currency:draft.currency,totalMinor:line?.amountMinor??'0',counterparty:draft.customer??draft.supplier??'-',reference:draft.invoiceRef??draft.billRef??'-',postingId:result.receipt.postingId,journalId:result.journal.id,demo:String(result.transactionId).startsWith('demo-')});
 }
 function transactionCheckpoint(){return {ledgerSize:ledger.size,auditSize:audit.size,idempotency:idempotency.toJSON(),metadata:clone([...txMeta.entries()])};}
 function rollbackTransaction(s){while(ledger.size>s.ledgerSize)ledger._rollbackLast(ledger.list().at(-1).id);while(audit.size>s.auditSize)audit._rollbackLast(audit.size);idempotency._restoreAll(s.idempotency);txMeta.clear();for(const [k,v]of s.metadata)txMeta.set(k,v);}
 async function createTransaction(kind,draft,opts){
  checkAuth(opts.authToken);checkOrg(draft?.orgId);requireActive(kind==='SALE'?'sales':'purchase');pipelineDepsFor(draft);
  const input=(kind==='SALE'?require('../business/salesService').buildSaleInput:require('../business/purchaseService').buildPurchaseInput)(draft);input.counterparty=draft.customer??draft.supplier;
  const c=await intake.native({input,actor:opts.actor??'user'});
  if(c.revision!==1&&!c.confirmation)throw Error('Native candidate changed; review and confirm the current intake candidate');
  // Existing native Create/Post is itself an explicit human submission. It now
  // uses the same durable candidate, validation and confirmation as other inputs.
  const confirmed=await intake.confirm({candidateId:c.candidateId,revision:c.revision,reviewHash:c.confirmation?.reviewHash??c.reviewHash,idempotencyKey:c.confirmation?.idempotencyKey??'native-confirm:'+c.candidateId,actor:opts.actor??'user'});return confirmed.posting;
 }
 const createSale=(draft,opts={})=>createTransaction('SALE',draft,opts),createPurchase=(draft,opts={})=>createTransaction('PURCHASE',draft,opts);
 async function importCsvText(csv,opts={}){
  checkAuth(opts.authToken);requireActive('import');
  const rows=parseCsv(csv),seen=new Set(ledger.list().map(e=>e.transactionId)),receipts=[],failures=[];
  for(const row of rows){try{
   if(!row.id||seen.has(row.id))throw Error('Missing or duplicate transaction id');
   seen.add(row.id);
   const base={id:row.id,orgId:row.orgId,date:row.date,jurisdiction:row.jurisdiction,currency:row.currency,description:row.description,amountMajor:row.amountMajor};
   const type=String(row.type).toUpperCase();if(!['SALE','PURCHASE'].includes(type))throw Error('type must be SALE|PURCHASE');
   const r=type==='SALE'?await createSale({...base,customer:row.counterparty,invoiceRef:row.reference},opts):await createPurchase({...base,supplier:row.counterparty,billRef:row.reference},opts);
   receipts.push({row:row.__row,id:row.id,postingId:r.receipt.postingId});
  }catch(e){failures.push({row:row.__row,id:row.id??null,error:e.message});}}
  return {total:rows.length,succeeded:receipts.length,failed:failures.length,receipts,failures};
 }
 function reverseJournal({journalId,id,date,memo,actor='user',authToken:token=null}){
  checkAuth(token);requireActive('accounting');const original=ledger.get(journalId);if(!original)throw Error('Unknown journal: '+journalId);checkOrg(original.orgId);const before=transactionCheckpoint();
  try{const {entry,receipt}=reversal.reverse(original,{id,date,memo,actor});txMeta.set(entry.id,{id:entry.id,kind:'REVERSAL',date:entry.date,currency:entry.currency,totalMinor:'0',counterparty:'-',reference:'reversal-of:'+original.id,postingId:receipt.postingId,journalId:entry.id,demo:false});persist();return {entry:serializeJournal(entry),receipt};}catch(e){rollbackTransaction(before);throw e;}
 }
 function listTransactions(){return [...txMeta.values()].sort((a,b)=>b.date.localeCompare(a.date));}
 function monthlyReport(currency=ctx.org?.baseCurrency){
  if(!ctx.chart||!currency)return [];
  const revenue=ctx.chart.getByCode('401').id,expense=ctx.chart.getByCode('501').id,buckets=new Map();
  for(const e of ledger.list()){if(e.currency!==currency||e.orgId!==scopeOrgId)continue;const month=e.date.slice(0,7),b=buckets.get(month)??{month,count:0,revenueMinor:0n,expenseMinor:0n};b.count++;
   for(const l of e.lines){if(l.accountId===revenue)b.revenueMinor+=l.side==='CREDIT'?l.money.amountMinor:-l.money.amountMinor;if(l.accountId===expense)b.expenseMinor+=l.side==='DEBIT'?l.money.amountMinor:-l.money.amountMinor;}buckets.set(month,b);
  }
  return [...buckets.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(b=>({...b,revenueMinor:String(b.revenueMinor),expenseMinor:String(b.expenseMinor),netMinor:String(b.revenueMinor-b.expenseMinor)}));
 }
 function summary(currency=ctx.org?.baseCurrency){
  if(!ctx.chart||!currency)return {currency:null,transactionCount:0,balances:[],totals:{revenueMinor:'0',expenseMinor:'0',netMinor:'0'},auditOk:audit.verifyChain().ok,otherCurrencies:[]};
  return {...getSummary(ctx,{currency}),otherCurrencies:[...new Set(ledger.list().filter(e=>e.currency!==currency).map(e=>e.currency))],fxConversionApplied:false};
 }
 async function seedDemo(){
  requireActive();if(txMeta.has('demo-sale-1'))return {seeded:false};
  await createSale({id:'demo-sale-1',orgId:scopeOrgId,date:activeConfig.proposal.period.periodStart,jurisdiction:ctx.org.jurisdiction,currency:ctx.org.baseCurrency,customer:'[DEMO] Customer',invoiceRef:'DEMO-1',description:'[DEMO] Income',amountMajor:'1000'});
  return {seeded:true};
 }
 function restore(){
  if(!persistPath||!fs.existsSync(persistPath))return;
  const raw=JSON.parse(fs.readFileSync(persistPath,'utf8'));if(raw.scopeOrgId&&raw.scopeOrgId!==scopeOrgId)throw Error('Persisted organization scope mismatch');
  if(raw.intake){Object.assign(intakeState,raw.intake);for(const d of Object.values(intakeState.documents)){if(require('../intake/files').hash(Buffer.from(d.originalBase64,'base64'))!==d.sha256)throw Error('Persisted original document hash mismatch');}}
  for(const p of raw.periods??[])periods.add(new FinancialPeriod(p));
  for(const j of raw.journals??[]){if(j.orgId!==scopeOrgId)throw Error('Persisted journal scope mismatch');ledger.append(deserializeJournal(j));}
  audit._restoreAll(raw.audit??[]);idempotency._restoreAll(raw.idempotency??{});for(const m of raw.txMeta??[])txMeta.set(m.id,m);
  if(raw.version!==2){migrationNotice='Previous setup needs review before activation. Journals and period states are preserved.';return;}
  if(raw.muse)museState={...museState,...raw.muse,events:(raw.muse.events??[]).slice(-100),conversations:(raw.muse.conversations??[]).slice(-10)};
  profileState=raw.profileState;profileState.slots={...blankProfileState().slots,...profileState.slots};lastProposal=raw.lastProposal;lastValidation=raw.lastValidation;confirmation=raw.confirmation;packApprovals=raw.packApprovals??[];history=(raw.history??[]).map(deepFreeze);proposalVersion=raw.proposalVersion??0;lastTurn=raw.lastTurn??lastTurn;aiCalls=raw.aiCalls??0;aiSuccesses=raw.aiSuccesses??0;taxReviewContext=raw.taxReviewContext??null;lastTaxProposal=raw.lastTaxProposal??null;
  if(taxReviewContext){checkOrg(taxReviewContext.request.scopeId);taxReadiness();}
  if(raw.active){
   const p=raw.active.proposal;
   if(p.hash!==proposalHash(p)||raw.active.confirmation?.proposalHash!==p.hash||raw.active.confirmation?.profileRevision!==p.profileRevision||p.profileFingerprint!==fingerprint({slots:raw.active.profileSnapshot?.slots,jurisdictionFacts:raw.active.profileSnapshot?.jurisdictionFacts}))throw Error('Persisted activation confirmation invalid');
   human(raw.active.actor,raw.active.confirmation.decisionSource);
   applyActiveConfiguration(p,raw.active.countryPackResolution);activeConfig=deepFreeze(raw.active);
  }
 }
 restore();
 function applyDocumentFacts(facts,save){
  const before={profileState,lastProposal,lastValidation,confirmation,lastTaxProposal};
  try{
   for(const fact of facts){
    const provenance={...fact,status:'CANDIDATE',evidenceLocation:fact.evidence};
    if(fact.slot){
     const previous=profileState.slots[fact.slot],nonempty=previous.value!=null&&previous.value!==''&&(!Array.isArray(previous.value)||previous.value.length);
     const conflict=nonempty&&JSON.stringify(previous.value)!==JSON.stringify(fact.value);
     // Facts join the existing profileState. Established values are retained;
     // a conflicting document is an alternative awaiting explicit profile edit.
     profileState=clone(profileState);
     profileState.history.push({revision:profileState.revision,slot:fact.slot,previous:clone(previous),documentFact:provenance});
     profileState.slots[fact.slot]={...previous,...(!nonempty?{value:fact.value,source:fact.source,documentId:fact.documentId,extractionId:fact.extractionId,evidenceLocation:fact.evidence,supportingQuote:fact.supportingQuote,confidence:fact.confidence}:{}),status:conflict?'CONFLICT':nonempty?previous.status:'CANDIDATE',documentCandidates:[...(previous.documentCandidates??[]),provenance]};
     if(conflict)profileState.slots[fact.slot].alternatives=[...new Set([previous.value,fact.value])];
    }else{
     const existing=profileState.jurisdictionFacts.find(j=>j.basis===fact.basis&&j.countryCode===fact.countryCode&&j.status!=='REJECTED');
     if(existing){profileState=clone(profileState);const target=profileState.jurisdictionFacts.find(j=>j.basis===fact.basis&&j.countryCode===fact.countryCode&&j.status!=='REJECTED');target.documentCandidates=[...(target.documentCandidates??[]),provenance];}
     else profileState=applyFacts(profileState,[],'DOCUMENT',{jurisdictionFacts:[provenance]});
    }
    profileState.revision++;invalidate();
   }
   save();
  }catch(e){({profileState,lastProposal,lastValidation,confirmation,lastTaxProposal}=before);throw e;}
 }
 async function commitIntakePosting(command,actor,finalize){
  const c=intakeState.candidates[command.provenance?.candidateId];
  if(!c?.confirmation||c.status!=='POSTING'||fingerprint(c.canonicalCommand)!==fingerprint(command))throw Error('Confirmed intake command required');
  if(c.confirmation.reviewHash!==fingerprint({candidateId:c.candidateId,revision:c.revision,current:c.current,workspace:workspaceProfile()})||command.currency!==ctx.org?.baseCurrency)throw Error('Confirmed workspace changed; review required before posting');
  const module=command.kind==='JOURNAL'?'accounting':command.kind==='REVENUE'?'sales':'purchase';requireActive(module);
  const deps=pipelineDepsFor(command),before=transactionCheckpoint();
  try{
   const result=await require('../intake/accountingBoundary').postCanonical(deps,command,actor);
   result.tax={...result.tax,status:'requires_review',finalTotalMinor:null,finalLiabilityMinor:null};
   if(command.kind==='JOURNAL')txMeta.set(result.transactionId,{id:result.transactionId,kind:'JOURNAL_IMPORT',date:command.date,currency:command.currency,totalMinor:'0',counterparty:c.current.counterparty??'-',reference:c.current.referenceNumber??command.sourceRef.externalId,postingId:result.receipt.postingId,journalId:result.journal.id,demo:false});
   else rememberMeta(command.kind==='REVENUE'?'SALE':'PURCHASE',{date:command.date,currency:command.currency,customer:c.current.counterparty,invoiceRef:c.current.referenceNumber??command.evidence.reference},result);
   txMeta.get(result.transactionId).totalMinor=Money.fromMajor(c.current.amount,c.current.currency).amountMinor.toString();
   finalize(result);persist();return result;
  }catch(e){rollbackTransaction(before);throw e;}
 }
 const intake=createIntakeService({state:intakeState,getContext:()=>({...ctx,workspace:workspaceProfile(),journalFor:id=>{const j=ctx.ledger.get(id);return j?serializeJournal(j):null;}}),persist,commitPosting:commitIntakePosting,applyProfileFacts:applyDocumentFacts,extractionProvider,semanticProvider});
 intake.recover();
 function recordMuse(event){museState.events.push(clone(event));if(museState.events.length>100)museState.events.shift();}
 const {governedCatalog,resolveSuggestion}=require('../ai/museCatalog');
 muse.attach({record:recordMuse,sources:{workspace:workspaceProfile,summary,profile:()=>profileState,question:deterministicQuestion,taxReadiness,
  candidates:id=>{if(id){const c=intakeState.candidates[id];return c?[intake.trace(id).candidate]:[];}return Object.values(intakeState.candidates).slice(-5).map(c=>intake.trace(c.candidateId).candidate);},
  determination:id=>taxReviewContext?taxServices().determinations.get(id,{scopeId:scopeOrgId,subjectId:taxReviewContext.request.subjectId}):null,
  catalog:()=>governedCatalog(taxServices().registry),resolveRule:entry=>resolveSuggestion(entry,taxServices().registry,taxReviewContext,taxReadiness())
 }});
 async function museAssistant(input){
  const result=await muse.assistant(input),before=museState.conversations;
  museState.conversations=[...before,{at:new Date().toISOString(),question:input.question,...result}].slice(-10);
  try{persist();}catch(e){museState.conversations=before;throw e;}return result;
 }
 async function museDiscovery(){const result=await muse.discover(),before=museState.discovery;museState.discovery={...result,profileRevision:profileState.revision};try{persist();}catch(e){museState.discovery=before;throw e;}return clone(museState.discovery);}
 function museTrace(){if(!muse.traceEnabled)throw Error('Muse trace mode is disabled');return {flow:['USER','META_MUSE_SPARK','CANDIDATE_FACTS','GOVERNED_PACK_REQUIREMENTS','MISSING_FACTS','MUSE_QUESTION','CONFIRMED_PROFILE','DETERMINISTIC_RESOLVER','TAX_ACCOUNTING_ENGINE','MUSE_EXPLANATION'],events:clone(museState.events),profileRevision:profileState.revision,requirements:taxReadiness(),confirmation:confirmation?{profileRevision:confirmation.profileRevision,proposalHash:confirmation.proposalHash,actor:confirmation.actor}:null,accounting:{journalCount:ledger.size,auditVerified:audit.verifyChain().ok}};}
 return {ctx,txMeta,contentRegistry,checkAuth,serializeMutation,createSale,createPurchase,importCsvText,reverseJournal,listTransactions,monthlyReport,summary,seedDemo,serializeJournal,pipelineDepsFor,
  chartFor:()=>ctx.chart,onboardingTurn,onboardingDraft,onboardingPropose,onboardingValidate,onboardingConfirm,onboardingReadiness,onboardingActivate,onboardingState,onboardingHistory:()=>clone(history),setUiLanguage,editProfile,approvePack,workspaceProfile,aiStatus,applyActiveConfiguration,beginTaxReview,answerTaxReview,proposeTaxReview,taxReadiness,
  countryPackState:()=>({resolution:resolve(),packs:contentRegistry.list(),approvals:clone(packApprovals)}),persist,intake,museAssistant,museDiscovery,museTrace,museStatus:()=>muse.status(),
 };
}
module.exports={createWebStore,proposalHash};
