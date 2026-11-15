// Clone-only Wolfveil map version switch. Never delete the original world.
// The uploader's two 30,327,245-byte .mjs copies contain the same 22,742,008-byte
// glTF2 asset. The geometry-preserving scene shards below were exported from it.
// A new setting generation intentionally resets old v1 Suigen defaults.
// The old key is left intact for historical recovery; never delete assets.
export const WORLD_VARIANT_LEGACY_STORAGE_KEY='game3d_clone_world_variant_v1';
export const WORLD_VARIANT_STORAGE_KEY='game3d_clone_world_variant_v3_classic_locked';
export const WORLD_VARIANT_EVENT='game3dWorldVariantChanged';
export const WORLD_VARIANT_STATUS_EVENT='game3dWorldVariantStatus';
export const WORLD_VARIANT_CLASSIC='classic';
export const WORLD_VARIANT_SUIGEN='suigen';

export const SUIGEN_ASSET_PARTS=Object.freeze([
  'https://media.base44.com/files/public/6ab42219a52fd34656a53b37/70f28504c_wolfveil_suigen_north.glb',
  'https://media.base44.com/files/public/6ab42219a52fd34656a53b37/777b3d50e_wolfveil_suigen_south.glb',
]);
export const SUIGEN_WORLD_METADATA=Object.freeze({
  id:'wolfveil-dominion-of-suigen',
  source:'Wolfveil_Dominion_Of_Suigen_2400m_AAA_Map',
  sideMeters:2400,
  bounds: Object.freeze({minX:-1200,maxX:1200,minZ:-1200,maxZ:1200}),
  worldRegion:'wolfveil',
  sourceMeshCount:928,
  shardCount:2,
  referenceStyle:'original painterly fantasy with physically-based materials',
});

// The user requested an actual rollback, not just another default change.
// The 2.4 km Suigen source remains stored in the repository/CDN as an archive,
// but no saved preference, stale v2 setting, or event can activate it in Play.
export function normalizeWolfveilWorldVariant(){
  return WORLD_VARIANT_CLASSIC;
}
export function readWolfveilWorldVariant(storage=globalThis?.localStorage){
  try{return normalizeWolfveilWorldVariant(storage?.getItem?.(WORLD_VARIANT_STORAGE_KEY));}
  catch{return WORLD_VARIANT_CLASSIC;}
}
export function saveWolfveilWorldVariant(value,storage=globalThis?.localStorage){
  const variant=normalizeWolfveilWorldVariant(value);
  try{storage?.setItem?.(WORLD_VARIANT_STORAGE_KEY,variant);}catch{}
  return variant;
}
