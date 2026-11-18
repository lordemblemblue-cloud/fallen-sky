// What the sword's two skills look like at each of their four mastery tiers:
// four versions of the single hit (Heavy Strike) and four versions of the
// three-hit (Triple Slash), every one a different set of cuts, built from the
// katana techniques (katanaTechniques.mjs: the nine strikes and the moves
// captured from the owner's dojo video).
//
// The tier is chosen from the skill's mastery level (swordSkillComboKind in
// weaponComboClips.js: levels 1-3, 4-6, 7-9 and 10), and each tier has its own
// clip names there (swordSingleTier1..4, swordTripleTier1..4 Hit1..3). This
// file supplies the cuts those clips play; the binder bakes them for the
// weapon in hand.
//
// A skill hit is shown the moment it is cast, so a skill's cut starts close
// to its strike: a long wind-up is trimmed away (`lead`). The three hits of
// Triple Slash are three clips, one per hit, half a second apart.
//
// Presentation only. Damage, cooldowns, hit timing and unlocks stay where
// they are. Pure data: nothing here draws or imports the renderer.
import { katanaBakerMove } from './katanaTechniques.mjs';

/** Seconds between the hits of Triple Slash (skillRegistry hit_delay; the server's offsets are 0, 500, 1000 ms). */
export const SWORD_THREE_HIT_SPACING = 0.5;

/** Heavy Strike, mastery tier 1 to 4. `cut`: a strike number or a captured move id. */
export const SWORD_SINGLE_HITS = Object.freeze([
  { tier: 1, id: 'levelSweep', name: 'Level sweep', cut: 'dojoSweep', lead: 0.4,
    looks: 'A wide level sweep from the left hip across the body, hips turning with it.' },
  { tier: 2, id: 'straightCut', name: 'Straight cut', cut: 1, lead: 0.15,
    looks: 'Blade over the head, straight down the middle.' },
  { tier: 3, id: 'steppingCut', name: 'Stepping overhead cut', cut: 'dojoLeapingCut', lead: 0.45,
    looks: 'A step to the side on one foot and an overhead cut that ends with the point at the ground.' },
  { tier: 4, id: 'spinningCut', name: 'Spinning overhead cut', cut: 'dojoSpinningFinish', lead: 0.5,
    looks: 'The end of a full turn, blade carried round overhead into a last cut in a wide stance.' },
].map((skill) => Object.freeze(skill)));

/** Triple Slash, mastery tier 1 to 4. */
export const SWORD_THREE_HITS = Object.freeze([
  { tier: 1, id: 'dojoFlow', name: 'Dojo flow', cuts: ['dojoDiagonal', 'dojoReturn', 'dojoOverhead'], lead: 0.45,
    looks: 'A diagonal cut from the high guard, the returning cut across, then up over the head and down.' },
  { tier: 2, id: 'risingGate', name: 'Rising gate', cuts: [7, 2, 8], lead: 0.35,
    looks: 'Up from the right hip, down the same line, straight up on the right. Upright and quick.' },
  { tier: 3, id: 'sideToSide', name: 'Side to side', cuts: [4, 5, 4], lead: 0.35,
    looks: 'Three level cuts at the waist: across, back across, and across again.' },
  { tier: 4, id: 'kneelingStorm', name: 'Kneeling storm', cuts: ['dojoSpinToKnee', 'dojoKneelingCut', 'dojoRisingCut'], lead: 0.45,
    looks: 'A turn that drops to one knee, a cut from the knee, then a cut on the way back up.' },
].map((skill) => Object.freeze(skill)));

/**
 * Triple Slash into Heavy Strike: the single starts in (or close to) the pose the three-hit's last cut ends
 * in, so casting Heavy Strike right after Triple Slash reads as one four-cut sequence. Any other pair of
 * tiers still plays; the body blends between the two poses.
 */
export const SWORD_SKILL_CHAINS = Object.freeze([
  { triple: 1, single: 1, why: 'The level sweep is the very next cut after the overhead cut in the dojo capture.' },
  { triple: 2, single: 2, why: 'The last rising cut ends with the blade overhead, where the straight cut begins.' },
  { triple: 4, single: 3, why: 'The stepping cut follows the rising cut in the dojo capture.' },
].map((chain) => Object.freeze(chain)));

