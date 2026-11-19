// Which move a dodge input plays inside Game 3D's eight-way dodge framework (game3dEightWayDodge.mjs), with the
// owner's roll option (2026-11), plus the double-tap detector for W / A / S / D.
//
//   double-tap W and the forward diagonals   a forward sidestep (Dodge_Forward, mobility clip pack)
//                                            "Roll dodges" (Settings): the front roll (dodgeMoves.js Front_Roll)
//   double-tap S and the back diagonals      the back flip (dodgeMoves.js Back_Flip)
//                                            "Roll dodges": a backward roll (Back_Roll, mobility clip pack)
//   double-tap A / D                         the aerial side flips (unchanged)
//   R (+ W / A / S / D)                      always a roll: front roll, backward roll (R alone), side roll
//
// A move lists its candidates in order and the controller plays the first one the body has a clip for, so a body
// without the clip pack (the v5 bodies, or a pack that failed to load) keeps the eight-way move it had. Travel,
// stamina, collision and the invulnerability window stay where they were (the world and the controller).
import { getEightWayDodgeMove } from './game3dEightWayDodge.mjs';

export const GAME3D_DOUBLE_TAP_MS = 320;

// Extra eight-way variants. duration: the clip's playable length (game3dMobilityTiming fits the clip to it);
// speed: the dash speed over min(.68 s, duration), the same rule as the other eight-way moves.
export const DODGE_VARIANT_MOVES = Object.freeze({
  stepForward: Object.freeze({ key: 'dodgeStepForward', kind: 'step', duration: .62, speed: 4.4, pitch: 0, side: 0 }),
  backRoll: Object.freeze({ key: 'dodgeBackRoll', kind: 'roll', duration: .9, speed: 5.0, pitch: -1, side: 0 }),
});

const forwardish = (direction) => /^forward/.test(String(direction));
const backwardish = (direction) => /^backward/.test(String(direction));

/**
 * The moves a dodge in `direction` may play, best first.
 *   rollKey     the dodge came from R (always a roll)
 *   rollDodges  the player's "Roll dodges" setting (double-tap W / S roll instead of sidestep / back flip)
 */
export function dodgeMoveCandidates(direction = 'forward', { rollKey = false, rollDodges = false } = {}) {
  const base = getEightWayDodgeMove(direction, { roll: rollKey });
  if (forwardish(direction) && !rollKey && !rollDodges) return [{ ...DODGE_VARIANT_MOVES.stepForward, direction }, base];
  if (backwardish(direction) && (rollKey || rollDodges)) return [{ ...DODGE_VARIANT_MOVES.backRoll, direction }, base];
  return [base];
}

/** The first candidate the body can play (`has(key)` says whether a clip is bound), or null. */
export function pickDodgeMove(candidates, has) {
  return (candidates || []).find((move) => move && has(move.key)) || null;
}

/**
 * Double-tap detection for the movement keys. A tap is a key press: an auto-repeat never counts, and neither does
 * a press of a key that is still down because its release was missed. The second press of the same key within
 * `windowMs` completes the double tap; a press of another movement key in between cancels it, so A then D never
 * dodges. Times are milliseconds (performance.now()).
 */
export function createDoubleTapDetector({ windowMs = GAME3D_DOUBLE_TAP_MS, keys = ['w', 'a', 's', 'd'] } = {}) {
  const watched = new Set(keys.map((k) => String(k).toLowerCase()));
  const held = new Set();
  let pending = null; // { key, at }
  return {
    keyDown(key, nowMs = 0, { repeat = false } = {}) {
      const k = String(key).toLowerCase();
      if (!watched.has(k) || repeat || held.has(k)) return false;
      held.add(k);
      if (pending && pending.key === k && nowMs >= pending.at && nowMs - pending.at <= windowMs) {
        pending = null;
        return true;
      }
      pending = { key: k, at: nowMs };
      return false;
    },
    keyUp(key) { held.delete(String(key).toLowerCase()); },
    reset() { held.clear(); pending = null; },
    pending: () => (pending ? { ...pending } : null),
    windowMs,
  };
}

// The body yaw that faces where W points on screen (the convention of characterDodgeVector's planar vectors).
// GameWorld3D squares the body up to it before a double-tap dodge, so the keys pick the eight-way slot.
export function screenForwardFacingYaw(screenForward) {
  return Math.atan2(Number(screenForward?.x) || 0, Number(screenForward?.z) || 0);
}
