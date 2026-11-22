// Two coordinate frames meet in Game 3D's valley.
//   LOCAL  Wolfveil metres: what the layout files, the area plan and the
//          pledge places use. x east, z north.
//   WORLD  what the scene, the player, the enemies and the HUD use.
// They differ only in z: world z = local z + 70 (WOLFVEIL_AREA_Z_OFFSET).
// Scenery added under wolfveilWorld.group is positioned in LOCAL metres (the
// group carries the offset); anything added straight to the scene is WORLD.
export const THREE_ROADS_Z_OFFSET = 70;

export const localToWorld = (x, z) => ({ x, z: z + THREE_ROADS_Z_OFFSET });
export const worldToLocal = (x, z) => ({ x, z: z - THREE_ROADS_Z_OFFSET });

// Distance on the ground between two points given in the same frame.
export const groundDistance = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
