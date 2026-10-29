'use strict';
const {createWebStore}=require('../src/web/store'),{createServer}=require('../src/web/server'),{mockMuse,fxProvider}=require('./lib/moroccanJourney');
const store=createWebStore({persistPath:process.argv[2],museRuntime:mockMuse().runtime,fxProvider:fxProvider()}),{server}=createServer({store});server.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));
const close=()=>{server.closeAllConnections();server.close(()=>process.exit(0));};process.on('message',m=>{if(m==='close')close();});process.on('disconnect',close);
