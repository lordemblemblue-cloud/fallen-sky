// Combat Foundation 12.3 — world-height-aware hit eligibility for the
// existing single-writer dedicated duel authority, NOT a second engine.
//
// Coordinates are the worker's simulated poses. Only map geometry supplied
// by private gateway configuration may supply height and LOS. Never pass
// client-computed Y, collision flags, distances, or hit results to this gate.
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const deny=reason=>({ok:false,reason,worldStrikeAuthorized:false});

// The 2D duel envelope remains unchanged when no trusted map is configured.
// In the versioned Wolfveil world, a ground-plane overlap across different
// floors is not a melee hit; ranged skills get a slightly larger vertical reach.
export const WORLD_STRIKE_MAX_VERTICAL_123=Object.freeze({
 damage:1.6,defense:1.6,ranged:3.25,
});
export const WORLD_STRIKE_RANGE_GRACE_123=0.75;

export function assessGame3DServerWorldStrike123({
 attacker,defender,facingYaw,weaponPath,range,mapWorld=null,worldOrigin=null,
}={}){
 if(!finite(attacker?.x)||!finite(attacker?.z)||
    !finite(defender?.x)||!finite(defender?.z)||
    !finite(facingYaw)||!finite(range)||range<=0||
    !Object.hasOwn(WORLD_STRIKE_MAX_VERTICAL_123,weaponPath))
  return deny('invalid_server_strike_geometry');

 const dx=defender.x-attacker.x,dz=defender.z-attacker.z;
 const horizontal=Math.hypot(dx,dz);
 if(!finite(horizontal)||horizontal>range+WORLD_STRIKE_RANGE_GRACE_123)
  return deny('out_of_range');
 const facingDot=horizontal<0.05?1:
   (dx*Math.sin(facingYaw)+dz*Math.cos(facingYaw))/horizontal;
 if(facingDot<Math.cos(75*Math.PI/180))
  return deny('target_not_in_front');

 let heightDifference=0;
 if(mapWorld!==null){
  // A trusted map must supply all three operations. Missing or crashing
  // geometry is not a reason to downgrade to an unchecked flat arena.
  if(typeof mapWorld.valid!=='function'||
     typeof mapWorld.height!=='function'||
     typeof mapWorld.canStrike!=='function')
   return deny('blocked_by_world');
  try{
   if(!mapWorld.valid(attacker,worldOrigin)||
      !mapWorld.valid(defender,worldOrigin))
    return deny('blocked_by_world');
   const y0=mapWorld.height(attacker,worldOrigin);
   const y1=mapWorld.height(defender,worldOrigin);
   if(!finite(y0)||!finite(y1))
    return deny('blocked_by_world');
   heightDifference=Math.abs(y1-y0);
   if(heightDifference>WORLD_STRIKE_MAX_VERTICAL_123[weaponPath])
    return deny('target_elevation_mismatch');
   // The server-sampled 3D distance, not just client camera proximity,
   // determines whether elevated ranged/melee targets can be hit.
   if(Math.hypot(horizontal,heightDifference)>range+WORLD_STRIKE_RANGE_GRACE_123)
    return deny('out_of_range');
   if(mapWorld.canStrike(attacker,defender,worldOrigin)!==true)
    return deny('blocked_by_world');
  }catch{
   return deny('blocked_by_world');
  }
 }
 return {ok:true,worldStrikeAuthorized:true,
  // Diagnostic values are computed from worker positions, never client fields.
  horizontalDistance:horizontal,heightDifference,
  serverDistance:Math.hypot(horizontal,heightDifference)};
}