/** Clip names, the same ones weaponComboClips.js gives the tiers. */
export const swordSingleTierState = (tier) => 'swordSingleTier' + tier;
export const swordTripleTierState = (tier, hit) => 'swordTripleTier' + tier + 'Hit' + (hit + 1);
export const SWORD_SKILL_TIER_STATE_NAMES = Object.freeze([
  ...SWORD_SINGLE_HITS.map((s) => swordSingleTierState(s.tier)),
  ...SWORD_THREE_HITS.flatMap((m) => m.cuts.map((_, hit) => swordTripleTierState(m.tier, hit))),
]);

// Start a move `lead` seconds before its strike: drop the keys before that and count time from there.
function trimmed(move, lead) {
  if (!(lead > 0) || move.hit <= lead + 1e-6) return move;
  const first = move.keys.findIndex((key) => key.t >= move.hit - lead - 1e-6);
  if (first <= 0) return move;
  const start = move.keys[first].t;
  const shift = (t) => Math.round((t - start) * 10000) / 10000;
  const keys = move.keys.slice(first).map((key) => ({ ...key, t: shift(key.t) }));
  const end = keys.at(-1).t;
  return { ...move, keys, hit: shift(move.hit), cancel: Math.min(end, shift(move.cancel)),
    sweep: move.sweep ? [Math.max(0, shift(move.sweep[0])), Math.min(end, shift(move.sweep[1]))] : null };
}

// Slide a captured move so its first key stands at `from` ([forward, right] from the character's own spot).
// A move keyed by hand has no travelling hips or placed feet and is returned as it is.
function standingAt(move, from = [0, 0]) {
  const start = move.keys[0];
  if (!(start.hips?.length > 2) || !start.feet) return move;
  const slide = [from[0] - start.hips[2], from[1] - start.hips[3]];
  const round = (v) => Math.round(v * 1000) / 1000;
  return { ...move, keys: move.keys.map((key) => ({ ...key,
    hips: [key.hips[0], key.hips[1], round(key.hips[2] + slide[0]), round(key.hips[3] + slide[1])],
    feet: Object.fromEntries(Object.entries(key.feet).map(([side, foot]) => [side, [round(foot[0] + slide[0]), round(foot[1] + slide[1]), ...foot.slice(2)]])) })) };
}
// Where the hips stand `seconds` into a move (the key at or just before that time).
function standsAfter(move, seconds) {
  const key = [...move.keys].reverse().find((k) => k.t <= seconds + 1e-6) || move.keys[0];
  return key.hips?.length > 2 ? key.hips.slice(2, 4) : [0, 0];
}

// A short sword is swung with one hand: the other hand guards in front of the hip instead of holding the hilt.
const FREE_HAND = Object.freeze({ arm: [0.24, -0.3, -0.08], pole: [-0.25, -0.4, 0.45] });
const oneHanded = (move) => ({ ...move, keys: move.keys.map((key) => ({ ...key, l: FREE_HAND })) });

/**
 * Every tier clip of the two sword skills as a baker move (weaponComboClips.js). twoHanded: both hands on
 * the hilt (long blades); otherwise the same cuts with one hand. `index`: which hit of its skill a move is.
 */
export function swordSkillTierMoves({ twoHanded = true } = {}) {
  const grip = twoHanded ? (move) => move : oneHanded;
  const moves = [];
  for (const single of SWORD_SINGLE_HITS) {
    const move = katanaBakerMove(single.cut, swordSingleTierState(single.tier));
    if (move) moves.push({ ...grip(standingAt(trimmed(move, single.lead))), index: 0, skillLook: single.id });
  }
  for (const triple of SWORD_THREE_HITS) {
    // each hit starts where the hit before it stands when the next one arrives
    let stands = [0, 0];
    triple.cuts.forEach((cut, hit) => {
      const whole = katanaBakerMove(cut, swordTripleTierState(triple.tier, hit));
      if (!whole) return;
      const move = standingAt(trimmed(whole, triple.lead), stands);
      stands = standsAfter(move, SWORD_THREE_HIT_SPACING);
      // the next hit arrives half a second later and must be free to start then
      const cancel = hit < triple.cuts.length - 1 ? Math.min(move.cancel, Math.max(move.hit + 0.01, SWORD_THREE_HIT_SPACING - 0.02)) : move.cancel;
      moves.push({ ...grip(move), cancel: Math.round(cancel * 1000) / 1000, index: hit, skillLook: triple.id });
    });
  }
  return moves;
}

/** Long two-handed blades hold the hilt with both hands; every other sword swings these with one. */
export function swordSkillTierMovesForWeapon(weapon) {
  const text = String(weapon?.cls || weapon?.class || '') + ' ' + String(weapon?.id || '');
  return swordSkillTierMoves({ twoHanded: /greatsword|odachi|katana|tachi/i.test(text) });
}
