// Combat 14.3 — private, level-bound AXE combat sheet, no equipment bonuses.
// Derive progression ONLY from the server's trusted character row, bound to
// the immutable 14.2 seed's recorded character revision. Never accept client
// stats or equipping claims. The same AXE TypeScript power budget is imported
// by the browser and the existing duel server.
import {deriveCharacterLevel} from './progressionLevelPolicy.mjs';
import {getAXEParHero,getAXEEnemyStats}
 from '../../base44/shared/axePowerBudget.ts';

const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
const key=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{8,128}$/.test(x);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const revision=x=>{
 const v=typeof x==='bigint'?String(x):typeof x==='string'?x:
  Number.isSafeInteger(x)?String(x):'';
 if(!/^(0|[1-9][0-9]*)$/.test(v))return null;
 const n=Number(v);
 return Number.isSafeInteger(n)?n:null;
};
const bound=(n,maximum)=>typeof n==='number'&&
 Number.isFinite(n)&&n>=0&&n<=maximum;
const fail=()=>{throw Error('14.3 trusted character combat sheet unavailable')};
const project=(stats)=>{
 const fields=['level','maxHP','damage','defense','attackSuccess','attackBlock',
  'critChance','attributionAttack','attributionDefense','criticalDamage',
  'criticalDefense','armorPenPct','hitBonusPct','avoidPct','blockPct',
  'damageReductionPct'];
 const out={};
 for(const f of fields){
  // The canonical AXE enemy curve leaves certain optional equipment
  // modifiers unspecified; they are zero, not a missing world attestation.
  const n=stats?.[f]===undefined ? 0 : stats[f];
  if(!bound(n,100000))fail();
  out[f]=n;
 }
 if(!bound(out.maxHP,100000)||out.maxHP<1||out.damage<1)fail();
 out.totalDamage=out.damage;
 return Object.freeze(out);
};
export function createGame3DTrustedCombatSheetReader143({pool}={}){
 if(typeof pool?.connect!=='function')
  throw Error('14.3 requires private PostgreSQL character read');
 const read=async({scope,seedRevision}={})=>{
  if(!who(scope?.ownerId)||!who(scope?.characterId)||
     !key(scope?.instanceId)||!sha(scope?.mapFingerprint)||
     !Number.isSafeInteger(seedRevision)||seedRevision<1)fail();
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE');
   const out=await c.query(
    'SELECT ch.owner_id,ch.character_id,ch.revision::text AS character_revision,'+
    'ch.xp_total::text AS xp_total,s.revision::text AS seed_revision,'+
    's.character_revision::text AS bound_character_revision '+
    'FROM game3d_trusted_character ch JOIN game3d_private_world_seed_142 s '+
    'ON s.owner_id=ch.owner_id AND s.character_id=ch.character_id '+
    'WHERE ch.owner_id=$1 AND ch.character_id=$2 AND s.instance_id=$3 '+
    'AND s.map_fingerprint=$4 AND s.sealed=true',
    [scope.ownerId,scope.characterId,scope.instanceId,scope.mapFingerprint]);
   if(out.rowCount!==1)fail();
   const row=out.rows[0];
   const current=revision(row.character_revision);
   if(row.owner_id!==scope.ownerId||row.character_id!==scope.characterId||
      current===null||current!==revision(row.bound_character_revision)||
      revision(row.seed_revision)!==seedRevision)fail();
   // XP is committed in PostgreSQL, but separately earned item affixes,
   // clan modifiers, ranked/quest bonuses and rewards remain unverified.
   const level=deriveCharacterLevel(String(row.xp_total)).level;
   const sheet=project(getAXEParHero(level));
   await c.query('COMMIT');
   return Object.freeze({
    source:'private-trusted-character-progress',
    characterRevision:current,seedRevision,level,sheet,
    equipmentBonusesAuthorized:false,masteryBonusesAuthorized:false,
    rankedEligible:false,rewardsAuthorized:false,
   });
  }catch(e){try{await c.query('ROLLBACK')}catch{}throw e}
  finally{c.release()}
 };
 // NPC stats are computed using the same shared AXE enemy tier curve.
 // The original sealed seed supplies positions and HP, but may never
 // exceed the independently derived tier HP budget.
 const apply=({seed,progress}={})=>{
  if(!seed?.ok||!Array.isArray(seed.enemies)||!progress?.sheet||
     !Number.isSafeInteger(progress.level)||
     progress.seedRevision!==seed.trustedSeedRevision)fail();
  const player=Object.freeze({
   position:seed.player.position,
   hp:seed.player.hp,
   stats:progress.sheet,
  });
  if(player.hp>progress.sheet.maxHP)fail();
  const enemies=seed.enemies.map(e=>{
   // Shared getAXEEnemyStats deliberately falls back to 'normal' for
   // unknown tiers. A private combat admission must NOT silently coerce
   // a forged/unsupported NPC into a valid combat opponent.
   if(!e||!['normal','elite','champion','miniBoss'].includes(e.tier)||
      typeof e.id!=='string'||!/^[A-Za-z0-9_.:-]{1,160}$/.test(e.id))
    fail();
   const npc=project(getAXEEnemyStats(progress.level,e.tier));
   if(e.hp>npc.maxHP)fail();
   return Object.freeze({...e,stats:npc});
  });
  return Object.freeze({...seed,
   player,enemies:Object.freeze(enemies),
   verifiedCharacterRevision:progress.characterRevision,
   level:progress.level,
   combatFormula:'shared-AXE-pve-base',
   equipmentBonusesAuthorized:false,
   masteryBonusesAuthorized:false,
  });
 };
 return Object.freeze({
  version:'14.3',read,apply,
  privateServerOnly:true,readOnly:true,
  equipmentBonusesAuthorized:false,
  rewardWriterEnabled:false,productionReady:false,
 });
}
