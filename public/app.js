'use strict';
const $=s=>document.querySelector(s);
const view=$('#view'),tabsEl=$('#tabs'),topLang=$('#topLang');
let route='onboarding',cache={ws:null,ob:null,summary:null,txs:[],journals:[],settings:null,monthly:[],audit:null};
let STR={},UILANG='en',loadedLanguage=null,pending=false,userInput='',chat=[],lastError='',csvText='',csvReport=null;
const TABS=[['onboarding','nav.onboarding'],['dashboard','nav.dashboard'],['intake','nav.intake'],['sales','nav.sales'],['purchase','nav.purchase'],['accounting','nav.accounting'],['reports','nav.reports'],['import','nav.import'],['settings','nav.settings']];
let intakeData={documents:[],chats:[],candidates:[]},intakeText='',intakeRequestId=null,intakeNotice='';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tr=k=>STR[k]??k;
async function api(path,body){
 const res=await fetch(path,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const data=await res.json();if(!res.ok||data.ok===false)throw Error(data.error??'Request failed');return data;
}
function toast(text,error=false){const el=document.createElement('div');el.className='toast'+(error?' error':'');el.textContent=text;$('#toasts').appendChild(el);setTimeout(()=>el.remove(),5000);}
function money(minor,currency=cache.ws?.functionalCurrency){
 if(!currency||minor==null)return '—';
 const decimals=cache.ob?.currencies?.find(c=>c.code===currency)?.minorUnits??2;
 const negative=String(minor).startsWith('-'),digits=String(minor).replace(/^-/,'').padStart(decimals+1,'0');
 const whole=decimals?digits.slice(0,-decimals):digits,fraction=decimals?digits.slice(-decimals):'';
 const locale=UILANG==='id'?'id-ID':'en-US',separator=UILANG==='id'?',':'.';
 const formatted=new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(BigInt(whole));
 return currency+' '+(negative?'-':'')+formatted+(decimals?separator+fraction:'');
}
async function loadLanguage(lang){
 UILANG=lang;document.documentElement.lang=lang;
 if(loadedLanguage!==lang){const r=await fetch('/i18n/'+lang+'.json');STR=await r.json();loadedLanguage=lang;}
 topLang.value=lang;
}
async function refreshOb(){
 const [ob,ws]=await Promise.all([api('/api/onboarding/state'),api('/api/workspace')]);cache.ob=ob;cache.ws=ws.workspace;
 await loadLanguage(route==='onboarding'?ob.uiLanguage:cache.ws.language);
 if(!chat.length){chat.push({who:'ai',text:ob.profileState.turnCount?tr('ob.resumed'):tr('ob.greeting')});if(ob.profileState.turnCount&&ob.question?.key!=='done')chat.push({who:'ai',text:ob.question.text});}
}
async function refresh(){
 await refreshOb();
 intakeData=await api('/api/intake');
 if(cache.ws.activated){
  const [s,t,j,m,a,settings]=await Promise.all([api('/api/summary'),api('/api/transactions'),api('/api/journals'),api('/api/reports/monthly'),api('/api/audit'),api('/api/settings')]);
  Object.assign(cache,{summary:s.summary,txs:t.transactions,journals:j.journals,monthly:m.months,audit:a,settings});
 }
}
function renderTabs(){
 const active=Boolean(cache.ws?.activated);tabsEl.hidden=!active;$('#auditPill').hidden=!active;$('#demoBtn').hidden=!active;
 $('#demoNote').hidden=!cache.txs.some(t=>t.demo);
 if(!active){if(route!=='intake')route='onboarding';tabsEl.innerHTML='';return;}
 const allowed=new Set(['onboarding','dashboard','settings','intake',...cache.ws.modules]);
 tabsEl.innerHTML=TABS.filter(([id])=>allowed.has(id)).map(([id,key])=>'<button type="button" class="tab" data-route="'+id+'" aria-selected="'+(route===id)+'">'+esc(tr(key))+'</button>').join('');
 tabsEl.querySelectorAll('[data-route]').forEach(b=>b.addEventListener('click',async()=>{if(pending)return;route=b.dataset.route;await loadLanguage(route==='onboarding'?cache.ob.uiLanguage:cache.ws.language);render();}));
 $('#auditPill').textContent=cache.audit?.verify?.ok?tr('audit.valid'):tr('audit.review');
 $('#demoBtn').textContent=tr('demo.load');
}
function country(code){return cache.ob?.jurisdictions?.find(j=>j.code===code)?.name??code;}
function fact(key){return cache.ob?.slots?.[key]?.value??null;}
function basisValues(basis){return (cache.ob?.jurisdictionCandidates??[]).filter(f=>f.basis===basis&&f.status!=='REJECTED').map(f=>country(f.countryCode)).join(', ');}
function currentBasis(basis){return (cache.ob?.jurisdictionCandidates??[]).find(f=>f.basis===basis&&f.status==='CANDIDATE')?.countryCode??'';}
function selectOptions(items,value,blank=false){return (blank?'<option value="">'+esc(tr('ob.unknown'))+'</option>':'')+items.map(([id,label])=>'<option value="'+esc(id)+'"'+(id===value?' selected':'')+'>'+esc(label)+'</option>').join('');}
function vOnboarding(){
 const ob=cache.ob;if(!ob)return '<div class="panel">'+esc(tr('loading'))+'</div>';
 const p=ob.proposal,confirmed=ob.active?.profileRevision===ob.profileRevision;
 const row=(label,value)=>'<div class="ob-kv"><span>'+esc(label)+'</span><strong>'+esc(Array.isArray(value)?value.join(', '):value||tr('ob.unknown'))+'</strong><small class="ob-badge '+(confirmed?'ok':'need')+'">'+esc(value?(confirmed?tr('ob.confirmed'):tr('ob.needsConfirm')):'')+'</small></div>';
 const understand='<div class="panel ob-side-block"><h3>'+esc(tr('ob.understandTitle'))+'</h3>'+
  row(tr('ob.fBusiness'),fact('org.name')||fact('org.businessType'))+
  row(tr('ob.nationality'),country(fact('user.nationality')))+
  row(tr('ob.workLocation'),basisValues('BUSINESS_WORK_LOCATION'))+
  row(tr('ob.registration'),basisValues('REGISTRATION'))+
  row(tr('ob.taxResidence'),basisValues('TAX_RESIDENCE'))+
  row(tr('ob.fCustomers'),basisValues('CUSTOMER_LOCATION'))+
  row(tr('ob.bankLocation'),basisValues('ACCOUNT_LOCATION'))+
  row(tr('ob.fCurrency'),fact('currency.functional'))+
  row(tr('ob.fOther'),fact('currency.transactions')?.join(', '))+
  row(tr('ob.foreignPurchases'),fact('currency.foreignPurchases')?.join(', '))+'</div>';
 const countries=ob.jurisdictions.map(j=>[j.code,j.name]),currencies=ob.currencies.map(c=>[c.code,c.code+' — '+c.name]);
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
   field(tr('ob.sLanguage'),'<select id="setLang">'+selectOptions([['en','English'],['id','Bahasa Indonesia']],p.language)+'</select>')+
   '<div class="grid2">'+field(tr('period.start'),'<input id="setStart" type="date" value="'+esc(p.period.periodStart)+'" />')+
   field(tr('period.end'),'<input id="setEnd" type="date" value="'+esc(p.period.periodEnd)+'" />')+'</div>'+
   '<p>'+esc(tr('ob.sFeatures'))+': '+p.modules.map(m=>esc(tr('nav.'+m))).join(', ')+'</p>'+
   '<p class="tax-pending">'+esc(tr('tax.review'))+'</p>'+
   '<div class="ob-actions"><button type="button" id="obUse" class="btn gold"'+(pending?' disabled':'')+'>'+esc(pending?tr('working'):tr('ob.useSetup'))+'</button></div></div>';
 }
 const provider=ob.ai?.providerUsed==='meta'?tr('provider.meta')+(ob.ai.model?' · '+ob.ai.model:''):tr('provider.fallback');
 const error=lastError?'<p class="err" role="alert">'+esc(lastError)+'</p>':'';
 return '<div class="ob-wrap"><div class="ob-hero"><h1>'+esc(tr('ob.headline'))+'</h1><p>'+esc(tr('ob.subheadline'))+'</p></div>'+
  (cache.ws?.activated?'<p class="tax-pending">'+esc(tr('ob.editingActive'))+'</p>':'')+
  '<div class="ob-grid"><div class="panel ob-chat"><div class="chat" id="obChat">'+chat.map(m=>'<div class="chat-row '+m.who+'"><div class="bubble"><p>'+esc(m.text)+'</p></div></div>').join('')+'</div>'+
  '<div class="ob-input-row"><input id="obInput" aria-label="'+esc(tr('ob.bigPlaceholder'))+'" placeholder="'+esc(tr('ob.bigPlaceholder'))+'" value="'+esc(userInput)+'" autocomplete="off"'+(pending?' disabled':'')+' /><button type="button" class="btn gold" id="obSend"'+(pending?' disabled':'')+'>'+esc(pending?tr('working'):tr('ob.send'))+'</button></div>'+
  '<small class="muted" role="status">'+esc(provider)+'</small>'+error+'<p class="muted">'+esc(tr('tax.review'))+'</p></div><aside class="ob-aside">'+understand+setup+'</aside></div></div>';
}
async function prepare(){
 await refreshOb();
 if(!cache.ob.readyForProposal)return;
 await api('/api/onboarding/propose',{});await api('/api/onboarding/validate',{});await refreshOb();
}
async function run(work){
 if(pending)return;pending=true;lastError='';render();
 try{await work();}catch(e){lastError=e.message;toast(e.message,true);}
 finally{pending=false;render();}
}
function wireOnboarding(){
 const input=$('#obInput');
 input?.addEventListener('input',e=>{userInput=e.target.value;});
 const send=()=>{const text=userInput.trim();if(!text||pending)return;return run(async()=>{userInput='';chat.push({who:'user',text});const r=await api('/api/onboarding/turn',{text});chat.push({who:'ai',text:r.question.text});await prepare();});};
 $('#obSend')?.addEventListener('click',send);input?.addEventListener('keydown',e=>{if(e.key==='Enter')send();});
 const edit=(selector,payload)=>$(selector)?.addEventListener('change',e=>run(async()=>{await api('/api/onboarding/edit',payload(e.target.value));await prepare();}));
 edit('#setName',v=>({slot:'org.name',value:v}));edit('#setBiz',v=>({slot:'org.businessType',value:v}));
 edit('#setWork',v=>({basis:'BUSINESS_WORK_LOCATION',countryCode:v||null}));edit('#setRegistration',v=>({basis:'REGISTRATION',countryCode:v||null}));
 edit('#setCur',v=>({slot:'currency.functional',value:v}));edit('#setLang',v=>({slot:'user.language',value:v}));
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
 return rows.map(tx=>'<tr><td>'+esc(tx.id)+(tx.demo?' <span class="tag demo">DEMO</span>':'')+'</td><td>'+esc(tx.date)+'</td><td>'+esc(tx.counterparty)+'</td><td class="num">'+esc(money(tx.totalMinor,tx.currency))+'</td></tr>').join('')||'<tr><td colspan="4" class="muted">'+esc(tr('ws.empty'))+'</td></tr>';
}
function transactionTable(rows){return '<div class="table-scroll"><table><thead><tr><th>ID</th><th>'+esc(tr('date'))+'</th><th>'+esc(tr('counterparty'))+'</th><th>'+esc(tr('amount'))+'</th></tr></thead><tbody>'+txRows(rows)+'</tbody></table></div>';}
function vDashboard(){
 const s=cache.summary;if(!s)return '';
 const cards=[['ws.income',s.totals.revenueMinor],['ws.expenses',s.totals.expenseMinor],['ws.net',s.totals.netMinor]];
 return '<div class="hero"><div class="panel hero-main"><p class="hero-kicker">'+esc(cache.ws.organizationName)+' · '+esc(cache.ws.functionalCurrency)+'</p><h1>'+esc(tr('ws.summary'))+'</h1><p>'+esc(tr('tax.review'))+'</p></div></div>'+
  '<div class="stat-grid">'+cards.map(([label,minor])=>'<div class="stat"><h4>'+esc(tr(label))+'</h4><strong>'+esc(money(minor))+'</strong></div>').join('')+'</div>'+
  (s.otherCurrencies?.length?'<p class="tax-pending">'+esc(tr('currency.separate'))+' '+esc(s.otherCurrencies.join(', '))+'</p>':'')+
  '<div class="panel"><h3>'+esc(tr('transactions.recent'))+'</h3>'+transactionTable(cache.txs.slice(0,8))+'</div>';
}
function vTransactions(kind){return '<div class="panel"><h3>'+esc(tr(kind==='SALE'?'nav.sales':'nav.purchase'))+'</h3><button type="button" id="newTx" class="btn gold">'+esc(tr('action.new'))+'</button>'+transactionTable(cache.txs.filter(t=>t.kind===kind))+'</div>';}
function vReports(){
 return '<div class="panel"><h3>'+esc(tr('nav.reports'))+' · '+esc(cache.ws.functionalCurrency)+'</h3><p class="tax-pending">'+esc(tr('tax.review'))+'</p><p class="muted">'+esc(tr('currency.noFx'))+'</p><div class="table-scroll"><table><thead><tr><th>'+esc(tr('month'))+'</th><th>'+esc(tr('ws.income'))+'</th><th>'+esc(tr('ws.expenses'))+'</th><th>'+esc(tr('ws.net'))+'</th></tr></thead><tbody>'+
 cache.monthly.map(m=>'<tr><td>'+esc(m.month)+'</td><td>'+esc(money(m.revenueMinor))+'</td><td>'+esc(money(m.expenseMinor))+'</td><td>'+esc(money(m.netMinor))+'</td></tr>').join('')+'</tbody></table></div></div>';
}
function vAccounting(){
 return '<div class="panel"><h3>'+esc(tr('nav.accounting'))+'</h3><p>'+esc(tr('accounting.corrections'))+'</p><div class="table-scroll"><table><tbody>'+
 cache.journals.map(j=>'<tr><td>'+esc(j.id)+'</td><td>'+esc(j.date)+'</td><td>'+j.lines.map(l=>esc(l.side+' '+l.accountId+' '+money(l.amountMinor,l.currency))).join('<br>')+'</td><td><button type="button" class="btn small navy" data-reverse="'+esc(j.id)+'">'+esc(tr('reversal'))+'</button></td></tr>').join('')+'</tbody></table></div></div>';
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
function vIntake(){
 const field=(name,label,value,type='text')=>'<label>'+esc(label)+'<input name="'+name+'" type="'+type+'" value="'+esc(value??'')+'" /></label>';
 const chart=cache.settings?.chart??[];
 const select=(name,label,value,items)=>'<label>'+esc(label)+'<select name="'+name+'">'+selectOptions(items,value,true)+'</select></label>';
 const candidates=intakeData.candidates.map(c=>{
  const f=c.current,locked=['CONFIRMED','POSTED','REJECTED'].includes(c.status),editable=!locked;
  const validation=c.validation??c;
  return '<article class="panel intake-candidate"><h3>'+esc(c.candidateType)+' · '+esc(c.status)+'</h3><p class="mono">'+esc(c.candidateId)+'</p><form data-intake-form="'+esc(c.candidateId)+'"><div class="grid2">'+
   field('transactionDate',tr('date'),f.transactionDate,'date')+field('amount',tr('amount'),f.amount)+field('currency',tr('currency'),f.currency)+field('counterparty',tr('counterparty'),f.counterparty)+field('description',tr('description'),f.description)+field('referenceNumber',tr('reference'),f.referenceNumber)+
   select('proposedTransactionType',tr('intake.classification'),f.proposedTransactionType,[['EXPENSE',tr('nav.purchase')],['REVENUE',tr('nav.sales')]])+
   select('classificationAccountId',tr('intake.account'),f.classificationAccountId,chart.filter(a=>['EXPENSE','REVENUE'].includes(a.type)).map(a=>[a.id,a.name]))+
   select('paymentAccountId',tr('intake.paymentAccount'),f.paymentAccountId,chart.filter(a=>a.code==='101').map(a=>[a.id,a.name]))+
   field('paymentMethod',tr('intake.paymentMethod'),f.paymentMethod)+select('settlementStatus',tr('intake.settlement'),f.settlementStatus,[['PAID',tr('intake.paid')]])+'</div>'+
   '<p class="muted">'+esc(tr('intake.dateNote'))+' '+esc([f.documentDate&&'Document: '+f.documentDate,f.invoiceDate&&'Invoice: '+f.invoiceDate,f.paymentDate&&'Payment: '+f.paymentDate].filter(Boolean).join(' · '))+'</p>'+
   '<p>'+esc([...(validation.missingFields??[]),...(validation.conflicts??[])].join('; '))+'</p>'+(c.lastError?'<p class="err">'+esc(c.lastError)+'</p>':'')+
   '<div class="dlg-actions">'+(editable?'<button class="btn ghost" type="submit">'+esc(tr('intake.save'))+'</button><button class="btn ghost" type="button" data-intake-action="reject" data-candidate="'+esc(c.candidateId)+'">'+esc(tr('intake.reject'))+'</button>':'')+
   (c.status==='READY_TO_CONFIRM'||c.status==='CONFIRMED'?'<button class="btn gold" type="button" data-intake-action="confirm" data-candidate="'+esc(c.candidateId)+'">'+esc(c.status==='CONFIRMED'?tr('intake.retryPosting'):tr('intake.confirm'))+'</button>':'')+'</div></form>'+
   '<details><summary>'+esc(tr('intake.evidence'))+'</summary><pre>'+esc(JSON.stringify({fields:c.evidence,revisions:c.revisions,confirmation:c.confirmation,posting:c.posting},null,2))+'</pre></details>'+
   (c.posting?'<p role="status">'+esc(tr('intake.posted'))+' '+esc(c.posting.receipt.postingId)+'</p>':'')+'</article>';
 }).join('');
 return '<div class="panel"><h2>'+esc(tr('nav.intake'))+'</h2><button class="btn ghost" id="reviewSetup" type="button">'+esc(tr('nav.onboarding'))+'</button><p>'+esc(tr('intake.hint'))+'</p><label>'+esc(tr('intake.chat'))+'<textarea id="intakeChat" rows="3">'+esc(intakeText)+'</textarea></label><button class="btn gold" id="intakeSend" type="button">'+esc(tr('intake.propose'))+'</button><label>'+esc(tr('intake.upload'))+'<input id="intakeFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.csv" /></label><p role="status">'+esc(pending?tr('working'):intakeNotice)+'</p></div>'+
  intakeData.documents.map(d=>'<article class="panel"><strong>'+esc(d.originalFilename)+'</strong><p>'+esc(d.processingStatus)+(d.lastError?' · '+esc(d.lastError):'')+'</p><p class="muted">'+esc((d.warnings??[]).join(' '))+'</p>'+(d.profileFacts?.length?'<details><summary>'+esc(tr('intake.profileFacts'))+'</summary><pre>'+esc(JSON.stringify(d.profileFacts,null,2))+'</pre></details>':'')+'<a href="/api/intake/original?documentId='+encodeURIComponent(d.documentId)+'" download>'+esc(tr('intake.original'))+'</a>'+(d.processingStatus==='FAILED'?'<button class="btn ghost" type="button" data-retry-document="'+esc(d.documentId)+'">'+esc(tr('intake.retry'))+'</button>':'')+'</article>').join('')+
  intakeData.chats.map(c=>'<article class="panel"><p>'+esc(c.text)+'</p><small>'+esc(c.status)+(c.lastError?' · '+esc(c.lastError):'')+'</small></article>').join('')+candidates;
}
function wireIntake(){
 $('#intakeChat')?.addEventListener('input',e=>{intakeText=e.target.value;intakeRequestId=null;});
 $('#intakeSend')?.addEventListener('click',()=>run(async()=>{intakeRequestId??=crypto.randomUUID();await api('/api/intake/chat',{text:intakeText,requestId:intakeRequestId});intakeText='';intakeRequestId=null;await refresh();}));
 $('#intakeFile')?.addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;return run(async()=>{if(file.size>8*1024*1024)throw Error('8 MiB file limit');const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('Could not read document'));reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(file);});const r=await api('/api/intake/upload',{base64,originalFilename:file.name,declaredMimeType:file.type||'application/octet-stream'});intakeNotice=tr(r.duplicate?'intake.duplicate':'intake.uploaded');await refresh();});});
 view.querySelectorAll('[data-intake-form]').forEach(form=>{const c=intakeData.candidates.find(c=>c.candidateId===form.dataset.intakeForm);if(['POSTED','REJECTED','CONFIRMED'].includes(c.status))form.querySelectorAll('input,select').forEach(el=>{el.disabled=true;});form.addEventListener('submit',e=>{e.preventDefault();return run(async()=>{const changes=Object.fromEntries(new FormData(form));for(const k of Object.keys(changes))changes[k]=changes[k]||null;await api('/api/intake/edit',{candidateId:c.candidateId,revision:c.revision,changes,actor:'user'});await refresh();});});});
 view.querySelectorAll('[data-intake-action]').forEach(button=>button.addEventListener('click',()=>{
  const c=intakeData.candidates.find(c=>c.candidateId===button.dataset.candidate),action=button.dataset.intakeAction;
  const visibleFields=Object.fromEntries(new FormData(button.closest('form')));
  if(action==='confirm'&&c.status!=='CONFIRMED'&&Object.entries(visibleFields).some(([key,value])=>(value||null)!==(c.current[key]||null))){lastError=tr('intake.unsaved');toast(lastError,true);return;}
  return run(async()=>{
   await api('/api/intake/'+action,{candidateId:c.candidateId,revision:c.revision,reviewHash:c.confirmation?.reviewHash??c.reviewHash,idempotencyKey:c.confirmation?.idempotencyKey??'confirm:'+c.candidateId+':'+c.revision,actor:'user'});await refresh();});
 }));
 view.querySelectorAll('[data-retry-document]').forEach(button=>button.addEventListener('click',()=>run(async()=>{await api('/api/intake/retry',{documentId:button.dataset.retryDocument});await refresh();})));
}
function render(){
 renderTabs();view.innerHTML=route==='onboarding'?vOnboarding()+'<button type="button" class="btn ghost" id="openIntake">'+esc(tr('nav.intake'))+'</button>':route==='intake'?vIntake():route==='dashboard'?vDashboard():route==='sales'?vTransactions('SALE'):route==='purchase'?vTransactions('PURCHASE'):route==='reports'?vReports():route==='accounting'?vAccounting():route==='import'?vImport():vSettings();
 topLang.disabled=pending;if(pending)view.querySelectorAll('input,select,textarea,button').forEach(el=>{el.disabled=true;});
 $('#openIntake')?.addEventListener('click',()=>{route='intake';render();});
 if(route==='onboarding'){wireOnboarding();return;}
 if(route==='intake')wireIntake();
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
topLang.addEventListener('change',e=>{const language=e.target.value;run(async()=>{route='onboarding';await api('/api/onboarding/language',{language});await prepare();});});
$('#demoBtn').addEventListener('click',()=>run(async()=>{await api('/api/demo/seed',{});await refresh();}));
async function boot(){view.innerHTML='<div class="panel">Loading…</div>';try{await refresh();if(cache.ws.activated&&cache.ob.active?.profileRevision===cache.ob.profileRevision){route='dashboard';await loadLanguage(cache.ws.language);}render();}catch(e){view.innerHTML='<div class="panel err">'+esc(e.message)+'</div>';}}
boot();
