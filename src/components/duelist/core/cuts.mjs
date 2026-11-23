// The sword's cuts by direction, in three modes (the owner's design of 2026-11-21, built as this game's own).
//
// Eight points round the body where a blade can be held ready: top, bottom, the two sides and the four corners.
// A cut is a line from one point to another, so the point a cut ends at is the point another starts from. The
// way the stick is held as the strike is pressed (relative to the facing) picks the line, and the blade travels
// toward the key: forward cuts straight down the middle, back runs the same line upward, left and right are flat
// cuts, and the four diagonals cut downward (forward) or upward (back) to that side. Standing still is a flat cut
// to the left.
//
// A cut that follows another inside its chain window carries on from where the blade is: the nearer the last
// cut's end is to this one's start, the more of the wind-up it skips (cutLead). Straight back along the line just
// cut skips the most and lands about one and a half times sooner.
//
// Three modes use the same lines: swift is quick and light, heavy winds all the way out, takes longer and hits
// hardest. The clips are made in Blender from the stance alone (tools/duelist/blender/cut_grid.py), one for each
// line in each mode, named as the move is.
export const CUT_POINTS = Object.freeze(['T', 'TR', 'R', 'BR', 'B', 'BL', 'L', 'TL']); // round the body, by its own right
export const CUT_MODES = Object.freeze(['swift', 'balanced', 'heavy']);
export const DEFAULT_MODE = 'balanced';
// A class fights in one mode (the owner's choice, 2026-11-21): the Healer swift, the Warrior heavy. A fighter with
// no class keeps the mode key and starts balanced.
export const CLASS_MODE = Object.freeze({ healer: 'swift', warrior: 'heavy' });
export const modeOf = (f) => CLASS_MODE[f?.classId] || f?.mode || DEFAULT_MODE;
// A cut does not root the fighter: the legs keep going under it, at this share of the running speed.
export const CUT_PACE = Object.freeze({ swift: 0.85, balanced: 0.7, heavy: 0.5 });
// Seconds of wind-up, cut, hold and recovery. KEEP IN STEP with tools/duelist/blender/cut_grid.py CUT_MODES
// (tests/duelist-cuts.test.mjs compares the clips with these).
export const CUT_TIMING = Object.freeze({
  swift: Object.freeze({ wind: 0.11, cut: 0.1, hold: 0.03, rec: 0.18 }),
  balanced: Object.freeze({ wind: 0.13, cut: 0.12, hold: 0.04, rec: 0.24 }),
  heavy: Object.freeze({ wind: 0.21, cut: 0.16, hold: 0.08, rec: 0.34 }),
});
// The blade meets what is in front between these shares of the cut (the clip's contact, the move's active part).
export const CONTACT = Object.freeze([0.3, 0.75]);

// Each line at the balanced mode's strength. The flat cuts reach wide; the cut down the middle is narrow, reaches
// farthest and is hard on a guard; the upward cuts drive back or wear the Veil.
export const CUT_LINES = Object.freeze({
  stand: Object.freeze({ name: 'Stand', from: 'R', to: 'L', damage: 9, range: 2.2, arc: 150 }),
  forward: Object.freeze({ name: 'Down', from: 'T', to: 'B', damage: 12, range: 2.4, arc: 60, stagger: 0.3, shieldMultiplier: 1.15 }),
  back: Object.freeze({ name: 'Up', from: 'B', to: 'T', damage: 9, range: 2.1, arc: 60, knockback: 0.4 }),
  left: Object.freeze({ name: 'Left', from: 'R', to: 'L', damage: 10, range: 2.3, arc: 160 }),
  right: Object.freeze({ name: 'Right', from: 'L', to: 'R', damage: 10, range: 2.3, arc: 160 }),
  forwardLeft: Object.freeze({ name: 'DownLeft', from: 'TR', to: 'BL', damage: 11, range: 2.3, arc: 110 }),
  forwardRight: Object.freeze({ name: 'DownRight', from: 'TL', to: 'BR', damage: 11, range: 2.3, arc: 110 }),
  backLeft: Object.freeze({ name: 'UpLeft', from: 'BR', to: 'TL', damage: 9, range: 2.2, arc: 110, veilMultiplier: 1.15 }),
  backRight: Object.freeze({ name: 'UpRight', from: 'BL', to: 'TR', damage: 9, range: 2.2, arc: 110, veilMultiplier: 1.15 }),
});
export const CUT_DIRECTIONS = Object.freeze(Object.keys(CUT_LINES).filter((d) => d !== 'stand'));
// the line that runs the other way along the same line (the return cut)
export const REVERSE_LINE = Object.freeze({ stand: 'right', left: 'right', right: 'left', forward: 'back', back: 'forward',
  forwardLeft: 'backRight', backRight: 'forwardLeft', forwardRight: 'backLeft', backLeft: 'forwardRight' });
