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
// Seconds of wind-up, cut, hold and recovery. KEEP IN STEP with tools/duelist/blender/cut_grid.py CUT_MODES
// (tests/duelist-cuts.test.mjs compares the clips with these).
export const CUT_TIMING = Object.freeze({
  swift: Object.freeze({ wind: 0.12, cut: 0.12, hold: 0.04, rec: 0.24 }),
  balanced: Object.freeze({ wind: 0.17, cut: 0.15, hold: 0.06, rec: 0.3 }),
  heavy: Object.freeze({ wind: 0.27, cut: 0.19, hold: 0.1, rec: 0.42 }),
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
    cancelInto: ['movement', 'power'], cancelFrom: round(hitEnd + 0.06),
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
  return round(CUT_TIMING[next.cut.mode].wind * LEAD_SHARE * (1 - steps(prev.cut.to, next.cut.from) / 4));
}
/** The stick's way for a form without cuts of its own (twin blades, staff): forward | side | back. */
export const flowDirection = (d) => (!d ? null : d === 'left' || d === 'right' || d === 'side' ? 'side' : d.startsWith('back') ? 'back' : 'forward');
/** The stick's eight ways from how far it points ahead and to the fighter's right (null: a light touch). */
export function stickDirection(ahead, right) {
  if (Math.hypot(ahead, right) < 0.6) return null;
  const sector = Math.round(Math.atan2(right, ahead) / (Math.PI / 4));
  return ['forward', 'forwardRight', 'right', 'backRight', 'back', 'backLeft', 'left', 'forwardLeft'][(sector + 8) % 8];
}
