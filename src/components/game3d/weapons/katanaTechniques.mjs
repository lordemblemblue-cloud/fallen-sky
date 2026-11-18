// The nine basic katana strikes, and three-hit combos built from them.
//
// Source: the owner's reference video "9 Basic Katana Strikes" (kenjutsu
// training, 60 frames a second, one strike about every 1.06 s). Each strike
// here follows that video's numbered strike: the same direction of cut, the
// same order of chamber, cut and follow-through. The game plays them faster
// than a training drill, like its other attacks.
//
// The moves are written in the combo baker's own key format
// (weaponComboClips.js), so they are solved on each character's own skeleton
// and fit every body and blade length. Both hands are on the hilt: the right
// hand carries the blade, the left holds the hilt below it.
//
// Directions are the swordsman's own: right is the swordsman's right hand
// side. (In the video the swordsman faces the camera, so the picture is
// mirrored.) Pure data: nothing here draws or imports the renderer.
//
// Captured moves (katanaCapturedMoves.mjs) are the second source: cuts
// measured from the owner's Rokoko capture of the "Katana swords training
// samurai" video, in the same key format, with the swordsman's own footwork,
// hips and timing. Combos can be built from either kind.
import { KATANA_CAPTURED_MOVES } from './katanaCapturedMoves.mjs';

const TWO_HANDS = Object.freeze({ hilt: 0.14 });
// Middle guard: hands in front of the belly, point at the opponent's throat.
const READY = Object.freeze({ spine: [0, 5, 0], hips: [0.04, 0], r: { arm: [0.34, -0.34, -0.15], blade: [0.74, 0.66, 0] }, l: TWO_HANDS });
const key = (t, spine, hips, arm, blade) => ({ t, spine, hips, r: { arm, blade }, l: TWO_HANDS });

/**
 * cut: where the point of the blade travels during the cut, seen from behind
 *   the swordsman: [right, up] of the start and the end, each -1, 0 or 1.
 * video: the seconds of the reference video that show this strike.
 * hit / sweep / cancel: seconds into the clip (the strike, the cutting arc for
 *   the blade trail, and when the next hit may start).
 */