// what a mode does to a line
const MODE = Object.freeze({
  swift: { damage: 0.72, stamina: 5, stagger: 0.8, knockback: 0.6, push: 0, shield: 1 },
  balanced: { damage: 1, stamina: 6, stagger: 1, knockback: 1, push: 0, shield: 1 },
  heavy: { damage: 1.5, stamina: 10, stagger: 1.5, knockback: 1, push: 0.5, shield: 1.2 },
});
const round = (x) => +x.toFixed(4);
const capital = (s) => s[0].toUpperCase() + s.slice(1);

export const cutId = (direction, mode = DEFAULT_MODE) => `swordCut${CUT_LINES[direction || 'stand'].name}${capital(mode)}`;
/** A mode's frame data (seconds): the wind-up and the cut up to contact, the contact, and the rest. */
export function cutFrames(mode) {
  const t = CUT_TIMING[mode];
  return { startup: round(t.wind + CONTACT[0] * t.cut), active: round((CONTACT[1] - CONTACT[0]) * t.cut), recovery: round((1 - CONTACT[1]) * t.cut + t.hold + t.rec) };
}
/** Every cut as a move's spec (core/moves.mjs makes the moves): { id: spec }. */
export const CUT_SPECS = Object.freeze(Object.fromEntries(CUT_MODES.flatMap((mode) => Object.entries(CUT_LINES).map(([direction, line]) => {
  const m = MODE[mode];
  const frames = cutFrames(mode);
  const hitEnd = round(frames.startup + frames.active);
  return [cutId(direction, mode), {
    weapon: 'sword', ...frames, stamina: m.stamina, damage: Math.round(line.damage * m.damage), range: line.range, arc: line.arc,
    knockback: round((line.knockback || 0) * m.knockback + m.push), stagger: round(Math.max(0.2, (line.stagger || 0.25) * m.stagger)),
    shieldMultiplier: round((line.shieldMultiplier || 1) * m.shield), veilMultiplier: line.veilMultiplier || 1,
    // any cut may follow from the end of the contact to just before the stance is back
    chain: { from: round(hitEnd + 0.02), to: round(frames.startup + frames.active + frames.recovery - 0.03) },
    cancelInto: ['movement', 'power'], cancelFrom: round(hitEnd + 0.06), mobile: CUT_PACE[mode],
    cut: Object.freeze({ direction, mode, from: line.from, to: line.to }),
  }];
}))));
export const CUT_IDS = Object.freeze(Object.keys(CUT_SPECS));

const steps = (a, b) => { const d = Math.abs(CUT_POINTS.indexOf(a) - CUT_POINTS.indexOf(b)); return Math.min(d, CUT_POINTS.length - d); }; // 0..4 round the ring
// The share of a wind-up that a cut may skip when the blade is already at its start.
export const LEAD_SHARE = 0.45;
/** Seconds of its wind-up a cut skips when it follows `prev` in a chain (both are moves; 0 unless both are cuts). */
export function cutLead(prev, next) {
  if (!prev?.cut || !next?.cut) return 0;
  const wind = (next.cut.form ? FORM_TIMING[next.cut.form] : CUT_TIMING[next.cut.mode]).wind;
  return round(wind * LEAD_SHARE * (1 - steps(prev.cut.to, next.cut.from) / 4));
}
/** The stick's way for a form without cuts of its own (twin blades, staff): forward | side | back. */
export const flowDirection = (d) => (!d ? null : d === 'left' || d === 'right' || d === 'side' ? 'side' : d.startsWith('back') ? 'back' : 'forward');
/** The stick's eight ways from how far it points ahead and to the fighter's right (null: a light touch). */
export function stickDirection(ahead, right) {
  if (Math.hypot(ahead, right) < 0.6) return null;
  const sector = Math.round(Math.atan2(right, ahead) / (Math.PI / 4));
  return ['forward', 'forwardRight', 'right', 'backRight', 'back', 'backLeft', 'left', 'forwardLeft'][(sector + 8) % 8];
}

