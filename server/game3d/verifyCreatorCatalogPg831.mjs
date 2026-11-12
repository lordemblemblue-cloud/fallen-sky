#!/usr/bin/env node
// 83.1 OPT-IN PG16 concurrency check. Uses only a disposable, pre-migrated,
// non-public schema via a loopback connection. Leaves immutable audit rows.
// No migration, DROP, reward/loot or catalog publication is performed.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const usage=[
 'Usage: node server/game3d/verifyCreatorCatalogPg831.mjs --plan|--run',
 '--run requires:',
 'GAME3D_PRIVATE_STAGING_ENV=staging',
 'GAME3D_CREATOR_PG831_RUN=1',
 'GAME3D_CREATOR_PG831_CONFIRM=YES_DISPOSABLE_STAGING',
 'GAME3D_CREATOR_PG831_SCHEMA=axe_creator_test_<name>',
 'GAME3D_CREATOR_PG831_URL=postgresql://...@127.0.0.1:PORT/disposable_db',
 'Install server/game3d pg dependency first. Manually apply 053 in the',
 'non-public schema with a DBA, then use a dedicated restricted non-owner',
 'role. No DDL, cleanup, production connectivity or player data writes.',
].join('\n')+'\n';

const args=process.argv.slice(2);
if(args.length===1&&['--help','--plan'].includes(args[0])){
  process.stdout.write(args[0]==='--plan'?'PLAN ONLY; no database connection.\n'+usage:usage);
}else if(args.length!==1||args[0]!=='--run'){
  process.stderr.write('BLOCKED: explicit --run required. See --plan.\n');
  process.exitCode=2;
}else{
  const env=process.env;
  const schema=env.GAME3D_CREATOR_PG831_SCHEMA;
  let url=null;
  try{url=new URL(env.GAME3D_CREATOR_PG831_URL)}catch{}
  const allowed=env.GAME3D_PRIVATE_STAGING_ENV==='staging'&&
    env.GAME3D_CREATOR_PG831_RUN==='1'&&
    env.GAME3D_CREATOR_PG831_CONFIRM==='YES_DISPOSABLE_STAGING'&&
    typeof schema==='string'&&/^axe_creator_test_[a-z0-9_]{1,24}$/.test(schema)&&
    url&&['postgres:','postgresql:'].includes(url.protocol)&&
    ['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&
    url.pathname.length>1&&/(test|scratch|sandbox|disposable|staging)/i.test(url.pathname);
  if(!allowed){
    process.stderr.write('BLOCKED: missing disposable staging confirmation, schema or loopback-only URL.\n');
    process.exitCode=2;
  }else{
    let pool;
    try{
      const [{default:pg},{createGame3DCreatorCatalogStaging830}]=await Promise.all([
        import('pg'),import('./creatorCatalogStaging830.mjs'),
      ]);
      pool=new pg.Pool({
        connectionString:env.GAME3D_CREATOR_PG831_URL,max:4,
        connectionTimeoutMillis:5000,idleTimeoutMillis:1000,
        statement_timeout:9000,query_timeout:12000,allowExitOnIdle:true,
      });
      const version=await pool.query(
        "SELECT current_setting('server_version_num')::integer AS v,"+
        "current_user AS role_name,"+
        "(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser");
      assert.ok(version.rows[0]?.v>=160000,'PG16 or later required');
      assert.equal(version.rows[0].superuser,false,'Run as restricted non-superuser');
      const tables=await pool.query(
        'SELECT c.relname,pg_get_userbyid(c.relowner) AS owner '+
        'FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid '+
        'WHERE n.nspname=$1 AND c.relname=ANY($2::text[])',
        [schema,['game3d_creator_catalog_proposal_830','game3d_creator_catalog_review_830']]);
      assert.equal(tables.rowCount,2,'Migration 053 must already exist');
      assert.ok(tables.rows.every(r=>r.owner!==version.rows[0].role_name),
        'Use a non-owner staging role');
      const permissions=await pool.query(
        "SELECT has_schema_privilege($1,'USAGE') AS usage,"+
        "has_table_privilege(format('%I.%I',$1,'game3d_creator_catalog_proposal_830'),'SELECT') AS ps,"+
        "has_table_privilege(format('%I.%I',$1,'game3d_creator_catalog_proposal_830'),'INSERT') AS pi,"+
        "has_table_privilege(format('%I.%I',$1,'game3d_creator_catalog_proposal_830'),'UPDATE') AS pu,"+
        "has_table_privilege(format('%I.%I',$1,'game3d_creator_catalog_proposal_830'),'DELETE') AS pd,"+
        "has_table_privilege(format('%I.%I',$1,'game3d_creator_catalog_review_830'),'SELECT') AS rs,"+
        "has_table_privilege(format('%I.%I',$1,'game3d_creator_catalog_review_830'),'INSERT') AS ri,"+
        "has_table_privilege(format('%I.%I',$1,'game3d_creator_catalog_review_830'),'UPDATE') AS ru,"+
        "has_table_privilege(format('%I.%I',$1,'game3d_creator_catalog_review_830'),'DELETE') AS rd",
        [schema]);
      const grants=permissions.rows[0];
      assert.ok(['usage','ps','pi','pu','rs','ri'].every(k=>grants[k]===true),
        'Missing restricted staging privileges');
      assert.ok(['pd','ru','rd'].every(k=>grants[k]===false),
        'Role must not delete or rewrite audit history');
      const token=randomUUID().replace(/-/g,'').slice(0,16);
      const creatorId='creator831_'+token,reviewerId='reviewer831_'+token;
      const trustedCreator=Object.freeze({creator:token});
      const trustedReviewer=Object.freeze({reviewer:token});
      const service=createGame3DCreatorCatalogStaging830({
        pool,schema,scope:'private-staging',enabled:true,
        authorizeCreator:async context=>context===trustedCreator
          ?{authorized:true,creatorId}:{authorized:false},
        authorizeReviewer:async context=>context===trustedReviewer
          ?{authorized:true,reviewerId}:{authorized:false},
      });
      assert.equal((await service.assertSchema()).ok,true);
      const proposal={
        schema:'axe-game3d-creator-proposal-829-v1',
        source:{boxId:'box831_'+token,slotIndex:499},
        blueprint:{id:'bp831_'+token,kind:'equipment',
          name:'Disposable Staging Sword',rarity:'Epic',slot:'weapon',
          levelMin:1,levelMax:50,stats:{strength:25,hp:100},
          description:'Never live equipment',dropChance:2.5,
          dropSource:'staging_831_only'},
      };
      const submit=()=>service.submit({proposal,serverContext:trustedCreator});
      const [a,b]=await Promise.all([submit(),submit()]);
      assert.equal(a.ok,true);
      assert.equal(b.ok,true);
      assert.equal(a.proposalId,b.proposalId);
      assert.equal([a.created,b.created].filter(Boolean).length,1);
      assert.equal((await service.status({
        proposalId:a.proposalId,serverContext:{role:'admin'},
      })).ok,false);
      const review=()=>service.review({proposalId:a.proposalId,
        serverContext:trustedReviewer,disposition:'accept-for-curation',
        note:'Disposable PG16 test only; not a live catalog'});
      const [c,d]=await Promise.all([review(),review()]);
      assert.equal([c,d].filter(x=>x.ok).length,1);
      const after=await service.status({
        proposalId:a.proposalId,serverContext:trustedCreator,
      });
      assert.equal(after.status,'curation-only');
      assert.equal(after.catalogPublished,false);
      assert.equal(after.eligibleForIssuance,false);
      assert.equal(after.rewardsIssued,false);
      assert.equal((await submit()).created,false);
      // schema was strictly allowlisted above; quoted qualified table only.
      const count=await pool.query(
        'SELECT count(*)::int AS n FROM "'+schema+
        '".game3d_creator_catalog_review_830 WHERE proposal_id=$1',
        [a.proposalId]);
      assert.equal(count.rows[0].n,1);
      process.stdout.write(JSON.stringify({
        status:'pass',scope:'disposable-PG16-83.1',schema,
        concurrentSubmissions:2,uniqueProposals:1,
        concurrentReviews:2,reviewRows:1,
        persistedTestAuditRows:true,catalogPublished:false,
        eligibleForIssuance:false,rewardsIssued:false,
      },null,2)+'\n');
    }catch(error){
      // Never print connection strings, queries, auth context or credentials.
      const code=typeof error?.code==='string'&&/^[A-Z0-9]{4,5}$/.test(error.code)
        ?error.code:'TEST_FAILURE';
      process.stderr.write('FAILED: disposable PostgreSQL integration ('+code+
        '). Check restricted database logs privately.\n');
      process.exitCode=1;
    }finally{
      try{await pool?.end()}catch{}
    }
  }
}
