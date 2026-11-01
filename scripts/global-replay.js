'use strict';
// Fresh process restores the same public store/server. IPC controls only its lifecycle.
const {createWebStore}=require('../src/web/store'),{createServer}=require('../src/web/server');
const {mockMuse,fxProvider}=require('./lib/globalJourney');
const store=createWebStore({persistPath:process.argv[2],museRuntime:mockMuse().runtime,fxProvider:fxProvider()});
const {server}=createServer({store});
server.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));
process.on('message',message=>{if(message==='close'){server.closeAllConnections();server.close(()=>process.exit(0));}});
process.on('disconnect',()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