export const KATANA_STRIKES = Object.freeze([
  { number: 1, id: 'straightDown', name: 'Straight down', cut: { from: [0, 1], to: [0, -1] }, video: [0.0, 1.4],
    hit: 0.33, sweep: [0.18, 0.46], cancel: 0.5, keys: [
      { t: 0, ...READY },
      key(0.18, [0, -10, 0], [0.01, 0], [0.06, 0.44, -0.17], [-0.62, 0.78, 0]),      // raised over the head
      key(0.33, [0, 18, 0], [0.09, 0], [0.52, -0.1, -0.17], [0.88, -0.46, 0]),       // down through the centre
      key(0.46, [0, 24, 0], [0.12, 0], [0.46, -0.36, -0.17], [0.9, -0.42, 0]),
      { t: 0.78, ...READY },
    ] },
  { number: 2, id: 'diagonalDownFromLeft', name: 'Diagonal down from the left', cut: { from: [-1, 1], to: [1, -1] }, video: [1.5, 2.5],
    hit: 0.33, sweep: [0.18, 0.46], cancel: 0.5, keys: [
      { t: 0, ...READY },
      key(0.18, [-24, -6, -4], [0.02, -8], [0.1, 0.36, -0.4], [-0.45, 0.75, -0.48]), // over the left shoulder
      key(0.33, [10, 12, 2], [0.07, 4], [0.5, -0.06, -0.14], [0.94, -0.12, -0.3]),
      key(0.46, [26, 16, 4], [0.1, 12], [0.26, -0.42, 0.06], [0.55, -0.55, 0.62]),   // down to the right hip
      { t: 0.78, ...READY },
    ] },
  { number: 3, id: 'diagonalDownFromRight', name: 'Diagonal down from the right', cut: { from: [1, 1], to: [-1, -1] }, video: [2.6, 3.5],
    hit: 0.33, sweep: [0.18, 0.46], cancel: 0.5, keys: [
      { t: 0, ...READY },
      key(0.18, [24, -6, 4], [0.02, 8], [0.06, 0.4, 0.04], [-0.45, 0.75, 0.48]),     // over the right shoulder
      key(0.33, [-10, 12, -2], [0.07, -4], [0.5, -0.06, -0.18], [0.94, -0.12, 0.3]),
      key(0.46, [-26, 16, -4], [0.1, -12], [0.3, -0.42, -0.4], [0.55, -0.55, -0.62]), // down to the left hip
      { t: 0.78, ...READY },
    ] },
  { number: 4, id: 'acrossLeftToRight', name: 'Across, left to right', cut: { from: [-1, 0], to: [1, 0] }, video: [3.5, 4.6],
    hit: 0.31, sweep: [0.17, 0.44], cancel: 0.46, keys: [
      { t: 0, ...READY },
      key(0.17, [-34, 4, -2], [0.05, -12], [0.24, -0.1, -0.46], [-0.35, 0.12, -0.93]), // drawn back on the left
      key(0.31, [6, 6, 0], [0.06, 2], [0.52, -0.12, -0.16], [0.98, 0.02, -0.18]),
      key(0.44, [36, 6, 2], [0.06, 14], [0.28, -0.12, 0.08], [-0.2, 0.06, 0.98]),      // carried through to the right
      { t: 0.72, ...READY },
    ] },
  { number: 5, id: 'acrossRightToLeft', name: 'Across, right to left', cut: { from: [1, 0], to: [-1, 0] }, video: [4.6, 5.6],
    hit: 0.31, sweep: [0.17, 0.44], cancel: 0.46, keys: [
      { t: 0, ...READY },
      key(0.17, [34, 4, 2], [0.05, 12], [0.2, -0.1, 0.1], [-0.35, 0.12, 0.93]),
      key(0.31, [-6, 6, 0], [0.06, -2], [0.52, -0.12, -0.18], [0.98, 0.02, 0.18]),
      key(0.44, [-36, 6, -2], [0.06, -14], [0.26, -0.12, -0.46], [-0.2, 0.06, -0.98]),
      { t: 0.72, ...READY },
    ] },
  { number: 6, id: 'risingToRight', name: 'Rising, low left to high right', cut: { from: [-1, -1], to: [1, 1] }, video: [5.6, 6.6],
    hit: 0.3, sweep: [0.16, 0.43], cancel: 0.46, keys: [
      { t: 0, ...READY },
      key(0.16, [-30, 14, -5], [0.09, -12], [0.26, -0.42, -0.42], [-0.3, -0.6, -0.74]), // low at the left hip, point trailing
      key(0.3, [8, 4, 0], [0.06, 4], [0.5, -0.1, -0.12], [0.9, 0.3, 0.15]),
      key(0.43, [30, -8, 5], [0.03, 12], [0.16, 0.36, 0.08], [-0.25, 0.82, 0.5]),       // high on the right
      { t: 0.74, ...READY },
    ] },
  { number: 7, id: 'risingToLeft', name: 'Rising, low right to high left', cut: { from: [1, -1], to: [-1, 1] }, video: [6.6, 7.5],
    hit: 0.3, sweep: [0.16, 0.43], cancel: 0.46, keys: [
      { t: 0, ...READY },
      key(0.16, [30, 14, 5], [0.09, 12], [0.22, -0.42, 0.08], [-0.3, -0.6, 0.74]),
      key(0.3, [-8, 4, 0], [0.06, -4], [0.5, -0.1, -0.2], [0.9, 0.3, -0.15]),
      key(0.43, [-30, -8, -5], [0.03, -12], [0.2, 0.36, -0.4], [-0.25, 0.82, -0.5]),
      { t: 0.74, ...READY },
    ] },
  { number: 8, id: 'straightUpRight', name: 'Straight up, on the right', cut: { from: [1, -1], to: [0, 1] }, video: [7.5, 8.5],
    hit: 0.31, sweep: [0.16, 0.45], cancel: 0.48, keys: [
      { t: 0, ...READY },
      key(0.16, [14, 12, 3], [0.08, 8], [0.18, -0.42, 0.06], [-0.55, -0.6, 0.35]),     // low beside the right hip
      key(0.31, [4, 2, 0], [0.05, 2], [0.52, 0.02, -0.08], [0.96, 0.26, 0.06]),
      key(0.45, [0, -10, 0], [0.01, 0], [0.08, 0.44, -0.12], [-0.5, 0.86, 0.08]),      // up over the head
      { t: 0.78, ...READY },
    ] },
  { number: 9, id: 'straightUpLeft', name: 'Straight up, on the left', cut: { from: [-1, -1], to: [0, 1] }, video: [8.5, 9.6],
    hit: 0.31, sweep: [0.16, 0.45], cancel: 0.48, keys: [
      { t: 0, ...READY },
      key(0.16, [-14, 12, -3], [0.08, -8], [0.24, -0.42, -0.4], [-0.55, -0.6, -0.35]),
      key(0.31, [-4, 2, 0], [0.05, -2], [0.52, 0.02, -0.24], [0.96, 0.26, -0.06]),
      key(0.45, [0, -10, 0], [0.01, 0], [0.08, 0.44, -0.2], [-0.5, 0.86, -0.08]),
      { t: 0.78, ...READY },
    ] },
].map((strike) => Object.freeze(strike)));

export const katanaStrike = (number) => KATANA_STRIKES.find((strike) => strike.number === number) || null;

/**
 * Three-hit combos. Each hit starts where the one before it ended, so the
 * blade never has to travel back before it can cut again. A combo is built
 * either from the nine strikes (`strikes`, by number) or from captured moves
 * (`moves`, by id) that follow each other in the capture.
 */
