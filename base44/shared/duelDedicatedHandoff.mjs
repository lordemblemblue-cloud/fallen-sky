// Combat Foundation 3.2 — fail-closed duel authority handoff policy.
// 'preparing' pauses the legacy writer; 'dedicated' is exclusively reported
// by the signed match worker, never by browser-submitted HP/damage.
import {duelWorldSpawnPreset} from './duelWorldSpawnPreset.mjs';
// JSON-only signed reports must remain replayable even when database reads
// reorder object keys. Arrays retain their order; undefined keys are absent.
const normalized=value=>Array.isArray(value)?value.map(normalized):
  value&&typeof value==='object'?Object.fromEntries(Object.keys(value)
    .filter(key=>value[key]!==undefined).sort()
    .map(key=>[key,normalized(value[key])])):value;
const sameReport=(a,b)=>JSON.stringify(normalized(a))===JSON.stringify(normalized(b));
export const DEDICATED_HANDOFF_MS=45000;
export const DEDICATED_MODE={legacy:'legacy',preparing:'preparing',dedicated:'dedicated'};
export function legacyCombatAllowed(duel) {
  return !duel?.dedicated_mode || duel.dedicated_mode==='legacy';
}
export function dedicatedVoting(duel,uid,now) {
  if(!duel || duel.status!=='active' ||
      ![duel.challenger_id,duel.opponent_id].includes(uid) ||
      !Number.isFinite(now))return {ok:false,reason:'not_eligible'};
  if(duel.dedicated_mode==='dedicated')return {ok:false,reason:'already_dedicated'};
  const expired=Number(duel.dedicated_vote_expires||0)<=now;
  const votes=duel.dedicated_mode==='preparing'&&!expired
    ? {...(duel.dedicated_votes||{})} : {};
  votes[uid]=true;
  const complete=votes[duel.challenger_id]===true&&votes[duel.opponent_id]===true;
  return {ok:true,complete,votes,
    expiresAt:now+DEDICATED_HANDOFF_MS,
    mode:complete?'dedicated':'preparing'};
}
export function validateDedicatedReport({duel,epoch,sequence,snapshot,checkpoint,resultId}={}) {
  if(!duel||duel.dedicated_mode!=='dedicated' ||
      typeof epoch!=='string'||!epoch||epoch!==duel.dedicated_epoch)
    return {ok:false,reason:'authority_mismatch'};
  if(!Number.isSafeInteger(sequence)||sequence<0)
    return {ok:false,reason:'invalid_sequence'};
  // The signed worker may update HP/positions but must not silently
  // switch the immutable arena's map or origin between checkpoints.
  const previous=duel.dedicated_checkpoint||{};
  const expectedOrigin=previous.worldOrigin||null;
  const reportedOrigin=checkpoint?.worldOrigin||null;
  if((previous.mapId||null)!==(checkpoint?.mapId||null) ||
     (previous.instanceId||null)!==(checkpoint?.instanceId||null) ||
     (previous.mapFingerprint||null)!==(checkpoint?.mapFingerprint||null) ||
     (previous.spawnPresetId||null)!==(checkpoint?.spawnPresetId||null) ||
     (expectedOrigin===null)!==(reportedOrigin===null) ||
     (expectedOrigin && (
       !reportedOrigin || expectedOrigin.x!==reportedOrigin.x ||
       expectedOrigin.z!==reportedOrigin.z)) ||
     (snapshot?.mapId||null)!==(previous.mapId||null) ||
     (snapshot?.instanceId||null)!==(previous.instanceId||null) ||
     (snapshot?.mapFingerprint||null)!==(previous.mapFingerprint||null) ||
     (snapshot?.spawnPresetId||null)!==(previous.spawnPresetId||null))
    return {ok:false,reason:'map_binding_changed'};
  // A completed match is retried idempotently using its stable result ID;
  // terminal replay is permitted even if a signed report is otherwise old.
  if(duel.status==='finished'){
    // A finished duel may only replay its EXACT accepted terminal state.
    // Matching a result ID alone must not acknowledge a divergent report.
    if(resultId&&duel.dedicated_result_id===resultId&&
       sequence===Number(duel.dedicated_sequence||0)&&
       sameReport(previous.state,checkpoint?.state)&&
       sameReport(previous.snapshot,snapshot))
      return {ok:true,replay:true};
    return {ok:false,reason:'duel_finished'};
  }
  // Signed worker snapshots and restart checkpoints must represent the same
  // actor state; a tampered or stale restart payload cannot diverge from HUD HP.
  const state=checkpoint?.state;
  if(!state || state.sequence!==snapshot?.seq ||
     state.status!==snapshot?.status ||
     !Array.isArray(state.actors)||state.actors.length!==2)
    return {ok:false,reason:'checkpoint_snapshot_mismatch'};
  for(const p of snapshot.players||[]){
    const a=state.actors.find(actor=>actor.id===p.id);
    if(!a||a.x!==p.x||a.z!==p.z||a.hp!==p.hp||
       a.stamina!==p.stamina||a.will!==p.will)
      return {ok:false,reason:'checkpoint_snapshot_mismatch'};
  }
  if(duel.status!=='active')return {ok:false,reason:'not_active'};
  const persistedSeq=Number(duel.dedicated_sequence||0);
  if(sequence<persistedSeq)return {ok:false,reason:'stale_sequence'};
  if(sequence===persistedSeq){
    // Lost HTTP acknowledgments may retransmit the *identical* checkpoint.
    // A divergent same-sequence report must not overwrite its predecessor.
    const existing=duel.dedicated_checkpoint;
    if(sameReport(existing?.state,state) &&
       sameReport(existing?.snapshot,snapshot))
      return {ok:true,replay:true};
    return {ok:false,reason:'sequence_conflict'};
  }
  // A higher HTTP envelope sequence cannot roll back the worker's
  // previously accepted combat simulation event sequence.
  const lastSimulationSeq=previous.state?.sequence;
  if(Number.isSafeInteger(lastSimulationSeq) &&
     Number.isSafeInteger(state.sequence) &&
     state.sequence<lastSimulationSeq)
    return {ok:false,reason:'simulation_sequence_regressed'};
  if(!snapshot||snapshot.matchId!==duel.id||
      !Array.isArray(snapshot.players)||snapshot.players.length!==2||
      new Set(snapshot.players.map(p=>p.id)).size!==2 ||
      ![duel.challenger_id,duel.opponent_id].every(id=>
        snapshot.players.some(p=>p.id===id)))
    return {ok:false,reason:'invalid_snapshot'};
  for(const player of snapshot.players){
    if(!Number.isFinite(player.hp)||player.hp<0||
        !Number.isFinite(player.maxHp)||player.maxHp<=0||
        player.hp>player.maxHp||!Number.isFinite(player.x)||
        !Number.isFinite(player.z)||Math.abs(player.x)>100||
        Math.abs(player.z)>100||!Number.isFinite(player.stamina)||
        !Number.isFinite(player.will))
      return {ok:false,reason:'invalid_player_state'};
  }
  if(snapshot.status==='finished'){
    if(snapshot.winnerId!=null &&
        ![duel.challenger_id,duel.opponent_id].includes(snapshot.winnerId))
      return {ok:false,reason:'invalid_winner'};
    if(!resultId||typeof resultId!=='string'||resultId.length>200)
      return {ok:false,reason:'invalid_result_id'};
  }else if(snapshot.status!=='waiting'&&snapshot.status!=='active')
    return {ok:false,reason:'invalid_match_status'};
  return {ok:true,replay:false};
}

