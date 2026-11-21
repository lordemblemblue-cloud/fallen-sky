// Which motion-pack clip each move plays, and how the move's time maps onto the clip's (shared by the rules,
// for root motion, and the renderer, for the pose, so both agree frame by frame).
//
// A move is a list of segments { clip, from: [moveTime, clipTime], to: [moveTime, clipTime], loop?, travel? }:
// between `from` and `to` the clip time runs linearly (or loops over its span). phases() maps a strike's
// wind-up, contact and follow-through onto the move's startup, active and recovery, so the frame data stays
// the rules' to tune and the clip follows. `settle`: the clip that finishes the motion when nothing else
// starts afterwards (walking or acting blends out of it). Travel: the pack builder took each clip's travel
// out of the clip; the rules put it back on the body over the same mapping, so the feet stay planted
// (travel: false keeps a segment's travel out, for moves whose distance the rules set themselves).
import { MOVES } from './moves.mjs';
import { MOTION_CLIPS } from './motionPack.data.mjs';

const seg = (clip, moveFrom, moveTo, clipFrom, clipTo, extra = {}) => ({ clip, from: [moveFrom, clipFrom], to: [moveTo, clipTo], ...extra });
// wind-up -> startup, contact -> active, follow-through -> recovery
const phases = (id, clip, [c0, c1, c2, c3], extra = {}) => {
  const m = MOVES[id];
  const s = m.startup;
  const e = m.startup + m.active;
  return [seg(clip, 0, s, c0, c1, extra), seg(clip, s, e, c1, c2, extra), seg(clip, e, m.duration, c2, c3, extra)];
};
const end = (id) => MOVES[id].duration;
const activeEnd = (id) => MOVES[id].startup + MOVES[id].active;

