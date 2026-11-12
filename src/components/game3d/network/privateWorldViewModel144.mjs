// Combat 14.4 — read-only, opt-in Game 3D HUD/render projection.
// Consume the existing 13.7 authoritative private world wire protocol.
// This never writes the existing playerHUDStore, NPC simulation, inventory,
// quests, currency, kill count, XP or equipment. A snapshot is presentation
// data, NEVER permission to pay out, teleport, or change a local world.
export const VIEW_POLICY_144=Object.freeze({
 protocol:1,maxEnemies:16,maxEvents:40,
});
const str=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{8,128}$/.test(x);
const actor=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const seq=x=>Number.isSafeInteger(x)&&x>=0;
const key=x=>x&&typeof x==='object'&&!Array.isArray(x);
const fail=message=>{throw Error('14.4 '+message)};
const copyEnemy=e=>Object.freeze({
 id:e.id,x:e.x,z:e.z,hp:e.hp,maxHp:e.maxHp,
 alive:e.alive,pendingImpactAt:e.pendingImpactAt,
});
export function projectPrivateWorldSnapshot144(snapshot,{
 instanceId=null,instanceEpoch=null,mapFingerprint=null,
}={}){
 if(!key(snapshot)||snapshot.protocol!==VIEW_POLICY_144.protocol||
    snapshot.rewardsIssued!==false||snapshot.productionReady!==false||
    !str(snapshot.instanceId)||!str(snapshot.instanceEpoch)||
    !sha(snapshot.mapFingerprint)||!seq(snapshot.eventSeq)||
    !finite(snapshot.serverTime)||snapshot.serverTime<0||
    (instanceId!==null&&snapshot.instanceId!==instanceId)||
    (instanceEpoch!==null&&snapshot.instanceEpoch!==instanceEpoch)||
    (mapFingerprint!==null&&snapshot.mapFingerprint!==mapFingerprint))
  fail('invalid_private_world_snapshot');
 const p=snapshot.player;
 if(!key(p)||!finite(p.x)||!finite(p.z)||
    !finite(p.hp)||!finite(p.maxHp)||p.maxHp<1||
    p.hp<0||p.hp>p.maxHp||
    !finite(p.stamina)||p.stamina<0||p.stamina>100||
    !finite(p.facing)||Math.abs(p.facing)>2*Math.PI||
    !seq(p.lastIntentSeq)||
    !Array.isArray(snapshot.enemies)||
    snapshot.enemies.length>VIEW_POLICY_144.maxEnemies)
  fail('invalid_private_player_state');
 const seen=new Set();
 const enemies=snapshot.enemies.map(e=>{
  if(!key(e)||!actor(e.id)||seen.has(e.id)||
     !finite(e.x)||!finite(e.z)||
     !finite(e.hp)||!finite(e.maxHp)||
     e.maxHp<1||e.hp<0||e.hp>e.maxHp||
     typeof e.alive!=='boolean'||e.alive!==(e.hp>0)||
     !(e.pendingImpactAt===null||
       (finite(e.pendingImpactAt)&&e.pendingImpactAt>=0)))
   fail('invalid_private_enemy_state');
  seen.add(e.id);
  return copyEnemy(e);
 });
 return Object.freeze({
  instanceId:snapshot.instanceId,
  instanceEpoch:snapshot.instanceEpoch,
  mapFingerprint:snapshot.mapFingerprint,
  eventSeq:snapshot.eventSeq,serverTime:snapshot.serverTime,
  player:Object.freeze({
   x:p.x,z:p.z,hp:p.hp,maxHp:p.maxHp,stamina:p.stamina,
   facing:p.facing,lastIntentSeq:p.lastIntentSeq,
  }),
  enemies:Object.freeze(enemies),
  rewardsIssued:false,productionReady:false,
  // Explicitly presentation-only: no locally triggered XP, loot or kills.
  canAwardProgression:false,canChangeGameWorld:false,
 });
}
export function projectPrivateWorldEvents144(events,{
 instanceId,afterSeq,maxSeq,
}={}){
 if(!Array.isArray(events)||events.length>VIEW_POLICY_144.maxEvents||
    !str(instanceId)||!seq(afterSeq)||!seq(maxSeq)||maxSeq<afterSeq)
  fail('invalid_private_event_batch');
 const allowed=new Set(['player_strike','enemy_strike','enemy_miss',
  'enemy_strike_refused','enemy_telegraph']);
 let cursor=afterSeq;
 return Object.freeze(events.map(e=>{
  if(!key(e)||!seq(e.seq)||e.seq!==cursor+1||
     e.seq>maxSeq||e.instanceId!==instanceId||
     !allowed.has(e.kind)||!finite(e.serverTime)||
     e.xpAuthorized!==false||e.lootAuthorized!==false||
     e.currencyAuthorized!==false)
   fail('invalid_private_event_stream');
  const fields=['kind','seq','serverTime','targetId','enemyId',
   'damage','enemyHp','playerHp','critical','killed',
   'serverKillCommitted','variant','impactAt','facingYaw',
   'arcDegrees'];
  const result={};
  for(const field of fields){
   if(!Object.prototype.hasOwnProperty.call(e,field))continue;
   const value=e[field];
   if(!(value===null||typeof value==='boolean'||
        typeof value==='string'||finite(value)))
    fail('invalid_private_event_field');
   result[field]=value;
  }
  // An ephemeral combat 'killed' flag is NOT proof of a rewarded kill.
  if(result.serverKillCommitted!==undefined&&
     result.serverKillCommitted!==false)
   fail('unauthorized_private_kill_claim');
  cursor=e.seq;
  return Object.freeze({...result,rewardsAuthorized:false});
 }));
}
export function createPrivateWorldViewStore144({
 instanceId=null,instanceEpoch=null,mapFingerprint=null,
}={}){
 let current=Object.freeze({
  mode:'disconnected',snapshot:null,connectionId:null,cursor:0,
  nextInputSeq:1,nextIntentSeq:1,lastError:null,
  effects:Object.freeze([]),
 });
 const listeners=new Set();
 const notify=()=>{for(const fn of [...listeners])fn(current)};
 const publish=s=>{current=Object.freeze(s);notify();return current};
 const context=()=>({instanceId,instanceEpoch,mapFingerprint});
 const stop=(reason='disconnected')=>publish({
  mode:'disconnected',snapshot:null,connectionId:null,cursor:0,
  nextInputSeq:1,nextIntentSeq:1,lastError:reason,effects:Object.freeze([]),
 });
 const connected=packet=>{
  if(packet?.ok!==true||packet.reset!==true||
     packet.rewardsIssued!==false||packet.productionReady!==false||
     typeof packet.connectionId!=='string'||
     !/^[a-f0-9-]{36}$/.test(packet.connectionId)||
     !seq(packet.cursor)||packet.cursor!==packet.snapshot?.eventSeq||
     !Number.isSafeInteger(packet.nextIntentSeq)||
     packet.nextIntentSeq!==packet.snapshot?.player?.lastIntentSeq+1)
   fail('invalid_private_connect');
  const snapshot=projectPrivateWorldSnapshot144(packet.snapshot,context());
  return publish({
   mode:'connected',snapshot,connectionId:packet.connectionId,
   cursor:packet.cursor,nextInputSeq:1,
   nextIntentSeq:packet.nextIntentSeq,lastError:null,
   effects:Object.freeze([]),
  });
 };
 const received=packet=>{
  if(current.mode!=='connected'||!current.snapshot)
   fail('disconnected_private_view');
  if(packet?.ok!==true||packet.rewardsIssued!==false||
     packet.productionReady!==false||
     typeof packet.reset!=='boolean'||typeof packet.gap!=='boolean'||
     !seq(packet.nextSeq)||typeof packet.hasMore!=='boolean')
   fail('invalid_private_poll');
  const snapshot=projectPrivateWorldSnapshot144(packet.snapshot,context());
  if(snapshot.eventSeq<current.snapshot.eventSeq||
     snapshot.serverTime<current.snapshot.serverTime)
   fail('stale_private_snapshot');
  if(packet.reset){
   if(!packet.gap||packet.hasMore||packet.events?.length!==0||
      packet.nextSeq!==snapshot.eventSeq)
    fail('invalid_private_reset');
   return publish({...current,snapshot,cursor:packet.nextSeq,
    nextIntentSeq:Math.max(current.nextIntentSeq,
     snapshot.player.lastIntentSeq+1),effects:Object.freeze([]),
    lastError:'event_gap_resynced'});
  }
  if(packet.gap||packet.nextSeq<current.cursor||
     packet.nextSeq>snapshot.eventSeq)
   fail('invalid_private_event_cursor');
  const effects=projectPrivateWorldEvents144(packet.events,{
   instanceId:snapshot.instanceId,afterSeq:current.cursor,
   maxSeq:snapshot.eventSeq,
  });
  if(packet.nextSeq!== (effects.at(-1)?.seq??current.cursor)||
     packet.hasMore!==(packet.nextSeq<snapshot.eventSeq))
   fail('invalid_private_event_page');
  return publish({...current,snapshot,cursor:packet.nextSeq,
   nextIntentSeq:Math.max(current.nextIntentSeq,
    snapshot.player.lastIntentSeq+1),effects,lastError:null});
 };
 const sentInput=seqSent=>{
  if(current.mode!=='connected'||!Number.isSafeInteger(seqSent)||
     seqSent!==current.nextInputSeq)fail('invalid_private_input_ack');
  return publish({...current,nextInputSeq:seqSent+1,
   effects:Object.freeze([])});
 };
 const sentIntent=seqSent=>{
  if(current.mode!=='connected'||!Number.isSafeInteger(seqSent)||
     seqSent!==current.nextIntentSeq)fail('invalid_private_intent_ack');
  return publish({...current,nextIntentSeq:seqSent+1,
   effects:Object.freeze([])});
 };
 return Object.freeze({
  getState:()=>current,
  subscribe(fn){
   if(typeof fn!=='function')throw Error('14.4 requires observer');
   listeners.add(fn);fn(current);return()=>listeners.delete(fn);
  },
  connected,received,sentInput,sentIntent,stop,
  readOnly:true,writeToPlayerHUDStore:false,
  grantRewards:false,productionReady:false,
 });
}
