// 84.7 real PostgreSQL 16 ONLY, in a disposable loopback database.
// Verifies the actual 84.3 receipt SQL/fence and replay cursor, not a new
// production writer or substitute for the original 15.2 ledger tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createGame3DPrivateQuestReceiptReconciler843}
 from '../privateQuestReceiptReconciler843.mjs';
import {safeDisposablePgUrl847} from '../privateDisposablePgGuard847.mjs';

const url=process.env.GAME3D_847_DISPOSABLE_PG_ADMIN_URL;
const ack=process.env.GAME3D_847_DISPOSABLE_ACK===
 'I_HAVE_A_DISPOSABLE_PG_INSTANCE';
const enabled=!!url||ack;
const quote=x=>'"'+x.replaceAll('"','""')+'"';
const digest=n=>'worldkill-'+n.toString(16).padStart(64,'0');
const scope=Object.freeze({ownerId:'owner847',characterId:'hero847',
 instanceId:'world-instance-847',instanceEpoch:'world-epoch-847',
 mapFingerprint:'d'.repeat(64)});
const serverRequestContext=Object.freeze({privilegedStagingWorld:'847'});
const now=Date.now();

test('84.7 only permits explicit disposable loopback PG16 connection strings',()=>{
 assert.equal(safeDisposablePgUrl847(
  'postgresql://postgres:postgres@127.0.0.1:5432/game3d_847_disposable'),true);
 for(const unsafe of [
  'postgresql://postgres:pw@other.example/game3d_847_disposable',
  'postgresql://postgres:pw@127.0.0.1:5432/production',
  'postgresql://postgres:pw@127.0.0.1:5432/game3d_847_disposable?sslmode=require',
  'postgresql://postgres:pw@127.0.0.1:5433/game3d_847_disposable',
  'postgresql://postgres:pw@127.0.0.1:5432/postgres',
  'http://127.0.0.1/game3d_847_disposable',
  '',undefined,
 ])assert.equal(safeDisposablePgUrl847(unsafe),false);
});