export const MOVE_MOTION = Object.freeze({
  // sword: a rising slash, a diagonal cut into a low lunge, a spinning cut (one continuous chain in the pack)
  swordLight1: { segments: phases('swordLight1', 'swordA', [0.05, 0.2, 0.28, 0.42]), settle: { clip: 'swordARec', from: 0 } },
  swordLight2: { segments: phases('swordLight2', 'swordB', [0, 0.2, 0.29, 0.5]), settle: { clip: 'swordBRec', from: 0 } },
  swordLight3: { segments: phases('swordLight3', 'swordC', [0.08, 0.58, 0.7, 1.05]), settle: { clip: 'swordC', from: 1.05 } },
  // overhead chop that drives into a lunge
  swordHeavy: { segments: phases('swordHeavy', 'swordHeavy', [0.05, 0.33, 0.46, 0.95]), settle: { clip: 'swordHeavy', from: 0.95 } },
  // Telekinesis: the free hand reaches out (push and pull), holds (grip), lowers
  push: { segments: [seg('castEnter', 0, MOVES.push.startup, 0.1, 0.4), seg('castEnter', MOVES.push.startup, activeEnd('push'), 0.4, 0.52),
    seg('castExit', activeEnd('push'), end('push'), 0, 0.43)] },
  pull: { segments: [seg('castEnter', 0, MOVES.pull.startup, 0.1, 0.4), seg('castEnter', MOVES.pull.startup, activeEnd('pull'), 0.4, 0.52),
    seg('castExit', activeEnd('pull'), end('pull'), 0, 0.43)] },
  grip: { segments: [seg('castEnter', 0, MOVES.grip.startup, 0.05, 0.5), seg('castHold', MOVES.grip.startup, activeEnd('grip'), 0, 2.1, { loop: true }),
    seg('castExit', activeEnd('grip'), end('grip'), 0, 0.43)] },
  // the held body is flung: the throw starts at its release
  gripThrow: { segments: [seg('throw', 0, activeEnd('gripThrow'), 0.3, 0.4), seg('throw', activeEnd('gripThrow'), end('gripThrow'), 0.4, 0.8)],
    settle: { clip: 'throw', from: 0.8 } },
  // Veil Breach: an open-hand strike with the free hand
  breach: { segments: phases('breach', 'punchJab', [0, 0.12, 0.2, 0.5]), settle: { clip: 'punchJab', from: 0.5 } },
  // Resist: brace and throw the hold off
  resist: { segments: [seg('shieldBurst', 0, end('resist'), 0.05, 0.35)], settle: { clip: 'shieldBurst', from: 0.35 } },
  // the smugglers' sidearm: the aim is held through the wind-up (you can see it coming), then the recoil
  sidearmShot: { segments: [seg('pistolShoot', 0, MOVES.sidearmShot.startup, 0, 0.02), seg('pistolShoot', MOVES.sidearmShot.startup, end('sidearmShot'), 0.02, 0.5)] },
  sidearmBurst: { segments: [
    seg('pistolShoot', 0, MOVES.sidearmBurst.startup, 0, 0.02),
    ...MOVES.sidearmBurst.hitAt.map((h, i, all) => seg('pistolShoot', MOVES.sidearmBurst.startup + h,
      i + 1 < all.length ? MOVES.sidearmBurst.startup + all[i + 1] : activeEnd('sidearmBurst'), 0.02, 0.2)),
    seg('pistolShoot', activeEnd('sidearmBurst'), end('sidearmBurst'), 0.2, 0.6),
  ] },
  sidearmWhip: { segments: phases('sidearmWhip', 'punchCross', [0.02, 0.14, 0.22, 0.6]) },
  // the Will dash: the rules move the body (6 m), the clip only lends the lunge
  dash: { segments: [seg('swordDash', 0, end('dash'), 0.22, 0.5, { travel: false })], settle: { clip: 'swordDash', from: 0.5 } },

  // ---- the classes' crystal forms: clips made in Blender from the pack's sword work
  // (tools/duelist/blender/weapon_clips.py). Each runs on into its own recovery, which is its settle.
  // Twin blades: the left blade's rising slash, the right's, the right's cut down into a lunge, then a turn in the
  // air with a blade out either side; each link starts from where the one before leaves the body.
  bladesLight1: { segments: phases('bladesLight1', 'bladesA', [0, 0.15, 0.23, 0.37]), settle: { clip: 'bladesA', from: 0.37 } },
  bladesLight2: { segments: phases('bladesLight2', 'bladesB', [0, 0.15, 0.23, 0.37]), settle: { clip: 'bladesB', from: 0.37 } },
  bladesLight3: { segments: phases('bladesLight3', 'bladesC', [0, 0.2, 0.3, 0.48]), settle: { clip: 'bladesC', from: 0.48 } },
  bladesLight4: { segments: phases('bladesLight4', 'bladesD', [0.25, 0.58, 0.72, 1.05]), settle: { clip: 'bladesD', from: 1.05 } },
  // both blades chop down, the left a beat behind the right
  bladesHeavy: { segments: phases('bladesHeavy', 'bladesHeavy', [0.05, 0.34, 0.52, 0.9]), settle: { clip: 'bladesHeavy', from: 0.9 } },
  // The staff: a level sweep into a low lunge, a turning backhand sweep, a rising diagonal (one continuous chain);
  // the heavy is a turn in the air with the staff level, so both ends pass before the landing cut
  staffLight1: { segments: phases('staffLight1', 'staffA', [0.02, 0.26, 0.4, 0.54]), settle: { clip: 'staffA', from: 0.54 } },
  staffLight2: { segments: phases('staffLight2', 'staffB', [0, 0.1, 0.3, 0.45]), settle: { clip: 'staffB', from: 0.45 } },
  staffLight3: { segments: phases('staffLight3', 'staffC', [0, 0.1, 0.26, 0.42]), settle: { clip: 'staffC', from: 0.42 } },
  staffHeavy: { segments: phases('staffHeavy', 'staffHeavy', [0, 0.3, 0.72, 1.05]), settle: { clip: 'staffHeavy', from: 1.05 } },
  // ---- strikes by direction (core/moves.mjs FLOW): forward an advance, sideways a wide sweep, back a turn that
  // cuts all round. Each leaves from its form's stance and settles back into it, so it may open a chain or follow
  // any other strike.
  swordAdvance: { segments: phases('swordAdvance', 'swordAdvance', [0.02, 0.26, 0.4, 0.54]), settle: { clip: 'swordAdvance', from: 0.54 } },
  swordSweep: { segments: phases('swordSweep', 'swordSweep', [0.05, 0.34, 0.5, 0.65]), settle: { clip: 'swordSweep', from: 0.65 } },
  swordTurn: { segments: phases('swordTurn', 'swordTurn', [0, 0.1, 0.3, 0.45]), settle: { clip: 'swordTurn', from: 0.45 } },
  bladesAdvance: { segments: phases('bladesAdvance', 'bladesAdvance', [0.05, 0.26, 0.4, 0.54]), settle: { clip: 'bladesAdvance', from: 0.54 } },
  bladesSweep: { segments: phases('bladesSweep', 'bladesSweep', [0.1, 0.34, 0.5, 0.65]), settle: { clip: 'bladesSweep', from: 0.65 } },
  bladesTurn: { segments: phases('bladesTurn', 'bladesTurn', [0, 0.1, 0.3, 0.45]), settle: { clip: 'bladesTurn', from: 0.45 } },
  staffLeap: { segments: phases('staffLeap', 'staffLeap', [0, 0.34, 0.48, 0.7]), settle: { clip: 'staffLeap', from: 0.7 } },
  staffSweep: { segments: phases('staffSweep', 'staffSweep', [0.05, 0.34, 0.5, 0.65]), settle: { clip: 'staffSweep', from: 0.65 } },

  // ---- class abilities and specials (the rules move the body where it travels: the leap's arc, the throw)
  leapStrike: { segments: [seg('leapStart', 0, MOVES.leapStrike.startup, 0.35, 0.6, { travel: false }),
    seg('leapLoop', MOVES.leapStrike.startup, activeEnd('leapStrike'), 0, 0.42, { travel: false }),
    seg('leapLand', activeEnd('leapStrike'), end('leapStrike'), 0.15, 0.6, { travel: false })], settle: { clip: 'leapLand', from: 0.6 } },
  repulse: { segments: [seg('shieldBurst', 0, end('repulse'), 0, 0.6)], settle: { clip: 'shieldBurst', from: 0.6 } },
  bladeThrow: { segments: phases('bladeThrow', 'throw', [0.05, 0.3, 0.36, 0.8], { travel: false }), settle: { clip: 'throw', from: 0.8 } },
  quickstep: { segments: [seg('castShoot', 0, end('quickstep'), 0, 0.3)] },
  quickstepAura: { segments: [seg('castShoot', 0, end('quickstepAura'), 0, 0.4)] },
  // the Duelist's parry stance (both blades up) and its answer (the lunge cut)
  counter: { segments: [seg('bladesGuard', 0, activeEnd('counter'), 0.1, 0.5, { travel: false }),
    seg('bladesGuard', activeEnd('counter'), end('counter'), 0.5, 0.7, { travel: false })] },
  counterStrike: { segments: phases('counterStrike', 'bladesC', [0.08, 0.2, 0.3, 0.48]), settle: { clip: 'bladesC', from: 0.48 } },
  cloak: { segments: [seg('castEnter', 0, activeEnd('cloak'), 0, 0.4), seg('castExit', activeEnd('cloak'), end('cloak'), 0, 0.3)] },
  empower: { segments: [seg('castEnter', 0, activeEnd('empower'), 0.1, 0.45), seg('castExit', activeEnd('empower'), end('empower'), 0, 0.3)] },
  misdirect: { segments: [seg('castShoot', 0, end('misdirect'), 0, 0.5)] },
  mend: { segments: [seg('castEnter', 0, MOVES.mend.startup, 0, 0.45), seg('castShoot', MOVES.mend.startup, end('mend'), 0.1, 0.5)] },
  levitate: { segments: [seg('jumpLoop', 0, end('levitate'), 0, 0.3, { travel: false })] },
  rage: { segments: [seg('castEnter', 0, MOVES.rage.startup, 0, 0.5), seg('shieldBurst', MOVES.rage.startup, end('rage'), 0.05, 0.5)] },
  execution: { segments: phases('execution', 'bladesHeavy', [0.12, 0.34, 0.52, 0.9], { travel: false }), settle: { clip: 'bladesHeavy', from: 0.9 } },
  shadowExecution: { segments: phases('shadowExecution', 'swordHeavy', [0.15, 0.33, 0.46, 0.95], { travel: false }), settle: { clip: 'swordHeavy', from: 0.95 } },
  sanctuary: { segments: [seg('castEnter', 0, MOVES.sanctuary.startup, 0, 0.5), seg('castShoot', MOVES.sanctuary.startup, activeEnd('sanctuary'), 0.1, 0.3),
    seg('castExit', activeEnd('sanctuary'), end('sanctuary'), 0, 0.4)] },
});