// ---- Three moves of their own, reached by a second press hard on the first: within SNAP seconds of a cut's
// start the press does not wait its turn, it turns the cut into one of these, by where the stick points then:
//   the same way as the cut (or nowhere)  -> the whirl: a turn on the spot that cuts all round
//   to one side of it                     -> the cross: a turning cut that sweeps wide
//   back the way it came                  -> the backhand: a cut that carries on round behind the body
// One cooldown covers all three, so they cannot be strung together or mashed out.
export const SNAP = 0.16;
export const SNAP_COOLDOWN = 2.5;
const WAY = Object.freeze({ forward: 0, forwardRight: 45, right: 90, backRight: 135, back: 180, backLeft: 225, left: 270, forwardLeft: 315 });
const SNAP_MODE = Object.freeze({ swift: { time: 0.85, damage: 0.75, stamina: 8 }, balanced: { time: 1, damage: 1, stamina: 10 }, heavy: { time: 1.25, damage: 1.4, stamina: 13 } });
// The backhand's own seconds. KEEP IN STEP with tools/duelist/blender/cut_grid.py BACKHAND_MODES.
export const BACKHAND_TIMING = Object.freeze({
  swift: Object.freeze({ wind: 0.1, cut: 0.13, hold: 0.05, rec: 0.2 }),
  balanced: Object.freeze({ wind: 0.13, cut: 0.16, hold: 0.06, rec: 0.27 }),
  heavy: Object.freeze({ wind: 0.2, cut: 0.21, hold: 0.1, rec: 0.37 }),
});
export const BACKHAND_CONTACT = Object.freeze([0.5, 0.95]); // the blade is past the sword side and going round behind
// Seconds of each of the three in each mode: for the whirl and the cross, the coil, the turn, the hold and the
// recovery; for the backhand, its wind-up, cut, hold and recovery. KEEP IN STEP with tools/duelist/blender/cut_grid.py
// SPIN_MODES and BACKHAND_MODES.
export const SNAP_TIMING = Object.freeze({
  whirl: Object.freeze({ swift: { wind: 0.12, cut: 0.29, hold: 0.03, rec: 0.2 }, balanced: { wind: 0.14, cut: 0.34, hold: 0.04, rec: 0.24 }, heavy: { wind: 0.18, cut: 0.42, hold: 0.05, rec: 0.3 } }),
  cross: Object.freeze({ swift: { wind: 0.1, cut: 0.26, hold: 0.03, rec: 0.19 }, balanced: { wind: 0.12, cut: 0.3, hold: 0.04, rec: 0.22 }, heavy: { wind: 0.15, cut: 0.38, hold: 0.05, rec: 0.27 } }),
  backhand: BACKHAND_TIMING,
});
// The shares of the turn (or the cut) through which the blade is doing its work: the whirl and the cross cut nearly
// all the way round.
export const SNAP_CONTACT = Object.freeze({ whirl: Object.freeze([0.15, 0.9]), cross: Object.freeze([0.2, 0.85]), backhand: BACKHAND_CONTACT });
// Each has a clip of its own in each mode, made in Blender (cut_grid.py). The whirl and the cross are one turn of the
// whole body on one foot with the blade carried round (the whirl to the left with the blade level, the cross to the
// right, rising from low across the body); the backhand's arc is turned to the sword side and behind (degrees to
// the left).
const SNAP_KINDS = Object.freeze({
  whirl: { damage: 12, range: 2.2, arc: 360, knockback: 0.6, stagger: 0.35 },
  cross: { damage: 11, range: 2.3, arc: 260, knockback: 0.9, stagger: 0.4 },
  backhand: { damage: 12, range: 2.2, arc: 200, arcTurn: -120, knockback: 0.5, stagger: 0.35 },
});
export const snapId = (kind, mode = DEFAULT_MODE) => `sword${capital(kind)}${capital(mode)}`;
export const SNAP_SPECS = Object.freeze(Object.fromEntries(CUT_MODES.flatMap((mode) => Object.entries(SNAP_KINDS).map(([kind, k]) => {
  const m = SNAP_MODE[mode];
  const t = SNAP_TIMING[kind][mode];
  const c = SNAP_CONTACT[kind];
  const frames = { startup: round(t.wind + c[0] * t.cut), active: round((c[1] - c[0]) * t.cut), recovery: round((1 - c[1]) * t.cut + t.hold + t.rec) };
  const hitEnd = round(frames.startup + frames.active);
  return [snapId(kind, mode), {
    weapon: 'sword', ...frames, stamina: m.stamina, cooldown: SNAP_COOLDOWN, damage: Math.round(k.damage * m.damage), range: k.range, arc: k.arc,
    ...(k.arcTurn ? { arcTurn: k.arcTurn } : {}), knockback: k.knockback, stagger: k.stagger,
    chain: { from: round(hitEnd + 0.02), to: round(hitEnd + frames.recovery - 0.03) }, cancelInto: ['movement'], cancelFrom: round(hitEnd + 0.1),
    snap: Object.freeze({ kind, mode }),
  }];
}))));
export const SNAP_IDS = Object.freeze(Object.keys(SNAP_SPECS));
/** Which clip a snap move plays (its own, of the same name) and the clip's times for its wind-up, contact and end. */
export function snapMotion(id) {
  const { kind, mode } = SNAP_SPECS[id].snap;
  const t = SNAP_TIMING[kind][mode];
  const c = SNAP_CONTACT[kind];
  return { clip: id, marks: [0, t.wind + c[0] * t.cut, t.wind + c[1] * t.cut, t.wind + t.cut + t.hold + t.rec], settle: false };
}
/** The move a second press turns a cut into: `first` the cut's own way (or 'stand'), `second` the stick's way now. */
export function snapMove(first, second, mode = DEFAULT_MODE) {
  const from = WAY[first] ?? 0; // a cut made standing counts as facing ahead
  const to = second === 'side' ? WAY.left : WAY[second];
  if (to === undefined) return snapId('whirl', mode);
  const turn = Math.abs(((to - from + 540) % 360) - 180); // degrees between the two ways, 0 to 180
  return snapId(turn < 45 ? 'whirl' : turn >= 135 ? 'backhand' : 'cross', mode);
}

