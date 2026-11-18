// What each sword skill looks like: four versions of the single hit and four
// versions of the three-hit multi, every one a different set of cuts, built
// from the katana techniques (katanaTechniques.mjs: the nine strikes and the
// moves captured from the owner's dojo video).
//
// A skill hit is shown the moment it is cast, so a skill's cut starts close
// to its strike: a long wind-up is trimmed away (`lead`). The three hits of a
// multi are three clips, one per hit, because the game sends each hit of a
// skill on its own.
//
// Presentation only. Damage, cooldowns, hit timing and unlocks stay where
// they are (skillRegistry, duelComboPolicy); this file only says which cuts a
// skill plays. Pure data: nothing here draws or imports the renderer.
import { katanaBakerMove } from './katanaTechniques.mjs';

/** Single hits, level 1 to 4. `cut`: a strike number or a captured move id. */
export const SWORD_SINGLE_HITS = Object.freeze([
  { level: 1, id: 'straightCut', name: 'Straight cut', cut: 1, lead: 0.15,
    looks: 'Blade over the head, straight down the middle.' },
  { level: 2, id: 'levelSweep', name: 'Level sweep', cut: 'dojoSweep', lead: 0.4,
    looks: 'A wide level sweep from the left hip across the body, hips turning with it.' },
  { level: 3, id: 'steppingCut', name: 'Stepping overhead cut', cut: 'dojoLeapingCut', lead: 0.45,
    looks: 'A step to the side on one foot and an overhead cut that ends with the point at the ground.' },
  { level: 4, id: 'spinningCut', name: 'Spinning overhead cut', cut: 'dojoSpinningFinish', lead: 0.5,
    looks: 'The end of a full turn, blade carried round overhead into a last cut in a wide stance.' },
].map((skill) => Object.freeze(skill)));

/** Three-hit multis, level 1 to 4. `spacing`: seconds between hits the cuts were chosen for. */
export const SWORD_THREE_HITS = Object.freeze([
  { level: 1, id: 'dojoFlow', name: 'Dojo flow', cuts: ['dojoDiagonal', 'dojoReturn', 'dojoOverhead'], lead: 0.45, spacing: 0.5,
    looks: 'A diagonal cut from the high guard, the returning cut across, then up over the head and down.' },
  { level: 2, id: 'risingGate', name: 'Rising gate', cuts: [7, 2, 8], lead: 0.15, spacing: 0.17,
    looks: 'Up from the right hip, down the same line, straight up on the right. Fast and upright.' },
  { level: 3, id: 'sideToSide', name: 'Side to side', cuts: [4, 5, 4], lead: 0.15, spacing: 0.22,
    looks: 'Three level cuts at the waist: across, back across, and across again.' },
  { level: 4, id: 'kneelingStorm', name: 'Kneeling storm', cuts: ['dojoSpinToKnee', 'dojoKneelingCut', 'dojoRisingCut'], lead: 0.45, spacing: 0.5,
    looks: 'A turn that drops to one knee, a cut from the knee, then a cut on the way back up.' },
].map((skill) => Object.freeze(skill)));

/**
 * Which game skill plays which version. The sword's single-hit skills, weakest to strongest: Heavy Strike and
 * Blade Art 2, Blade Art 4, Blade Art 6, Blade Art 9 (divine). Its three-hit skills: Triple Slash, Blade
 * Art 5, Blade Art 10 (divine). There is no fourth three-hit skill yet, so the level 4 multi is bound to none.
 */
export const SWORD_SKILL_LOOKS = Object.freeze({
  sword_heavy_strike: Object.freeze({ family: 'single', level: 1 }),
  axe_offensive_skill_2: Object.freeze({ family: 'single', level: 1 }),
  axe_offensive_skill_4: Object.freeze({ family: 'single', level: 2 }),
  axe_offensive_skill_6: Object.freeze({ family: 'single', level: 3 }),
  axe_offensive_skill_9: Object.freeze({ family: 'single', level: 4 }),
  sword_triple_slash: Object.freeze({ family: 'multi', level: 1 }),
  axe_offensive_skill_5: Object.freeze({ family: 'multi', level: 2 }),
  axe_offensive_skill_10: Object.freeze({ family: 'multi', level: 3 }),
});

