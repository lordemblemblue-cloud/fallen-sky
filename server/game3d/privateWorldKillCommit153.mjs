// Combat / Quest 15.3 — private, lease-fenced COMMITTED world defeat receipts.
// This is an opt-in trusted scheduler component, NOT an endpoint or hook into
// GameWorld3D. It consumes ONLY a pinned 13.6 encounter and immutable sealed
// 14.2 world seed. The full lease check and INSERT occur in one PostgreSQL
// transaction, while the scheduler must serialize 13.6 ticks with commit().
// No client-passed kills, timestamps, tiers, NPC spawns or rewards accepted.
import {createHash} from 'node:crypto';
import {ENCOUNTER_RULES_136} from './privateWorldEncounter136.mjs';

const validKey=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{8,128}$/.test(x);
const validWho=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
const validHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const validEnemy=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const validTier=x=>['normal','elite','champion','miniBoss'].includes(x);
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const clone=x=>Object.freeze({...x});
const denied=reason=>Object.freeze({ok:false,reason,version:'15.3',
 receipts:Object.freeze([]),privateServerOnly:true,rewardAuthorized:false,
 questCreditCommitted:false,productionReady:false});
const leaseSQL=`
 SELECT l.instance_id,l.instance_epoch,l.holder_id,l.owner_id,
  l.character_id,l.map_fingerprint,l.fencing_token::text AS fencing_token
 FROM game3d_combat_world_instance_lease l
 WHERE l.instance_id=$1 AND l.instance_epoch=$2 AND l.holder_id=$3
  AND l.owner_id=$4 AND l.character_id=$5 AND l.map_fingerprint=$6
  AND l.fencing_token=$7::bigint
  AND l.expires_at>clock_timestamp()
 FOR UPDATE
`;
const seedSQL=`
 SELECT s.instance_id,s.owner_id,s.character_id,s.map_fingerprint,
  s.map_id,s.source_kind,s.sealed,s.actors_json,
  s.world_origin_x,s.world_origin_z
 FROM game3d_private_world_seed_142 s
 WHERE s.instance_id=$1 AND s.owner_id=$2 AND s.character_id=$3
  AND s.map_fingerprint=$4 AND s.map_id=$5 AND s.sealed=true
  AND s.source_kind='trusted_server_world_provisioner'
 FOR SHARE
`;
const insertSQL=`
 INSERT INTO game3d_private_world_kill_receipt_152
 (receipt_id,owner_id,character_id,instance_id,instance_epoch,
  map_fingerprint,event_seq,enemy_id,enemy_tier,source_kind,
  server_kill_committed)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,
  'server-committed-private-pve-kill',true)
 ON CONFLICT DO NOTHING RETURNING receipt_id
`;
function trustedRoster(row,scope,mapId,origin,initial){
 if(row?.instance_id!==scope.instanceId||
    row?.owner_id!==scope.ownerId||
    row?.character_id!==scope.characterId||
    row?.map_fingerprint!==scope.mapFingerprint||
    row?.map_id!==mapId||row?.sealed!==true||
    row?.source_kind!=='trusted_server_world_provisioner'||
    row.world_origin_x!==origin.x||row.world_origin_z!==origin.z||
    !row?.actors_json||!Array.isArray(row.actors_json.enemies)||
    row.actors_json.enemies.length>16)
  return null;
 if(initial?.instanceId!==scope.instanceId||
    initial.enemies?.length!==row.actors_json.enemies.length||
    initial.player?.x!==row.actors_json.player?.position?.x||
    initial.player?.z!==row.actors_json.player?.position?.z||
    initial.player?.maxHp!==row.actors_json.player?.stats?.maxHP||
    initial.player?.hp!==row.actors_json.player?.hp)return null;
 const initialEnemy=new Map(initial.enemies.map(e=>[e.id,e]));
 const byId=new Map();
 for(const enemy of row.actors_json.enemies){
  if(!validEnemy(enemy?.id)||!validTier(enemy?.tier)||
     enemy.isBoss===true||byId.has(enemy.id)||
     initialEnemy.get(enemy.id)?.x!==enemy.position?.x||
     initialEnemy.get(enemy.id)?.z!==enemy.position?.z||
     initialEnemy.get(enemy.id)?.maxHp!==enemy.stats?.maxHP||
     initialEnemy.get(enemy.id)?.tier!==enemy.tier||
     initialEnemy.get(enemy.id)?.hp!==enemy.hp||
     initialEnemy.get(enemy.id)?.alive!==true)return null;
  byId.set(enemy.id,enemy.tier);
 }
 return byId;
}
const verifySnapshot=(snapshot,scope,roster)=>{
 if(snapshot?.instanceId!==scope.instanceId||
   snapshot.rewardsIssued!==false||
   snapshot.productionReady!==false||
   !integer(snapshot.eventSeq)||
   !Array.isArray(snapshot.enemies)||
   snapshot.enemies.length!==roster.size)return null;
 const dead=new Map();
 for(const e of snapshot.enemies){
  if(!roster.has(e?.id)||dead.has(e.id)||
     e.tier!==roster.get(e.id)||
     typeof e.alive!=='boolean'||!Number.isFinite(e.hp)||
     (e.alive&&e.hp===0)||(!e.alive&&e.hp!==0))return null;
  dead.set(e.id,e);
 }
 return dead;
}
const validScope=s=>validKey(s?.instanceId)&&validKey(s?.instanceEpoch)&&
 validKey(s?.holderId)&&validWho(s?.ownerId)&&
 validWho(s?.characterId)&&validHash(s?.mapFingerprint);