// ---- The twin blades and the staff cut the same nine lines, each in one mode of its own: the blades rapid and
// light and hard on the Veil (the second blade cuts the line in a mirror, a beat behind), the staff long and wide.
// Seconds: KEEP IN STEP with tools/duelist/blender/cut_grid.py FORM_MODES.
export const FORM_TIMING = Object.freeze({
  dualBlades: Object.freeze({ wind: 0.1, cut: 0.1, hold: 0.03, rec: 0.2 }),
  staff: Object.freeze({ wind: 0.13, cut: 0.13, hold: 0.05, rec: 0.25 }),
});
const FORM = Object.freeze({
  dualBlades: { prefix: 'bladesCut', damage: 0.62, stamina: 4, range: -0.25, arc: 0, veil: 1.35, stagger: 0.8, pace: 0.85 },
  staff: { prefix: 'staffCut', damage: 0.9, stamina: 6, range: 0.3, arc: 20, veil: 1, stagger: 1, pace: 0.7 },
});
export const formCutId = (weapon, direction) => `${FORM[weapon].prefix}${CUT_LINES[direction || 'stand'].name}`;
export const FORM_CUT_SPECS = Object.freeze(Object.fromEntries(Object.entries(FORM).flatMap(([weapon, k]) => Object.entries(CUT_LINES).map(([direction, line]) => {
  const t = FORM_TIMING[weapon];
  const frames = { startup: round(t.wind + CONTACT[0] * t.cut), active: round((CONTACT[1] - CONTACT[0]) * t.cut), recovery: round((1 - CONTACT[1]) * t.cut + t.hold + t.rec) };
  const hitEnd = round(frames.startup + frames.active);
  return [formCutId(weapon, direction), {
    weapon, ...frames, stamina: k.stamina, damage: Math.max(3, Math.round(line.damage * k.damage)), range: round(line.range + k.range), arc: Math.min(360, line.arc + k.arc),
    knockback: line.knockback || 0, stagger: round(Math.max(0.2, (line.stagger || 0.25) * k.stagger)),
    shieldMultiplier: line.shieldMultiplier || 1, veilMultiplier: round((line.veilMultiplier || 1) * k.veil),
    chain: { from: round(hitEnd + 0.02), to: round(hitEnd + frames.recovery - 0.03) }, cancelInto: ['movement', 'power'], cancelFrom: round(hitEnd + 0.06),
    mobile: k.pace, cut: Object.freeze({ direction, form: weapon, from: line.from, to: line.to }),
  }];
}))));
export const FORM_CUT_IDS = Object.freeze(Object.keys(FORM_CUT_SPECS));
/** A cut's clip times (seconds): its start, the contact's start and end, and its end. Sword and forms alike. */
export function cutMarks(spec) {
  const t = spec.cut.form ? FORM_TIMING[spec.cut.form] : CUT_TIMING[spec.cut.mode];
  return [0, t.wind + CONTACT[0] * t.cut, t.wind + CONTACT[1] * t.cut, t.wind + t.cut + t.hold + t.rec];
}
// What a second press hard on the first turns a cut into with these forms: moves they already had (the blades'
// turn in the air, wide sweep and turn; the staff's turning sweep, wide swing and leap).
const FORM_SNAPS = Object.freeze({
  dualBlades: Object.freeze({ whirl: 'bladesLight4', cross: 'bladesSweep', backhand: 'bladesTurn' }),
  staff: Object.freeze({ whirl: 'staffLight2', cross: 'staffSweep', backhand: 'staffLeap' }),
});
/** The moves that share the one cooldown, for a weapon. */
export const snapSet = (weapon) => (FORM_SNAPS[weapon] ? Object.values(FORM_SNAPS[weapon]) : SNAP_IDS);
/** snapMove for any weapon that cuts by direction. */
export function snapFor(weapon, first, second, mode = DEFAULT_MODE) {
  const id = snapMove(first, second, mode);
  return FORM_SNAPS[weapon] ? FORM_SNAPS[weapon][SNAP_SPECS[id].snap.kind] : id;
}
