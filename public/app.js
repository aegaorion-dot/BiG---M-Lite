'use strict';
const $=s=>document.querySelector(s);
const view=$('#view'),tabsEl=$('#tabs'),topLang=$('#topLang');
let route='onboarding',cache={ws:null,ob:null,summary:null,txs:[],journals:[],settings:null,monthly:[],audit:null,product:null,demo:null};
let STR={},UILANG='en',loadedLanguage=null,localeFallbackKeys=[],pending=false,userInput='',chat=[],lastError='',csvText='',csvReport=null;
const TABS=[['onboarding','nav.onboarding'],['dashboard','nav.dashboard'],['intake','nav.intake'],['sales','nav.sales'],['purchase','nav.purchase'],['accounting','nav.accounting'],['reports','nav.reports'],['import','nav.import'],['settings','nav.settings']];
 let pendingLabel='working',externalOpen=false;
let intakeData={documents:[],chats:[],candidates:[]},intakeText='',intakeRequestId=null,intakeNotice='';
let externalPreview=null,externalPage=0;
let taxReviewer='';
let assistantText='',assistantResult=null,assistantDiscovery=null,assistantTrace=null,assistantActivity=null,assistantMessages=[];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tr=k=>STR[k]??k;
const rtl=()=>UILANG==='ar-MA';
function enumLabel(value){if(value==null)return tr('ob.unknown');const v=String(value);if(cache.ob?.currencies?.some(c=>c.code===v))return v;return STR['business.'+v]??STR['financial.enum.'+v]??STR['enum.'+v]??STR['product.status.'+v]??(rtl()&&/^[A-Z][A-Z_ -]{2,}$/.test(v)?tr('ob.unknown'):v);}
function accountLabel(a){return STR['account.'+a.code]??a.name;}
function profileValue(v){return Array.isArray(v)?v.map(x=>typeof x==='object'?(x.name??''):enumLabel(x)).join(', '):enumLabel(v);}
async function api(path,body){
 const res=await fetch(path,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const data=await res.json();if(!res.ok||data.ok===false)throw Error(data.error??'Request failed');return data;
}
function toast(text,error=false){const el=document.createElement('div');el.className='toast'+(error?' error':'');el.textContent=text;$('#toasts').appendChild(el);setTimeout(()=>el.remove(),5000);}
function money(minor,currency=cache.ws?.functionalCurrency){if(!currency||minor==null)return '\u2014';const decimals=cache.ob?.currencies?.find(c=>c.code===currency)?.minorUnits??2;return BigmLocale.money(minor,currency,UILANG,decimals);}
async function loadLanguage(lang){
 lang=BigmLocale.canonical(lang);UILANG=lang;document.documentElement.lang=lang;document.documentElement.dir=BigmLocale.languageInfo(lang)?.direction??'ltr';
 if(loadedLanguage!==lang){const r=await api('/api/i18n/pack?locale='+encodeURIComponent(lang));STR=r.pack.strings;localeFallbackKeys=r.pack.fallbackKeys??[];loadedLanguage=lang;}
 topLang.value=lang;
 const note=$('#localeFallback');if(note){note.hidden=!localeFallbackKeys.length;note.textContent=localeFallbackKeys.length?tr('locale.fallback'):'';note.title=localeFallbackKeys.length?`${localeFallbackKeys.length} strings use the fallback language`:'';}
}
async function refreshOb(){
 const [ob,ws,product,demo]=await Promise.all([api('/api/onboarding/state'),api('/api/workspace'),api('/api/product'),api('/api/demo/status')]);cache.ob=ob;cache.ws=ws.workspace;cache.product=product;cache.demo=demo;
 topLang.innerHTML=ob.languages.map(l=>'<option value="'+esc(l.tag)+'">'+esc(l.name)+'</option>').join('');
 await loadLanguage(ob.uiLocale??ob.uiLanguage);
 if(!chat.length){chat.push({who:'ai',text:ob.profileState.turnCount?tr('ob.resumed'):tr('ob.greeting')});if(ob.profileState.turnCount&&ob.question?.key!=='done')chat.push({who:'ai',text:ob.question.text});}
}
async function refresh(){
 await refreshOb();
 intakeData=await api('/api/intake');
 cache.position=(await api('/api/financial-position')).position;
 cache.scopedLaw=(await api('/api/tax/scoped/law')).candidates;
 if(externalPreview)externalPreview=await api('/api/intake/external/preview?batchId='+encodeURIComponent(externalPreview.batch.batchId));
 if(cache.ws.activated){
  const [s,t,j,m,a,settings]=await Promise.all([api('/api/summary'),api('/api/transactions'),api('/api/journals'),api('/api/reports/monthly'),api('/api/audit'),api('/api/settings')]);
  Object.assign(cache,{summary:s.summary,txs:t.transactions,journals:j.journals,monthly:m.months,audit:a,settings});
 }
}
function renderTabs(){
 const active=Boolean(cache.ws?.activated);tabsEl.hidden=!active;$('#auditPill').hidden=!active;$('#demoBtn').hidden=true;
 $('#demoNote').hidden=!cache.demo?.enabled&&!cache.txs.some(t=>t.demo);$('#demoNote').textContent=tr(cache.demo?.enabled?'product.demoNote':'demo.note');
 if(!active){if(!['intake','assistant'].includes(route))route='onboarding';tabsEl.innerHTML='';return;}
 const allowed=new Set(['onboarding','dashboard','settings','intake',...cache.ws.modules]);
 const primary=[['dashboard','product.home'],['assistant','muse.assistant'],['intake','product.transactions'],['documents','product.documents'],['tax','product.tax'],['reports','nav.reports'],['settings','nav.settings']];
 const tab=([id,key])=>'<button type="button" class="tab" data-route="'+id+'" aria-selected="'+(route===id)+'">'+esc(tr(key))+'</button>';
 tabsEl.innerHTML=primary.filter(([id])=>id!=='reports'||allowed.has(id)).map(tab).join('')+'<details class="advanced-nav"><summary>'+esc(tr('product.more'))+'</summary><div>'+TABS.filter(([id])=>['onboarding','sales','purchase','accounting','import'].includes(id)&&allowed.has(id)).map(tab).join('')+'</div></details>';
 tabsEl.querySelectorAll('[data-route]').forEach(b=>b.addEventListener('click',async()=>{if(pending)return;route=b.dataset.route;await loadLanguage(cache.ob.uiLocale??cache.ob.uiLanguage);render();}));
 $('#auditPill').textContent=cache.audit?.verify?.ok?tr('audit.valid'):tr('audit.review');
 $('#demoBtn').textContent=tr('demo.load');
}
function country(code){if(!code)return code;try{return BigmLocale.region(code,UILANG);}catch{return code;}}
function fact(key){return cache.ob?.slots?.[key]?.value??null;}
function basisValues(basis){return (cache.ob?.jurisdictionCandidates??[]).filter(f=>f.basis===basis&&f.status!=='REJECTED').map(f=>country(f.countryCode)).join(', ');}
function currentBasis(basis){return (cache.ob?.jurisdictionCandidates??[]).find(f=>f.basis===basis&&f.status==='CANDIDATE')?.countryCode??'';}
function selectOptions(items,value,blank=false){return (blank?'<option value="">'+esc(tr('ob.unknown'))+'</option>':'')+items.map(([id,label])=>'<option value="'+esc(id)+'"'+(id===value?' selected':'')+'>'+esc(label)+'</option>').join('');}
function profileUiTag(tag){if(tag==='id')return 'id-ID';if(tag==='ar')return 'ar-MA';if(tag==='el')return 'el-GR';return BigmLocale.supported(tag)?BigmLocale.canonical(tag):'en';}
function profileLanguageValue(tag){if(tag==='id-ID'||tag==='id')return 'id';if(tag==='ar')return 'ar-MA';if(tag==='el')return 'el-GR';return String(tag).startsWith('en')?'en':tag;}
function vOnboarding(){
 const ob=cache.ob;if(!ob)return '<div class="panel">'+esc(tr('loading'))+'</div>';
 const p=ob.proposal,confirmed=ob.active?.profileRevision===ob.profileRevision;
 const row=(label,value)=>'<div class="ob-kv"><span>'+esc(label)+'</span><strong>'+esc(Array.isArray(value)?profileValue(value):value?enumLabel(value):tr('ob.unknown'))+'</strong><small class="ob-badge '+(confirmed?'ok':'need')+'">'+esc(value?(confirmed?tr('ob.confirmed'):tr('ob.needsConfirm')):'')+'</small></div>';
 let understand='<div class="panel ob-side-block"><h3>'+esc(tr('ob.understandTitle'))+'</h3>'+
  row(tr('ob.fBusiness'),fact('org.name')||fact('org.businessType'))+
  row(tr('ob.nationality'),country(fact('user.nationality')))+
  row(tr('financial.homeCountry'),country(fact('user.homeCountry')))+row(tr('financial.physicalLocation'),country(fact('user.physicalLocation')))+row(tr('financial.travelStatus'),fact('user.travelStatus'))+row(tr('financial.travelDays'),fact('user.travelDays'))+row(tr('financial.entityDeclaration'),fact('org.entityDeclarations'))+row(tr('scope.employment'),fact('employment.relationship'))+row(tr('scope.employerCountry'),country(fact('employment.employerCountry')))+row(tr('scope.workCountry'),country(fact('employment.workCountry')))+row(tr('scope.salaryCurrency'),fact('employment.salaryCurrency'))+
  row(tr('ob.workLocation'),basisValues('BUSINESS_WORK_LOCATION'))+
  row(tr('ob.registration'),basisValues('REGISTRATION'))+
  row(tr('ob.taxResidence'),basisValues('TAX_RESIDENCE'))+
  row(tr('ob.fCustomers'),basisValues('CUSTOMER_LOCATION'))+
  row(tr('ob.bankLocation'),basisValues('ACCOUNT_LOCATION'))+
  row(tr('ob.fCurrency'),fact('currency.functional'))+
  row(tr('ob.fOther'),fact('currency.transactions')?.join(', '))+
  row(tr('ob.foreignPurchases'),fact('currency.foreignPurchases')?.join(', '))+'</div>';
 const economic=ob.slots['org.economicScopes']?.value??[],intervals=ob.slots['presence.intervals']?.value??[];
 const context='<section class="panel"><h3>'+esc(tr('scope.details'))+'</h3>'+economic.map(x=>'<p>'+esc(x.name)+' · '+esc(tr('scope.kind.'+x.kind))+' · '+esc(country(x.countryCode))+' · '+esc(enumLabel(x.legalStructure??null))+' · '+esc(enumLabel(x.usage??null))+'</p>').join('')+(intervals.length?'<h4>'+esc(tr('scope.presence'))+'</h4>'+intervals.map(x=>'<p>'+esc(country(x.countryCode))+' <bdi>'+esc(x.entryDate)+' / '+esc(x.exitDate)+'</bdi></p>').join('')+'<p>'+esc(tr('scope.presenceBoundary'))+'</p>':'')+'</section>';
 const countries=ob.jurisdictions.map(j=>[j.code,country(j.code)]),currencies=ob.currencies.map(c=>[c.code,c.code+(rtl()?'':' — '+c.name)]);
 const biz=['small-business','freelancer','umkm','perdagangan','jasa','kuliner','manufaktur'];
 let setup='<div class="panel ob-side-block"><h3>'+esc(tr('ob.setupTitle'))+'</h3><p>'+esc(tr('ob.working'))+'</p></div>';
 if(p){
  const field=(label,content)=>'<label class="ob-edit"><span>'+esc(label)+'</span>'+content+'</label>';
  setup='<div class="panel ob-side-block"><h3>'+esc(tr('ob.setupTitle'))+'</h3><p class="muted">'+esc(tr('ob.readyNote'))+'</p>'+
   field(tr('business.name'),'<input id="setName" value="'+esc(p.organizationName)+'" maxlength="120" />')+
   (p.organizationNameSuggested?'<small class="muted">'+esc(tr('ob.suggestedName'))+'</small>':'')+
   field(tr('ob.sBusinessType'),'<select id="setBiz">'+selectOptions(biz.map(b=>[b,tr('business.'+b)]),p.businessType)+'</select>')+
   field(tr('ob.workLocation'),'<select id="setWork">'+selectOptions(countries,currentBasis('BUSINESS_WORK_LOCATION'),true)+'</select>')+
   field(tr('ob.registration'),'<select id="setRegistration">'+selectOptions(countries,currentBasis('REGISTRATION'),true)+'</select>')+
   field(tr('ob.sBookCurrency'),'<select id="setCur">'+selectOptions(currencies,p.functionalCurrency)+'</select>')+
   field(tr('fx.reportingCurrency'),'<select id="setReportingCurrency">'+selectOptions(currencies,p.reportingCurrency)+'</select>')+
   field(tr('ob.sLanguage'),'<select id="setLang">'+selectOptions(ob.languages.map(l=>[l.tag,l.name]),profileUiTag(p.language))+'</select>')+
   '<div class="grid2">'+field(tr('period.start'),'<input id="setStart" type="date" value="'+esc(p.period.periodStart)+'" />')+
   field(tr('period.end'),'<input id="setEnd" type="date" value="'+esc(p.period.periodEnd)+'" />')+'</div>'+
   '<p>'+esc(tr('ob.sFeatures'))+': '+p.modules.map(m=>esc(tr('nav.'+m))).join(', ')+'</p>'+
   '<p class="tax-pending">'+esc(tr('tax.review'))+'</p>'+
   '<div class="ob-actions"><button type="button" id="obUse" class="btn gold"'+(pending?' disabled':'')+'>'+esc(pending?tr('working'):tr('ob.useSetup'))+'</button></div></div>';
 }
 understand+=economic.length?context:'';
 const provider=ob.ai?.providerUsed==='meta'?tr('muse.understood'):tr('provider.fallback');
 const error=lastError?'<p class="err" role="alert">'+esc(lastError)+'</p>':'';
 return '<div class="ob-wrap"><div class="ob-hero"><h1>'+esc(tr('ob.headline'))+'</h1><p>'+esc(tr('ob.subheadline'))+'</p></div>'+
  (cache.ws?.activated?'<p class="tax-pending">'+esc(tr('ob.editingActive'))+'</p>':'')+
  '<div class="ob-grid"><div class="panel ob-chat"><div class="chat" id="obChat">'+chat.map(m=>'<div class="chat-row '+m.who+'"><div class="bubble"><p>'+esc(m.text)+'</p></div></div>').join('')+'</div>'+
  '<div class="ob-input-row"><input id="obInput" aria-label="'+esc(tr('ob.bigPlaceholder'))+'" placeholder="'+esc(tr('ob.bigPlaceholder'))+'" value="'+esc(userInput)+'" autocomplete="off"'+(pending?' disabled':'')+' /><button type="button" class="btn gold" id="obSend"'+(pending?' disabled':'')+'>'+esc(pending?tr('working'):tr('ob.send'))+'</button></div>'+(cache.demo?.enabled?'<button class="btn ghost" type="button" id="demoProfile">'+esc(tr('product.demoProfile'))+'</button>':'')+
  '<small class="provenance" role="status">'+esc(provider)+'</small>'+error+'<p class="muted">'+esc(tr('tax.review'))+'</p></div><aside class="ob-aside">'+understand+setup+'</aside></div>'+packDetails()+'</div>';
}
async function prepare(){
 await refreshOb();
 if(!cache.ob.readyForProposal)return;
 await api('/api/onboarding/propose',{});await api('/api/onboarding/validate',{});await refreshOb();
}
async function run(work,label='working'){
 if(pending)return;pending=true;pendingLabel=label;lastError='';render();
 try{await work();}catch(e){lastError=friendlyError(e.message);toast(lastError,true);}
 finally{pending=false;render();}
}
function wireOnboarding(){
 $('#demoProfile')?.addEventListener('click',()=>{userInput=cache.demo.profileText;render();});
 const input=$('#obInput');
 input?.addEventListener('input',e=>{userInput=e.target.value;});
 const send=()=>{const text=userInput.trim();if(!text||pending)return;return run(async()=>{userInput='';chat.push({who:'user',text});const r=await api('/api/onboarding/turn',{text});chat.push({who:'ai',text:r.question.text});await prepare();},'product.loadingBusiness');};
 $('#obSend')?.addEventListener('click',send);input?.addEventListener('keydown',e=>{if(e.key==='Enter')send();});
 const edit=(selector,payload)=>$(selector)?.addEventListener('change',e=>run(async()=>{await api('/api/onboarding/edit',payload(e.target.value));await prepare();}));
 edit('#setName',v=>({slot:'org.name',value:v}));edit('#setBiz',v=>({slot:'org.businessType',value:v}));
 edit('#setWork',v=>({basis:'BUSINESS_WORK_LOCATION',countryCode:v||null}));edit('#setRegistration',v=>({basis:'REGISTRATION',countryCode:v||null}));
 edit('#setCur',v=>({slot:'currency.functional',value:v}));edit('#setReportingCurrency',v=>({slot:'currency.reporting',value:v}));$('#setLang')?.addEventListener('change',e=>run(async()=>{await api('/api/onboarding/edit',{slot:'user.language',value:profileLanguageValue(e.target.value)});await prepare();await refreshOb();}));
 edit('#setStart',v=>({slot:'accounting.periodStart',value:v}));edit('#setEnd',v=>({slot:'accounting.periodEnd',value:v}));
 $('#obUse')?.addEventListener('click',()=>run(async()=>{
  const hash=cache.ob?.proposal?.hash;if(!hash)throw Error(tr('ob.working'));
  await api('/api/onboarding/confirm',{proposalHash:hash,actor:'user',decisionSource:'HUMAN'});
  await api('/api/onboarding/activate',{activationKey:'web-'+hash,actor:'user'});
  route='dashboard';await refresh();toast(tr('ob.confirmedOk'));
 }));
 const chatEl=$('#obChat');if(chatEl)chatEl.scrollTop=chatEl.scrollHeight;
}
function txRows(rows){
 return rows.map(tx=>'<tr><td>'+esc(BigmLocale.date(tx.date,UILANG))+'</td><td>'+esc(tx.description??tx.reference)+(tx.demo?' <span class="tag demo">DEMO</span>':'')+'</td><td>'+esc(tx.counterparty)+'</td><td class="num">'+esc(money(tx.totalMinor,tx.currency))+'</td></tr>').join('')||'<tr><td colspan="4" class="muted">'+esc(tr('ws.empty'))+'</td></tr>';
}
function transactionTable(rows){return '<div class="table-scroll"><table><thead><tr><th>'+esc(tr('date'))+'</th><th>'+esc(tr('description'))+'</th><th>'+esc(tr('counterparty'))+'</th><th>'+esc(tr('amount'))+'</th></tr></thead><tbody>'+txRows(rows)+'</tbody></table></div>';}
function vDashboard(){
 const s=cache.summary;if(!s)return '';if(cache.position?.scopePosition)return '<div class="panel"><h3>'+esc(tr('product.business'))+'</h3>'+businessFacts()+'</div>'+transactionTable(cache.txs.slice(0,10));
 const cards=[['ws.income',s.totals.revenueMinor],['ws.expenses',s.totals.expenseMinor],[cache.position?.hasFinancialEvents?'financial.provisionalNet':'ws.net',s.totals.netMinor]];
 const tax=cache.product?.tax;
 return '<div class="hero product-hero"><div class="panel hero-main"><p class="hero-kicker">'+esc(cache.ws.organizationName)+' · '+esc(cache.ws.functionalCurrency)+'</p><h1>'+esc(tr('ws.summary'))+'</h1><p>'+esc(tr('product.context'))+': '+esc(country(cache.ws.jurisdiction)??tr('ob.unknown'))+'</p><p>'+esc(tr('product.backbone'))+'</p><button class="btn gold" data-go="intake">'+esc(tr('product.record'))+'</button></div><div class="panel"><h3>'+esc(tr('product.tax'))+'</h3><span class="status-tag warn">'+esc(statusLabel(tax?.status))+'</span><p>'+esc(tr('product.taxUnknown'))+'</p><button class="btn ghost" data-go="tax">'+esc(tr('product.seeReasons'))+'</button></div></div>'+
  (cache.txs.length?'<div class="stat-grid product-stats">'+cards.map(([label,minor])=>'<div class="stat"><h4>'+esc(tr(label))+'</h4><strong>'+esc(money(minor))+'</strong></div>').join('')+'</div>':'<div class="panel empty"><h3>'+esc(tr('product.noTransactions'))+'</h3><p>'+esc(tr('product.startTransactions'))+'</p></div>')+
  (cache.product?.cash?.length?'<p class="cash-summary">'+esc(tr('product.cash'))+': '+esc(money(cache.product.cash[0].netMinor))+'</p>':'')+
  (s.otherCurrencies?.length?'<p class="tax-pending">'+esc(tr('currency.separate'))+' '+esc(s.otherCurrencies.join(', '))+'</p>':'')+
  '<div class="cards"><div class="panel"><h3>'+esc(tr('product.business'))+'</h3>'+businessFacts()+'<button class="btn ghost" data-go="onboarding">'+esc(tr('product.reviewProfile'))+'</button></div><div class="panel"><h3>'+esc(tr('transactions.recent'))+'</h3>'+transactionTable(cache.txs.slice(0,8))+'</div></div>';
}
function taxFactLabel(id){const key='product.taxFact.'+id;return STR[key]??String(id).toLowerCase().replaceAll('_',' ');}
function statusLabel(status){return tr('product.status.'+(status??'REVIEW_REQUIRED'));}
function financialFields(c){
 const f=c.current,options=(values,value)=>selectOptions(values.map(v=>[v,enumLabel(v)]),value,true),select=(name,key,values)=>'<label>'+esc(tr('financial.'+key))+'<select name="'+name+'">'+options(values,f[name])+'</select></label>',input=(name,key)=>'<label>'+esc(tr('financial.'+key))+'<input name="'+name+'" maxlength="500" value="'+esc(f[name]??'')+'" /></label>';
 const question=f.purpose==='MIXED'?( /hotel/i.test(f.description)?'financial.hotelQuestion':/fuel|taxi|ride/i.test(f.description)?'financial.transportQuestion':'financial.mixedQuestion'):null;
 return '<details class="financial-review"'+(f.eventType?' open':'')+'><summary>'+esc(tr('financial.review'))+'</summary><p>'+esc(tr('financial.boundary'))+'</p>'+(question?'<p class="tax-pending">'+esc(tr(question))+'</p>':'')+'<div class="grid2">'+select('eventType','eventType',['INCOME_RECEIPT','CARD_PURCHASE','CARD_REPAYMENT','CASH_PURCHASE','CAPITAL_CONTRIBUTION'])+select('incomeCategory','incomeCategory',['EMPLOYMENT_WAGE','PROJECT_SERVICE','AFFILIATE_COMMISSION','SOFTWARE_LICENCE','ADVANCE_PAYMENT','RENTAL_RECEIPT','RETAIL_SALES'])+select('purpose','purpose',['BUSINESS','PERSONAL','MIXED','UNKNOWN'])+select('recognitionStatus','recognition',['EARNED','ADVANCE','EXPENSE','PERSONAL','REVIEW_REQUIRED','LIABILITY_SETTLEMENT','EQUITY','DEPOSIT'])+(rtl()?select('expenseCategory','expenseCategory',['PAYROLL','INGREDIENTS','RENT','UTILITIES','MAINTENANCE','CLEANING','MANAGEMENT','PLATFORM_FEE','EQUIPMENT','FIT_OUT','CONTRACTOR','DEPOSIT','PERMIT','SUBSCRIPTION','CARD_FEE','RESTAURANT','GROCERIES','AIRLINE','FUEL','HOTEL','PHONE_DATA','CLOTHING','SHOPPING']):input('expenseCategory','expenseCategory'))+input('engagementId','engagement')+input('contractTotal','contractTotal')+input('payerCountry','payerCountry')+select('ipRetained','ipRetained',['YES','NO','UNKNOWN'])+input('reviewReason','reviewReason')+(cache.ws?.economicScopes?.length?'<label>'+esc(tr('scope.select'))+'<select name="economicScopeId">'+selectOptions(cache.ws.economicScopes.map(x=>[x.scopeId,x.name]),f.economicScopeId,true)+'</select></label>':'')+'</div></details>';
}
function vScopePosition(p){const amount=m=>'<bdi class="money">'+esc(money(m.amountMinor,m.currency))+'</bdi>',row=(label,m)=>'<div class="fact-row"><span>'+esc(tr(label))+'</span><strong>'+amount(m)+'</strong></div>';
 return '<section class="panel scope-position"><h1>'+esc(tr('scope.title'))+'</h1><p>'+esc(tr('scope.note'))+'</p><div class="cards">'+p.scopes.map(x=>'<article class="panel" data-economic-scope="'+esc(x.scopeId)+'"><h2>'+esc(x.name)+'</h2><p>'+esc(tr('scope.kind.'+x.kind))+' · '+esc(country(x.countryCode))+'</p>'+row('scope.revenue',x.amounts.revenue)+row('scope.wages',x.amounts.wages)+row('scope.capital',x.amounts.capital)+row('scope.expenses',x.amounts.expenses)+row('scope.purchases',x.amounts.purchases)+row('scope.assetReview',x.amounts.assetPolicyReview)+row('scope.deposits',x.amounts.deposits)+(x.recordedOperatingResult?row('scope.result',x.recordedOperatingResult):'')+'<p>'+esc(tr('scope.originals'))+': '+[...Object.values(x.originalReceipts),...Object.values(x.originalPurchases)].map(amount).join('; ')+'</p>'+(x.contractBalances.length?'<p>'+esc(tr('financial.clientsOwe'))+': '+x.contractBalances.map(v=>amount(v.outstanding)).join('; ')+'</p>':'')+(x.obligations?.length?'<details><summary>'+esc(tr('supportedTax.obligations'))+'</summary>'+x.obligations.map(o=>'<p>'+esc(o.name)+' '+amount(o.monthlyPayment)+' / '+amount(o.outstanding)+'</p>'+o.payments.map(p=>'<p>'+esc(p.date)+' '+amount(p.principal)+'</p>').join('')).join('')+'</details>':'')+(x.costs?.length?'<details><summary>'+esc(tr('supportedTax.costs'))+'</summary>'+x.costs.map(c=>'<p>'+esc(c.description)+' '+amount(c.economicCost)+' / '+enumLabel(c.purpose)+' / '+esc(c.taxStatus)+'</p>').join('')+'</details>':'')+(x.reviewItems.length?'<p class="tax-pending">'+esc(tr('scope.review'))+'</p>':'')+'</article>').join('')+'</div>'+row('financial.bank',p.global.cashBank)+row('financial.cardLiability',p.global.sharedCardLiability)+row('financial.repayments',p.global.repayments)+'<h3>'+esc(tr('scope.presence'))+'</h3><p>'+Object.entries(p.presence.byCountry).map(([code,days])=>esc(country(code))+': <bdi>'+days+'</bdi>').join('; ')+'</p><p>'+esc(tr('scope.presenceBoundary'))+'</p><p class="tax-pending">'+esc(tr('scope.noFinalTax'))+'</p><button class="btn gold" id="explainPosition">'+esc(tr('financial.explain'))+'</button></section>';
}
function vFinancialPosition(){if(cache.position?.scopePosition)return vScopePosition(cache.position.scopePosition);
 const p=cache.position;if(!p?.hasFinancialEvents)return '';const amount=m=>money(m.amountMinor,m.currency),cards=[['cashReceived',p.cashReceived],['bank',p.cashBankBalance],['cardLiability',p.cardLiability],['advances',p.advances]],row=(key,m)=>'<div class="fact-row"><span>'+esc(tr('financial.'+key))+'</span><strong>'+esc(amount(m))+'</strong></div>';
 return '<section class="financial-position panel"><h2>'+esc(tr('financial.position'))+'</h2><p>'+esc(tr('financial.period'))+': '+esc(p.period.periodStart)+' - '+esc(p.period.periodEnd)+'</p><div class="stat-grid">'+cards.map(([key,m])=>'<div class="stat"><h4>'+esc(tr('financial.'+key))+'</h4><strong>'+esc(amount(m))+'</strong></div>').join('')+'</div><div class="cards"><div><h3>'+esc(tr('financial.clientsOwe'))+'</h3>'+(Object.values(p.receivables.byCurrency).map(m=>'<p><strong>'+esc(amount(m))+'</strong></p>').join('')||'<p>'+esc(tr('position.none'))+'</p>')+'<p class="muted">'+esc(tr('financial.contractualNote'))+'</p><h3>'+esc(tr('financial.incomeCategory'))+'</h3>'+Object.entries(p.incomeByType).map(([k,m])=>row('category.'+k,m)).join('')+'</div><div><h3>'+esc(tr('financial.spending'))+'</h3>'+row('totalPurchases',p.totalSpending)+row('businessSpending',p.businessClassifiedSpending)+row('personalSpending',p.personalSpending)+row('mixedSpending',p.mixedSpending)+row('businessExpenses',p.confirmedBusinessExpenses)+row('policyReview',p.businessRecognitionReview)+row('repayments',p.cardRepayments)+'</div></div><p class="tax-pending">'+esc(tr('financial.profitPending'))+'</p><p>'+esc(tr('financial.provisionalNet'))+': '+esc(amount(p.profit.provisionalRecognizedBusinessNet))+'</p><button class="btn gold" id="explainPosition">'+esc(tr('financial.explain'))+'</button><details><summary>'+esc(tr('financial.lineage'))+'</summary>'+p.lineage.map(l=>'<p>'+esc(l.eventType)+' · '+esc(l.sourceChannel)+' · '+esc(l.journalId)+'</p>').join('')+'</details></section>';
}
function roleLabel(role){return tr(({'org.name':'business.name','org.businessType':'ob.sBusinessType','user.nationality':'ob.nationality','user.homeCountry':'financial.homeCountry','user.physicalLocation':'financial.physicalLocation','user.travelStatus':'financial.travelStatus','user.travelDays':'financial.travelDays','org.legalForm':'financial.legalForm','org.activities':'financial.activities','org.entityDeclarations':'financial.entityDeclaration','user.taxResidenceDeclaration':'financial.residenceDeclaration','user.withholdingDocumentation':'financial.withholding','currency.functional':'ob.sBookCurrency','currency.reporting':'fx.reportingCurrency',BUSINESS_WORK_LOCATION:'ob.workLocation',REGISTRATION:'ob.registration',TAX_RESIDENCE:'ob.taxResidence',CUSTOMER_LOCATION:'ob.fCustomers'})[role]??role);}
function businessFacts(){
 const facts=cache.product?.facts??[],value=f=>f.value==null?tr('ob.unknown'):['user.nationality','user.homeCountry','user.physicalLocation','BUSINESS_WORK_LOCATION','REGISTRATION','TAX_RESIDENCE','CUSTOMER_LOCATION'].includes(f.role)?country(f.value):f.role==='org.businessType'?tr('business.'+f.value):Array.isArray(f.value)?profileValue(f.value):enumLabel(f.value);
 return ['CONFIRMED','CANDIDATE'].map(group=>'<section class="fact-group"><h4>'+esc(tr(group==='CONFIRMED'?'product.confirmedFacts':'product.pendingFacts'))+'</h4>'+facts.filter(f=>group==='CONFIRMED'?f.status==='CONFIRMED':f.status!=='CONFIRMED').map(f=>'<div class="fact-row"><span>'+esc(roleLabel(f.role))+'</span><strong>'+esc(value(f))+'</strong><small>'+esc(tr('product.fact.'+f.status))+'</small></div>').join('')+'</section>').join('');
}
function packDetails(){
 const packs=cache.product?.tax?.packs??[];
 return '<details class="explanation"><summary>'+esc(tr('product.whyConfiguration'))+'</summary><p>'+esc(tr('product.ruleBoundary'))+'</p><p>'+esc(tr('product.packScope'))+'</p>'+(packs.length?'<div class="table-scroll"><table><thead><tr><th>CountryPack / TreatyPack</th><th>'+esc(tr('product.version'))+'</th><th>'+esc(tr('product.period'))+'</th><th>'+esc(tr('product.governance'))+'</th></tr></thead><tbody>'+packs.map(p=>'<tr><td>'+esc(p.packId)+'<small class="muted">'+esc(p.kind==='TREATY_PACK'?tr('product.treatyCandidate'):tr('product.countryCandidate'))+'</small></td><td>'+esc(p.version)+'</td><td>'+esc(p.effectiveFrom??tr('product.unestablished'))+'<br>'+esc(p.effectiveTo??tr('product.unestablished'))+'</td><td>'+esc(p.governance)+'<small class="muted">'+esc(p.sourceStatus)+'</small></td></tr>').join('')+'</tbody></table></div>':'<p>'+esc(tr('product.noPacks'))+'</p>')+'</details>';
}
function vExpandedTax(){
 const state=cache.position?.scopePosition?.expandedTax,p=state?.proposal,r=state?.result;if(!p)return '';
 const amt=m=>m?money(m.amountMinor,m.currency):tr('ob.unknown'),law=cache.scopedLaw.filter(c=>(c.pack.packId??c.pack.treatyPackId??'').startsWith('YOUSSEF_'));
 const details=law.map(c=>'<details><summary>'+esc(c.pack.packId??c.pack.treatyPackId)+' / '+esc(c.governanceStatus)+'</summary><p>'+esc(c.contentHash)+'</p><p>'+esc(c.pack.effectiveFrom)+' - '+esc(c.pack.effectiveTo)+'</p>'+c.pack.evidenceRefs.map(e=>'<details><summary>'+esc(e.legalCitation)+'</summary><a href="'+esc(e.sourceUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(e.sourceUrl)+'</a><blockquote>'+esc(e.quote)+'</blockquote><p>'+esc(e.evidenceId)+'</p></details>').join('')+'<pre>'+esc(JSON.stringify(c.pack.rules??c.pack.incomeArticles,null,2))+'</pre></details>').join('');
 const rows=r?r.taxByScope.map(s=>'<tr><td>'+esc(tr('expandedTax.'+s.scope))+'</td><td>'+esc(amt(s.grossIncome))+'</td><td>'+esc(amt(s.taxableBase))+'</td><td>'+esc(amt(s.netTaxPayable))+'</td></tr>').join(''):'';
 return '<section class="panel" data-expanded-tax-status="'+esc(state.status)+'"><h1>'+esc(tr('expandedTax.title'))+'</h1><p>'+esc(tr('expandedTax.period'))+'</p><p class="tax-pending">'+esc(tr('expandedTax.partial'))+'</p>'+(r?'<h2>'+esc(tr('expandedTax.personal'))+': <bdi>'+esc(amt(r.personalTax))+'</bdi></h2><p>'+esc(tr('expandedTax.company'))+': <bdi>'+esc(amt(r.companyTax))+'</bdi></p><h2>'+esc(tr('expandedTax.total'))+': <bdi>'+esc(amt(r.netTaxPayable))+'</bdi></h2><p>'+esc(tr('supportedTax.credits'))+': <bdi>'+esc(amt(r.credits))+'</bdi></p><h3>'+esc(tr('expandedTax.byScope'))+'</h3><div class="table-scroll"><table><thead><tr>'+['scope.select','supportedTax.gross','supportedTax.base','supportedTax.payable'].map(k=>'<th>'+esc(tr(k))+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div><h3>'+esc(tr('expandedTax.byCountry'))+'</h3>'+r.taxByJurisdiction.map(j=>'<p>'+esc(country(j.jurisdiction))+': <bdi>'+esc(amt(j.taxAmount??j.combinedEconomicSupportedTax))+'</bdi> / '+esc(j.status)+'</p>').join('')+'<details><summary>'+esc(tr('supportedTax.calculation'))+'</summary><pre>'+esc(JSON.stringify({residence:r.residenceStatusByJurisdiction,taxByScope:r.taxByScope,fx:r.fxTrace,review:r.remainingReviewItems},null,2))+'</pre></details>':'<label>'+esc(tr('supportedTax.reviewer'))+'<input id="expandedReviewer" value="'+esc(taxReviewer)+'"></label><button class="btn ghost" id="expandedLawApprove">'+esc(tr('expandedTax.approve'))+'</button><button class="btn gold" id="expandedTaxConfirm">'+esc(tr('expandedTax.confirm'))+'</button>')+'<details><summary>'+esc(tr('expandedTax.facts'))+'</summary><pre>'+esc(JSON.stringify({fixture:p.fixture,presence:p.presence,fx:p.fxTrace,rentalContracts:p.rentalRows},null,2))+'</pre></details><details><summary>'+esc(tr('supportedTax.rule'))+' / '+esc(tr('supportedTax.evidence'))+'</summary>'+details+'</details></section>';
}
function vSupportedTax(){
 const state=cache.position?.scopePosition?.taxCalculation,p=state?.proposal,r=state?.result;
 if(!p)return '';
 const law=cache.scopedLaw?.find(c=>c.pack.effectiveFrom<=p.request.period.periodStart&&c.pack.effectiveTo>=p.request.period.periodEnd),pack=law?.pack;
 const line=(key,value)=>'<p><strong>'+esc(tr('supportedTax.'+key))+': </strong><bdi>'+esc(value)+'</bdi></p>';
 const amt=m=>m?money(m.amountMinor,m.currency):tr('ob.unknown');
 const facts=p.snapshot.facts.map(f=>'<tr><td>'+esc(f.name)+'</td><td>'+esc(f.type==='MONEY'?amt(f.value):String(f.value))+'</td><td>'+esc(f.evidenceReference)+'</td></tr>').join('');
 const evidence=(pack?.evidenceRefs??[]).map(e=>'<details><summary>'+esc(e.legalCitation)+'</summary><p><a href="'+esc(e.sourceUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(e.sourceUrl)+'</a></p><p>'+esc(e.evidenceId)+'</p><p>'+esc(e.rawContentHash)+'</p><blockquote>'+esc(e.quote)+'</blockquote></details>').join('');
 const rate=pack?.rules[0].parameters.FINAL_RATE.value;
 return '<section class="panel supported-tax" data-tax-status="'+esc(r?.status??state.status)+'"><h2>'+esc(tr('supportedTax.'+(r?'title':'facts')))+'</h2><p>'+esc(tr('supportedTax.note'))+'</p>'+line('classification',p.ownership.entityName+' / '+p.request.incomeOrEventType)+line('period',p.request.period.periodStart+' - '+p.request.period.periodEnd)+
 (r?line('gross',amt(r.grossIncome))+line('deductions',amt(r.supportedDeductions))+line('base',amt(r.taxableBase))+line('formula',amt(r.taxableBase)+' x '+rate)+line('tax',amt(r.grossTax))+line('credits',amt(r.withholdingOrCredits))+line('payable',amt(r.netTaxPayable)):'<p>'+esc(state.status)+'</p>')+
 '<p>'+esc(tr('supportedTax.grossNote'))+'</p><details><summary>'+esc(tr('supportedTax.facts'))+'</summary><div class="table-scroll"><table><tbody>'+facts+'</tbody></table></div></details>'+line('rule',pack?.rules[0].ruleId)+(law?.candidateId?'<button class="btn ghost" type="button" data-muse-evidence="'+esc(law.candidateId)+'">View rule evidence lineage</button>':'')+line('period',(pack?.effectiveFrom??'')+' - '+(pack?.effectiveTo??''))+line('formula','MONTHLY_TURNOVER x FINAL_RATE ('+rate+')')+'<details><summary>'+esc(tr('supportedTax.evidence'))+'</summary>'+evidence+'</details>'+
 (r?'<details><summary>'+esc(tr('supportedTax.calculation'))+'</summary><pre>'+esc(JSON.stringify(r.trace,null,2))+'</pre></details>':'<label>'+esc(tr('supportedTax.reviewer'))+'<input id="taxReviewer" value="'+esc(taxReviewer)+'" required></label>'+(law?.governanceStatus!=='APPROVED'?'<button class="btn ghost" id="scopedLawApprove">'+esc(tr('supportedTax.approve'))+'</button>':'')+'<button class="btn gold" id="scopedTaxConfirm" '+(law?.governanceStatus!=='APPROVED'?'disabled':'')+'>'+esc(tr('supportedTax.confirm'))+'</button>')+
 (cache.position?.scopePosition?.expandedTax?.result?'':'<h3>'+esc(tr('supportedTax.review'))+'</h3>')+(cache.position?.scopePosition?.expandedTax?.result?[]:p.excludedScopes).map(s=>'<p>'+esc(s.name)+' ? REVIEW_REQUIRED</p>').join('')+'</section>';
}
function vTax(){
 if(cache.position?.scopePosition?.expandedTax?.result)return vExpandedTax()+vSupportedTax()+packDetails();
 const tax=cache.product?.tax;
 return vExpandedTax()+vSupportedTax()+'<div class="page-heading"><p class="eyebrow">'+esc(cache.ws?.organizationName??'BiG-M Lite')+'</p><h1>'+esc(tr('product.tax'))+'</h1><p>'+esc(tr('product.taxUnknown'))+'</p></div><div class="panel"><h3>'+esc(tr('product.taxNext'))+'</h3><div class="readiness-list">'+(tax?.reasons??[]).map(r=>'<div class="readiness-row"><span class="status-tag warn">'+esc(statusLabel(r.status))+'</span><p>'+esc(tr('product.reason.'+r.status))+'</p>'+(r.missing?.length?'<p>'+esc(tr('product.missing'))+': '+esc(r.missing.map(taxFactLabel).join('; '))+'</p>':'')+'</div>').join('')+'</div>'+(cache.demo?.enabled&&!tax?.reviewStatus?'<p>'+esc(tr('product.demoTaxScope'))+'</p><button class="btn ghost" id="demoTaxReview">'+esc(tr('product.startTaxReview'))+'</button>':'')+'<button class="btn gold" id="explainTax">'+esc(tr('product.askTax'))+'</button><button class="btn ghost" data-go="onboarding">'+esc(tr('product.reviewProfile'))+'</button><details><summary>'+esc(tr('product.statusGuide'))+'</summary>'+['READY','REVIEW_REQUIRED','MISSING_INFORMATION','OUT_OF_PERIOD','MISSING_APPROVED_RULE','TREATY_REVIEW_REQUIRED'].map(s=>'<p><strong>'+esc(statusLabel(s))+'</strong> - '+esc(tr('product.reason.'+s))+'</p>').join('')+'</details></div>'+packDetails();
}
function vTransactions(kind){return '<div class="panel"><h3>'+esc(tr(kind==='SALE'?'nav.sales':'nav.purchase'))+'</h3><button type="button" id="newTx" class="btn gold">'+esc(tr('action.new'))+'</button>'+transactionTable(cache.txs.filter(t=>t.kind===kind))+'</div>';}
function vReports(){if(cache.position?.scopePosition)return '<div class="panel"><h3>'+esc(tr('nav.reports'))+'</h3><p>'+esc(tr('scope.note'))+'</p><div class="table-scroll"><table><thead><tr>'+['scope.select','scope.revenue','scope.wages','scope.capital','scope.expenses','scope.result'].map(k=>'<th>'+esc(tr(k))+'</th>').join('')+'</tr></thead><tbody>'+cache.position.scopePosition.scopes.map(x=>'<tr><td>'+esc(x.name)+'</td>'+['revenue','wages','capital','expenses'].map(k=>'<td class="num"><bdi>'+esc(money(x.amounts[k].amountMinor,x.amounts[k].currency))+'</bdi></td>').join('')+'<td class="num"><bdi>'+esc(x.recordedOperatingResult?money(x.recordedOperatingResult.amountMinor,x.recordedOperatingResult.currency):'—')+'</bdi></td></tr>').join('')+'</tbody></table></div><button class="btn gold" id="explainReport">'+esc(tr('product.askReport'))+'</button></div>';
 return '<div class="panel"><h3>'+esc(tr('nav.reports'))+' · '+esc(cache.ws.functionalCurrency)+'</h3><p class="tax-pending">'+esc(tr('tax.review'))+'</p><p class="muted">'+esc(tr('currency.noFx'))+'</p>'+(cache.ws.reportingCurrency!==cache.ws.functionalCurrency?'<p>'+esc(tr('fx.reportingCurrency'))+': '+esc(cache.ws.reportingCurrency)+' - '+esc(tr('fx.reportingPending'))+'</p>':'')+(cache.position?.hasFinancialEvents?'<p>'+esc(tr('financial.scopeNote'))+'</p>':'')+'<div class="table-scroll"><table><thead><tr><th>'+esc(tr('month'))+'</th><th>'+esc(tr('ws.income'))+'</th><th>'+esc(tr('ws.expenses'))+'</th><th>'+esc(tr(cache.position?.hasFinancialEvents?'financial.provisionalNet':'ws.net'))+'</th></tr></thead><tbody>'+
  (cache.monthly.map(m=>'<tr><td>'+esc(m.month)+'</td><td>'+esc(money(m.revenueMinor))+'</td><td>'+esc(money(m.expenseMinor))+'</td><td>'+esc(money(m.netMinor))+'</td></tr>').join('')||'<tr><td colspan="4">'+esc(tr('product.noReport'))+'</td></tr>')+'</tbody></table></div><button class="btn gold" id="explainReport">'+esc(tr('product.askReport'))+'</button></div>';
}
function vAccounting(){
 const accounts=cache.settings?.chart??[];
 return '<div class="panel"><h1>'+esc(tr('nav.accounting'))+'</h1><p>'+esc(tr('accounting.corrections'))+'</p><div class="table-scroll"><table><thead><tr><th>'+esc(tr('date'))+'</th><th>'+esc(tr('accounting.entry'))+'</th><th>'+esc(tr('accounting.actions'))+'</th></tr></thead><tbody>'+cache.journals.map(j=>'<tr><td>'+esc(BigmLocale.date(j.date,UILANG))+'</td><td>'+j.lines.map(l=>'<div class="accounting-line"><span>'+esc((rtl()?tr(l.side==='DEBIT'?'scope.purchases':'scope.revenue'):tr(l.side==='DEBIT'?'accounting.debit':'accounting.credit')))+' · '+esc(accountLabel(accounts.find(a=>a.id===l.accountId)??{name:tr('accounting.account')}))+'</span><strong>'+esc(money(l.amountMinor,l.currency))+'</strong></div>').join('')+'<details><summary>'+esc(tr('accounting.details'))+'</summary><code>'+esc(j.id)+'</code></details></td><td><button type="button" class="btn small navy" data-reverse="'+esc(j.id)+'">'+esc(tr('reversal'))+'</button></td></tr>').join('')+'</tbody></table></div></div>';
}
function vSettings(){
 const s=cache.settings;
 return '<div class="panel"><h3>'+esc(tr('nav.settings'))+'</h3><p>'+esc(s.org.name)+' · '+esc(country(cache.ws.jurisdiction)||tr('ob.unknown'))+' · '+esc(s.org.baseCurrency)+'</p>'+
 s.periods.map(p=>'<p>'+esc(p.start)+' → '+esc(p.end)+' · '+esc(tr(p.status==='CLOSED'?'period.closed':'period.open'))+'</p>').join('')+
 '<p>'+esc(tr('tax.review'))+'</p><button type="button" class="btn gold" id="reviewSetup">'+esc(tr('ob.changeSomething'))+'</button></div>';
}
function vImport(){
 return '<div class="panel"><h3>'+esc(tr('nav.import'))+'</h3><p class="muted">'+esc(tr('csv.hint'))+'</p><p class="mono">type,id,orgId,date,jurisdiction,currency,description,amountMajor,counterparty,reference</p>'+
 '<textarea id="csvText" rows="8" aria-label="CSV">'+esc(csvText)+'</textarea><button type="button" class="btn gold" id="csvRun"'+(pending?' disabled':'')+'>'+esc(tr('csv.import'))+'</button>'+
 (csvReport?'<p>'+esc(tr('csv.result'))+': '+csvReport.succeeded+' / '+csvReport.total+'</p>'+csvReport.failures.map(f=>'<p class="err">'+esc(f.row+': '+f.error)+'</p>').join(''):'')+'</div>';
}
function vExternal(){
 const sources=intakeData.externalSources??[],p=externalPreview,chart=cache.settings?.chart??[],page=p?.batch.rows.slice(externalPage*20,externalPage*20+20)??[];
 return '<section class="panel"><h3>'+esc(tr('external.title'))+'</h3><p>'+esc(tr('external.hint'))+'</p><div class="grid2"><label>'+esc(tr('external.sourceId'))+'<input id="extId" /></label><label>'+esc(tr('external.sourceName'))+'<input id="extName" /></label><label>'+esc(tr('currency'))+'<input id="extCurrency" value="'+esc(cache.ws?.functionalCurrency??'')+'" /></label><button class="btn ghost" type="button" id="extRegister">'+esc(tr('external.register'))+'</button></div><label>'+esc(tr('external.source'))+'<select id="extSource">'+selectOptions(sources.map(s=>[s.externalSourceId,s.name+' · '+s.schemaVersion]),sources[0]?.externalSourceId,true)+'</select></label><label>'+esc(tr('external.mode'))+'<select id="extMode"><option value="TRANSACTION_IMPORT">'+esc(enumLabel('TRANSACTION_IMPORT'))+'</option><option value="JOURNAL_IMPORT">'+esc(enumLabel('JOURNAL_IMPORT'))+'</option></select></label><input id="extFile" type="file" accept=".csv,.json" aria-label="'+esc(tr('external.upload'))+'" />'+
 (intakeData.externalBatches??[]).map(b=>'<button class="btn ghost" type="button" data-ext-batch="'+esc(b.batchId)+'">'+esc(b.originalFilename)+' · '+b.rowCount+'</button>').join('')+
 (p?'<h4>'+esc(p.batch.originalFilename)+' · '+p.batch.rowCount+' '+esc(tr('external.rows'))+'</h4><a href="/api/intake/external/original?batchId='+encodeURIComponent(p.batch.batchId)+'" download>'+esc(tr('intake.original'))+'</a><p>'+esc(enumLabel(p.batch.mode))+' · '+esc(p.batch.currencies.join(', '))+' · '+esc(p.batch.period.join(', '))+'</p>'+p.mappings.map(m=>'<div><strong>'+esc(m.externalAccountCode)+' · '+esc(enumLabel(m.status))+'</strong><select id="map-'+esc(m.mappingId)+'">'+selectOptions(chart.map(a=>[a.id,a.code+' '+accountLabel(a)]),m.canonicalAccountId??m.proposedAccountIds[0],true)+'</select><input id="reason-'+esc(m.mappingId)+'" placeholder="'+esc(tr('external.reason'))+'" /><button class="btn ghost" type="button" data-ext-map="'+esc(m.mappingId)+'">'+esc(tr('external.approve'))+'</button></div>').join('')+
 '<details><summary>'+esc(tr('product.technicalStatus'))+'</summary><pre>'+esc(JSON.stringify(page.map(r=>({row:r.row,status:r.status,normalized:r.normalized,errors:r.errors,candidateId:r.candidateId})),null,2))+'</pre></details><button class="btn ghost" id="extPrev" type="button"'+(externalPage===0?' disabled':'')+'>'+esc(tr('external.previous'))+'</button><button class="btn ghost" id="extNext" type="button"'+((externalPage+1)*20>=p.batch.rowCount?' disabled':'')+'>'+esc(tr('external.next'))+'</button><button class="btn gold" id="extConfirm" type="button"'+(!p.candidates.some(c=>c.status==='READY_TO_CONFIRM')?' disabled':'')+'>'+esc(tr('external.confirm'))+' ('+p.candidates.filter(c=>c.status==='READY_TO_CONFIRM').length+')</button>':'')+'</section>';
}
function wireExternal(){
 document.querySelector('details.advanced')?.addEventListener('toggle',e=>{externalOpen=e.target.open;});
 $('#extRegister')?.addEventListener('click',()=>{const payload={externalSourceId:$('#extId').value,name:$('#extName').value,functionalCurrency:$('#extCurrency').value,actor:'user'};return run(async()=>{await api('/api/intake/external/source',payload);await refresh();});});
 $('#extFile')?.addEventListener('change',e=>{const file=e.target.files[0],externalSourceId=$('#extSource').value,mode=$('#extMode').value;if(!file)return;return run(async()=>{if(file.size>8*1024*1024)throw Error('8 MiB file limit');const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(Error('Could not read import'));r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(file);});externalPreview=await api('/api/intake/external/upload',{externalSourceId,mode,originalFilename:file.name,declaredMimeType:file.type||'application/octet-stream',base64,actor:'user'});externalPage=0;await refresh();});});
 view.querySelectorAll('[data-ext-batch]').forEach(b=>b.addEventListener('click',()=>run(async()=>{externalPreview=await api('/api/intake/external/preview?batchId='+encodeURIComponent(b.dataset.extBatch));externalPage=0;})));
 view.querySelectorAll('[data-ext-map]').forEach(b=>b.addEventListener('click',()=>{const m=externalPreview.mappings.find(m=>m.mappingId===b.dataset.extMap),payload={mappingId:m.mappingId,revision:m.revision,canonicalAccountId:$('#map-'+m.mappingId).value,reason:$('#reason-'+m.mappingId).value,actor:'user'};return run(async()=>{await api('/api/intake/external/mapping',payload);await refresh();});}));
 $('#extPrev')?.addEventListener('click',()=>{externalPage=Math.max(0,externalPage-1);render();});$('#extNext')?.addEventListener('click',()=>{externalPage++;render();});
 $('#extConfirm')?.addEventListener('click',()=>{const payload={batchId:externalPreview.batch.batchId,previewHash:externalPreview.previewHash,candidateIds:externalPreview.candidates.filter(c=>c.status==='READY_TO_CONFIRM').map(c=>c.candidateId),idempotencyKey:'batch-review:'+externalPreview.previewHash,actor:'user'};return run(async()=>{const r=await api('/api/intake/external/confirm',payload);externalPreview=r;intakeNotice=r.outcomes.map(o=>o.status+(o.error?': '+o.error:'')).join('; ');await refresh();});});
}
function duplicateControls(c){return !['POSTED','REJECTED','CONFIRMED'].includes(c.status)&&c.duplicates?.status==='POSSIBLE_DUPLICATE'?'<p class="err">'+esc(enumLabel('POSSIBLE_DUPLICATE'))+' · '+esc(c.duplicates.matches.map(m=>m.candidateId+' ('+tr('product.source.'+m.sourceChannel)+')').join(', '))+'</p><input id="dup-'+esc(c.candidateId)+'" placeholder="'+esc(tr('external.reason'))+'" /><button type="button" class="btn ghost" data-dup-id="'+esc(c.candidateId)+'" data-decision="DISTINCT">'+esc(tr('external.distinct'))+'</button><button type="button" class="btn ghost" data-dup-id="'+esc(c.candidateId)+'" data-decision="DUPLICATE">'+esc(tr('external.duplicate'))+'</button>':'';}
function vIntake(documentOnly=false){
 const field=(name,label,value,type='text')=>'<label>'+esc(label)+'<input name="'+name+'" type="'+type+'" value="'+esc(value??'')+'" /></label>';
 const chart=cache.settings?.chart??[];
 const select=(name,label,value,items)=>'<label>'+esc(label)+'<select name="'+name+'">'+selectOptions(items,value,true)+'</select></label>';
 const externalIds=new Set(externalPreview?.batch.rows.slice(externalPage*20,externalPage*20+20).map(r=>r.candidateId)??[]);
 const candidates=intakeData.candidates.filter(c=>(!documentOnly||c.documentId)&&(!c.sourceChannel.startsWith('EXTERNAL_')||externalIds.has(c.candidateId))).map(c=>{
  const f=c.current,locked=['CONFIRMED','POSTED','REJECTED'].includes(c.status),editable=!locked;
  const validation=c.validation??c;
  if(c.candidateType==='EXTERNAL_JOURNAL')return '<article class="panel intake-candidate"><div class="candidate-heading"><h3>'+esc(tr('external.journal'))+'</h3><span class="status-tag">'+esc(statusLabel(c.status))+'</span></div><p>'+esc(tr('external.mappedLines').replace('{count}',String(f.journalLines?.length??0)))+'</p><p>'+esc((validation.conflicts??[]).join('; '))+'</p>'+duplicateControls(c)+'<details><summary>'+esc(tr('assistant.technicalDetails'))+'</summary><pre>'+esc(JSON.stringify({lines:f.journalLines,mappings:c.mappingRefs,confirmation:c.confirmation,posting:c.posting},null,2))+'</pre></details><form data-intake-form="'+esc(c.candidateId)+'">'+(c.status==='READY_TO_CONFIRM'||c.status==='CONFIRMED'?'<button type="button" class="btn gold" data-intake-action="confirm" data-candidate="'+esc(c.candidateId)+'">'+esc(tr('intake.confirm'))+'</button>':'')+(!locked?'<button type="button" class="btn ghost" data-intake-action="reject" data-candidate="'+esc(c.candidateId)+'">'+esc(tr('intake.reject'))+'</button>':'')+'</form></article>';
  return '<article class="panel intake-candidate"><div class="candidate-heading"><h3>'+esc(f.description??tr('product.reviewTransaction'))+'</h3><span class="status-tag" data-state="'+esc(c.status)+'">'+esc(statusLabel(c.status))+'</span></div><p class="muted">'+esc(tr('product.source.'+c.sourceChannel))+' · '+esc(tr('fx.functional'))+': '+esc(cache.ws.functionalCurrency??tr('ob.unknown'))+'</p>'+(c.semanticProvenance?.success?'<small class="provenance">'+esc(tr('muse.understood'))+'</small>':'<small class="muted">'+esc(tr('product.localInterpretation'))+'</small>')+(locked?'<details><summary>'+esc(tr('product.viewTransaction'))+'</summary>':'')+'<form data-intake-form="'+esc(c.candidateId)+'"><div class="grid2">'+
   field('transactionDate',tr('date'),f.transactionDate,'date')+field('amount',tr('amount'),f.amount)+field('currency',tr('currency'),f.currency)+field('counterparty',tr('counterparty'),f.counterparty)+field('description',tr('description'),f.description)+field('referenceNumber',tr('reference'),f.referenceNumber)+
   select('proposedTransactionType',tr('intake.classification'),f.proposedTransactionType,[['EXPENSE',tr('nav.purchase')],['REVENUE',tr('nav.sales')],['TRANSFER',tr('financial.settlement')]])+
   select('classificationAccountId',tr('intake.account'),f.classificationAccountId,chart.map(a=>[a.id,accountLabel(a)]))+
   select('paymentAccountId',tr('intake.paymentAccount'),f.paymentAccountId,chart.filter(a=>['101','202'].includes(a.code)).map(a=>[a.id,accountLabel(a)]))+
   (rtl()?select('paymentMethod',tr('intake.paymentMethod'),f.paymentMethod,['cash','bank','card','qr'].map(v=>[v,enumLabel(v)])):field('paymentMethod',tr('intake.paymentMethod'),f.paymentMethod))+select('settlementStatus',tr('intake.settlement'),f.settlementStatus,[['PAID',tr('intake.paid')]])+'</div>'+financialFields(c)+
   '<p class="muted">'+esc(tr('intake.dateNote'))+' '+esc([f.documentDate&&tr('product.documents')+': '+f.documentDate,f.invoiceDate&&tr('reference')+': '+f.invoiceDate,f.paymentDate&&tr('intake.settlement')+': '+f.paymentDate].filter(Boolean).join(' · '))+'</p>'+
   validationMessages(validation)+duplicateControls(c)+(c.lastError?'<p class="err">'+esc(friendlyError(c.lastError))+'</p>':'')+
   fxControls(c,editable)+'<div class="dlg-actions">'+(editable?'<button class="btn ghost" type="submit">'+esc(tr('intake.save'))+'</button><button class="btn ghost" type="button" data-intake-action="reject" data-candidate="'+esc(c.candidateId)+'">'+esc(tr('intake.reject'))+'</button>':'')+
   (c.status==='READY_TO_CONFIRM'||c.status==='CONFIRMED'?'<button class="btn gold" type="button" data-intake-action="confirm" data-candidate="'+esc(c.candidateId)+'">'+esc(c.status==='CONFIRMED'?tr('intake.retryPosting'):tr('intake.confirm'))+'</button>':'')+'</div></form>'+(locked?'</details>':'')+
   '<details><summary>'+esc(tr('intake.evidence'))+'</summary><button class="btn ghost" type="button" data-muse-evidence="'+esc(c.candidateId)+'">View evidence</button><pre>'+esc(JSON.stringify({fields:c.evidence,revisions:c.revisions,confirmation:c.confirmation,fx:c.fx,posting:c.posting},null,2))+'</pre></details>'+
   (c.posting?'<p role="status">'+esc(tr('intake.posted'))+' '+esc(c.posting.receipt.postingId)+'</p>':'')+'</article>';
 }).join('');
 return '<div class="panel"><h2>'+esc(tr(documentOnly?'product.documents':'nav.intake'))+'</h2><button class="btn ghost" id="reviewSetup" type="button">'+esc(tr('nav.onboarding'))+'</button><p>'+esc(tr('intake.hint'))+'</p>'+(!documentOnly?'<label>'+esc(tr('intake.chat'))+'<textarea id="intakeChat" rows="3">'+esc(intakeText)+'</textarea></label><button class="btn gold" id="intakeSend" type="button">'+esc(tr('intake.propose'))+'</button>':'')+'<label class="drop">'+esc(tr('intake.upload'))+'<input id="intakeFile" type="file" accept=".xlsx,.pdf,.png,.jpg,.jpeg,.txt,.csv" /></label>'+(cache.demo?.enabled?'<div class="toolbar"><span>'+esc(tr('product.syntheticSamples'))+'</span><button class="btn ghost" data-demo-document="receipt">'+esc(tr('product.sampleReceipt'))+'</button><button class="btn ghost" data-demo-document="invoice">'+esc(tr('product.sampleInvoice'))+'</button></div>':'')+'<p role="status">'+esc(pending?tr(pendingLabel):intakeNotice)+'</p></div>'+
  (!documentOnly?'<details class="panel advanced"'+(externalOpen?' open':'')+'><summary>'+esc(tr('external.title'))+'</summary>'+vExternal()+'</details>':'')+intakeData.documents.map(documentCard).join('')+museActivityPanel()+
  (!documentOnly?intakeData.chats.map(c=>'<details class="panel"><summary>'+esc(tr('product.source.CHAT'))+' · '+esc(statusLabel(c.status))+'</summary><p>'+esc(c.text)+'</p>'+(c.lastError?'<p class="err">'+esc(friendlyError(c.lastError))+'</p>':'')+'</details>').join(''):'')+candidates+(!candidates?'<div class="panel empty"><h3>'+esc(tr(documentOnly?'product.noDocuments':'product.noTransactions'))+'</h3><p>'+esc(tr('product.startTransactions'))+'</p></div>':'');
}
function friendlyError(message){const s=String(message??'');if(rtl()&&/ECONOMIC_SCOPE/.test(s))return tr('error.scope');if(/MUSE_UNAVAILABLE|semantic interpretation|Meta/i.test(s))return tr('product.errorMuse');if(/FX_/i.test(s))return tr('product.errorFx');if(/unsupported|MIME|file limit|8 MiB/i.test(s))return tr('product.errorDocument');if(/post|ledger|journal/i.test(s))return tr('product.errorPosting');if(rtl())return tr('error.generic');return s.split(/\r?\n/)[0].replace(/[A-Z]:\\[^ ]+/g,'').slice(0,220);}
function validationMessages(v){const gaps=[...(v.missingFields??[]),...(v.conflicts??[])];return gaps.length?'<p class="tax-pending">'+esc(tr(gaps.some(g=>/FX_/.test(g))?'product.errorFx':'product.reviewFields'))+'</p><details><summary>'+esc(tr('product.reviewDetails'))+'</summary><p>'+esc(rtl()?gaps.map(friendlyError).join('; '):gaps.join('; '))+'</p></details>':'';}
function documentCard(d){const candidates=d.candidates??[],interpreted=candidates.length>0||d.profileFacts?.length>0,meta=candidates.some(c=>c.semanticProvenance?.success),stages=[['original',true],['extracted',Boolean(d.extraction)],['interpreted',interpreted],['candidate',candidates.length>0],['review',candidates.some(c=>c.confirmation)],['posted',d.processingStatus==='POSTED']];return '<article class="panel document-card"><h3>'+esc(d.originalFilename)+'</h3><ol class="document-steps">'+stages.map(([step,done])=>'<li class="'+(done?'complete':'')+'">'+esc(tr('product.step.'+step))+'</li>').join('')+'</ol><p class="provenance">'+esc(interpreted?(meta?tr('muse.understood'):tr('product.localInterpretation')):statusLabel(d.processingStatus))+'</p>'+(d.lastError?'<p class="err">'+esc(friendlyError(d.lastError))+'</p>':'')+(d.warnings?.length?'<details><summary>'+esc(tr('product.reviewDetails'))+'</summary><p>'+esc(d.warnings.join(' '))+'</p></details>':'')+(d.profileFacts?.length?'<details><summary>'+esc(tr('intake.profileFacts'))+'</summary><pre>'+esc(JSON.stringify(d.profileFacts,null,2))+'</pre></details>':'')+'<a href="/api/intake/original?documentId='+encodeURIComponent(d.documentId)+'" download>'+esc(tr('intake.original'))+'</a> '+candidates.slice(0,1).map(c=>'<button class="btn ghost" type="button" data-muse-evidence="'+esc(c.candidateId)+'">View evidence</button>').join('')+(d.processingStatus==='FAILED'?'<button class="btn ghost" type="button" data-retry-document="'+esc(d.documentId)+'">'+esc(tr('intake.retry'))+'</button>':'')+'</article>';}
function museActivityPanel(){return '<details class="panel muse-activity"'+(assistantActivity!==null?' open':'')+'><summary>Muse activity and evidence</summary>'+(assistantActivity?.length?assistantActivity.map(e=>{const c=intakeData.candidates.find(candidate=>candidate.candidateId===e.sourceId||candidate.documentId===e.sourceId||candidate.sourceId===e.sourceId);return '<article class="evidence-passage"><strong>'+esc(e.purpose??'Muse activity')+'</strong><small> · '+esc(e.model??e.provider??'')+' · '+esc(e.status??'')+(e.at?' · '+esc(e.at):'')+'</small>'+(e.failure?'<p>'+esc(e.failure)+'</p>':'')+(c?'<p><button class="btn ghost" type="button" data-muse-evidence="'+esc(c.candidateId)+'">View source evidence</button></p>':'<p class="muted">Evidence unavailable for this activity event.</p>')+'<details><summary>Technical lineage</summary><pre>'+esc(JSON.stringify({sourceId:e.sourceId,sourceHash:e.sourceHash,candidateCount:e.candidateCount,responseStatus:e.responseStatus,schemaValidationSuccess:e.schemaValidationSuccess},null,2))+'</pre></details></article>';}).join(''):assistantActivity===null?'<p class="muted">Muse activity is loaded only when requested.</p><button class="btn ghost" type="button" id="loadMuseActivity">Load Muse activity</button>':'<p class="muted">No Muse activity has been recorded.</p>')+'</details>';}
async function openMuseEvidence(candidateId){
 const dialog=$('#evidenceDialog'),body=$('#evidenceBody');if(!dialog||!body)return;
 body.innerHTML='<p class="muted">Loading evidence…</p>';dialog.showModal();
 try{
  const result=await api('/api/muse/evidence?candidateId='+encodeURIComponent(candidateId)),e=result.evidence,s=e.source??{},financial=e.financialLineage??{},calculations=e.calculations??[];
  let html='<h3>'+esc(s.title??e.packId??'Evidence')+'</h3><p><strong>Authority:</strong> '+esc(s.authority??s.sourceKind??'Evidence record')+'</p><p><strong>Retrieved:</strong> '+esc(s.retrievedAt??'Not recorded')+'</p><p><strong>Provenance:</strong> '+esc(s.sha256??e.contentHash??'Unavailable')+'</p>';
  if(s.originalUrl)html+='<p><a href="'+esc(s.originalUrl)+'" target="_blank" rel="noopener noreferrer">Open saved original</a></p>';
  if(e.kind==='REGULATORY_CANDIDATE')html+='<p><strong>Candidate:</strong> '+esc(e.candidateId)+' · <strong>Status:</strong> '+esc(e.status)+' · <strong>Rules:</strong> '+esc((e.ruleIds??[]).join(', ')||'Unavailable')+'</p>';
  html+='<h4>Exact evidence used</h4>'+(e.fields?.length?e.fields.map(f=>'<article class="evidence-passage"><p><strong>'+esc(f.field??f.evidenceId??'Evidence')+'</strong> '+(f.locator?'· '+esc(f.locator):'')+'</p>'+(f.sourceUrl?'<p><a href="'+esc(f.sourceUrl)+'" target="_blank" rel="noopener noreferrer">Open original official source</a></p>':'')+'<blockquote>'+esc(f.quote??'Evidence excerpt unavailable')+'</blockquote><small>'+esc(f.sourceKind??'')+(f.confidence!=null?' · confidence '+esc(f.confidence):'')+(f.quoteVerified===false?' · Quote could not be matched to extracted source text':'')+'</small></article>').join(''):'<p>Evidence unavailable.</p>');
  if(e.kind==='REGULATORY_CANDIDATE'){
   html+='<details open><summary>Calculation and financial source lineage</summary>';
   html+=calculations.length?calculations.map(c=>'<article class="evidence-passage"><strong>'+esc(c.status??'')+' · '+esc(money(c.taxAmount?.amountMinor,c.currency))+' estimated tax</strong><p>Taxable base: '+esc(money(c.taxableBase?.amountMinor,c.currency))+' · determination: '+esc(c.determinationId??'')+'</p>'+(c.inputEvidence??[]).map(f=>'<p><strong>'+esc(f.name)+'</strong>: '+esc(f.value?.amountMinor!=null?money(f.value.amountMinor,f.value.currency):f.value??'')+'<br><small>'+esc(f.confirmationAuthority??'')+(f.provisional?' · provisional':'')+'</small><br>'+esc(f.evidenceReference??'')+'</p>').join('')+'</article>').join(''):'<p>Calculation linkage unavailable.</p>';
   html+=financial.records?.length?financial.records.map(r=>'<article class="evidence-passage"><strong>'+esc(r.transaction?.counterparty??r.transaction?.description??r.candidateId)+'</strong> · '+esc(r.status??'')+' '+esc(r.transaction?.currency??'')+' '+esc(r.transaction?.amount??'')+'<p>'+esc(r.transaction?.description??'')+'</p><small>'+esc(r.source?.title??'Source')+' · SHA-256 '+esc(r.source?.sha256??'unavailable')+'</small>'+(r.source?.originalUrl?'<p><a href="'+esc(r.source.originalUrl)+'" target="_blank" rel="noopener noreferrer">Open source document</a></p>':'')+(r.evidence??[]).filter(x=>x.quote).map(x=>'<blockquote>'+esc(x.quote)+(x.quoteVerified?'':' · quote verification unavailable')+'</blockquote>').join('')+'</article>').join(''):'<p>Financial source records unavailable.</p>';
   html+='</details>';
  }
  if(e.rawText)html+='<details><summary>Show raw OCR / extracted text</summary><pre>'+esc(e.rawText)+'</pre><p class="muted">This is BiG-M text extraction, not the original document.</p></details>';
  if(e.disclosure)html+='<details><summary>Applicability and uncertainty</summary><pre>'+esc(JSON.stringify(e.disclosure,null,2))+'</pre></details>';
  if(e.lineage)html+='<details><summary>Technical lineage</summary><pre>'+esc(JSON.stringify(e.lineage,null,2))+'</pre></details>';
  body.innerHTML=html;
 }catch(error){body.innerHTML='<p class="err">'+esc(error.message)+'</p><p>Evidence unavailable.</p>';}
}function fxControls(c,editable){
 if(!cache.ws?.activated||c.current.currency===cache.ws.functionalCurrency||c.candidateType==='EXTERNAL_JOURNAL')return '';
 const fx=c.fx,details=fx?.rate?'<div class="fx-summary"><p>'+esc(tr('fx.original'))+': <strong>'+esc(money(fx.conversion.original.amountMinor,fx.conversion.original.currency))+'</strong></p><p>'+esc(tr('fx.functional'))+': <strong>'+esc(money(fx.conversion.functional.amountMinor,fx.conversion.functional.currency))+'</strong></p><p>'+esc(tr('fx.rate'))+': '+esc(fx.rate.rate)+' '+esc(fx.rate.quoteCurrency)+' / '+esc(fx.rate.baseCurrency)+'; '+esc(tr('fx.date'))+': '+esc(BigmLocale.date(fx.rate.rateDate,UILANG))+'</p><p>'+esc(tr('fx.provider'))+': '+esc(fx.rate.provider)+(cache.demo?.enabled?' · '+esc(tr('product.recordedFx')):'')+'</p></div>':'';
 return '<section><p>'+esc(tr('fx.review'))+'</p>'+details+'<p>'+esc(fx?.status??'FX_REQUIRED')+'</p>'+(editable?'<button type="button" class="btn ghost" data-intake-action="fx/resolve" data-candidate="'+esc(c.candidateId)+'">'+esc(tr('fx.resolve'))+'</button>':'')+(editable&&fx?.status==='AVAILABLE'?'<button type="button" class="btn gold" data-intake-action="fx/approve" data-candidate="'+esc(c.candidateId)+'">'+esc(tr('fx.approve'))+'</button>':'')+'</section>';
}
function wireIntake(){
 wireExternal();
 view.querySelectorAll('[data-demo-document]').forEach(b=>b.addEventListener('click',()=>run(async()=>{const r=await api('/api/demo/document',{sample:b.dataset.demoDocument});intakeNotice=tr(r.duplicate?'intake.duplicate':'intake.uploaded');await refresh();},'product.loadingDocument')));
 view.querySelectorAll('[data-dup-id]').forEach(b=>b.addEventListener('click',()=>{const c=intakeData.candidates.find(c=>c.candidateId===b.dataset.dupId),payload={candidateId:c.candidateId,revision:c.revision,decision:b.dataset.decision,reason:$('#dup-'+c.candidateId).value,actor:'user'};return run(async()=>{await api('/api/intake/duplicates/review',payload);await refresh();});}));
 $('#intakeChat')?.addEventListener('input',e=>{intakeText=e.target.value;intakeRequestId=null;});
 $('#intakeSend')?.addEventListener('click',()=>run(async()=>{intakeRequestId??=crypto.randomUUID();await api('/api/intake/chat',{text:intakeText,requestId:intakeRequestId});intakeText='';intakeRequestId=null;await refresh();},'product.loadingTransaction'));
 $('#intakeFile')?.addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;return run(async()=>{if(file.size>8*1024*1024)throw Error('8 MiB file limit');const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('Could not read document'));reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(file);});const r=await api('/api/intake/upload',{base64,originalFilename:file.name,declaredMimeType:file.type||'application/octet-stream'});intakeNotice=tr(r.duplicate?'intake.duplicate':'intake.uploaded');await refresh();},'product.loadingDocument');});
 view.querySelectorAll('[data-intake-form]').forEach(form=>{const c=intakeData.candidates.find(c=>c.candidateId===form.dataset.intakeForm);if(['POSTED','REJECTED','CONFIRMED'].includes(c.status))form.querySelectorAll('input,select').forEach(el=>{el.disabled=true;});form.addEventListener('submit',e=>{e.preventDefault();return run(async()=>{const changes=Object.fromEntries(new FormData(form));for(const k of Object.keys(changes))changes[k]=changes[k]||null;await api('/api/intake/edit',{candidateId:c.candidateId,revision:c.revision,changes,actor:'user'});await refresh();});});});
 view.querySelectorAll('[data-intake-action]').forEach(button=>button.addEventListener('click',()=>{
  const c=intakeData.candidates.find(c=>c.candidateId===button.dataset.candidate),action=button.dataset.intakeAction;
  const visibleFields=Object.fromEntries(new FormData(button.closest('form')));
  if(action==='confirm'&&c.status!=='CONFIRMED'&&Object.entries(visibleFields).some(([key,value])=>(value||null)!==(c.current[key]||null))){lastError=tr('intake.unsaved');toast(lastError,true);return;}
  return run(async()=>{
   await api('/api/intake/'+action,{candidateId:c.candidateId,revision:c.revision,reviewHash:c.confirmation?.reviewHash??c.reviewHash,idempotencyKey:c.confirmation?.idempotencyKey??'confirm:'+c.candidateId+':'+c.revision,quoteHash:c.fx?.quoteHash,decisionSource:'HUMAN',actor:'user'});await refresh();},action==='fx/resolve'?'product.loadingFx':action==='confirm'?'product.loadingPosting':'working');
 }));
 view.querySelectorAll('[data-retry-document]').forEach(button=>button.addEventListener('click',()=>run(async()=>{await api('/api/intake/retry',{documentId:button.dataset.retryDocument});await refresh();})));
}
function assistantBubble(message){
 if(message.role==='user')return '<article class="assistant-message user"><span class="assistant-speaker">'+esc(tr('assistant.you'))+'</span><div class="assistant-bubble">'+esc(message.text)+'</div></article>';
 if(message.text)return '<article class="assistant-message"><span class="assistant-speaker">'+esc(tr('muse.assistant'))+'</span><div class="assistant-bubble">'+esc(message.text)+'</div></article>';
 const result=message.result;if(!result)return '';
 return '<article class="assistant-message"><span class="assistant-speaker">'+esc(tr('muse.assistant'))+(result.provider==='meta'?' · '+esc(tr('assistant.ready')):'')+'</span><div class="assistant-bubble assistant-answer">'+result.sections.map(s=>'<section class="answer-section"><h3>'+esc(tr('product.section.'+s.kind))+'</h3>'+s.facts.map(f=>'<p>'+esc(f.display)+'</p>').join('')+(s.explanation?'<p>'+esc(s.explanation)+'</p>':'')+'</section>').join('')+(result.status==='MUSE_UNAVAILABLE'?'<p class="muted">'+esc(tr('assistant.offline'))+'</p>':'')+'</div></article>';
}
function vAssistant(){
 const status=cache.ob?.ai?.muse;
 const thread=assistantMessages.length?assistantMessages.map(assistantBubble).join(''):'<div class="assistant-welcome"><span class="assistant-avatar">B</span><h2>'+esc(tr('assistant.welcomeTitle'))+'</h2><p>'+esc(tr('assistant.welcomeBody'))+'</p></div>';
 return '<section class="assistant-page"><header class="assistant-heading"><div class="assistant-avatar">B</div><div><p class="eyebrow">BiG-M Lite</p><h1>'+esc(tr('muse.assistant'))+'</h1><p>'+esc(tr('assistant.subtitle'))+'</p></div><span class="assistant-availability '+(status?.enabled?'ready':'offline')+'" role="status">'+esc(status?.enabled?tr('assistant.ready'):tr('assistant.offline'))+'</span></header>'+
 '<div class="assistant-panel"><div class="assistant-thread" id="assistantThread" role="log" aria-live="polite">'+thread+'</div>'+
 '<div class="assistant-prompts"><span>'+esc(tr('assistant.tryAsking'))+'</span><button type="button" class="btn ghost" id="quickTax">'+esc(tr('product.askTax'))+'</button><button type="button" class="btn ghost" id="quickReport">'+esc(tr('product.askReport'))+'</button></div>'+
 '<div class="assistant-composer"><label class="sr-only" for="assistantText">'+esc(tr('muse.question'))+'</label><textarea id="assistantText" maxlength="2000" rows="2" placeholder="'+esc(tr('assistant.placeholder'))+'">'+esc(assistantText)+'</textarea><div class="assistant-composer-actions"><div class="assistant-attachments"><input id="assistantFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.xls" hidden><button type="button" class="btn ghost" id="assistantAttach">'+esc(tr('assistant.attach'))+'</button><button type="button" class="btn ghost" id="reviewSetup">'+esc(tr('assistant.profileSettings'))+'</button></div><button type="button" class="btn gold" id="assistantSend"'+(pending?' disabled':'')+'>'+esc(pending?tr('working'):tr('ob.send'))+'</button></div><p class="assistant-disclosure">'+esc(tr('product.assistantBoundary'))+'</p></div></div>'+
 '<details class="assistant-more"><summary>'+esc(tr('assistant.moreDetails'))+'</summary><div class="toolbar"><button type="button" class="btn ghost" id="assistantRules">'+esc(tr('assistant.checkCoverage'))+'</button>'+(status?.traceEnabled?'<button type="button" class="btn ghost" id="assistantTrace">'+esc(tr('assistant.activity'))+'</button>':'')+'</div>'+(assistantDiscovery?'<p>'+esc(assistantDiscovery.candidates.length?tr('assistant.coverageFound'):tr('assistant.coverageNone'))+'</p><details><summary>'+esc(tr('assistant.technicalDetails'))+'</summary><pre>'+esc(JSON.stringify(assistantDiscovery,null,2))+'</pre></details>':'')+(assistantTrace?'<details><summary>'+esc(tr('assistant.technicalDetails'))+'</summary><pre>'+esc(JSON.stringify(assistantTrace,null,2))+'</pre></details>':'')+'<p><button type="button" class="btn ghost" id="loadMuseActivity">'+esc(tr('assistant.activity'))+'</button></p>'+(assistantActivity?.length?assistantActivity.map(e=>'<article class="evidence-passage"><strong>'+esc(e.purpose??'')+'</strong><p>'+esc(e.status??'')+' · '+esc(e.model??'')+'</p>'+((intakeData.candidates.find(c=>c.candidateId===e.sourceId||c.documentId===e.sourceId))?'<p>'+esc(tr('intake.evidence'))+'</p>':'')+'</article>').join(''):'')+'</details></section>';
}
function wireAssistant(){
 $('#assistantText')?.addEventListener('input',e=>{assistantText=e.target.value;});
 const send=()=>{const question=assistantText.trim();if(!question||pending)return;return run(async()=>{assistantMessages.push({role:'user',text:question});assistantText='';assistantResult=await api('/api/muse/assistant',{question});assistantMessages.push({role:'assistant',result:assistantResult});await refreshOb();});};
 $('#assistantSend')?.addEventListener('click',send);
 $('#assistantText')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();send();}});
 $('#assistantAttach')?.addEventListener('click',()=>$('#assistantFile')?.click());
 $('#assistantFile')?.addEventListener('change',e=>{const file=e.target.files?.[0];if(!file)return;return run(async()=>{if(file.size>8*1024*1024)throw Error('8 MiB file limit');const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('Could not read document'));reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(file);});const result=await api('/api/intake/upload',{base64,originalFilename:file.name,declaredMimeType:file.type||'application/octet-stream'});assistantMessages.push({role:'user',text:'📎 '+file.name});assistantMessages.push({role:'assistant',text:tr(result.duplicate?'intake.duplicate':'assistant.documentReceived')});intakeData=await api('/api/intake');e.target.value='';render();},'product.loadingDocument');});
 $('#assistantRules')?.addEventListener('click',()=>run(async()=>{assistantDiscovery=await api('/api/muse/discovery',{});await refreshOb();}));
 $('#assistantTrace')?.addEventListener('click',()=>run(async()=>{assistantTrace=await api('/api/muse/trace');}));
 $('#quickTax')?.addEventListener('click',()=>explain('TAX'));$('#quickReport')?.addEventListener('click',()=>explain('REPORT'));
}
function explain(topic){assistantText=tr(topic==='TAX'?'product.taxQuestion':'product.reportQuestion');const question=assistantText;route='assistant';return run(async()=>{assistantMessages.push({role:'user',text:question});assistantResult=await api('/api/muse/assistant',{question,topic});assistantMessages.push({role:'assistant',result:assistantResult});assistantText='';await refreshOb();},'product.loadingExplain');}
function render(){
 view.dataset.page=route;
 renderTabs();view.innerHTML=route==='onboarding'?vOnboarding()+'<button type="button" class="btn ghost" id="openIntake">'+esc(tr('nav.intake'))+'</button>':route==='assistant'?vAssistant():route==='intake'?vIntake():route==='documents'?vIntake(true):route==='tax'?vTax():route==='dashboard'?vDashboard():route==='sales'?vTransactions('SALE'):route==='purchase'?vTransactions('PURCHASE'):route==='reports'?vReports():route==='accounting'?vAccounting():route==='import'?vImport():vSettings();
 if(pending)view.innerHTML='<p class="processing" role="status">'+esc(tr(pendingLabel))+'</p>'+view.innerHTML;
 if(lastError&&route!=='onboarding')view.innerHTML='<p class="err error-banner" role="alert">'+esc(lastError)+'</p>'+view.innerHTML;
 if(['dashboard','reports'].includes(route)&&cache.position?.hasFinancialEvents)view.innerHTML=vFinancialPosition()+view.innerHTML;
 view.querySelectorAll('[data-muse-evidence]').forEach(button=>button.addEventListener('click',()=>openMuseEvidence(button.dataset.museEvidence)));
 $('#loadMuseActivity')?.addEventListener('click',()=>run(async()=>{assistantActivity=(await api('/api/muse/activity')).events;render();}));
 $('#evidenceClose')?.addEventListener('click',()=>$('#evidenceDialog')?.close());
 view.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>{if(!pending){route=b.dataset.go;render();}}));
 $('#expandedReviewer')?.addEventListener('input',e=>{taxReviewer=e.target.value;});
 $('#expandedLawApprove')?.addEventListener('click',()=>run(async()=>{if(!taxReviewer.trim())throw Error(tr('supportedTax.reviewer'));for(const law of cache.scopedLaw.filter(c=>(c.pack.packId??c.pack.treatyPackId??'').startsWith('YOUSSEF_')&&c.governanceStatus!=='APPROVED'))await api('/api/tax/scoped/law/review',{candidateId:law.candidateId,contentHash:law.contentHash,reviewedHashes:law.reviewedHashes,actor:taxReviewer,decisionSource:'HUMAN',reason:tr('supportedTax.note')});await refresh();}));
 $('#expandedTaxConfirm')?.addEventListener('click',()=>run(async()=>{if(!taxReviewer.trim())throw Error(tr('supportedTax.reviewer'));await api('/api/tax/expanded/confirm',{proposalHash:cache.position.scopePosition.expandedTax.proposal.proposalHash,actor:taxReviewer,decisionSource:'HUMAN'});await refresh();}));
 $('#taxReviewer')?.addEventListener('input',e=>{taxReviewer=e.target.value;});
 $('#scopedLawApprove')?.addEventListener('click',()=>run(async()=>{if(!taxReviewer.trim())throw Error(tr('supportedTax.reviewer'));const p=cache.position.scopePosition.taxCalculation.proposal,law=cache.scopedLaw.find(c=>c.pack.effectiveFrom<=p.request.period.periodStart&&c.pack.effectiveTo>=p.request.period.periodEnd);await api('/api/tax/scoped/law/review',{candidateId:law.candidateId,contentHash:law.contentHash,reviewedHashes:law.reviewedHashes,actor:taxReviewer,decisionSource:'HUMAN',reason:tr('supportedTax.note')});await refresh();}));
 $('#scopedTaxConfirm')?.addEventListener('click',()=>run(async()=>{if(!taxReviewer.trim())throw Error(tr('supportedTax.reviewer'));await api('/api/tax/scoped/confirm',{proposalHash:cache.position.scopePosition.taxCalculation.proposal.proposalHash,actor:taxReviewer,decisionSource:'HUMAN'});await refresh();}));
 $('#demoTaxReview')?.addEventListener('click',()=>run(async()=>{await api('/api/tax/review/start',{request:cache.demo.taxReviewRequest});await refresh();}));
 $('#explainTax')?.addEventListener('click',()=>explain('TAX'));$('#explainReport')?.addEventListener('click',()=>explain('REPORT'));
 $('#explainPosition')?.addEventListener('click',()=>{assistantText=tr('financial.positionQuestion');route='assistant';return run(async()=>{assistantResult=await api('/api/muse/assistant',{question:assistantText});await refreshOb();},'product.loadingExplain');});
 if(route==='onboarding'||route==='intake')view.innerHTML+='<button type="button" class="btn ghost" id="openAssistant">'+esc(tr('muse.assistant'))+'</button>';
 topLang.disabled=pending;if(pending)view.querySelectorAll('input,select,textarea,button').forEach(el=>{el.disabled=true;});
 $('#openAssistant')?.addEventListener('click',()=>{route='assistant';render();});
 if(route==='assistant')wireAssistant();
 const assistantThread=$('#assistantThread');if(assistantThread)assistantThread.scrollTop=assistantThread.scrollHeight;
 $('#openIntake')?.addEventListener('click',()=>{route='intake';render();});
 if(route==='onboarding'){wireOnboarding();return;}
 if(['intake','documents'].includes(route))wireIntake();
 $('#newTx')?.addEventListener('click',()=>openTx(route==='purchase'?'PURCHASE':'SALE'));
 $('#reviewSetup')?.addEventListener('click',async()=>{route='onboarding';await refreshOb();render();});
 view.querySelectorAll('[data-reverse]').forEach(b=>b.addEventListener('click',()=>openReversal(b.dataset.reverse)));
 $('#csvText')?.addEventListener('input',e=>{csvText=e.target.value;});
 $('#csvRun')?.addEventListener('click',()=>run(async()=>{const r=await api('/api/import/csv',{csv:csvText});csvReport=r.report;await refresh();}));
}
function transactionDate(){const today=new Date().toISOString().slice(0,10),p=cache.ws.period;return today>=p.periodStart&&today<=p.periodEnd?today:p.periodStart;}
function openTx(kind){
 const dialog=$('#txDialog'),sale=kind==='SALE';
 dialog.innerHTML='<form id="txForm" class="dlg"><h3>'+esc(tr(sale?'nav.sales':'nav.purchase'))+'</h3><div class="grid2">'+
 '<label>ID<input name="id" required value="tx-'+Date.now()+'" /></label><label>'+esc(tr('date'))+'<input name="date" type="date" required value="'+transactionDate()+'" /></label>'+
 '<label>'+esc(tr('description'))+'<input name="description" required /></label><label>'+esc(tr('amount'))+'<input name="amountMajor" required inputmode="decimal" /></label>'+
 '<label>'+esc(tr('currency'))+'<select name="currency">'+selectOptions(cache.ob.currencies.map(c=>[c.code,c.code]),cache.ws.functionalCurrency)+'</select></label>'+
 '<label>'+esc(tr('counterparty'))+'<input name="counterparty" required /></label><label>'+esc(tr('reference'))+'<input name="reference" required /></label></div><p class="err" id="txErr" hidden></p>'+
 '<div class="dlg-actions"><button type="button" class="btn ghost" id="txCancel">'+esc(tr('action.cancel'))+'</button><button type="submit" class="btn gold">'+esc(tr('action.post'))+'</button></div></form>';
 $('#txCancel').addEventListener('click',()=>dialog.close());
 $('#txForm').addEventListener('submit',async e=>{
  e.preventDefault();if(pending)return;pending=true;
  const submit=e.target.querySelector('[type=submit]');submit.disabled=true;
  try{
   const f=Object.fromEntries(new FormData(e.target)),ws=cache.ws;
   const payload={id:f.id.trim(),orgId:ws.organizationId,date:f.date,jurisdiction:ws.jurisdiction??'ZZ',currency:f.currency,description:f.description,amountMajor:f.amountMajor.trim()};
   if(sale){payload.customer=f.counterparty;payload.invoiceRef=f.reference;}else{payload.supplier=f.counterparty;payload.billRef=f.reference;}
   await api(sale?'/api/sales':'/api/purchases',payload);dialog.close();await refresh();render();
  }catch(error){$('#txErr').textContent=error.message;$('#txErr').hidden=false;}
  finally{pending=false;submit.disabled=false;}
 });dialog.showModal();
}
function openReversal(journalId){
 const dialog=$('#revDialog');dialog.innerHTML='<form class="dlg" id="revForm"><h3>'+esc(tr('reversal'))+'</h3><label>ID<input name="id" required value="rev-'+Date.now()+'" /></label><label>'+esc(tr('date'))+'<input name="date" type="date" required value="'+transactionDate()+'" /></label><label>'+esc(tr('description'))+'<input name="memo" /></label><p class="err" id="revErr" hidden></p><div class="dlg-actions"><button type="button" id="revCancel" class="btn ghost">'+esc(tr('action.cancel'))+'</button><button type="submit" class="btn gold">'+esc(tr('action.post'))+'</button></div></form>';
 $('#revCancel').addEventListener('click',()=>dialog.close());$('#revForm').addEventListener('submit',async e=>{e.preventDefault();if(pending)return;pending=true;try{const f=Object.fromEntries(new FormData(e.target));await api('/api/reversals',{journalId,...f});dialog.close();await refresh();render();}catch(error){$('#revErr').textContent=error.message;$('#revErr').hidden=false;}finally{pending=false;}});dialog.showModal();
}
topLang.addEventListener('change',e=>{const language=e.target.value;return run(async()=>{await api('/api/onboarding/language',{language});await refresh();});});
$('#demoBtn').addEventListener('click',()=>run(async()=>{await api('/api/demo/seed',{});await refresh();}));
async function boot(){const preferred=(typeof location!=='undefined'&&typeof URLSearchParams!=='undefined'?new URLSearchParams(location.search).get('lang'):null)??(typeof navigator!=='undefined'&&navigator.language?.startsWith('ar')?'ar-MA':null);view.innerHTML='<div class="panel">'+(preferred==='ar-MA'?'كنحملو…':'Loading…')+'</div>';try{if(preferred&&BigmLocale.supported(preferred))await api('/api/onboarding/language',{language:preferred});await refresh();if(cache.ws.activated&&cache.ob.active?.profileRevision===cache.ob.profileRevision){route='dashboard';await loadLanguage(cache.ob.uiLocale??cache.ob.uiLanguage);}render();}catch(e){view.innerHTML='<div class="panel err">'+esc(preferred==='ar-MA'?'ما قدرناش نحملو الصفحة. عاود المحاولة.':e.message)+'</div>';}}
boot();