function clipTravel(clip, time) {
  const info = MOTION_CLIPS[clip];
  const tr = info?.travel;
  if (!tr) return [0, 0];
  const u = Math.min(1, Math.max(0, time / info.duration)) * (tr.forward.length - 1);
  const i = Math.min(tr.forward.length - 2, Math.floor(u));
  const f = u - i;
  return [tr.forward[i] + (tr.forward[i + 1] - tr.forward[i]) * f, tr.right[i] + (tr.right[i + 1] - tr.right[i]) * f];
}

const clipTimeIn = (s, t) => {
  const span = Math.max(1e-6, s.to[0] - s.from[0]);
  if (s.loop) return s.from[1] + (((t - s.from[0]) % (s.to[1] - s.from[1])) + (s.to[1] - s.from[1])) % (s.to[1] - s.from[1]);
  const k = Math.min(1, Math.max(0, (t - s.from[0]) / span));
  return s.from[1] + (s.to[1] - s.from[1]) * k;
};

/** The clip and clip time a move shows at move time t, or null when the move has no clip of its own. */
export function clipAt(id, t) {
  const segments = MOVE_MOTION[id]?.segments;
  if (!segments) return null;
  let s = segments[segments.length - 1];
  for (const candidate of segments) if (t < candidate.to[0]) { s = candidate; break; }
  return { clip: s.clip, time: clipTimeIn(s, Math.min(t, s.to[0])) };
}

/** Where the move has carried the body by move time t: { forward, right } metres (null: no clip travel). */
export function travelAt(id, t) {
  const segments = MOVE_MOTION[id]?.segments;
  if (!segments) return null;
  let forward = 0;
  let right = 0;
  for (const s of segments) {
    if (s.travel === false || s.loop || t <= s.from[0]) continue;
    const [f0, r0] = clipTravel(s.clip, s.from[1]);
    const [f1, r1] = clipTravel(s.clip, clipTimeIn(s, t));
    forward += f1 - f0;
    right += r1 - r0;
  }
  return { forward, right };
}

/** Does the clip carry the body (so the rules take this move's root motion from it)? */
export const hasClipTravel = (id) => !!MOVE_MOTION[id]?.segments.some((s) => s.travel !== false && !s.loop && MOTION_CLIPS[s.clip]?.travel);

export const settleOf = (id) => MOVE_MOTION[id]?.settle || null;