// Transfer the already-server-held legacy duel state without healing either
// player. Coordinates are translated to the worker's bounded local arena;
// this is NOT a real world collision or physics handoff.
export function initialDedicatedCheckpoint(duel,now,mapId=null,binding={}) {
  const preset=binding.spawnPresetId?duelWorldSpawnPreset(binding.spawnPresetId):null;
  if(binding.spawnPresetId&&(!preset||mapId!==preset.mapId))
    throw Error('Unknown or mismatched dedicated spawn preset');
  const participants=[duel.challenger_id,duel.opponent_id];
  const first=duel.challenger_position,second=duel.opponent_position;
  const usable=first&&second&&
    [first.x,first.z,second.x,second.z].every(Number.isFinite);
  const dx=usable ? Math.max(-8,Math.min(8,second.x-first.x)):2.5;
  const dz=usable ? Math.max(-8,Math.min(8,second.z-first.z)):0;
  const at=(v,defaultValue)=>Number.isFinite(Number(v))?Number(v):defaultValue;
  const player=(uid,index)=>{
    const side=index===0?'challenger':'opponent';
    const stats=duel[side+'_stats']||{};
    const maxHp=Math.max(1,at(stats.maxHP,at(duel[side+'_max_hp'],100)));
    const shield=duel.duel_shields?.[uid];
    const allCooldowns=duel.duel_skill_cooldowns?.[uid]||{};
    return {
      id:uid,x:index===0?0:dx,z:index===0?0:dz,
      hp:Math.max(0,Math.min(maxHp,at(duel[side+'_hp'],maxHp))),
      stamina:100,will:100,
      facing:index===0?Math.atan2(dx,dz):Math.atan2(-dx,-dz),
      shield:shield&&at(shield.expiresAt,0)>now
        ?{current:Math.max(0,at(shield.current,0)),expiresAt:shield.expiresAt}:null,
      shieldReadyAt:Math.max(0,at(allCooldowns.aegis_shield,0)),
      lastBasicAt:Math.max(0,at(duel.last_hit_at?.[uid],0)),
      lastIntentSeq:Math.max(0,at(duel.duel_intent_seq?.[uid],0)),
      cooldowns:Object.entries(allCooldowns).filter(([key,value])=>
        key!=='aegis_shield'&&typeof key==='string'&&
        Number.isFinite(value)).slice(0,30),
    };
  };
  const actors=participants.map(player);
  if(preset){
    actors[0].x=preset.challenger.x;actors[0].z=preset.challenger.z;
    actors[1].x=preset.opponent.x;actors[1].z=preset.opponent.z;
    actors[0].facing=Math.atan2(actors[1].x-actors[0].x,actors[1].z-actors[0].z);
    actors[1].facing=Math.atan2(actors[0].x-actors[1].x,actors[0].z-actors[1].z);
  }
  // Preserve the original trusted duel-world translation across reports and
  // worker restarts. If a valid origin is missing, the client must not project
  // worker arena positions into the visible world.
  const worldOrigin=preset?{...preset.worldOrigin}:first && Number.isFinite(first.x) && Number.isFinite(first.z) &&
    Math.abs(first.x)<=100000 && Math.abs(first.z)<=100000
    ? {x:first.x,z:first.z} : null;
  return {
    reportSequence:0,worldOrigin,mapId,
    ...(binding.instanceId?{instanceId:binding.instanceId}:{}),
    ...(binding.mapFingerprint?{mapFingerprint:binding.mapFingerprint}:{}),
    ...(preset?{spawnPresetId:preset.id}:{}),
    state:{status:'active',sequence:0,winnerId:null,actors},
    snapshot:{
      matchId:duel.id,status:'active',seq:0,winnerId:null,mapId,
      ...(binding.instanceId?{instanceId:binding.instanceId}:{}),
      ...(binding.mapFingerprint?{mapFingerprint:binding.mapFingerprint}:{}),
      ...(preset?{spawnPresetId:preset.id}:{}),
      players:actors.map(a=>({
        id:a.id,x:a.x,z:a.z,hp:a.hp,maxHp:Math.max(1,
          at(duel[(a.id===duel.challenger_id?'challenger':'opponent')+'_max_hp'],100)),
        stamina:a.stamina,will:a.will,
        shield:a.shield?.current||0,
      })),
    },
  };
}
