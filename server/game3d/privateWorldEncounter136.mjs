// Combat 13.6 — PRIVATE, single-writer PvE encounter simulation.
// This is an opt-in server-only building block, not a public WS/HTTP route.
// An externally injected authoritative world attester MUST supply the initial
// instance/player/NPC snapshot. No browser pose, damage, health, NPCs or
// rewards are accepted, and NO XP/item/AGP persistence is performed.
import {
 combatEnemyProfile,enemyPursuitVector,planEnemyStrike,isWithinEnemyStrike,
 horizontalDistance,
} from '../../src/components/game3d/ai/EnemyCombatIntelligence.mjs';
import {assessGame3DServerWorldStrike123} from './serverWorldStrike123.mjs';
import {validateResolvedStrike129} from './combatResolverGuard129.mjs';

export const ENCOUNTER_RULES_136=Object.freeze({
 maxEnemies:16,maxQueued:24,maxEvents:100,
 maxTickDeltaMs:100,inputHoldMs:350,
 moveSpeed:6.5,playerStrikeCooldownMs:450,
 meleeRange:3,defenseRange:3,rangedRange:7,
});
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const key=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const supportedTier=x=>['normal','elite','champion','miniBoss'].includes(x);
const supportedProfile=x=>['standard','aggressive','quest','bruiser'].includes(x);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const number=(x,min,max)=>finite(x)&&x>=min&&x<=max;
const pose=x=>x&&number(x.x,-100000,100000)&&number(x.z,-100000,100000);
const stats=x=>x&&typeof x==='object'&&!Array.isArray(x)&&
 number(x.maxHP,1,100000)&&number(x.damage,0,100000)&&
 number(x.defense,0,100000);
const copy=x=>({x:x.x,z:x.z});
const blocked=reason=>({ok:false,reason,rewardsIssued:false});
const roundDamage=n=>Math.min(100000,Math.max(0,Math.round(n)));
function mapReady(mapWorld,position,worldOrigin){
 try{
  if(mapWorld.valid(position,worldOrigin)!==true)return false;
  const y=mapWorld.height(position,worldOrigin);
  return finite(y);
 }catch{return false}
}
function visible(mapWorld,a,b,origin,maxVertical=1.6){
 try{
  if(!mapReady(mapWorld,a,origin)||!mapReady(mapWorld,b,origin))return false;
  const ay=mapWorld.height(a,origin),by=mapWorld.height(b,origin);
  return Math.abs(ay-by)<=maxVertical&&
   mapWorld.canStrike(a,b,origin)===true;
 }catch{return false}
}
function safeMove(mapWorld,from,to,origin){
 try{
  const after=mapWorld.move(from,to,origin);
  if(!pose(after)||!mapReady(mapWorld,after,origin))return from;
  // A private map resolver may clamp/slide, never teleport actors beyond
  // the submitted step. No client position or authoritative Y is accepted.
  const allowed=Math.hypot(to.x-from.x,to.z-from.z)+0.00001;
  if(horizontalDistance(from,after)>allowed)return from;
  return copy(after);
 }catch{return from}
}
const boundedIntent=x=>x&&typeof x==='object'&&!Array.isArray(x)&&
 typeof x.intentId==='string'&&/^[A-Za-z0-9_-]{8,72}$/.test(x.intentId)&&
 Number.isSafeInteger(x.intentSeq)&&x.intentSeq>0;
const authenticated=(subject,ownerId)=>subject&&
 subject.authenticated===true&&
 subject.identitySource==='trusted-server-session'&&
 subject.accountId===ownerId;

