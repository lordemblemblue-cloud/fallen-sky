// Player-selected ability pursuit only. No kill-triggered movement or snapping.
// Movement still uses GameWorld3D's terrain/collision and (when relevant) its
// separately authoritative multiplayer input pipeline.
export const SELECTED_ABILITY_RANGES=Object.freeze({
  meleeAcquireMeters:30,
  bowAcquireMeters:40,
  approachSeconds:3.5,
  minimumMeleeReachMeters:1.7,
});
export function planarAbilityDistance(origin,target){
  if(!origin||!target)return Infinity;
  const dx=target.x-origin.x,dz=target.z-origin.z;
  return [dx,dz].every(Number.isFinite)?Math.hypot(dx,dz):Infinity;
}
export function planSelectedAbility({origin,target,weaponPath='melee',meleeReach=2.4,
  pvp=false,mounted=false}={}){
  if(!target?.position||target.alive===false||target.dying||target.defeated||
      target.visible===false)return {kind:'invalid'};
  const distance=planarAbilityDistance(origin,target.position);
  if(!Number.isFinite(distance))return {kind:'invalid'};
  // Authenticated PvP ranges are owned by the duel worker. Never extend them
  // with a local position dash or client-supplied hit distance.
  if(pvp)return {kind:'pvp_worker',distance};
  if(weaponPath==='ranged')
    return distance<=SELECTED_ABILITY_RANGES.bowAcquireMeters
      ? {kind:'fire',distance} : {kind:'out_of_range',distance};
  if(distance>SELECTED_ABILITY_RANGES.meleeAcquireMeters)
    return {kind:'out_of_range',distance};
  if(distance<=Math.max(SELECTED_ABILITY_RANGES.minimumMeleeReachMeters,meleeReach))
    return {kind:'fire',distance};
  if(mounted)return {kind:'mounted',distance};
  return {kind:'approach',distance};
}
