'use strict';
const {createWebStore}=require('../src/web/store'),{createServer}=require('../src/web/server'),{fxProvider}=require('./lib/moroccanJourney'),{liveRuntime}=require('./lib/moroccanLiveRuntime');
const store=createWebStore({persistPath:process.argv[2],museRuntime:liveRuntime(process.argv[3]),fxProvider:fxProvider()}),{server}=createServer({store});server.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));
const close=()=>{server.closeAllConnections();server.close(()=>process.exit(0));};process.on('message',m=>{if(m==='close')close();});process.on('disconnect',close);