export async function createGame3DPrivateEncounter136({
 instanceId,ownerId,characterId,worldOrigin,mapWorld,
 attestWorldSnapshot,resolveAuthenticatedSubject,
 resolvePlayerStrike,resolveEnemyStrike,now=Date.now,
}={}){
 if(!key(instanceId)||!who(ownerId)||!who(characterId)||
  !pose(worldOrigin)||!mapWorld||
  !key(mapWorld.id)||!sha(mapWorld.fingerprint)||
  typeof mapWorld.valid!=='function'||
  typeof mapWorld.height!=='function'||
  typeof mapWorld.move!=='function'||
  typeof mapWorld.canStrike!=='function'||
  typeof attestWorldSnapshot!=='function'||
  typeof resolveAuthenticatedSubject!=='function'||
  typeof resolvePlayerStrike!=='function'||
  typeof resolveEnemyStrike!=='function'||typeof now!=='function')
  throw Error('13.6 requires private world authority, map and damage resolver');
 // Copy the world anchor before any asynchronous attestation. A mutable
 // caller object cannot move the collision map after the match starts.
 const origin=Object.freeze(copy(worldOrigin));
 const raw=await attestWorldSnapshot({instanceId,ownerId,characterId,
  worldOrigin:origin,mapId:mapWorld.id,mapFingerprint:mapWorld.fingerprint});
 if(raw?.ok!==true||raw.provenance!=='authoritative-world-simulation'||
    raw.instanceId!==instanceId||raw.ownerId!==ownerId||
    raw.characterId!==characterId||raw.mapId!==mapWorld.id||
    raw.mapFingerprint!==mapWorld.fingerprint||
    !pose(raw.worldOrigin)||raw.worldOrigin.x!==origin.x||
    raw.worldOrigin.z!==origin.z||
    !Array.isArray(raw.enemies)||raw.enemies.length>ENCOUNTER_RULES_136.maxEnemies||
    raw.enemies.some(e=>!key(e?.id)||e.isBoss===true||
      !supportedTier(e?.tier)||!supportedProfile(e?.aiProfile)||
      !pose(e.position)||!pose(e.home)||!stats(e.stats)||
      !number(e.hp,1,e.stats.maxHP))||
    new Set(raw.enemies.map(e=>e.id)).size!==raw.enemies.length||
    !pose(raw.player?.position)||!stats(raw.player?.stats)||
    !number(raw.player.hp,1,raw.player.stats.maxHP))
  throw Error('13.6 authoritative world snapshot missing or invalid');
 if(!mapReady(mapWorld,raw.player.position,origin)||
    raw.enemies.some(e=>!mapReady(mapWorld,e.position,origin)||
      !mapReady(mapWorld,e.home,origin)||
      horizontalDistance(e.position,raw.player.position)<1.1)||
    raw.enemies.some((e,i)=>raw.enemies.slice(i+1).some(other=>
      horizontalDistance(e.position,other.position)<1.1)))
  throw Error('13.6 invalid authoritative world spawn geometry');
 const player={
  position:copy(raw.player.position),hp:raw.player.hp,
  maxHp:raw.player.stats.maxHP,
  stats:Object.freeze({...raw.player.stats}),
  input:{x:0,z:0},inputSeq:0,inputAt:-Infinity,facing:0,
  stamina:100,lastStrikeAt:-Infinity,lastIntentSeq:0,
  recent:new Map(),
 };
 const enemies=new Map(raw.enemies.map(e=>[e.id,{
  id:e.id,position:copy(e.position),home:copy(e.home),
  stats:Object.freeze({...e.stats}),hp:e.hp,maxHp:e.stats.maxHP,
  tier:e.tier||'normal',aiProfile:e.aiProfile||'standard',
  isQuestSpawn:e.isQuestSpawn===true,alive:true,isBoss:false,
  combatStrikeSerial:0,engaged:false,
  pending:null,nextReadyAt:0,
 }]));
 let lastTick=now(),eventSeq=0;
 if(!number(lastTick,0,Number.MAX_SAFE_INTEGER))
  throw Error('13.6 invalid server clock');
 const events=[],queue=[];
 let recoveryWindowOpen=true; // One-time private recovery, before any connection or simulation.

 const emit=(kind,data={})=>{
  const entry=Object.freeze({seq:++eventSeq,serverTime:lastTick,
   instanceId,kind,...data,
   xpAuthorized:false,lootAuthorized:false,currencyAuthorized:false});
  events.push(entry);
  if(events.length>ENCOUNTER_RULES_136.maxEvents)events.shift();
  return entry;
 };
 const session=async context=>{
  try{
   const subject=await resolveAuthenticatedSubject(context);
   return authenticated(subject,ownerId);
  }catch{return false}
 };
 const setInput=async({serverRequestContext,input}={})=>{
  recoveryWindowOpen=false;
  if(!await session(serverRequestContext))
   return blocked('unverified_player_session');
  if(player.hp<=0)return blocked('player_defeated');
  if(!input||typeof input!=='object'||Array.isArray(input)||
     !Number.isSafeInteger(input.seq)||input.seq<1||
     !number(input.x,-1,1)||!number(input.z,-1,1)||
     !number(input.facing,-Math.PI*2,Math.PI*2))
   return blocked('invalid_player_input');
  if(input.seq<=player.inputSeq)return blocked('stale_player_input');
  if(input.seq-player.inputSeq>1024)return blocked('player_input_gap');
  const length=Math.hypot(input.x,input.z);
  player.input=length>1?{x:input.x/length,z:input.z/length}:
   {x:input.x,z:input.z};
  player.facing=input.facing;player.inputSeq=input.seq;
  player.inputAt=lastTick;
  return {ok:true,inputSeq:player.inputSeq,rewardsIssued:false};
 };
 const submit=async({serverRequestContext,intent}={})=>{
  recoveryWindowOpen=false;
  if(!await session(serverRequestContext))
   return blocked('unverified_player_session');
  if(player.hp<=0)return blocked('player_defeated');
  if(!boundedIntent(intent))return blocked('invalid_player_intent');
  if(queue.length>=ENCOUNTER_RULES_136.maxQueued)
   return blocked('encounter_queue_full');
  // Only a single basic strike is supported in 13.6. No client power,
  // damage, position, HP, hit flags, or submitted enemy health is used.
  if(intent.action!=='basic'||!key(intent.targetId)||
    !['damage','defense','ranged'].includes(intent.weaponPath))
   return blocked('unsupported_player_action');
  queue.push(Object.freeze({intentId:intent.intentId,
   intentSeq:intent.intentSeq,targetId:intent.targetId,
   weaponPath:intent.weaponPath}));
  return {ok:true,queued:true,rewardsIssued:false};
 };
 const attack=(intent)=>{
  const previous=player.recent.get(intent.intentId);
  if(previous)return previous.seq===intent.intentSeq&&
   previous.targetId===intent.targetId&&
   previous.weaponPath===intent.weaponPath?previous.result:
   blocked('intent_payload_conflict');
  const remember=result=>{
   player.recent.set(intent.intentId,{seq:intent.intentSeq,
    targetId:intent.targetId,weaponPath:intent.weaponPath,result});
   if(player.recent.size>32)
    player.recent.delete(player.recent.keys().next().value);
   return result;
  };
  if(intent.intentSeq!==player.lastIntentSeq+1)
   return blocked('out_of_order_intent');
  player.lastIntentSeq=intent.intentSeq;
  const enemy=enemies.get(intent.targetId);
  if(!enemy||!enemy.alive)return remember(blocked('target_unavailable'));
  if(lastTick-player.lastStrikeAt<ENCOUNTER_RULES_136.playerStrikeCooldownMs)
   return remember(blocked('player_strike_cooldown'));
  if(player.stamina<6)return remember(blocked('insufficient_stamina'));
  const range=intent.weaponPath==='ranged'?
   ENCOUNTER_RULES_136.rangedRange:intent.weaponPath==='damage'?
   ENCOUNTER_RULES_136.meleeRange:ENCOUNTER_RULES_136.defenseRange;
  const hit=assessGame3DServerWorldStrike123({
   attacker:player.position,defender:enemy.position,
   facingYaw:player.facing,weaponPath:intent.weaponPath,
   range,mapWorld,worldOrigin:origin,
  });
  if(!hit.ok)return remember(blocked(hit.reason));
  let proof;
  try{
   proof=validateResolvedStrike129(resolvePlayerStrike({
    attacker:player.stats,defender:enemy.stats,
    skillMultiplier:1,isSkill:false,
    targetHpPct:enemy.hp/enemy.maxHp,
   }));
  }catch{return remember(blocked('strike_resolution_failed'))}
  if(!proof.ok)return remember(blocked(proof.reason));
  player.stamina-=6;player.lastStrikeAt=lastTick;
  const damage=roundDamage(proof.strike.damage);
  enemy.hp=Math.max(0,enemy.hp-damage);
  const killed=enemy.hp===0;
  if(killed){enemy.alive=false;enemy.pending=null;}
  const evt=emit('player_strike',{targetId:enemy.id,tier:enemy.tier,damage,
   enemyHp:enemy.hp,critical:proof.strike.critical,killed,
   // A defeated enemy is ephemeral only, never an earned quest/reward.
   serverKillCommitted:false});
  return remember({ok:true,kind:'strike',eventSeq:evt.seq,
   damage,killed,enemyHp:enemy.hp,rewardsIssued:false});
 };
 const tick=()=>{
  recoveryWindowOpen=false;
  // Time is sourced only from the injected private server clock, never a
  // timestamp supplied with client movement or a public-facing method call.
  const timestamp=now();
  if(!number(timestamp,lastTick,Number.MAX_SAFE_INTEGER))return [];
  const dt=Math.min(ENCOUNTER_RULES_136.maxTickDeltaMs,timestamp-lastTick);
  lastTick=timestamp;
  const sec=dt/1000;
  if(player.hp>0){
   const active=timestamp-player.inputAt<=ENCOUNTER_RULES_136.inputHoldMs;
   const input=active?player.input:{x:0,z:0};
   const next={x:player.position.x+input.x*ENCOUNTER_RULES_136.moveSpeed*sec,
    z:player.position.z+input.z*ENCOUNTER_RULES_136.moveSpeed*sec};
   player.position=safeMove(mapWorld,player.position,next,origin);
   if(sec>0)player.stamina=Math.min(100,player.stamina+sec*18);
  }
  // Resolve queued player intents first: an enemy defeated on this tick
  // cannot begin or finish a telegraph after its authoritative HP hit zero.
  const replies=[];
  while(queue.length)replies.push(attack(queue.shift()));
  // Move and strike each server-owned NPC exactly once per clock step.
  for(const enemy of enemies.values()){
   if(!enemy.alive||player.hp<=0)continue;
   const profile=combatEnemyProfile(enemy);
   const homeDist=horizontalDistance(enemy.position,enemy.home);
   const distance=horizontalDistance(enemy.position,player.position);
   if(homeDist>=profile.leashRange||
       (enemy.engaged&&distance>profile.disengageRange)){
    enemy.engaged=false;enemy.pending=null;
   }
   if(!enemy.engaged&&distance<=profile.aggroRange&&
     homeDist<profile.leashRange)enemy.engaged=true;
   if(!enemy.engaged){
    const back=enemyPursuitVector(enemy.position,enemy.home);
    enemy.position=safeMove(mapWorld,enemy.position,{
     x:enemy.position.x+back.x*profile.speed*sec,
     z:enemy.position.z+back.z*profile.speed*sec,
    },origin);
    continue;
   }
   if(enemy.pending){
    const pending=enemy.pending;
    if(timestamp>=pending.impactAt){
     enemy.pending=null;enemy.nextReadyAt=timestamp+pending.cooldownMs;
     const inArc=isWithinEnemyStrike({
      origin:enemy.position,target:player.position,
      facingYaw:pending.facingYaw,
      range:pending.range,arcDegrees:pending.arcDegrees,
     });
     if(!inArc||!visible(mapWorld,enemy.position,player.position,origin)){
      emit('enemy_miss',{enemyId:enemy.id,variant:pending.variant});
      continue;
     }
     let result;
     try{
      result=validateResolvedStrike129(resolveEnemyStrike({
       attacker:enemy.stats,defender:player.stats,
       skillMultiplier:1,isSkill:false,
       targetHpPct:player.hp/player.maxHp,
      }));
     }catch{result={ok:false,reason:'strike_resolution_failed'}}
     if(!result.ok){
      emit('enemy_strike_refused',{enemyId:enemy.id});
      continue;
     }
     const damage=roundDamage(result.strike.damage);
     player.hp=Math.max(0,player.hp-damage);
     emit('enemy_strike',{enemyId:enemy.id,damage,
      playerHp:player.hp,variant:pending.variant,
      serverKillCommitted:false});
    }
    continue;
   }
   if(timestamp<enemy.nextReadyAt)continue;
   if(distance<=profile.range&&
      visible(mapWorld,enemy.position,player.position,origin)){
    const plan=planEnemyStrike({
     group:{position:enemy.position},combatStrikeSerial:enemy.combatStrikeSerial,
    },player.position,profile);
    enemy.combatStrikeSerial++;
    enemy.pending={impactAt:timestamp+Math.ceil(plan.windup*1000),
     facingYaw:plan.facingYaw,range:plan.range,arcDegrees:plan.arcDegrees,
     variant:plan.variant,cooldownMs:Math.ceil(plan.cooldown*1000)};
    emit('enemy_telegraph',{enemyId:enemy.id,variant:plan.variant,
     impactAt:enemy.pending.impactAt,
     facingYaw:plan.facingYaw,arcDegrees:plan.arcDegrees});
   }else{
    const step=enemyPursuitVector(enemy.position,player.position);
    enemy.position=safeMove(mapWorld,enemy.position,{
     x:enemy.position.x+step.x*profile.speed*sec,
     z:enemy.position.z+step.z*profile.speed*sec,
    },origin);
   }
  }
  return replies;
 };
 // Only the private 13.7 owner/session adapter calls this during reconnect
 // or lease loss. Keep HP and committed intent receipts; discard all stale
 // movement, queued attacks and NPC windups from the abandoned connection.
 const resetConnection=()=>{
  recoveryWindowOpen=false;
  player.input={x:0,z:0};
  player.inputSeq=0;player.inputAt=-Infinity;
  queue.length=0;
  for(const enemy of enemies.values()){
   enemy.pending=null;
   enemy.nextReadyAt=Math.max(enemy.nextReadyAt,lastTick+750);
  }
  return {lastIntentSeq:player.lastIntentSeq,inputSeq:0,
   serverTime:lastTick,rewardsIssued:false};
 };
 const snapshot=()=>({
  instanceId,player:{x:player.position.x,z:player.position.z,
   hp:player.hp,maxHp:player.maxHp,stamina:player.stamina,
   facing:player.facing,lastIntentSeq:player.lastIntentSeq},
  enemies:[...enemies.values()].map(e=>({
   id:e.id,x:e.position.x,z:e.position.z,hp:e.hp,maxHp:e.maxHp,
   tier:e.tier,
   alive:e.alive,pendingImpactAt:e.pending?.impactAt??null,
  })),
  eventSeq,serverTime:lastTick,privateBetaOnly:true,
  rewardsIssued:false,productionReady:false,
 });
 // 13.9: private, one-time recovery of authoritative simulation state.
 // A trusted server wrapper MUST load a DB-hash-checked, lease-fenced record;
 // callers/browsers must never supply this method or its argument.
 // Re-attest actor IDs, map, stats and geometry against the new worker's
 // trusted world snapshot. Pending attacks/held inputs are NOT persisted.
 const exportCheckpoint139=()=>({
  schemaVersion:1,instanceId,ownerId,characterId,
  mapId:mapWorld.id,mapFingerprint:mapWorld.fingerprint,
  worldOrigin:copy(origin),eventSeq,
  player:{
   position:copy(player.position),hp:player.hp,
   stamina:player.stamina,facing:player.facing,
   lastIntentSeq:player.lastIntentSeq,
   recent:[...player.recent].map(([intentId,item])=>({
    intentId,seq:item.seq,targetId:item.targetId,
    weaponPath:item.weaponPath,result:{...item.result}
   }))
  },
  enemies:[...enemies.values()].map(e=>({
   id:e.id,position:copy(e.position),hp:e.hp,
   alive:e.alive,engaged:e.engaged,
   combatStrikeSerial:e.combatStrikeSerial
  })),
  xpAuthorized:false,lootAuthorized:false,
  currencyAuthorized:false,productionReady:false
 });
 const restoreCheckpoint139=(record)=>{
  if(!recoveryWindowOpen)throw Error('13.9 recovery window closed');
  // Close the window even when validation fails; failed restoration cannot
  // be retried with a different, caller-selected checkpoint.
  recoveryWindowOpen=false;
  const ids=[...enemies.keys()];
  const snapshotNow=now();
  if(!record||record.schemaVersion!==1||
     record.instanceId!==instanceId||record.ownerId!==ownerId||
     record.characterId!==characterId||
     record.mapId!==mapWorld.id||
     record.mapFingerprint!==mapWorld.fingerprint||
     !pose(record.worldOrigin)||
     record.worldOrigin.x!==origin.x||
     record.worldOrigin.z!==origin.z||
     record.xpAuthorized!==false||record.lootAuthorized!==false||
     record.currencyAuthorized!==false||record.productionReady!==false||
     !Number.isSafeInteger(record.eventSeq)||record.eventSeq<0||
     !Number.isSafeInteger(snapshotNow)||snapshotNow<lastTick||
     !record.player||!pose(record.player.position)||
     !mapReady(mapWorld,record.player.position,origin)||
     !number(record.player.hp,0,player.maxHp)||
     !number(record.player.stamina,0,100)||
     !number(record.player.facing,-Math.PI*2,Math.PI*2)||
     !Number.isSafeInteger(record.player.lastIntentSeq)||
     record.player.lastIntentSeq<0||
     !Array.isArray(record.player.recent)||
     record.player.recent.length>32||
     !Array.isArray(record.enemies)||
     record.enemies.length!==ids.length||
     new Set(record.enemies.map(e=>e?.id)).size!==ids.length)
   throw Error('13.9 rejected untrusted or corrupt encounter checkpoint');
  const safeRecent=new Map();
  for(const entry of record.player.recent){
   if(!boundedIntent({intentId:entry?.intentId,intentSeq:entry?.seq})||
      entry.seq>record.player.lastIntentSeq||
      !key(entry.targetId)||
      !['damage','defense','ranged'].includes(entry.weaponPath)||
      !entry.result||typeof entry.result!=='object'||
      typeof entry.result.ok!=='boolean'||
      entry.result.rewardsIssued!==false||
      safeRecent.has(entry.intentId))
    throw Error('13.9 invalid combat replay receipts');
   safeRecent.set(entry.intentId,{
    seq:entry.seq,targetId:entry.targetId,
    weaponPath:entry.weaponPath,result:{...entry.result}
   });
  }
  for(const row of record.enemies){
   const original=enemies.get(row.id);
   if(!original||!pose(row.position)||
      !mapReady(mapWorld,row.position,origin)||
      !number(row.hp,0,original.maxHp)||
      typeof row.alive!=='boolean'||
      row.alive!==(row.hp>0)||
      typeof row.engaged!=='boolean'||
      !Number.isSafeInteger(row.combatStrikeSerial)||
      row.combatStrikeSerial<0)
    throw Error('13.9 invalid world actor checkpoint');
  }
  // Apply only after the whole record passes checks.
  lastTick=snapshotNow;eventSeq=record.eventSeq;
  player.position=copy(record.player.position);
  player.hp=record.player.hp;player.stamina=record.player.stamina;
  player.facing=record.player.facing;
  player.lastIntentSeq=record.player.lastIntentSeq;
  player.recent=safeRecent;
  // Reset combat cooldowns conservatively so a restart cannot instantly
  // bypass a strike delay or resume an unseen enemy windup.
  player.lastStrikeAt=lastTick;
  player.input={x:0,z:0};player.inputAt=-Infinity;player.inputSeq=0;
  queue.length=0;events.length=0;
  for(const row of record.enemies){
   const enemy=enemies.get(row.id);
   enemy.position=copy(row.position);enemy.hp=row.hp;
   enemy.alive=row.alive;enemy.engaged=row.engaged;
   enemy.combatStrikeSerial=row.combatStrikeSerial;
   enemy.pending=null;enemy.nextReadyAt=lastTick+750;
  }
  return {ok:true,eventSeq,lastIntentSeq:player.lastIntentSeq,
   rewardsIssued:false,productionReady:false};
 };
 return Object.freeze({version:'13.6',instanceId,
  mapId:mapWorld.id,mapFingerprint:mapWorld.fingerprint,
  worldOrigin:origin,
  tick,setInput,submit,snapshot,resetConnection,
  exportCheckpoint139,restoreCheckpoint139,
  getEventsAfter:(sequence=0)=>events.filter(e=>e.seq>sequence).slice(),
  privateServerOnly:true,
  xpAwardsEnabled:false,itemRewardsEnabled:false,
  economyEnabled:false,productionReady:false});
}
