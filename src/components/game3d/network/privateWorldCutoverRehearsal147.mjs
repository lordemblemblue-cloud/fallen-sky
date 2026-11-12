// Combat 14.7: evidence-only Game 3D cutover rehearsal.
// Read legacy state through a callback; NEVER mutate it. Compare the
// opt-in 14.4 private preview against existing client world state and list
// the exact blockers for a one-writer switch. The release gate is always
// CLOSED until public auth, gameplay collision, reward proof and approval.
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const key=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const pos=x=>x&&finite(x.x)&&finite(x.z);
const fail=x=>{throw Error('14.7 '+x)};
export const PRIVATE_WORLD_RELEASE_BLOCKERS_147=Object.freeze([
 'public_player_gateway_not_installed',
 'live_world_authority_cutover_not_approved',
 'legacy_combat_writer_still_active',
 'two_player_replication_not_verified',
 'full_map_collision_parity_not_verified',
 'equipment_and_reward_provenance_not_verified',
 'owner_release_approval_missing',
]);
const denied=(reason,counts)=>Object.freeze({
 ok:false,reason,checked:counts?.checked??0,
 matching:counts?.matching??0,divergences:Object.freeze([]),
 safeToActivate:false,gameplayMutated:false,
 blockers:PRIVATE_WORLD_RELEASE_BLOCKERS_147,
});
export function comparePrivateWorldToLegacy147({
 snapshot,legacy,positionTolerance=1.25,
}={}){
 if(!finite(positionTolerance)||positionTolerance<0||
    positionTolerance>100)fail('invalid_position_tolerance');
 if(!snapshot||!legacy||!pos(legacy.player)||
    !Array.isArray(legacy.enemies)||!key(snapshot.instanceId)||
    typeof legacy.mapFingerprint!=='string')
  return denied('incomplete_legacy_observation');
 if(legacy.mapFingerprint!==snapshot.mapFingerprint)
  return denied('map_fingerprint_mismatch');
 const diverged=[];
 let checked=0,matching=0;
 const check=(kind,id,actual,expected)=>{
  checked++;
  if(!pos(actual)||!pos(expected)||!finite(actual.hp)||
     !finite(expected.hp)||!finite(actual.maxHp)||
     !finite(expected.maxHp))
  {diverged.push({kind,id,reason:'invalid_actor_state'});return}
  const delta=Math.hypot(actual.x-expected.x,actual.z-expected.z);
  const hpDelta=Math.abs(actual.hp-expected.hp);
  const maxDelta=Math.abs(actual.maxHp-expected.maxHp);
  if(delta>positionTolerance||hpDelta>.01||maxDelta>.01)
   diverged.push(Object.freeze({
    kind,id,reason:'state_divergence',
    positionDelta:Number(delta.toFixed(3)),
    hpDelta:Number(hpDelta.toFixed(3)),
    maxHpDelta:Number(maxDelta.toFixed(3)),
   }));
  else matching++;
 };
 check('player','player',legacy.player,snapshot.player);
 const seen=new Set();
 for(const enemy of legacy.enemies){
  if(!key(enemy?.id)||seen.has(enemy.id)){
   diverged.push(Object.freeze({kind:'enemy',id:'invalid',
    reason:'duplicate_or_invalid_legacy_actor'}));continue;
  }
  seen.add(enemy.id);
 }
 for(const enemy of snapshot.enemies){
  const current=legacy.enemies.find(x=>x?.id===enemy.id);
  if(!current){
   checked++;diverged.push(Object.freeze({
    kind:'enemy',id:enemy.id,reason:'missing_legacy_enemy',
   }));continue;
  }
  check('enemy',enemy.id,current,enemy);
 }
 for(const enemy of legacy.enemies){
  if(!snapshot.enemies.some(e=>e.id===enemy?.id)){
   checked++;diverged.push(Object.freeze({
    kind:'enemy',id:enemy.id||'invalid',reason:'unmatched_legacy_enemy',
   }));
  }
 }
 return Object.freeze({
  ok:true,reason:diverged.length?'visual_mismatch':'matched_visual_observation',
  checked,matching,divergences:Object.freeze(diverged),
  safeToActivate:false,gameplayMutated:false,
  blockers:PRIVATE_WORLD_RELEASE_BLOCKERS_147,
 });
}
export function createPrivateWorldCutoverRehearsal147({
 view,readLegacyState,positionTolerance=1.25,maxHistory=20,
}={}){
 if(typeof view?.getState!=='function'||
    typeof readLegacyState!=='function'||
    !Number.isInteger(maxHistory)||maxHistory<1||maxHistory>100)
  fail('requires private view and read-only legacy observer');
 let history=[],disposed=false;
 const observe=()=>{
  if(disposed)fail('rehearsal_closed');
  const current=view.getState();
  if(current?.mode!=='connected'||!current.snapshot)
   return denied('private_world_not_connected');
  let legacy;
  try{legacy=readLegacyState()}catch{
   return denied('legacy_observation_failed');
  }
  const comparison=comparePrivateWorldToLegacy147({
   snapshot:current.snapshot,legacy,positionTolerance,
  });
  const report=Object.freeze({...comparison,
   eventSeq:current.snapshot.eventSeq,
   instanceId:current.snapshot.instanceId,
   connected:true,safeToActivate:false,
  });
  history=[...history,report].slice(-maxHistory);
  return report;
 };
 return Object.freeze({
  version:'14.7',observe,
  getHistory:()=>Object.freeze([...history]),
  assess:()=>Object.freeze({
   sampled:history.length,
   observationsMatch:history.length>0&&
    history.every(r=>r.ok&&r.divergences.length===0),
   readyForLiveCutover:false,
   blockers:PRIVATE_WORLD_RELEASE_BLOCKERS_147,
   activated:false,
  }),
  dispose(){disposed=true;history=[]},
  liveAuthoritySwitchInstalled:false,previewOnly:true,
  gameplayMutated:false,productionReady:false,
 });
}
