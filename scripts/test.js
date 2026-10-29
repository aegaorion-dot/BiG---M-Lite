'use strict';
const {spawnSync}=require('node:child_process');
const env={...process.env,NODE_ENV:'test'};
delete env.BIGM_FX_LIVE_TEST;
delete env.BIGM_DEMO_LIVE;
for(const key of ['BIGM_META_API_URL','BIGM_META_API_KEY','BIGM_META_MODEL','BIGM_META_DOCUMENT_LIVE','BIGM_META_LIVE_TEST','BIGM_MUSE_ENABLED','BIGM_MUSE_TRACE','BIGM_MUSE_MAX_REQUESTS','BIGM_API_TOKEN','BIGM_DATA_PATH'])delete env[key];
const result=spawnSync(process.execPath,['--require','./scripts/test-network-guard.cjs','--test','test/'],{stdio:'inherit',env});
process.exitCode=result.status??1;