export const KATANA_COMBOS = Object.freeze([
  { id: 'dojoFlow', name: 'Dojo flow', source: 'capture', moves: ['dojoDiagonal', 'dojoReturn', 'dojoOverhead'],
    reads: 'A diagonal cut from the high guard, the returning cut across, then up over the head and down.' },
  { id: 'kneelingStorm', name: 'Kneeling storm', source: 'capture', moves: ['dojoSpinToKnee', 'dojoKneelingCut', 'dojoRisingCut'],
    reads: 'A full turn that drops to one knee, a cut from the knee, then a cut on the way back up.' },
  { id: 'leapingFinish', name: 'Leaping finish', source: 'capture', moves: ['dojoReturn', 'dojoLeapingCut', 'dojoSpinningFinish'],
    reads: 'A cut across, a stepping overhead cut, then a full turn into a last overhead cut.' },
  { id: 'kesaFlow', name: 'Kesa flow', source: 'strikes', strikes: [3, 9, 1],
    reads: 'Down from the right shoulder, straight back up on the left, then straight down.' },
  { id: 'crossingCuts', name: 'Crossing cuts', source: 'strikes', strikes: [2, 8, 3],
    reads: 'Down to the right hip, straight up on the right, then down across to the left hip: an X.' },
  { id: 'risingGate', name: 'Rising gate', source: 'strikes', strikes: [7, 2, 8],
    reads: 'Up from the right hip, down the same line, then straight up on the right.' },
  { id: 'sideToSide', name: 'Side to side', source: 'strikes', strikes: [4, 5, 4],
    reads: 'Across at the waist, back across, and across again.' },
].map((combo) => Object.freeze(combo)));
export const KATANA_DEFAULT_COMBO = 'dojoFlow';
export const katanaCombo = (id) => KATANA_COMBOS.find((combo) => combo.id === id) || null;
export const katanaCapturedMove = (id) => KATANA_CAPTURED_MOVES.find((move) => move.id === id) || null;

const strikeMove = (strike, name) => ({ name, technique: strike.id, hit: strike.hit, sweep: strike.sweep, cancel: strike.cancel, keys: strike.keys });
// A captured move's hips and feet are measured from where its group began in the capture. `from` is where
// the body already stands when the move starts ([forward, right] from the character's own spot): the move
// is slid so it starts there, and so it can open a combo or follow a move it did not follow in the capture.
function capturedMove(move, name, from = [0, 0]) {
  const start = move.keys[0].hips;
  const slide = [from[0] - (start[2] || 0), from[1] - (start[3] || 0)];
  const round = (v) => Math.round(v * 1000) / 1000;
  const keys = move.keys.map((key) => ({ ...key,
    hips: [key.hips[0], key.hips[1], round((key.hips[2] || 0) + slide[0]), round((key.hips[3] || 0) + slide[1])],
    feet: Object.fromEntries(Object.entries(key.feet).map(([side, foot]) => [side, [round(foot[0] + slide[0]), round(foot[1] + slide[1]), ...foot.slice(2)]])) }));
  return { name, technique: move.id, hit: move.hit, sweep: move.sweep, cancel: move.cancel, keys,
    ease: move.ease, steps: move.steps, armLength: move.armLength };
}

/**
 * One technique as a baker move with the clip name asked for: a strike by its number (1..9) or a captured
 * move by its id. `from`: where the body already stands when a captured move starts.
 */
export function katanaBakerMove(technique, name, from = [0, 0]) {
  const strike = typeof technique === 'number' ? katanaStrike(technique) : null;
  if (strike) return strikeMove(strike, name);
  const captured = typeof technique === 'string' ? katanaCapturedMove(technique) : null;
  return captured ? capturedMove(captured, name, from) : null;
}

/** The nine strikes as baker moves, each its own clip ("katanaStrike1" .. "katanaStrike9"). */
export function katanaStrikeMoves() {
  return KATANA_STRIKES.map((strike) => strikeMove(strike, 'katanaStrike' + strike.number));
}

/** Every captured move as a baker move, each its own clip (named by its id). */
export function katanaCapturedMoves() {
  return KATANA_CAPTURED_MOVES.map((move) => capturedMove(move, move.id));
}

/**
 * A combo as three baker moves named for the controller's three sword states,
 * so it plays through the game's existing three-hit chain.
 */
export function katanaComboMoves(comboId = KATANA_DEFAULT_COMBO, stateNames = ['swordCombo1', 'swordCombo2', 'swordCombo3']) {
  const combo = katanaCombo(comboId);
  const parts = combo?.moves ? combo.moves.map(katanaCapturedMove) : combo?.strikes?.map(katanaStrike);
  if (!parts || parts.length !== stateNames.length || parts.some((part) => !part)) return null;
  if (!combo.moves) return parts.map((part, i) => strikeMove(part, stateNames[i]));
  let stands = [0, 0];
  return parts.map((part, i) => {
    const move = capturedMove(part, stateNames[i], stands);
    stands = move.keys.at(-1).hips.slice(2, 4);
    return move;
  });
}

/**
 * Which moves a held weapon swings. A long two-handed blade (the odachi, any
 * katana) uses the katana combo; every other sword keeps the game's own
 * one-handed three hits (null).
 */
export function swordMovesForWeapon(weapon, comboId = KATANA_DEFAULT_COMBO) {
  const text = String(weapon?.cls || weapon?.class || '') + ' ' + String(weapon?.id || '');
  return /greatsword|odachi|katana|tachi/i.test(text) ? katanaComboMoves(comboId) : null;
}
