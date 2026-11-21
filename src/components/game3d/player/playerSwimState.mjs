// Deep water: the hero swims at the surface instead of walking on the bed.
//
// GameWorld3D runs this every frame after the feet are glued to the ground, with the water surface under the hero
// (world/game3dWaterSurface.mjs: the river's and the lake's own meshes) and the bed (the ground the glue found).
// Once the water over the bed reaches a standing hero's neck the hero swims: the body floats with the neck at the
// surface and the controller plays the owner's swim loops (Swim_Idle / Swim_Forward, tools/avatar-motion/
// mobility-clips.mjs). Those clips keep the neck at the model's origin, so a swimmer's origin sits just under the
// water line. Where the bed comes back up, the hero stands and walks out.
//
// The way in and out is one blend: the clips cross-fade over blendSeconds (LunaDashboardPlayerController.setSwimming)
// while the body moves between where it stood and the float height at the same pace, so the head stays level.
// Presentation and movement only; the water is not a collider and nothing here touches combat or the ground code.
export const SWIM = Object.freeze({
  enterDepth: 1.45, // m of water over the bed: up to a standing hero's neck (both fused bodies are 1.73 m)
  exitDepth: 1.2, // m: the bed is shallow enough to stand again (chest-deep), with room so the edge never flickers
  waterline: 0.04, // m: the swim clips hold the neck at the origin (0.00-0.08 measured); the origin sits this far under
  speed: 1.9, // m/s swimming forward; Swim_Forward's own 1.32-1.38 m/s cycle plays faster to match (cadence-capped)
  blendSeconds: 0.4, // into and out of the water
  aboveWater: 0.3, // a hero this far above the surface (a bridge deck, the top of a jump) is not in the water
  noticeSeconds: 1.6, // "can't do that while swimming" at most this often
});

export const SWIM_STATES = Object.freeze({ idle: 'swimIdle', forward: 'swimForward' });
export const isSwimState = (state) => state === SWIM_STATES.idle || state === SWIM_STATES.forward;

const smooth = (t) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** Water over the bed (m), or -Infinity where there is no water. */
export function swimDepth(surfaceY, bedY) {
  return finite(surfaceY) && finite(bedY) ? surfaceY - bedY : -Infinity;
}

/**
 * One hero's water state. update() each frame with
 *   dt         seconds since the last frame
 *   surfaceY   the water surface under the hero, or null (no water there)
 *   bedY       the ground the feet were glued to this frame (the river or lake bed in the water)
 *   currentY   the hero's height after the glue and the controller's motion (the jump offset included)
 *   allowed    false while riding, dead, flying with the mount, in a cutscene...: the hero is out at once
 * and get { swimming, weight, rootY, depth, entered, left }: rootY is the height to put the hero at, or null to keep
 * what the ground code set; weight is how far the body is into the swim (0 standing, 1 floating).
 */
export function createPlayerSwimState({ swim = SWIM } = {}) {
  let swimming = false, weight = 0, fromY = null, lastY = null, lastFloatY = null;
  const state = { swimming: false, weight: 0, rootY: null, depth: -Infinity, entered: false, left: false };
  const report = (patch) => Object.assign(state, patch);
  return {
    update({ dt = 0, surfaceY = null, bedY = null, currentY = null, allowed = true } = {}) {
      const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
      const depth = swimDepth(surfaceY, bedY);
      const wasSwimming = swimming;
      if (!allowed) {
        swimming = false; weight = 0; fromY = null;
        lastY = finite(currentY) ? currentY : lastY;
        return report({ swimming, weight, rootY: null, depth, entered: false, left: wasSwimming });
      }
      const floatY = finite(surfaceY) ? surfaceY - swim.waterline : lastFloatY;
      if (finite(surfaceY)) lastFloatY = floatY;
      // Into the water only from below the surface line: a bridge deck over the river or the top of a jump is dry.
      const fromAbove = finite(currentY) && finite(surfaceY) && currentY > surfaceY + swim.aboveWater;
      if (!swimming && depth >= swim.enterDepth && !fromAbove) {
        swimming = true;
        // where the body was before the glue moved it to the bed this frame (the bank, a fall): blend from there;
        // after a teleport or a respawn that height is somewhere else, so start from where the hero is now
        const near = finite(lastY) && (!finite(currentY) || Math.abs(lastY - currentY) < 6);
        fromY = near ? lastY : finite(currentY) ? currentY : bedY;
      } else if (swimming && (depth < swim.exitDepth || !finite(floatY))) {
        swimming = false;
      }
      const rate = swim.blendSeconds > 0 ? step / swim.blendSeconds : 1;
      weight = swimming ? Math.min(1, weight + rate) : Math.max(0, weight - rate);
      let rootY = null;
      if (swimming) {
        rootY = weight >= 1 || !finite(fromY) ? floatY : fromY + (floatY - fromY) * smooth(weight);
        if (weight >= 1) fromY = null;
      } else if (weight > 0 && finite(floatY) && finite(bedY)) {
        // standing up in the shallows: from the float height down to the bed as the walk takes over
        rootY = bedY + (floatY - bedY) * smooth(weight);
      }
      lastY = finite(rootY) ? rootY : finite(currentY) ? currentY : lastY;
      return report({ swimming, weight, rootY, depth, entered: swimming && !wasSwimming, left: wasSwimming && !swimming });
    },
    isSwimming: () => swimming,
    /** 0 standing, 1 floating: how far the body is into the swim. */
    getWeight: () => weight,
    getState: () => ({ ...state }),
    reset() {
      swimming = false; weight = 0; fromY = null; lastY = null; lastFloatY = null;
      report({ swimming: false, weight: 0, rootY: null, depth: -Infinity, entered: false, left: false });
    },
  };
}

/** "You can't do that while swimming": each message at most once per SWIM.noticeSeconds (a held key, click spam). */
export function createSwimNotice(show, { seconds = SWIM.noticeSeconds, now = () => globalThis.performance.now() } = {}) {
  const last = new Map();
  return (text) => {
    const t = now();
    if (t - (last.get(text) ?? -Infinity) < seconds * 1000) return false;
    last.set(text, t);
    show(text);
    return true;
  };
}