// This module is only constructible inside a privileged world scheduler.
// The injected authorizer MUST use operator identity, not browser claims.
// The serializer MUST prevent parallel tick()/restoreCheckpoint() while
// commit() is in flight. Snapshot stability is also checked fail-closed.
export function createGame3DPrivateWorldKillCommit153({
 encounter,pool,scope,fencingToken,authorizeServerOperation,
 attestCommittedKill185=null,
}={}){
 if(typeof pool?.connect!=='function'||
    typeof authorizeServerOperation!=='function'||
    (attestCommittedKill185!==null&&typeof attestCommittedKill185!=='function')||
    !validScope(scope)||
    !integer(fencingToken)||fencingToken<1||
    encounter?.version!=='13.6'||encounter.privateServerOnly!==true||
    encounter.instanceId!==scope.instanceId||
    encounter.mapFingerprint!==scope.mapFingerprint||
    typeof encounter.getEventsAfter!=='function'||
    typeof encounter.snapshot!=='function')
  throw Error('15.3 requires private encounter, committed lease, server authority and PostgreSQL');
 const pinned=clone(scope),token=fencingToken;
 const initial=encounter.snapshot();
 // Never skip an unknown kill on worker bootstrap/recovery. An existing
 // nonzero event stream requires a separate durable reconciliation design.
 if(initial?.instanceId!==pinned.instanceId||initial.eventSeq!==0||
    initial.rewardsIssued!==false||initial.productionReady!==false)
  throw Error('15.3 requires fresh, zero-sequence authoritative world');
 let cursor=0,fenced=false,tail=Promise.resolve();
 const serialize=fn=>{
  const result=tail.then(fn,fn);
  tail=result.then(()=>undefined,()=>undefined);
  return result;
 };
 const commit=()=>serialize(async()=>{
  if(fenced)return denied('private_kill_commit_fenced');
  let authorized=false;
  try{authorized=await authorizeServerOperation({
   operation:'commit_private_world_kills',scope:pinned,fencingToken:token
  })===true}catch{}
  if(!authorized){fenced=true;return denied('private_kill_commit_unauthorized')}
  const client=await pool.connect();
  let begun=false;
  try{
   await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
   begun=true;
   const lease=await client.query(leaseSQL,[
    pinned.instanceId,pinned.instanceEpoch,pinned.holderId,
    pinned.ownerId,pinned.characterId,pinned.mapFingerprint,token
   ]);
   if(lease.rowCount!==1||
      Number(lease.rows[0]?.fencing_token)!==token){
    fenced=true;
    await client.query('ROLLBACK');begun=false;
    return denied('private_world_kill_lease_lost');
   }
   const sr=await client.query(seedSQL,[
    pinned.instanceId,pinned.ownerId,pinned.characterId,
    pinned.mapFingerprint,encounter.mapId
   ]);
   const roster=sr.rowCount===1?
    trustedRoster(sr.rows[0],pinned,encounter.mapId,
     encounter.worldOrigin,initial):null;
   if(!roster){
    fenced=true;
    await client.query('ROLLBACK');begun=false;
    return denied('trusted_world_kill_seed_missing');
   }
   const snapshot=encounter.snapshot();
   const dead=verifySnapshot(snapshot,pinned,roster);
   const events=encounter.getEventsAfter(cursor);
   if(!dead||!Array.isArray(events)||
      events.length>ENCOUNTER_RULES_136.maxEvents||
      snapshot.eventSeq-cursor!==events.length){
    fenced=true;
    await client.query('ROLLBACK');begun=false;
    return denied('private_world_kill_event_gap');
   }
   const commits=[];
   let next=cursor;
   for(const e of events){
    if(e?.seq!==next+1||e.instanceId!==pinned.instanceId||
       !integer(e.serverTime)||!['player_strike','enemy_strike',
        'enemy_miss','enemy_strike_refused','enemy_telegraph'].includes(e.kind)||
       e.xpAuthorized!==false||e.lootAuthorized!==false||
       e.currencyAuthorized!==false){
      fenced=true;
      await client.query('ROLLBACK');begun=false;
      return denied('invalid_private_world_event_chain');
    }
    next=e.seq;
    if(e.kind!=='player_strike'||e.killed!==true)continue;
    const tier=roster.get(e.targetId);
    if(!validEnemy(e.targetId)||!validTier(tier)||
       e.enemyHp!==0||e.serverKillCommitted!==false||
       dead.get(e.targetId)?.alive!==false||
       dead.get(e.targetId)?.hp!==0||
       // With 15.1 merged, also cross-check its server-attested event tier.
       (e.tier!==undefined&&e.tier!==tier)){
      fenced=true;
      await client.query('ROLLBACK');begun=false;
      return denied('untrusted_private_lethal_event');
    }
    const receiptId='worldkill-'+createHash('sha256')
     .update([pinned.instanceId,pinned.instanceEpoch,e.seq].join('\0'))
     .digest('hex');
    const insert=await client.query(insertSQL,[
     receiptId,pinned.ownerId,pinned.characterId,
     pinned.instanceId,pinned.instanceEpoch,pinned.mapFingerprint,
     e.seq,e.targetId,tier
    ]);
    // A duplicate or conflicting event must never silently count as a
    // newly committed kill. No reward writers are called in either case.
    if(insert.rowCount===1){
     // 18.5 opt-in: make the immutable receipt and its ORIGINAL 18.3
     // per-world-open lease nonce one atomic PostgreSQL commit.
     // Only the already-sealed 13.6/15.3 lethal event reaches this hook.
     // A stale/revoked world or missing binding ROLLS BACK BOTH inserts.
     if(attestCommittedKill185!==null&&
        await attestCommittedKill185(client,Object.freeze({
         receiptId,ownerId:pinned.ownerId,characterId:pinned.characterId,
         instanceId:pinned.instanceId,instanceEpoch:pinned.instanceEpoch,
         mapFingerprint:pinned.mapFingerprint,eventSeq:e.seq,
        }))!==true)
      throw Error('18.5 cannot attest world kill session lease');
     commits.push(Object.freeze({receiptId,eventSeq:e.seq,
      enemyId:e.targetId,tier}));
    }
   }
   if(encounter.snapshot().eventSeq!==snapshot.eventSeq){
    fenced=true;
    await client.query('ROLLBACK');begun=false;
    return denied('concurrent_private_world_tick');
   }
   await client.query('COMMIT');begun=false;
   cursor=next;
   return Object.freeze({ok:true,version:'15.3',
    lastSeq:cursor,receipts:Object.freeze(commits),
    privateServerOnly:true,killReceiptCommitted:commits.length>0,
    questCreditCommitted:false,rewardAuthorized:false,
    productionReady:false});
  }catch{
   // An ambiguous COMMIT can be retried safely due to the immutable
   // receipt primary key and unique instance/epoch/event sequence.
   if(begun)try{await client.query('ROLLBACK')}catch{}
   return denied('private_world_kill_database_failure');
  }finally{client.release()}
 });
 return Object.freeze({version:'15.3',commit,
  privateServerOnly:true,publicRouteInstalled:false,
  publicGameWorldMounted:false,
  trustedSchedulerIntegrationInstalled:false,
  questCreditWriterInstalledSeparately:true,
  questTurnInWriterEnabled:false,rewardWriterEnabled:false,
  productionReady:false});
}
