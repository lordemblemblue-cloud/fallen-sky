// Two coordinate frames may meet in a story's world.
//   LAYOUT  what a story's own tables (points, homes, places) are written in. x east, z north.
//   WORLD   what the scene, the player, the enemies and the HUD use.
// They differ only in z, by the story frame's zOffset (storyFrame.mjs): 0 unless a story says
// otherwise. The old Wolfveil valley's was 70.
import { storyFrame } from './storyFrame.mjs';

export const storyZOffset = () => storyFrame().zOffset;
export const localToWorld = (x, z) => ({ x, z: z + storyFrame().zOffset });
export const worldToLocal = (x, z) => ({ x, z: z - storyFrame().zOffset });

// Distance on the ground between two points given in the same frame.
export const groundDistance = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
