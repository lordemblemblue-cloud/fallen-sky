// Existing owner-assigned Game 3D enemy from Atom X Eve OS Admin > Model3D.
// Read-only source snapshot of the connected app Model3D id
// 6992ed8225f8003a1ad5c557, role='enemy', ai_enabled=true.
// Animation FBX ids/URLs resolved from that entity's ai_profile.animations
// and corresponding AnimationFBX records. No asset bytes are embedded.
// The filename/rig availability still needs Play-mode verification.
export const WOLFVEIL_ADMIN_C1_MODEL=Object.freeze({
  id:'6992ed8225f8003a1ad5c557',
  name:'C1',
  modelUrl:'https://base44.app/api/apps/6876751a602125f45f1861b9/files/public/6876751a602125f45f1861b9/3f915913a_ErikaArcher.fbx',
  modelFormat:'fbx',
  originalRole:'enemy',
  adminAIEnabled:true,
  adminSpawnKey:'KeyL',
  adminBehaviorType:'passive_wander',
  adminAttackRangeM:2,
  adminDetectionRangeM:10,
  adminWanderRadiusM:5,
  assetFilesVerifiedInBrowser:false,
  authoritativeServerEnemy:false,
});
export const WOLFVEIL_ADMIN_C1_ANIMATIONS=Object.freeze({
  idle:Object.freeze({
    id:'6992eac0946af9bfafd4c326',
    name:'standing idle 01',
    url:'https://base44.app/api/apps/6876751a602125f45f1861b9/files/public/6876751a602125f45f1861b9/b7fd6fb1f_standingidle01.fbx',
  }),
  run:Object.freeze({
    id:'69869585e4b379ce22d7e5fb',
    name:'Running',
    url:'https://base44.app/api/apps/6876751a602125f45f1861b9/files/public/6876751a602125f45f1861b9/4edd51169_Running.fbx',
  }),
  attack:Object.freeze({
    id:'6992eac3d5e64d5cbd9793f6',
    name:'standing melee kick',
    url:'https://base44.app/api/apps/6876751a602125f45f1861b9/files/public/6876751a602125f45f1861b9/d4d6d9112_standingmeleekick.fbx',
  }),
  death:Object.freeze({
    id:'6992eab6105430563090d40e',
    name:'standing death backward 01',
    url:'https://base44.app/api/apps/6876751a602125f45f1861b9/files/public/6876751a602125f45f1861b9/29505649e_standingdeathbackward01.fbx',
  }),
  hit:Object.freeze({
    id:'6992eab6e69c6abdcc12d7b2',
    name:'standing block',
    url:'https://base44.app/api/apps/6876751a602125f45f1861b9/files/public/6876751a602125f45f1861b9/62b704f49_standingblock.fbx',
    note:'Admin hit slot is a BLOCK clip, not a verified recoil reaction.',
  }),
  dodge:Object.freeze({
    id:'6992eabac48acf6d36d9503a',
    name:'standing dodge backward',
    url:'https://base44.app/api/apps/6876751a602125f45f1861b9/files/public/6876751a602125f45f1861b9/39c79f4e9_standingdodgebackward.fbx',
  }),
});
export const WOLFVEIL_ADMIN_C1_WALK_ASSIGNED=false;
export const WOLFVEIL_ADMIN_C1_WALK_POLICY=
  'Use independent slowed copy of admin-assigned Running clip for patrol; no C1 walk file assigned';
