// User-supplied SKINNED GLBs uploaded to this application's Base44 media library.
// The URLs are first-party assets, not illustrative placeholders.
// Replaced the 3 former mesh-only faction mounts in-place; IDs and mount progression remain unchanged.
// Asset integrity and skin joints documented in docs/game3d/FACTION_MOUNTS_AND_SPIRITUAL_GLB.md.
export const GAME3D_FACTION_MOUNTS = Object.freeze({
  AXE_Faction_1: Object.freeze({
    factionId: 'AXE_Faction_1', companionId: 'faction_bear',
    mountDefinitionId: 'axe_mount_faction_bear', name: 'Fantasy Bear',
    modelUrl: 'https://media.base44.com/files/public/6876751a602125f45f1861b9/4a25e7204_fantasy_bear_3d_model__1_.glb',
    scale: 1.4,
  }),
  AXE_Faction_2: Object.freeze({
    factionId: 'AXE_Faction_2', companionId: 'faction_armored_wolf',
    mountDefinitionId: 'axe_mount_faction_wolf', name: 'Armored Wolf',
    modelUrl: 'https://media.base44.com/files/public/6876751a602125f45f1861b9/238bac526_fantasy_armored_wolf_3d_model__1_.glb',
    scale: 1.4,
  }),
  AXE_Faction_3: Object.freeze({
    factionId: 'AXE_Faction_3', companionId: 'faction_tiger',
    mountDefinitionId: 'axe_mount_faction_tiger', name: 'Fantasy Tiger',
    modelUrl: 'https://media.base44.com/files/public/6876751a602125f45f1861b9/43581b070_fantasy_tiger_3d_model__1_.glb',
    scale: 1.4,
  }),
});
export const GAME3D_SHARED_SPIRITUAL_ASSETS = Object.freeze({
  halo: 'https://media.base44.com/files/public/6876751a602125f45f1861b9/8ec9a29aa_winged_crown_3d_model.glb',
  blueEnergyWings: 'https://media.base44.com/files/public/6876751a602125f45f1861b9/25b64772e_blue_winged_angel_3d_model.glb',
});
export function getGame3DFactionMount(factionId) {
  return GAME3D_FACTION_MOUNTS[factionId] || null;
}
export function getGame3DStarterMountDefinitionId(factionId) {
  return getGame3DFactionMount(factionId)?.mountDefinitionId || 'axe_mount_war_wolf';
}
