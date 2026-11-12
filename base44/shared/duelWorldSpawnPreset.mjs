// Combat Foundation 3.6: fixed, backend-selected staging duel spawn presets.
// These are local coordinates relative to worldOrigin in the Wolfveil renderer.
// Presets establish safe initial locations, NOT shared-world shard residency.
const southApproach=Object.freeze({
  id:'wolfveil-south-approach-v1',mapId:'wolfveil-v1',
  worldOrigin:Object.freeze({x:0,z:-80}),
  challenger:Object.freeze({x:-3,z:0}),
  opponent:Object.freeze({x:3,z:0}),
});
export const DUEL_WORLD_SPAWN_PRESETS=Object.freeze({
  [southApproach.id]:southApproach,
});
export function duelWorldSpawnPreset(id){
  return typeof id==='string'
    ? Object.prototype.hasOwnProperty.call(DUEL_WORLD_SPAWN_PRESETS,id)
      ? DUEL_WORLD_SPAWN_PRESETS[id]:null
    : null;
}

// Only immutable signed checkpoint fields are admissible. Subsequent reports
// need the same preset/origin, but actors can of course move after admission.
export function validateDuelWorldSpawnPreset(checkpoint,requiredId,participants=null){
  if(!requiredId)return {ok:!checkpoint?.spawnPresetId,reason:'unexpected_spawn_preset'};
  const preset=duelWorldSpawnPreset(requiredId);
  if(!preset||checkpoint?.spawnPresetId!==requiredId)
    return {ok:false,reason:'spawn_preset_mismatch'};
  const o=checkpoint.worldOrigin;
  if(checkpoint.mapId!==preset.mapId||o?.x!==preset.worldOrigin.x||
     o?.z!==preset.worldOrigin.z)
    return {ok:false,reason:'spawn_origin_mismatch'};
  const isInitial=checkpoint?.reportSequence===0 &&
    checkpoint?.state?.sequence===0;
  if(isInitial){
    if(!participants||participants.length!==2||new Set(participants).size!==2)
      return {ok:false,reason:'spawn_participants_missing'};
    const actors=checkpoint.state.actors;
    if(!Array.isArray(actors)||actors.length!==2)
      return {ok:false,reason:'spawn_actors_missing'};
    for(let i=0;i<2;i++){
      const expected=i===0?preset.challenger:preset.opponent;
      const actor=actors.find(a=>a.id===participants[i]);
      if(!actor||actor.x!==expected.x||actor.z!==expected.z)
        return {ok:false,reason:'spawn_position_mismatch'};
    }
  }
  return {ok:true,preset};
}
