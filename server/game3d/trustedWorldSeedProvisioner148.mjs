// Combat 14.8: privileged PRIVATE world seed creation.
// Use only committed character progression + canonical Wolfveil geometry and
// the shared AXE PvE budget. No browser actor data, loot, XP, item grants,
// public route, or automatic instance/session issuance.
import {randomUUID} from 'node:crypto';
import {createWolfveilMapCollision,WOLFVEIL_MAP_ID,
 WOLFVEIL_MAP_FINGERPRINT} from './mapCollision.mjs';
import {deriveCharacterLevel} from './progressionLevelPolicy.mjs';
import {getAXEParHero,getAXEEnemyStats}
 from '../../base44/shared/axePowerBudget.ts';

const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const INSTANCE=/^[A-Za-z0-9_.:-]{8,128}$/;
const validWho=x=>typeof x==='string'&&WHO.test(x)&&
 !['__anon__','__default__'].includes(x);
const validInstance=x=>typeof x==='string'&&INSTANCE.test(x);
const safeInt=x=>{
 if(typeof x!=='string'||!/^(0|[1-9][0-9]*)$/.test(x))return null;
 const n=Number(x);
 return Number.isSafeInteger(n)?n:null;
};
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const stats=s=>s&&finite(s.maxHP)&&s.maxHP>=1&&s.maxHP<=100000&&
 finite(s.damage)&&s.damage>=1&&s.damage<=100000&&
 finite(s.defense)&&s.defense>=0&&s.defense<=100000;
const fail=reason=>{throw Error('14.8 '+reason)};
const BLUEPRINTS=Object.freeze({
 'wolfveil-patrol-v1':Object.freeze({tier:'normal',profile:'standard'}),
 'wolfveil-elite-v1':Object.freeze({tier:'elite',profile:'bruiser'}),
});
const SITES=Object.freeze(
 [-360,-280,-200,200,280,360].flatMap(x=>
  [-330,-240,-150,150,240,330].map(z=>Object.freeze({x,z}))),
);
const projectStats=s=>({maxHP:s.maxHP,damage:s.damage,defense:s.defense});
function chooseServerActors({mapWorld,level,blueprint}){
 const hero=getAXEParHero(level);
 const npc=getAXEEnemyStats(level,blueprint.tier);
 if(!stats(hero)||!stats(npc))fail('invalid_shared_power_budget');
 const origin=Object.freeze({x:0,z:0});
 for(const point of SITES){
  const player={x:point.x,z:point.z};
  const enemy={x:point.x+2.25,z:point.z};
  try{
   if(mapWorld.valid(player,origin)!==true||
      mapWorld.valid(enemy,origin)!==true||
      mapWorld.canStrike(player,enemy,origin)!==true||
      !finite(mapWorld.height(player,origin))||
      !finite(mapWorld.height(enemy,origin)))continue;
  }catch{continue}
  return {
   origin,
   actors:{
    player:{position:player,hp:hero.maxHP,stats:projectStats(hero)},
    enemies:[{
     id:'world_seed_enemy_148_1',position:enemy,home:{...enemy},
     hp:npc.maxHP,stats:projectStats(npc),
     tier:blueprint.tier,aiProfile:blueprint.profile,
     isQuestSpawn:false,isBoss:false,
    }],
   },
  };
 }
 fail('no_verified_wolfveil_spawn');
}

