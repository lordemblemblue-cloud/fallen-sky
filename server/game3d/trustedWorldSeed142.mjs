// Combat Foundation 14.2: only immutable, server-provisioned PG snapshots
// may initialize the existing 13.6 combat engine. No browser snapshot input,
// account impersonation, NPC spawning API, or reward/quest grant authority.
const key=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{8,128}$/.test(x);
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
const enemyId=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const bounded=(x,max)=>finite(x)&&x>=0&&x<=max;
const pos=x=>x&&finite(x.x)&&finite(x.z)&&
 Math.abs(x.x)<=100000&&Math.abs(x.z)<=100000;
const shape=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const stats=x=>shape(x)&&bounded(x.maxHP,100000)&&x.maxHP>=1&&
 bounded(x.damage,100000)&&bounded(x.defense,100000);
const validScope=s=>key(s?.instanceId)&&who(s?.ownerId)&&
 who(s?.characterId)&&hash(s?.mapFingerprint);
const fail=()=>{throw Error('14.2 trusted world seed missing or invalid')};
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
function normalizeSeed142(row,scope,map){
 if(!row||row.instance_id!==scope.instanceId||
    row.owner_id!==scope.ownerId||row.character_id!==scope.characterId||
    row.map_id!==map.id||row.map_fingerprint!==map.fingerprint||
    row.map_fingerprint!==scope.mapFingerprint||
    row.source_kind!=='trusted_server_world_provisioner'||
    row.sealed!==true||
    !Number.isSafeInteger(Number(row.revision))||
    Number(row.revision)<1||
    !pos({x:row.world_origin_x,z:row.world_origin_z})||
    !shape(row.actors_json))fail();
 const actors=row.actors_json;
 if(!Object.keys(actors).every(k=>['player','enemies'].includes(k))||
    !shape(actors.player)||!Array.isArray(actors.enemies)||
    actors.enemies.length>16||!pos(actors.player.position)||
    !stats(actors.player.stats)||!bounded(actors.player.hp,100000)||
    actors.player.hp<1||actors.player.hp>actors.player.stats.maxHP)
  fail();
 const projectStats=x=>({
  maxHP:x.maxHP,damage:x.damage,defense:x.defense,
 });
 const projectPosition=x=>({x:x.x,z:x.z});
 const seen=new Set();
 const enemies=actors.enemies.map(e=>{
  if(!shape(e)||!enemyId(e.id)||seen.has(e.id)||
     e.isBoss===true||
     !['normal','elite','champion','miniBoss'].includes(e.tier)||
     !['standard','aggressive','quest','bruiser'].includes(e.aiProfile)||
     !pos(e.position)||!pos(e.home)||!stats(e.stats)||
     !bounded(e.hp,100000)||e.hp<1||e.hp>e.stats.maxHP||
     (own(e,'isQuestSpawn')&&typeof e.isQuestSpawn!=='boolean'))
   fail();
  seen.add(e.id);
  return {
   id:e.id,position:projectPosition(e.position),
   home:projectPosition(e.home),stats:projectStats(e.stats),
   hp:e.hp,tier:e.tier,aiProfile:e.aiProfile,
   isQuestSpawn:e.isQuestSpawn===true,isBoss:false,
  };
 });
 const origin={x:row.world_origin_x,z:row.world_origin_z};
 const player={position:projectPosition(actors.player.position),
  hp:actors.player.hp,stats:projectStats(actors.player.stats)};
 try{
  if(map.valid(player.position,origin)!==true||
     enemies.some(e=>map.valid(e.position,origin)!==true||
                     map.valid(e.home,origin)!==true))fail();
 }catch{fail()}
 return Object.freeze({
  ok:true,provenance:'authoritative-world-simulation',
  instanceId:scope.instanceId,ownerId:scope.ownerId,
  characterId:scope.characterId,mapId:map.id,
  mapFingerprint:map.fingerprint,worldOrigin:Object.freeze(origin),
  player:Object.freeze(player),
  enemies:Object.freeze(enemies),
  trustedSeedRevision:Number(row.revision),
 });
}
export function createGame3DTrustedWorldSeedReader142({pool}={}){
 if(typeof pool?.connect!=='function')
  throw Error('14.2 requires private PostgreSQL');
 const read=async({scope,map}={})=>{
  if(!validScope(scope)||!map||map.id!=='wolfveil-v1'||
     map.fingerprint!==scope.mapFingerprint||
     typeof map.valid!=='function')
   fail();
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE');
   const res=await c.query(
    'SELECT s.instance_id,s.owner_id,s.character_id,s.map_id,'+
    's.map_fingerprint,s.revision::text AS revision,'+
    's.world_origin_x,s.world_origin_z,s.actors_json,'+
    's.source_kind,s.sealed FROM game3d_private_world_seed_142 s '+
    'INNER JOIN game3d_trusted_character ch '+
    'ON ch.owner_id=s.owner_id AND ch.character_id=s.character_id '+
    'WHERE s.instance_id=$1 AND s.owner_id=$2 AND s.character_id=$3 '+
    'AND s.map_id=$4 AND s.map_fingerprint=$5 AND s.sealed=true',
    [scope.instanceId,scope.ownerId,scope.characterId,
     map.id,map.fingerprint]);
   // In a read-only snapshot, malformed records must fail before COMMIT.
   const seed=res.rowCount===1?
    normalizeSeed142(res.rows[0],scope,map):fail();
   await c.query('COMMIT');
   return seed;
  }catch(e){
   try{await c.query('ROLLBACK')}catch{}
   throw e;
  }finally{c.release()}
 };
 return Object.freeze({
  version:'14.2',read,
  privateServerOnly:true,readOnly:true,
  acceptsBrowserActorSnapshots:false,seedProvisionerInstalled:false,
  rewardWriterEnabled:false,productionReady:false,
 });
}
