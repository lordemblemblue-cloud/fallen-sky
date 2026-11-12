// Game 3D 3.1: an isolated single-writer, server-simulated duel.
// ALL state mutations occur synchronously in tick(). Never await datastore
// writes inside combat resolution; there is no second match writer here.
import { randomUUID } from 'node:crypto';
import { advanceDuelBody, separateDuelBodies } from './arenaCollision.mjs';
import { duelSkillProfile, validateDuelCastHit } from '../../base44/shared/duelComboPolicy.mjs';
import {
  validateServerChargeBegin, verifyServerChargeRelease, verifyServerFinisherChain,
  verifiedPvpChargedModifiers,
} from '../../base44/shared/duelChargePolicy.mjs';
import { createDuelShield, activeDuelShield, absorbDuelShieldDamage } from '../../base44/shared/duelShieldPolicy.mjs';
import { assessGame3DServerWorldStrike123 } from './serverWorldStrike123.mjs';
import { validateResolvedStrike129 } from './combatResolverGuard129.mjs';

export const MATCH_RULES=Object.freeze({
  tickMs:50, snapshotMs:100, maxPlayers:2, maxQueue:48,
  speed:6.5, dashSpeed:12, dashMs:260, dodgeInvulMs:260,
  basicIntervalMs:450, basicStamina:6, dodgeStamina:22,
  shieldWill:9, staminaRegenPerSec:18, willRegenPerSec:5,
  guardDrainPerSec:12, guardReduction:0.35,
  range: Object.freeze({damage:3,defense:3,ranged:7}),
  arenaRadius:100, eventHistory:100, idleMs:180000,
  admissionMs:60000, inputHoldMs:350,
});
const bounded=(n,min,max)=>Math.min(max,Math.max(min,n));
const num=n=>typeof n==='number'&&Number.isFinite(n);
// Bound untrusted/invalid resolver results before mutating persistent HP.
const combatAmount=n=>num(n)?bounded(n,0,100000):0;
const xy=(x,z)=>Math.hypot(x,z);
const safeInput=(x,z)=>{
  if (!num(x)||!num(z)||Math.abs(x)>1||Math.abs(z)>1) return null;
  const size=xy(x,z);
  return size>1?{x:x/size,z:z/size}:{x,z};
};
const actorFrom=(id,snapshot,stats)=>{
  // Invalid or infinite character stats cannot start with exaggerated HP.
  const candidateHp=Number(stats?.maxHP);
  const maxHp=bounded(Number.isFinite(candidateHp)&&candidateHp>0?candidateHp:100,1,100000);
  return {
    id,position:{x:bounded(Number.isFinite(Number(snapshot?.x))?Number(snapshot.x):0,-100,100),
      z:bounded(Number.isFinite(Number(snapshot?.z))?Number(snapshot.z):0,-100,100)},
    facing:0,input:{x:0,z:0},inputSeq:0,inputTime:0, hp:maxHp,maxHp,
    stats,stamina:100,will:100, guard:false,
    dashUntil:0,dashDir:{x:0,z:0},invulUntil:0,
    shield:null,shieldReadyAt:0, lastBasicAt:-Infinity,
    resourceSpentAt:0,cooldowns:new Map(),casts:new Map(),charges:new Map(),
    lastIntentSeq:0,recent:new Map(),connected:false,
  };
};
export function createGame3DDuelMatch({id,challengerId,opponentId,challengerStats,opponentStats,
  challengerSpawn={x:0,z:0},opponentSpawn={x:2.5,z:0},
  checkpoint=null,mapWorld=null,resolveStrike,now=Date.now}={}) {
  if (!id||!challengerId||!opponentId||challengerId===opponentId||
      typeof resolveStrike!=='function') throw new Error('Invalid duel match configuration');
  const actors=new Map([
    [challengerId,actorFrom(challengerId,challengerSpawn,challengerStats)],
    [opponentId,actorFrom(opponentId,opponentSpawn,opponentStats)],
  ]);
  const queue=[],events=[];
  let sequence=0,status='waiting',winnerId=null,finishReason=null,
    lastTick=now(),lastActionAt=lastTick;
  const startedAt=lastTick;
  // Signed checkpoint origin is immutable for the entire duel. No browser
  // chooses an anchor through input packets or during reconnect.
  const anchor=checkpoint?.worldOrigin;
  const worldOrigin=anchor && num(anchor.x) && num(anchor.z) &&
    Math.abs(anchor.x)<=100000 && Math.abs(anchor.z)<=100000
    ? Object.freeze({x:anchor.x,z:anchor.z}) : null;
  const mapId=mapWorld?.id||null;
  const mapFingerprint=checkpoint?.mapFingerprint||null;
  const instanceId=checkpoint?.instanceId||null;
  const spawnPresetId=checkpoint?.spawnPresetId||null;
  if(mapId && (!worldOrigin || checkpoint?.mapId!==mapId))
    throw Error('Dedicated map binding missing or mismatched');
  if(mapFingerprint&&(!mapWorld || mapFingerprint!==mapWorld.fingerprint))
    throw Error('Dedicated map collision fingerprint mismatch');
  // Only the signed backend ticket can provide a checkpoint. Reset unsafe
  // transient inputs/dash state rather than replaying a browser command.
  const restore=checkpoint?.state;
  if(['active','waiting'].includes(restore?.status)&&Array.isArray(restore.actors)&&
      restore.actors.length===2 &&
      new Set(restore.actors.map(p=>p?.id)).size===2 &&
      restore.actors.every(p=>p&&actors.has(p.id))) {
    sequence=Number.isSafeInteger(restore.sequence)&&restore.sequence>=0
      ?restore.sequence:0;
    status=restore.status;
    lastActionAt=lastTick;
    for(const saved of restore.actors){
      const p=actors.get(saved.id);
      const n=(v,min,max,fallback)=>num(v)?bounded(v,min,max):fallback;
      p.position.x=n(saved.x,-MATCH_RULES.arenaRadius,MATCH_RULES.arenaRadius,p.position.x);
      p.position.z=n(saved.z,-MATCH_RULES.arenaRadius,MATCH_RULES.arenaRadius,p.position.z);
      p.hp=n(saved.hp,0,p.maxHp,p.hp);
      p.stamina=n(saved.stamina,0,100,100);
      p.will=n(saved.will,0,100,100);
      p.facing=n(saved.facing,-Math.PI*2,Math.PI*2,0);
      p.shield=saved.shield&&num(saved.shield.current)&&num(saved.shield.expiresAt)
        ?{current:Math.max(0,saved.shield.current),expiresAt:saved.shield.expiresAt}:null;
      p.shieldReadyAt=n(saved.shieldReadyAt,0,Number.MAX_SAFE_INTEGER,0);
      p.lastBasicAt=n(saved.lastBasicAt,0,Number.MAX_SAFE_INTEGER,-Infinity);
      p.lastIntentSeq=n(saved.lastIntentSeq,0,Number.MAX_SAFE_INTEGER,0);
      // A signed checkpoint may still be stale or corrupted; never replay
      // malformed cooldown maps or non-server skill IDs.
      const restored=Array.isArray(saved.cooldowns)?saved.cooldowns.slice(0,30):[];
      p.cooldowns=new Map(restored.filter(pair=>
        Array.isArray(pair)&&pair.length===2&&
        typeof pair[0]==='string'&&!!duelSkillProfile(pair[0])&&
        num(pair[1])&&pair[1]>=0&&pair[1]<=Number.MAX_SAFE_INTEGER));
      // In-flight casts and charge holds are discarded on crash recovery;
      // only server-owned finished HP/defense state is resumed.
      p.casts.clear();p.charges.clear();p.guard=false;
      p.dashUntil=0;p.invulUntil=0;p.inputSeq=0;
    }
  }
  // Check both handed-off positions before activating map-aware authority.
  // Client-origin legacy positions are not yet fully attested; invalid
  // spawn footprints are rejected instead of silently moving through walls.
  if(mapWorld && ([...actors.values()].some(p=>
      !mapWorld.valid(p.position,worldOrigin)) ||
      xy(actors.get(challengerId).position.x-actors.get(opponentId).position.x,
         actors.get(challengerId).position.z-actors.get(opponentId).position.z)<1.1))
    throw Error('Dedicated map checkpoint contains an unsafe spawn');
  const get=uid=>actors.get(uid);
  const other=uid=>get(uid===challengerId?opponentId:challengerId);
  const snapshot=()=>({
    t:'snapshot',protocol:1,matchId:id,seq:sequence,worldOrigin,mapId,
    ...(instanceId?{instanceId}:{}),
    ...(mapFingerprint?{mapFingerprint}:{}),
    ...(spawnPresetId?{spawnPresetId}:{}),
    status,winnerId,
    finishReason,
    serverTime:lastTick,players:[...actors.values()].map(p=>({
      id:p.id,x:p.position.x,z:p.position.z,
      ...(mapWorld?{y:mapWorld.height(p.position,worldOrigin)}:{}),
      facing:p.facing,
      hp:p.hp,maxHp:p.maxHp,stamina:p.stamina,will:p.will,guard:p.guard,
      lastIntentSeq:p.lastIntentSeq,
      shield:activeDuelShield(p.shield,lastTick),connected:p.connected,
    })),
  });
  const emit=(actor,type,detail={})=>{
    const result={t:'combat',eventId:randomUUID(),seq:++sequence,matchId:id,
      serverTime:lastTick,actorId:actor.id,kind:type,...detail};
    events.push(result);
    if(events.length>MATCH_RULES.eventHistory)events.shift();
    return result;
  };
  const setConnected=(uid,connected)=>{
    const p=get(uid);if(!p)return false;
    p.connected=!!connected;p.input={x:0,z:0};p.inputTime=0;p.guard=false;
    // Movement sequence is connection-scoped; a freshly authenticated
    // replacement socket starts input packets at 1 again. Keep durable
    // *intent* sequence (lastIntentSeq) untouched across reconnects.
    p.inputSeq=0;
    if(!connected){
      // Recovery has to start without old cast/charge, dash or dodge immunity
      // from an abandoned socket. Keep committed HP and cooldowns intact.
      p.charges.clear();p.casts.clear();
      p.dashUntil=0;p.invulUntil=0;
      p.dashDir={x:0,z:0};
      // Commands sent immediately before leaving cannot execute after
      // reconnecting with a newly authenticated socket.
      for(let i=queue.length-1;i>=0;i--)if(queue[i].uid===uid)queue.splice(i,1);
    }
    if(status==='waiting'&&[...actors.values()].every(a=>a.connected)){
      status='active'; lastActionAt=lastTick;
      emit(p,'match_start');
    }
    return true;
  };
  const setInput=(uid,packet)=>{
    const p=get(uid);if(!p||status!=='active'||!p.connected)return {ok:false,reason:'not_active'};
    // 13.0–13.2: only connection-scoped, bounded sequence movement. Bad
    // packets must be rejected before reading their fields or changing pose.
    if(!packet||typeof packet!=='object'||Array.isArray(packet))
      return {ok:false,reason:'invalid_input'};
    if(!Number.isSafeInteger(packet.seq)||packet.seq<1)
      return {ok:false,reason:'invalid_input_sequence'};
    if(packet.seq<=p.inputSeq)
      return {ok:false,reason:'stale_input'};
    if(packet.seq-p.inputSeq>1024)
      return {ok:false,reason:'input_sequence_gap'};
    const dir=safeInput(packet.x,packet.z);
    if(!dir)return {ok:false,reason:'invalid_input'};
    if(!num(packet.facing)||Math.abs(packet.facing)>Math.PI*2)
      return {ok:false,reason:'invalid_facing'};
    p.inputSeq=packet.seq;p.input=dir;p.facing=packet.facing;p.inputTime=lastTick;
    return {ok:true};
  };
  const submit=(uid,command)=>{
    if(!get(uid)||!get(uid).connected||status!=='active')
      return {ok:false,reason:'not_active'};
    if(!command||typeof command!=='object'||Array.isArray(command))
      return {ok:false,reason:'invalid_command'};
    if(queue.length>=MATCH_RULES.maxQueue)return {ok:false,reason:'queue_full'};
    // Bound per-actor pending commands: one peer cannot monopolize ticks.
    const actorPending=queue.reduce((count,item)=>count+(item.uid===uid?1:0),0);
    if(actorPending>=Math.floor(MATCH_RULES.maxQueue/MATCH_RULES.maxPlayers))
      return {ok:false,reason:'actor_queue_full'};
    if(typeof command.intentId!=='string'||!/^[a-zA-Z0-9_-]{8,72}$/.test(command.intentId)||
       !Number.isSafeInteger(command.intentSeq)||command.intentSeq<1)
      return {ok:false,reason:'invalid_intent'};
    queue.push({uid,command});
    return {ok:true,queued:true};
  };
  const resolve=(p,command)=>{
    const target=other(p.id);
    const key=command.intentId,seq=command.intentSeq;
    const previous=p.recent.get(key);
    if(previous)return previous.seq===seq?previous.result:
      {ok:false,reason:'intent_id_reused',intentId:key,intentSeq:seq};
    // Rejected actions still consume their ordered intent sequence. Cache
    // the result too, so a network retry of a refused attack is deterministic.
    const reject=(reason)=>{
      const result={ok:false,reason,intentId:key,intentSeq:seq};
      if(seq===p.lastIntentSeq){
        p.recent.set(key,{seq,result});
        if(p.recent.size>24)p.recent.delete(p.recent.keys().next().value);
      }
      return result;
    };
    if(seq!==p.lastIntentSeq+1) return reject('out_of_order_intent');
    p.lastIntentSeq=seq;
    const action=command.action;
    if(!['basic','dodge','guard','shield','charge_begin','cast','skill_hit','forfeit'].includes(action))
      return reject('unsupported_action');
    if(!p.connected||status!=='active'||p.hp<=0||
        (action!=='forfeit'&&!target.connected))
      return reject('not_ready');
    const time=lastTick;
    let result;
    if(action==='forfeit'){
      status='finished';winnerId=target.id;finishReason='forfeit';
      result={ok:true,kind:'forfeit',winnerId};
    }else if(action==='guard'){
      if(command.held===true&&p.stamina<=0)result=reject('no_stamina');
      else {p.guard=command.held===true;result={ok:true,guard:p.guard};}
    }else if(action==='dodge'){
      const dir=safeInput(command.x,command.z);
      if(!dir||xy(dir.x,dir.z)<0.1)result=reject('invalid_dodge');
      else if(p.stamina<MATCH_RULES.dodgeStamina)result=reject('no_stamina');
      else{
        p.stamina-=MATCH_RULES.dodgeStamina;
        p.resourceSpentAt=time;p.dashUntil=time+MATCH_RULES.dashMs;
        p.invulUntil=time+MATCH_RULES.dodgeInvulMs;p.dashDir=dir;p.guard=false;
        result={ok:true,kind:'dodge'};
      }
    }else if(action==='shield'){
      if(time<p.shieldReadyAt)result=reject('shield_cooldown');
      else if(p.will<MATCH_RULES.shieldWill)result=reject('no_will');
      else{
        p.will-=MATCH_RULES.shieldWill;p.resourceSpentAt=time;
        p.shield=createDuelShield(p.maxHp,time);p.shieldReadyAt=time+60000;
        result={ok:true,kind:'shield',durability:p.shield.current};
      }
    }else if(action==='charge_begin'){
      const test=validateServerChargeBegin({skillId:command.skillId,
        weaponPath:command.weaponPath,chargeId:command.chargeId,now:time});
      if(!test.ok)result=reject(test.reason);
      else if(p.charges.has(command.chargeId))result=reject('duplicate_charge_id');
      else if(p.charges.size>=2)result=reject('charge_busy');
      else{
        p.charges.set(command.chargeId,test.hold);
        result={ok:true,kind:'charge_started'};
      }
    }else if(action==='cast'){
      const profile=duelSkillProfile(command.skillId);
      if(!profile||profile.weaponPath!==command.weaponPath)result=reject('unsupported_skill');
      else if(typeof command.castId!=='string'||!/^axe[a-zA-Z0-9_-]{5,68}$/.test(command.castId))
        result=reject('invalid_cast_id');
      else if(time<(p.cooldowns.get(command.skillId)||0))result=reject('skill_cooldown');
      else if(p.casts.has(command.castId))result=reject('duplicate_cast');
      else if(p.casts.size>=3)result=reject('too_many_casts');
      else{
        const willCost=7+Math.max(0,profile.offsets.length-1)*2;
        if(p.will<willCost||p.stamina<5)result=reject('no_resources');
        else{
          p.will-=willCost;p.stamina-=5;p.resourceSpentAt=time;
          const released=verifyServerChargeRelease(p.charges.get(command.chargeId),{
            skillId:command.skillId,weaponPath:command.weaponPath,now:time});
          if(command.chargeId)p.charges.delete(command.chargeId);
          const cast={castId:command.castId,skillId:command.skillId,
            createdAt:time,nextIndex:0,expiresAt:time+4500,
            serverTimedCharge:released.valid===true,masteryVerified:false,
            chainConsumed:false,serverTimedChain:false,sourceMasteryVerified:false};
          if(command.chainFromCastId){
            const source=p.casts.get(command.chainFromCastId);
            const sourceProfile=source&&duelSkillProfile(source.skillId);
            const linked=verifyServerFinisherChain({
              source,sourceProfile,nextProfile:profile,now:time,
            });
            if(linked.ok){source.chainConsumed=true;cast.serverTimedChain=true;}
          }
          p.casts.set(command.castId,cast);
          p.cooldowns.set(command.skillId,time+profile.cooldownMs);
          result={ok:true,kind:'cast',castId:cast.castId,
            serverTimedCharge:cast.serverTimedCharge,
            serverTimedChain:cast.serverTimedChain};
        }
      }
    }else{
      const basic=action==='basic';
      const path=basic?command.weaponPath:null;
      const cast=basic?null:p.casts.get(command.castId);
      const profile=cast&&duelSkillProfile(cast.skillId);
      let multiplier=1,modifiers={powerMultiplier:1,armorPiercePct:0},hitIndex=0;
      if(basic){
        if(!Object.prototype.hasOwnProperty.call(MATCH_RULES.range,path))
          return reject('invalid_weapon');
        if(time-p.lastBasicAt<MATCH_RULES.basicIntervalMs)return reject('basic_cooldown');
        if(p.stamina<MATCH_RULES.basicStamina)return reject('no_stamina');
      }else{
        if(!profile||profile.weaponPath!==command.weaponPath)
          return reject('cast_required');
        const check=validateDuelCastHit(cast,profile,command.hitIndex,time);
        if(!check.ok)return reject(check.reason);
        hitIndex=command.hitIndex;
        multiplier=profile.multiplier;
        modifiers=verifiedPvpChargedModifiers(cast,profile,hitIndex);
        multiplier*=modifiers.powerMultiplier;
      }
      const range=MATCH_RULES.range[command.weaponPath]||0;
      if(!range)return reject('invalid_weapon');
      // Worker-controlled positions + versioned server map height and LOS.
      // Rejected geometry must not spend stamina or advance the hit index.
      const geometry=assessGame3DServerWorldStrike123({
        attacker:p.position,defender:target.position,
        facingYaw:p.facing,weaponPath:command.weaponPath,range,
        mapWorld,worldOrigin,
      });
      if(!geometry.ok)return reject(geometry.reason);
      // Purely resolve first. A failed damage resolver must not partially
      // consume stamina/cast hit indices or crash the entire authoritative tick.
      let resolved;
      try{resolved=resolveStrike({
        attacker:p.stats,defender:{...target.stats,
          defense:Math.max(0,(target.stats.defense||0)*(1-modifiers.armorPiercePct))},
        skillMultiplier:Math.min(3,multiplier),isSkill:!basic,
        targetHpPct:target.hp/Math.max(1,target.maxHp),
        criticalAllowed:profile?.criticalAllowed!==false,
      });}catch{return reject('strike_resolution_failed')}
      const checked=validateResolvedStrike129(resolved);
      if(!checked.ok)return reject(checked.reason);
      resolved=checked.strike;
      if(basic){
        p.stamina-=MATCH_RULES.basicStamina;p.resourceSpentAt=time;p.lastBasicAt=time;
      }else{
        cast.nextIndex++;
        if(cast.nextIndex>=profile.offsets.length){
          if(cast.serverTimedCharge&&profile.offsets.length===3)
            cast.expiresAt=time+250;
          else p.casts.delete(cast.castId);
        }
      }
      const invul=time<target.invulUntil;
      const raw=invul?0:combatAmount(resolved.damage);
      const guarded=target.guard?Math.round(raw*(1-MATCH_RULES.guardReduction)):raw;
      const absorbed=absorbDuelShieldDamage({
        shield:target.shield,damage:guarded,now:time,
        chainPierce:modifiers.armorPiercePct>0,
      });
      if(target.shield)target.shield.current=absorbed.remaining;
      target.hp=Math.max(0,target.hp-absorbed.hpDamage);
      const reflect=invul?0:combatAmount(resolved.reflected);
      p.hp=Math.max(0,Math.min(p.maxHp,p.hp-reflect+
        (invul?0:combatAmount(resolved.lifeSteal))));
      result={ok:true,kind:'strike',targetId:target.id,hitIndex,
        critical:!invul&&!!resolved.critical,blocked:!!resolved.blocked||target.guard,
        dodged:invul,rawDamage:raw,hpDamage:absorbed.hpDamage,
        shieldAbsorbed:absorbed.absorbed,shieldPierced:absorbed.shieldPierced,
        attackerHp:p.hp,defenderHp:target.hp};
      if(target.hp===0||p.hp===0){
        status='finished';
        // Simultaneous lethal reflect damage is a draw, never attacker win.
        const doubleKO=target.hp===0&&p.hp===0;
        winnerId=doubleKO?null:target.hp===0?p.id:target.id;
        // Report/archive/ledger protocols currently accept 'knockout'
        // with null winner as a draw, but not 'double_knockout'.
        // Preserve compatibility until all settlement validators migrate.
        finishReason='knockout';
      }
    }
    if(!result)result=reject('invalid_command');
    if(result.ok){
      lastActionAt=time;
      const evt=emit(p,result.kind||action,{
        targetId:result.targetId||null,intentId:key,intentSeq:seq,
        hpDamage:result.hpDamage||0,shieldAbsorbed:result.shieldAbsorbed||0,
        blocked:!!result.blocked,critical:!!result.critical,
        winnerId,
      });
      result={...result,eventId:evt.eventId,seq:evt.seq};
    }
    p.recent.set(key,{seq,result});
    if(p.recent.size>24)p.recent.delete(p.recent.keys().next().value);
    return result;
  };
  const tick=(time=now())=>{
    if(!num(time)||time<lastTick) return [];
    const dt=bounded(time-lastTick,0,100);lastTick=time;
    if(status==='waiting'&&time-startedAt>MATCH_RULES.admissionMs){
      status='finished';winnerId=null;finishReason='timeout';
      emit(get(challengerId),'timeout');
    }
    if(status==='active'){
      const bothConnected=[...actors.values()].every(p=>p.connected);
      const prior=mapWorld?new Map([...actors].map(([id,p])=>[
        id,{...p.position},
      ])):null;
      for(const p of actors.values()){
        const sec=dt/1000;
        if(p.connected&&bothConnected&&p.hp>0){
          // A silent/background tab must not leave movement held forever.
          const freshInput=p.inputTime>0 && time-p.inputTime<=MATCH_RULES.inputHoldMs;
          const v=time<p.dashUntil?p.dashDir:(freshInput?p.input:{x:0,z:0});
          const speed=time<p.dashUntil?MATCH_RULES.dashSpeed:
            p.guard?MATCH_RULES.speed*0.5:MATCH_RULES.speed;
          const next=advanceDuelBody(p.position,v.x*speed*sec,
            v.z*speed*sec,MATCH_RULES.arenaRadius);
          p.position=mapWorld?mapWorld.move(p.position,next,worldOrigin):next;
          if(p.guard){p.stamina=Math.max(0,p.stamina-MATCH_RULES.guardDrainPerSec*sec);
            if(p.stamina===0)p.guard=false;}
          else if(time-p.resourceSpentAt>850)
            p.stamina=bounded(p.stamina+MATCH_RULES.staminaRegenPerSec*sec,0,100);
          if(time-p.resourceSpentAt>850)
            p.will=bounded(p.will+MATCH_RULES.willRegenPerSec*sec,0,100);
        }
        for(const [chargeId,hold] of p.charges)if(hold.expiresAt<=time)p.charges.delete(chargeId);
        for(const [castId,cast] of p.casts)if(cast.expiresAt<=time)p.casts.delete(castId);
      }
      // Pair separation runs on the single authority after BOTH actor steps,
      // preventing same-position melee exploits and walk-through overlap.
      const [first,second]=[...actors.values()];
      const [a,b]=separateDuelBodies(first.position,second.position,
        MATCH_RULES.arenaRadius);
      first.position=a;second.position=b;
      // Body separation must never push a player inside a map blocker.
      // Restore the previous valid pair instead of allowing a server wall clip.
      if(mapWorld&&(!mapWorld.valid(first.position,worldOrigin)||
          !mapWorld.valid(second.position,worldOrigin))){
        first.position=prior.get(first.id);
        second.position=prior.get(second.id);
      }
      if(time-lastActionAt>MATCH_RULES.idleMs){
        status='finished';winnerId=null;finishReason='timeout';
        emit(get(challengerId),'timeout');
      }
    }
    const result=[];
    while(queue.length){
      const item=queue.shift();
      const outcome=resolve(get(item.uid),item.command);
      result.push({uid:item.uid,intentId:item.command.intentId,...outcome});
    }
    return result;
  };
  const getEventsAfter=(seq=0)=>events.filter(e=>e.seq>seq).slice(-MATCH_RULES.eventHistory);
  const checkpointState=()=>({
    status,sequence,winnerId,actors:[...actors.values()].map(p=>({
      id:p.id,x:p.position.x,z:p.position.z,hp:p.hp,
      stamina:p.stamina,will:p.will,facing:p.facing,
      shield:p.shield,shieldReadyAt:p.shieldReadyAt,
      lastBasicAt:Number.isFinite(p.lastBasicAt)?p.lastBasicAt:0,
      lastIntentSeq:p.lastIntentSeq,cooldowns:[...p.cooldowns].slice(0,30),
    })),
  });
  return {id,actors,other,get,status:()=>status,tick,submit,setInput,setConnected,
    snapshot,checkpointState,getEventsAfter,worldOrigin,mapId,
    instanceId,mapFingerprint,spawnPresetId,queueSize:()=>queue.length};
}
