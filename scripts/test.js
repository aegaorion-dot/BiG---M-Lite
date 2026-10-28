'use strict';
const {spawnSync}=require('node:child_process');
const env={...process.env,NODE_ENV:'test'};
for(const key of ['BIGM_META_API_URL','BIGM_META_API_KEY','BIGM_META_MODEL','BIGM_API_TOKEN','BIGM_DATA_PATH'])delete env[key];
const result=spawnSync(process.execPath,['--require','./scripts/test-network-guard.cjs','--test','test/'],{stdio:'inherit',env});
process.exitCode=result.status??1;
