import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame3DTrustedCombatSheetReader143}
 from '../trustedCombatSheet143.mjs';
import {createGame3DPrivateAXEPveResolvers143}
 from '../privateAXEPveResolver143.mjs';
import {createGame3DPrivateWorldBootstrap143}
 from '../privateWorldBootstrap143.mjs';
import {getAXEParHero,getAXEEnemyStats,axeStrikeOutcomes,rollAXEStrike}
 from '../../../base44/shared/axePowerBudget.ts';

const scope={instanceId:'world-143-0001',ownerId:'owner143',
 characterId:'hero143',mapFingerprint:'a'.repeat(64)};
const player={position:{x:0,z:0},hp:100,
 stats:{maxHP:100,damage:10,defense:2}};
const wolf={id:'wolf1',position:{x:2,z:0},
 home:{x:2,z:0},hp:30,
 stats:{maxHP:30,damage:3,defense:1},
 tier:'normal',aiProfile:'standard'};
const seed={ok:true,provenance:'authoritative-world-simulation',
 instanceId:scope.instanceId,ownerId:scope.ownerId,
 characterId:scope.characterId,
 mapId:'wolfveil-v1',mapFingerprint:scope.mapFingerprint,
 worldOrigin:{x:0,z:0},player,enemies:[wolf],
 trustedSeedRevision:5};
const row=(overrides={})=>({
 owner_id:scope.ownerId,character_id:scope.characterId,
 character_revision:'4',bound_character_revision:'4',
 seed_revision:'5',xp_total:'100',...overrides});
function db(record=row()){
 const calls=[];let releases=0;
 return {pool:{connect:async()=>({
  query:async(sql,args)=>{calls.push({sql,args});
   return sql.startsWith('SELECT')?{
    rowCount:record?1:0,rows:record?[record]:[]}:{
     rowCount:0,rows:[]};
  },release:()=>{releases++},
 })},calls,get releases(){return releases}};
}
test('14.3 derives trusted character level and exact shared AXE par sheet',async()=>{
 const f=db(),read=createGame3DTrustedCombatSheetReader143({pool:f.pool});
 const r=await read.read({scope,seedRevision:5});
 assert.equal(r.source,'private-trusted-character-progress');
 assert.equal(r.level,2);
 assert.deepEqual(r.sheet.damage,getAXEParHero(2).damage);
 assert.deepEqual(r.sheet.maxHP,getAXEParHero(2).maxHP);
 assert.equal(r.equipmentBonusesAuthorized,false);
 assert.equal(r.masteryBonusesAuthorized,false);
 assert.equal(r.rewardsAuthorized,false);
 assert.equal(f.calls[0].sql,
  'BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE');
 assert.equal(f.calls[1].args[0],scope.ownerId);
 assert.match(f.calls[1].sql,/s\.character_revision/);
 assert.equal(f.calls.at(-1).sql,'COMMIT');
 assert.equal(f.releases,1);
 const revised=read.apply({seed,progress:r});
 assert.equal(revised.player.hp,100);
 assert.equal(revised.player.stats.damage,r.sheet.damage);
 assert.equal(revised.enemies[0].stats.defense,
  getAXEEnemyStats(2,'normal').defense);
 assert.equal(revised.enemies[0].hp,30);
 assert.equal(revised.combatFormula,'shared-AXE-pve-base');
 assert.equal(revised.equipmentBonusesAuthorized,false);
});
test('14.3 rejects changed or absent character progression revisions',async()=>{
 for(const changed of [
  {character_revision:'5'},
  {bound_character_revision:null},
  {seed_revision:'6'},
  {xp_total:'bogus'},
  {owner_id:'attacker'},
 ]){
  const f=db(row(changed)),reader=
   createGame3DTrustedCombatSheetReader143({pool:f.pool});
  await assert.rejects(reader.read({scope,seedRevision:5}),
   /combat sheet unavailable|committed XP total/);
  assert.equal(f.calls.at(-1).sql,'ROLLBACK');
  assert.equal(f.releases,1);
 }
 const absent=db(null);
 await assert.rejects(createGame3DTrustedCombatSheetReader143({
  pool:absent.pool}).read({scope,seedRevision:5}),
 /combat sheet unavailable/);
});
test('14.3 blocks forged HP, missing actor identity and invalid NPC tiers',async()=>{
 const reader=createGame3DTrustedCombatSheetReader143({pool:db().pool});
 const progress=await reader.read({scope,seedRevision:5});
 for(const invalid of [
  {...seed,player:{...player,hp:99999}},
  {...seed,enemies:[{...wolf,tier:'worldBoss'}]},
  {...seed,trustedSeedRevision:6},
 ]){
  assert.throws(()=>reader.apply({seed:invalid,progress}),
   /combat sheet unavailable/);
 }
});
test('14.3 player and NPC outcomes use the single shared AXE formula',()=>{
 const rolls=[.99,0];
 const rng=()=>rolls.shift();
 const r=createGame3DPrivateAXEPveResolvers143({randomRoll:rng});
 const attacker=getAXEParHero(5),defender=getAXEEnemyStats(5,'normal');
 const expected=rollAXEStrike(axeStrikeOutcomes(attacker,defender,{
  pvp:false,isSkill:false,skillMultiplier:1,targetHpPct:1,
 }),.99);
 const hit=r.resolvePlayerStrike({attacker,defender,
  skillMultiplier:1,isSkill:false,targetHpPct:1});
 assert.equal(hit.damage,expected.damage);
 assert.equal(hit.critical,expected.critical);
 assert.equal(hit.reflected,0);
 assert.equal(hit.lifeSteal,0);
 const miss=r.resolveEnemyStrike({attacker:defender,defender:attacker,
  skillMultiplier:1,isSkill:false,targetHpPct:1});
 assert.equal(miss.damage>=0,true);
 assert.equal(r.source,'shared-axe-power-budget-pve');
 assert.equal(r.reflectedAndLifeStealApplied,false);
});
test('14.3 denies client-modified formula or invalid private random roll',()=>{
 const r=createGame3DPrivateAXEPveResolvers143({randomRoll:()=>.5});
 const attacker=getAXEParHero(1),defender=getAXEEnemyStats(1);
 assert.throws(()=>r.resolvePlayerStrike({attacker,defender,
  skillMultiplier:999,isSkill:true,targetHpPct:1}),/invalid private/);
 const bad=createGame3DPrivateAXEPveResolvers143({randomRoll:()=>NaN});
 assert.throws(()=>bad.resolvePlayerStrike({attacker,defender,
  skillMultiplier:1,isSkill:false,targetHpPct:1}),/invalid private RNG/);
});
test('14.3 immutable revision binding migration and no live rewards',async()=>{
 const sql=readFileSync(new URL(
  '../sql/033_combat143_character_sheet_binding.sql',import.meta.url),'utf8');
 assert.match(sql,/ADD COLUMN character_revision bigint/);
 assert.match(sql,/world_seed_143_revision_nonnegative/);
 assert.doesNotMatch(sql,/GRANT INSERT|GRANT UPDATE|GRANT DELETE/);
 await assert.rejects(createGame3DPrivateWorldBootstrap143({
  scope,pool:{connect:()=>{}},authorizeServerOperation:null,
 }),/trusted worker/);
});
