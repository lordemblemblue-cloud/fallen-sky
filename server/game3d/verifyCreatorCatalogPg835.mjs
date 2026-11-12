#!/usr/bin/env node
/**
 * Game 3D 83.5 — opt-in READ-ONLY check of migrations 053/054/055 and
 * three separate restricted PostgreSQL roles. Does not apply DDL or write
 * even test proposals. No network access in --help/--plan/default modes.
 */
const help=[
 'Usage: node server/game3d/verifyCreatorCatalogPg835.mjs --plan|--run',
 'For --run, set:',
 '  GAME3D_PRIVATE_STAGING_ENV=staging',
 '  GAME3D_PG835_RUN=1',
 '  GAME3D_PG835_CONFIRM=YES_DISPOSABLE_READONLY',
 '  GAME3D_PG835_SCHEMA=axe_creator_test_<name>',
 '  GAME3D_PG835_STAGING_URL=postgresql://role:secret@127.0.0.1:5432/test_db',
 '  GAME3D_PG835_AUDIT_URL=postgresql://role:secret@127.0.0.1:5432/test_db',
 '  GAME3D_PG835_POLICY_URL=postgresql://role:secret@127.0.0.1:5432/test_db',
 'All URLs must point at loopback and a test/scratch/sandbox/staging DB.',
 'Use only a disposable database that contains no player or production data.',
 'They must use THREE DISTINCT restricted usernames, not superusers/owners.',
 'DBA must manually apply private migrations 053, 054, 055 and grants.',
 'The 83.5 script uses READ ONLY transactions; it creates/changes NOTHING.',
 'Never use production credentials or a public game/player database.',
].join('\n')+'\n';
const args=process.argv.slice(2);
if(args.length===1&&['--help','--plan'].includes(args[0])){
  process.stdout.write(args[0]==='--plan'?'PLAN ONLY — no database connection.\n'+help:help);
}else if(args.length!==1||args[0]!=='--run'){
  process.stderr.write('BLOCKED: --run and disposable staging consent required; see --plan.\n');
  process.exitCode=2;
}else{
  const env=process.env,schema=env.GAME3D_PG835_SCHEMA;
  const keys=['GAME3D_PG835_STAGING_URL',
    'GAME3D_PG835_AUDIT_URL','GAME3D_PG835_POLICY_URL'];
  const urls=keys.map(key=>{try{return new URL(env[key])}catch{return null}});
  const validUrl=url=>url!==null&&
    ['postgresql:','postgres:'].includes(url.protocol)&&
    ['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&
    url.username.length>0&&url.password.length>0&&
    !url.search&&!url.hash&&!url.username.includes('@')&&
    /^\/[A-Za-z0-9_-]{4,80}$/.test(url.pathname)&&
    /(test|scratch|sandbox|staging|disposable)/i.test(url.pathname);
  const permitted=env.GAME3D_PRIVATE_STAGING_ENV==='staging'&&
    env.GAME3D_PG835_RUN==='1'&&
    env.GAME3D_PG835_CONFIRM==='YES_DISPOSABLE_READONLY'&&
    typeof schema==='string'&&
    /^axe_creator_test_[a-z0-9_]{1,24}$/.test(schema)&&
    urls.every(validUrl)&&
    new Set(urls.filter(Boolean).map(url=>url.username)).size===3&&
    new Set(urls.filter(Boolean).map(url=>url.pathname)).size===1;
  if(!permitted){
    process.stderr.write('BLOCKED: missing safe private staging flags, three distinct roles or disposable loopback URLs.\n');
    process.exitCode=2;
  }else{
    let pools=[];
    try{
      const [{default:pg},{auditCreatorCatalogPgReadiness835}]=await Promise.all([
        import('pg'),import('./creatorCatalogPgReadiness835.mjs'),
      ]);
      pools=keys.map(key=>new pg.Pool({
        connectionString:env[key],max:1,
        connectionTimeoutMillis:5000,
        idleTimeoutMillis:1000,allowExitOnIdle:true,
        statement_timeout:9000,query_timeout:12000,
        application_name:'axe-creator-catalog-835-readonly',
      }));
      const result=await auditCreatorCatalogPgReadiness835({
        stagingPool:pools[0],auditPool:pools[1],policyPool:pools[2],
        schema,enabled:true,scope:'private-staging',
      });
      if(!result.ok){
        process.stderr.write('NOT READY: '+(
          /^[a-z0-9-]+$/.test(result.code||'')?result.code:'private-readiness-failed')+
          '. No database mutations performed.\n');
        process.exitCode=1;
      }else{
        process.stdout.write(JSON.stringify({
          status:'pass',scope:'private-disposable-PG16-readonly',
          rolesVerified:true,tableCount:result.tableCount,
          immutableTriggersVerified:result.immutableTriggersVerified,
          publicTableGrants:0,catalogPublished:false,
          eligibleForIssuance:false,rewardsIssued:false,
          migrationsAppliedByScript:false,databaseRowsWritten:0,
        },null,2)+'\n');
      }
    }catch{
      // Never print connection strings, credentials, errors from driver,
      // SQL parameters or private database role identities.
      process.stderr.write('FAILED: private PostgreSQL readiness could not complete; review local logs privately.\n');
      process.exitCode=1;
    }finally{
      await Promise.all(pools.map(async pool=>{
        try{await pool.end()}catch{}
      }));
    }
  }
}