/**
 * A multi that flows into a single hit: the single starts in (or close to) the pose the multi's last cut
 * ends in, so casting the single right after the multi reads as one four-cut sequence.
 */
export const SWORD_SKILL_CHAINS = Object.freeze([
  { multi: 1, single: 2, why: 'The level sweep is the very next cut after the overhead cut in the dojo capture.' },
  { multi: 2, single: 1, why: 'The last rising cut ends with the blade overhead, where the straight cut begins.' },
  { multi: 4, single: 3, why: 'The stepping cut follows the rising cut in the dojo capture.' },
  { multi: 1, single: 3, why: 'The overhead cut ends low on the left, where the stepping cut starts.' },
].map((chain) => Object.freeze(chain)));

const singleState = (level) => 'swordSkillSingle' + level;
const multiState = (level, hit) => 'swordSkillMulti' + level + 'Hit' + (hit + 1);

/** Every clip name a sword skill can play (the controller treats them like its combo states). */
export const SWORD_SKILL_STATE_NAMES = Object.freeze([
  ...SWORD_SINGLE_HITS.map((s) => singleState(s.level)),
  ...SWORD_THREE_HITS.flatMap((m) => m.cuts.map((_, hit) => multiState(m.level, hit))),
]);

/** The clip a skill's hit plays, or null when the skill has no look of its own (the caller keeps the combo clip). */
export function swordSkillState(skillId, hitIndex = 0) {
  const look = typeof skillId === 'string' && Object.prototype.hasOwnProperty.call(SWORD_SKILL_LOOKS, skillId) ? SWORD_SKILL_LOOKS[skillId] : null;
  if (!look) return null;
  if (look.family === 'single') return singleState(look.level);
  const hits = SWORD_THREE_HITS.find((m) => m.level === look.level)?.cuts.length || 3;
  const hit = Math.abs(Math.trunc(Number(hitIndex) || 0)) % hits;
  return multiState(look.level, hit);
}

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
 * Every sword skill clip as a baker move (weaponComboClips.js). twoHanded: both hands on the hilt (long
 * blades); otherwise the same cuts with one hand. Each move carries the hit it is (`index`) within its skill.
 */
export function swordSkillMoves({ twoHanded = true } = {}) {
  const grip = twoHanded ? (move) => move : oneHanded;
  const moves = [];
  for (const single of SWORD_SINGLE_HITS) {
    const move = katanaBakerMove(single.cut, singleState(single.level));
    if (move) moves.push({ ...grip(standingAt(trimmed(move, single.lead))), index: 0, skillLook: 'single' + single.level });
  }
  for (const multi of SWORD_THREE_HITS) {
    // each hit starts where the hit before it stands when the next one arrives (`spacing` seconds in)
    let stands = [0, 0];
    multi.cuts.forEach((cut, hit) => {
      const whole = katanaBakerMove(cut, multiState(multi.level, hit));
      if (!whole) return;
      const move = standingAt(trimmed(whole, multi.lead), stands);
      stands = standsAfter(move, multi.spacing);
      // the next hit arrives `spacing` seconds later and must be free to start then
      const cancel = hit < multi.cuts.length - 1 ? Math.min(move.cancel, Math.max(move.hit + 0.01, multi.spacing - 0.02)) : move.cancel;
      moves.push({ ...grip(move), cancel: Math.round(cancel * 1000) / 1000, index: hit, skillLook: 'multi' + multi.level });
    });
  }
  return moves;
}

/** Long two-handed blades hold the hilt with both hands; every other sword swings these with one. */
export function swordSkillMovesForWeapon(weapon) {
  const text = String(weapon?.cls || weapon?.class || '') + ' ' + String(weapon?.id || '');
  return swordSkillMoves({ twoHanded: /greatsword|odachi|katana|tachi/i.test(text) });
}
