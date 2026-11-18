// Game 3D terrain macro maps (2026-11-16 landscaping, round 2).
//
// The 310 x 310 game terrain (3.55 m vertex spacing) is shaded with maps
// baked from a 2048 x 2048 evaluation of the SAME height function (0.54 m),
// plus a hydraulic-erosion pass on the mountain ranges (gullies, ridges,
// scree fans). Erosion is shading only: the mesh, BVH and server collision
// keep the analytic height. Baked by scripts/bake-wolfveil-terrain-macro.mjs.
//
// Texture layout (flipY=false: image row 0 = local z min, column 0 = x min):
//   normal  2048^2  R,G = world normal x,z (0.5 = 0)   B = fine cavity (0.5 = flat)
//   mask    1024^2  R = sky ambient occlusion  G = water flow  B = scree deposits
// Pure data + helpers: safe in Node (tests, bake script, server).

export const WOLFVEIL_TERRAIN_MACRO=Object.freeze({
  revision:'wolfveil-terrain-macro-v1-20261116',
  // Local terrain coordinates (the Play/world origin is local z + 70).
  span:1100,
  normalSize:2048,
  maskSize:1024,
  normalUrl:'/game3d/landscape/wv_terrain_macro_normal.webp',
  maskUrl:'/game3d/landscape/wv_terrain_macro_mask.webp',
  metaFile:'wv_terrain_macro.json',
  // Fade the maps out over this many metres at the edge of the baked square.
  edgeFade:14,
});

/** World-space rect {x0,z0,width,depth} of the baked square for a scene offset. */
export function wolfveilTerrainMacroRect(offsetZ=0,span=WOLFVEIL_TERRAIN_MACRO.span){
  return {x0:-span/2,z0:-span/2+offsetZ,width:span,depth:span};
}

/**
 * Stable fingerprint of the height function the maps were baked from: a
 * 17 x 17 grid over the baked square, rounded to 1 cm, FNV-1a. A changed
 * landscape design changes this value, so a test can flag a stale bake.
 */
export function wolfveilTerrainMacroChecksum(heightAt,span=WOLFVEIL_TERRAIN_MACRO.span){
  let hash=0x811c9dc5;
  const feed=s=>{for(let i=0;i<s.length;i++){hash^=s.charCodeAt(i);hash=Math.imul(hash,0x01000193)>>>0;}};
  for(let j=0;j<=16;j++)for(let i=0;i<=16;i++){
    const x=(i/16-.5)*span*.98,z=(j/16-.5)*span*.98;
    feed(Math.round(heightAt(x,z)*100)+';');
  }
  return hash.toString(16).padStart(8,'0');
}
