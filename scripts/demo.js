'use strict';
const fs=require('node:fs'),path=require('node:path');
const {ROOT,createDemoStore,demoDirectory,assertDemoStopped,resetDemo}=require('../src/web/demo');
async function main(){
 const role=process.argv[2]??'start';if(!['start','reset','prepare'].includes(role))throw Error('Unknown demo command');
 if(role!=='start'){const result=await resetDemo({ready:role==='prepare'});console.log(JSON.stringify({demo:true,syntheticOnly:true,...result}));return;}
 const dir=demoDirectory();assertDemoStopped(dir);const file=path.join(dir,'store.json');if(!fs.existsSync(file))await resetDemo();
 require('../src/web/environment').loadEnvironment(path.join(ROOT,'.env'));
 const live=process.env.BIGM_DEMO_LIVE==='1';const store=createDemoStore({persistPath:file,live});if(live&&!store.demo.liveMuse)throw Error('Live Muse configuration unavailable; use offline demo or configure the ignored .env');
 const lock=path.join(dir,'server.lock');fs.writeFileSync(lock,JSON.stringify({owner:'bigm-lite-demo-v1',pid:process.pid}),{flag:'wx'});
 const {server}=require('../src/web/server').createServer({store}),port=Number(process.env.BIGM_DEMO_PORT??3109);
 const cleanup=()=>{try{if(JSON.parse(fs.readFileSync(lock,'utf8')).pid===process.pid)fs.unlinkSync(lock);}catch{}};process.on('exit',cleanup);for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
 server.on('error',()=>{cleanup();console.error('Demo server could not start. Check the selected local port.');process.exitCode=1;});
 server.listen(port,'127.0.0.1',()=>console.log('BiG-M Lite synthetic '+(live?'live Muse':'offline')+' demo: http://localhost:'+port+' (data/demo only)'));
}
main().catch(e=>{console.error(String(e.message).split('\n')[0].slice(0,220));process.exitCode=1;});