test('84.7 actual PG16: 18.3 lease lock, 18.5 immutable binding, 84.3 replay, revoke and two-character isolation',
 {skip:!enabled,timeout:120000},async()=>{
 assert.equal(ack,true,'explicit disposable DB acknowledgement required');
 assert.equal(safeDisposablePgUrl847(url),true,
  'never run PG staging verification against remote or production databases');
 const {default:pg}=await import('pg');
 const suffix=randomUUID().replaceAll('-','');
 const schema='g3d_847_'+suffix,readerRole='g3d_847_reader_'+suffix;
 const admin=new pg.Pool({connectionString:url,max:3,
  connectionTimeoutMillis:4000});
 let setup=null,reader=null,createdSchema=false,createdRole=false;
 const table=x=>quote(schema)+'.'+quote(x);
 const sql=(client,statement,args)=>client.query(statement,args);
 const current={nonce:randomUUID(),active:true,expiresAtMs:now+90000};
 const lease=()=>Object.freeze({
  ownerId:scope.ownerId,characterId:scope.characterId,
  worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
  serverSessionId:'world-session-847',
  actionSessionId:'qb174-'+'e'.repeat(64),
  leaseNonce:current.nonce,expiresAtMs:current.expiresAtMs,
 });
 const worldStage180={version:'18.0',privateServerOnly:true,
  publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext:ctx}){
   return ctx===serverRequestContext&&current.active?lease():null;
  },
 };
 const readerPool=()=>{
  const raw=new pg.Pool({connectionString:url,max:2,
   connectionTimeoutMillis:4000});
  return {async connect(){
   const db=await raw.connect();
   try{
    await db.query('SET ROLE '+quote(readerRole));
    await db.query('SET search_path TO '+quote(schema));
   }catch(error){db.release(true);throw error;}
   return {query:(...args)=>db.query(...args),
    release:()=>db.release(true)};
  },end:()=>raw.end()};
 };
 const receiptRows=Array.from({length:18},(_,i)=>({
  receiptId:digest(i+1),seq:i+1,
 }));
 let reconciler;
 try{
  const version=await admin.query('SHOW server_version_num');
  assert(Number(version.rows[0]?.server_version_num)>=160000,
   'real PostgreSQL 16+ required');
  await admin.query('CREATE SCHEMA '+quote(schema));createdSchema=true;
  await admin.query('CREATE ROLE '+quote(readerRole)+' NOLOGIN');
  createdRole=true;
  setup=new pg.Pool({connectionString:url,max:3,
   options:'-c search_path='+schema,connectionTimeoutMillis:4000});
  await setup.query(`
   CREATE TABLE game3d_private_quest_session_fence_183(
    owner_id text NOT NULL,character_id text NOT NULL,
    world_instance_id text NOT NULL,world_epoch text NOT NULL,
    world_session_id text NOT NULL,action_session_id text NOT NULL,
    lease_nonce uuid NOT NULL,active boolean NOT NULL,
    expires_at timestamptz NOT NULL,
    action_row_lock_183 smallint GENERATED ALWAYS AS (1) STORED
   );
   CREATE TABLE game3d_private_world_kill_receipt_152(
    receipt_id text PRIMARY KEY,owner_id text NOT NULL,
    character_id text NOT NULL,instance_id text NOT NULL,
    instance_epoch text NOT NULL,map_fingerprint text NOT NULL,
    event_seq bigint NOT NULL,enemy_id text NOT NULL,
    enemy_tier text NOT NULL,source_kind text NOT NULL,
    server_kill_committed boolean NOT NULL,
    UNIQUE(owner_id,character_id,instance_id,instance_epoch,map_fingerprint,event_seq)
   );
   CREATE TABLE game3d_private_world_kill_lease_binding_185(
    receipt_id text PRIMARY KEY,owner_id text NOT NULL,
    character_id text NOT NULL,instance_id text NOT NULL,
    instance_epoch text NOT NULL,map_fingerprint text NOT NULL,
    event_seq bigint NOT NULL,server_session_id text NOT NULL,
    action_session_id text NOT NULL,lease_nonce uuid NOT NULL,
    source_kind text NOT NULL,reward_authorized boolean NOT NULL
   );
   CREATE TABLE g3d_847_credit_fixture(
    receipt_id text PRIMARY KEY
   );
  `);
  const active=lease();
  await setup.query(`
   INSERT INTO game3d_private_quest_session_fence_183
   (owner_id,character_id,world_instance_id,world_epoch,
    world_session_id,action_session_id,lease_nonce,active,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,true,to_timestamp($8::numeric/1000))
  `,[scope.ownerId,scope.characterId,scope.instanceId,
   scope.instanceEpoch,active.serverSessionId,active.actionSessionId,
   active.leaseNonce,active.expiresAtMs]);
  for(const {receiptId,seq:eventSeq} of receiptRows){
   await setup.query(`
    INSERT INTO game3d_private_world_kill_receipt_152
    (receipt_id,owner_id,character_id,instance_id,instance_epoch,
     map_fingerprint,event_seq,enemy_id,enemy_tier,source_kind,
     server_kill_committed)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,
      'server-committed-private-pve-kill',true)
   `,[receiptId,scope.ownerId,scope.characterId,
     scope.instanceId,scope.instanceEpoch,scope.mapFingerprint,
     eventSeq,'wolf_'+eventSeq,'normal']);
   await setup.query(`
    INSERT INTO game3d_private_world_kill_lease_binding_185
    (receipt_id,owner_id,character_id,instance_id,instance_epoch,
     map_fingerprint,event_seq,server_session_id,action_session_id,
     lease_nonce,source_kind,reward_authorized)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
      '15.3-server-committed-18.5-lease',false)
   `,[receiptId,scope.ownerId,scope.characterId,
     scope.instanceId,scope.instanceEpoch,scope.mapFingerprint,
     eventSeq,active.serverSessionId,active.actionSessionId,
     active.leaseNonce]);
  }
  // A receipt from a second character must never be selected as progress
  // for the pinned owner/character, even with the same instance fingerprint.
  await setup.query(`
   INSERT INTO game3d_private_world_kill_receipt_152
   (receipt_id,owner_id,character_id,instance_id,instance_epoch,
    map_fingerprint,event_seq,enemy_id,enemy_tier,source_kind,
    server_kill_committed)
   VALUES($1,$2,$3,$4,$5,$6,19,'wolf_foreign','normal',
    'server-committed-private-pve-kill',true)
  `,[digest(99),scope.ownerId,'other_hero847',
   scope.instanceId,scope.instanceEpoch,scope.mapFingerprint]);
  await admin.query('GRANT USAGE ON SCHEMA '+quote(schema)+
   ' TO '+quote(readerRole));
  for(const name of [
   'game3d_private_quest_session_fence_183',
   'game3d_private_world_kill_receipt_152',
   'game3d_private_world_kill_lease_binding_185',
  ])await admin.query('GRANT SELECT ON '+table(name)+
   ' TO '+quote(readerRole));
  // PostgreSQL SELECT ... FOR SHARE requires an UPDATE-grant on at least
  // one column. The original 18.3 fence grants it only on this generated
  // no-op lock marker, never on active, nonce or expiration fields.
  await admin.query('GRANT UPDATE (action_row_lock_183) ON '+
   table('game3d_private_quest_session_fence_183')+
   ' TO '+quote(readerRole));
  reader=readerPool();
  const db=await reader.connect();
  try{
   await assert.rejects(db.query(
    'UPDATE game3d_private_world_kill_receipt_152 SET server_kill_committed=false'));
  }finally{db.release()}
  const projectCommittedKill=async({serverRequestContext:ctx,serverKillContext})=>{
   assert.equal(ctx,serverRequestContext);
   const recorded=await setup.query(`
    INSERT INTO g3d_847_credit_fixture(receipt_id)
    VALUES($1) ON CONFLICT DO NOTHING RETURNING receipt_id
   `,[serverKillContext.receiptId]);
   return {ok:true,receiptId:serverKillContext.receiptId,
    credited:recorded.rowCount===1?[{questId:'axe_q_first_patrol',
     objectiveId:'patrol_kills'}]:[],
    questTurnInCommitted:false,rewardAuthorized:false,rewardsIssued:false};
  };
  const readProgress=async()=>({
   ok:true,rewardsIssued:false,rewardAuthorized:false,
   objectives:[{questId:'axe_q_first_patrol',objectiveId:'patrol_kills',
    status:'accepted',current:Number((await setup.query(
     'SELECT count(*) AS n FROM g3d_847_credit_fixture')).rows[0].n),
    required:18}],
  });
  reconciler=createGame3DPrivateQuestReceiptReconciler843({
   enabled:true,pool:reader,scope,worldStage180,serverRequestContext,
   resolveServerKillContext:async({persistedReceipt})=>Object.freeze({
    receiptId:persistedReceipt.receiptId,
   }),
   projectCommittedKill,readProgress,now:()=>now,
   isStopped:()=>false,
  });
  const first=await reconciler.reconcile();
  assert.equal(first.ok,true);assert.equal(first.processedReceipts,16);
  assert.equal(first.hasMore,true);assert.equal(first.nextEventSeq,16);
  const second=await reconciler.reconcile({afterEventSeq:16});
  assert.equal(second.ok,true);assert.equal(second.processedReceipts,2);
  assert.equal(second.hasMore,false);assert.equal(second.nextEventSeq,18);
  assert.equal(second.objectives[0].current,18);
  const replay=await reconciler.reconcile({afterEventSeq:0});
  assert.equal(replay.ok,true);assert.equal(replay.newCredits.length,0);
  assert.equal(replay.objectives[0].current,18);
  // A missing/old immutable session binding refuses rather than skipping.
  await setup.query(`
   UPDATE game3d_private_world_kill_lease_binding_185
   SET lease_nonce=$1 WHERE receipt_id=$2
  `,[randomUUID(),digest(2)]);
  const invalid=await reconciler.reconcile();
  assert.equal(invalid.ok,false);
  assert.equal(invalid.retryFromEventSeq,0);
  await setup.query(`
   UPDATE game3d_private_world_kill_lease_binding_185
   SET lease_nonce=$1 WHERE receipt_id=$2
  `,[current.nonce,digest(2)]);
  current.active=false;
  await setup.query(`
   UPDATE game3d_private_quest_session_fence_183
   SET active=false WHERE owner_id=$1 AND character_id=$2
  `,[scope.ownerId,scope.characterId]);
  assert.equal((await reconciler.reconcile()).ok,false);
 }finally{
  if(reader)await reader.end();
  if(setup)await setup.end();
  if(createdSchema)await admin.query('DROP SCHEMA '+quote(schema)+' CASCADE');
  if(createdRole)await admin.query('DROP ROLE '+quote(readerRole));
  await admin.end();
 }
});
