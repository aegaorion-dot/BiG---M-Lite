'use strict';
// Real Chromium render/navigation rehearsal for the single product UI.
// Offline synthetic store, no paid calls. Fails loudly instead of skipping checks.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {ROOT,createDemoStore,prepareDemo}=require('../src/web/demo');
const ROUTES=['home','documents','tax','reports','assistant','settings'];
async function main(){
 if(typeof WebSocket!=='function')throw Error('Node 20 needs --experimental-websocket for this optional browser check');
 const candidates=[process.env.BIGM_CHROME_PATH,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean),binary=candidates.find(p=>fs.existsSync(p));if(!binary)throw Error('Set BIGM_CHROME_PATH to an installed Chromium browser');
 const store=createDemoStore();await prepareDemo(store);store.setUiLanguage('id-ID');const {server}=require('../src/web/server').createServer({store});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/';
 const dir=path.join(ROOT,'research','phase9-demo'),shots=path.join(dir,'screenshots');fs.mkdirSync(shots,{recursive:true});const profile=path.join(ROOT,'data','demo-browser-'+crypto.randomUUID());fs.mkdirSync(profile,{recursive:true});
 const browser=cp.spawn(binary,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 let socket,deadline;const results=[],errors=[];let close;
 try{
  const endpoint=await new Promise((resolve,reject)=>{let text='';deadline=setTimeout(()=>reject(Error('Browser startup timed out')),20000);browser.stderr.on('data',b=>{text+=b.toString();const match=text.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(deadline);resolve(match[1]);}});browser.on('error',()=>reject(Error('Browser could not start')));browser.on('exit',()=>reject(Error('Browser exited before connection')));});
  socket=new WebSocket(endpoint);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',()=>j(Error('Browser connection failed')),{once:true});});let next=0;const pending=new Map();
  socket.addEventListener('message',event=>{const msg=JSON.parse(String(event.data));if(msg.id){const work=pending.get(msg.id);if(work){pending.delete(msg.id);clearTimeout(work.timer);msg.error?work.reject(Error(msg.error.message)):work.resolve(msg.result);}}else if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.text);});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('Browser command timed out: '+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  close=()=>send('Browser.close');const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true}),page=(m,p)=>send(m,p,sessionId);
  await page('Runtime.enable');await page('Page.enable');
  const evaluate=async expression=>{const r=await page('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error('Browser expression failed: '+(r.exceptionDetails.exception?.description??r.exceptionDetails.text).split('\n')[0].slice(0,160)+' | expr: '+expression.slice(0,120));return r.result?.value;};
  const until=async expression=>{for(let i=0;i<120;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,50));}throw Error('UI did not become ready: '+expression.slice(0,110));};
  const ready="(()=>{const c=document.querySelector('#pageContent');return Boolean(document.querySelector('#appShell')&&c&&c.children.length>0&&!c.querySelector('.spinner'));})()";
  const openPage=async name=>{await evaluate("document.querySelector('#primaryNav [data-page=\""+name+"\"]').click()");await until("document.querySelector('#primaryNav [data-page=\""+name+"\"][aria-current=\"page\"]')&&"+ready);};
  for(const [name,width,height]of [['desktop',1440,900],['laptop',1280,800]]){
   await page('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await page('Page.navigate',{url});await until(ready);
   for(const route of ROUTES){
    await openPage(route);
    const snapshot=await evaluate("(()=>{const c=document.querySelector('#pageContent'),pre=[...c.querySelectorAll('pre')].filter(e=>e.getClientRects().length>0);return {page:document.querySelector('#pageName').textContent,width:innerWidth,documentWidth:document.documentElement.scrollWidth,visibleJson:pre.length,text:c.innerText.slice(0,4000),heading:(c.querySelector('h1,h2,h3')||{}).innerText||''};})()");
    const result={...snapshot,untranslated:/\b(?:nav|product|cognitive|ob|question)\.[a-zA-Z]+/.test(snapshot.text),rawError:/undefined|\[object Object\]|Request failed/.test(snapshot.text)};delete result.text;
    assert.equal(result.documentWidth<=width,true,route+' page overflow '+JSON.stringify({viewport:width,innerWidth:result.width,documentWidth:result.documentWidth}));assert.equal(result.visibleJson,0,route+' exposes JSON by default');assert.equal(result.untranslated,false,route+' shows an untranslated key');assert.equal(result.rawError,false,route+' shows a raw failure string');assert.ok(result.heading,route+' renders a heading');results.push({viewport:name,...result});
    if(route==='home'||name==='laptop'&&['documents','tax','reports'].includes(route)){const image=await page('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(shots,route+'-'+name+'.png'),Buffer.from(image.data,'base64'));}
   }
   await openPage('reports');
   for(const tag of ['en','id-ID']){await evaluate("(()=>{const s=document.querySelector('#languageSelect');s.value="+JSON.stringify(tag)+";s.dispatchEvent(new Event('change',{bubbles:true}));})()");await until("document.documentElement.lang==="+JSON.stringify(tag)+"&&"+ready);assert.ok(await evaluate("Boolean(document.querySelector('#primaryNav [data-page=\"reports\"][aria-current=\"page\"]'))"),'language switch must preserve the current route');}
   await openPage('assistant');
   await evaluate("(()=>{const t=document.querySelector('#assistantInput');t.value='What needs my attention?';t.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#assistantForm').requestSubmit();})()");
   await until("document.querySelectorAll('#chatLog .chat-message').length>=2");
   const reply=await evaluate("(()=>{const bubbles=[...document.querySelectorAll('#chatLog .chat-message:not(.user)')];const last=bubbles[bubbles.length-1];return {text:last.innerText.slice(0,280),error:Boolean(last.querySelector('.chat-bubble.error'))};})()");
   assert.equal(reply.error,false,'assistant reply must not be an error bubble');assert.ok(reply.text.trim().length>0,'assistant reply must not be empty');results.push({viewport:name,assistantReply:reply.text});
  }
  assert.deepEqual(errors,[]);assert.equal(store.ctx.ledger.size,3);assert.equal(store.summary().totals.netMinor,'29321000');
  const evidence={success:true,syntheticOnly:true,liveMetaCalls:0,singleUi:true,engineJournals:3,checks:results,consoleErrors:errors,languageSwitchPreservedRoute:true,assistantRoundTrip:true,viewports:[{width:1440,height:900},{width:1280,height:800}],screenshots:fs.readdirSync(shots).filter(f=>f.endsWith('.png'))};
  fs.writeFileSync(path.join(dir,'browser-rehearsal.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({success:true,viewsChecked:results.length,consoleErrors:errors.length,screenshots:evidence.screenshots}));
 }finally{clearTimeout(deadline);if(close)try{await close();}catch{}if(socket)socket.close();if(browser.exitCode===null){await Promise.race([new Promise(r=>browser.once('exit',r)),new Promise(r=>setTimeout(r,2000))]);if(browser.exitCode===null)browser.kill();}server.closeAllConnections();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(String(e.message).split('\n')[0].slice(0,220));process.exitCode=1;});