export function createGame3DWorldSeedProvisioner148({
 pool,authorizeTrustedProvision,
 makeInstanceId=()=> 'world-'+randomUUID(),
 mapWorld=createWolfveilMapCollision(),
}={}){
 if(typeof pool?.connect!=='function'||
    typeof authorizeTrustedProvision!=='function'||
    typeof makeInstanceId!=='function'||
    mapWorld?.id!==WOLFVEIL_MAP_ID||
    mapWorld?.fingerprint!==WOLFVEIL_MAP_FINGERPRINT||
    typeof mapWorld.valid!=='function'||
    typeof mapWorld.height!=='function'||
    typeof mapWorld.canStrike!=='function')
  fail('private_provisioner_requires_server_authority');
 const provision=async({ownerId,characterId,
  blueprintId='wolfveil-patrol-v1'}={})=>{
  if(!validWho(ownerId)||!validWho(characterId)||
     !Object.hasOwn(BLUEPRINTS,blueprintId))
   fail('untrusted_provision_request');
  // Authorization MUST bind a private server operator to this exact
  // character and action. Never expose this method as an HTTP endpoint.
  let allowed=false;
  try{
   allowed=await authorizeTrustedProvision({
    operation:'create_private_world_seed',
    ownerId,characterId,blueprintId,
   })===true;
  }catch{}
  if(!allowed)fail('provision_not_authorized');
  const instanceId=makeInstanceId();
  if(!validInstance(instanceId))fail('invalid_server_instance_id');
  const client=await pool.connect();
  let begun=false;
  try{
   await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
   begun=true;
   const r=await client.query(
    'SELECT owner_id,character_id,revision::text AS revision,'+
    'xp_total::text AS xp_total FROM game3d_trusted_character '+
    'WHERE owner_id=$1 AND character_id=$2 FOR SHARE',
    [ownerId,characterId]);
   if(r.rowCount!==1||r.rows[0]?.owner_id!==ownerId||
      r.rows[0]?.character_id!==characterId)
    fail('trusted_character_missing');
   const characterRevision=safeInt(r.rows[0].revision);
   if(characterRevision===null)fail('invalid_character_revision');
   const level=deriveCharacterLevel(r.rows[0].xp_total).level;
   const {origin,actors}=chooseServerActors({
    mapWorld,level,blueprint:BLUEPRINTS[blueprintId],
   });
   // PostgreSQL serializable transaction + a FOR SHARE character lock bind
   // the exact XP/revision to this immutable seed. ON CONFLICT never rewrites
   // a prior instance and no externally supplied actor payload is accepted.
   const save=await client.query(
    'INSERT INTO game3d_private_world_seed_142 '+
    '(instance_id,owner_id,character_id,map_id,map_fingerprint,'+
    'revision,world_origin_x,world_origin_z,actors_json,'+
    'character_revision,source_kind,sealed) VALUES '+
    '($1,$2,$3,$4,$5,1,$6,$7,$8::jsonb,$9,'+
    "'trusted_server_world_provisioner',true) "+
    'ON CONFLICT (instance_id) DO NOTHING '+
    'RETURNING instance_id,owner_id,character_id,'+
    'character_revision::text AS character_revision',
    [instanceId,ownerId,characterId,
     WOLFVEIL_MAP_ID,WOLFVEIL_MAP_FINGERPRINT,
     origin.x,origin.z,JSON.stringify(actors),characterRevision]);
   if(save.rowCount!==1||
      save.rows[0]?.instance_id!==instanceId||
      save.rows[0]?.owner_id!==ownerId||
      save.rows[0]?.character_id!==characterId||
      safeInt(save.rows[0]?.character_revision)!==characterRevision)
    fail('instance_conflict_or_provision_failed');
   await client.query('COMMIT');
   begun=false;
   return Object.freeze({
    ok:true,instanceId,ownerId,characterId,
    mapId:WOLFVEIL_MAP_ID,mapFingerprint:WOLFVEIL_MAP_FINGERPRINT,
    characterRevision,seedRevision:1,blueprintId,
    level,provenance:'trusted_server_world_provisioner',
    privateOnly:true,rewardsIssued:false,
   });
  }catch(e){
   if(begun)try{await client.query('ROLLBACK')}catch{}
   throw e;
  }finally{client.release()}
 };
 return Object.freeze({
  version:'14.8',provision,
  privateServerOnly:true,createsWorldSeeds:true,
  actorSource:'trusted_character_and_server_blueprint',
  issuesPlayerBearerTokens:false,publicHTTPInstalled:false,
  mutatesLiveGame:false,lootWriterEnabled:false,
  rewardWriterEnabled:false,productionReady:false,
 });
}
