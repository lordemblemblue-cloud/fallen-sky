// Every action a duelist can take, as frame data (seconds). The rules core plays these; the renderer picks
// the clip with the same id. Numbers are playtest proposals.
//
//   startup / active / recovery: the three phases; a hit lands in the active phase (hitAt: offsets inside
//     it for multi-hit moves).
//   stamina / will: paid when the move starts. cooldown: before the same move may start again.
//   damage, range (m), arc (deg), knockback (m: how far the hit drives the body; negative pulls it in),
//     stagger (s): what a landed hit does.
//   shieldMultiplier: how hard it hits shields and armor; veilMultiplier: how much Will it costs to stop.
//   chain: { next, from, to }: pressing the same button between from and to (seconds into the move) starts
//     `next` without waiting for the recovery (light strikes: FLOW below says what follows, by direction).
//   link (on the action, not here): how many strikes of a chain have been made, this one included.
//   cancelInto + cancelFrom: kinds of moves that may interrupt this one from that time on (roll into push).
//   iframes: [from, to] during which nothing can touch the fighter.
//   rootMotion: metres a roll or dash carries the body over its active phase (strikes and powers move the body
//     by their clip's own travel instead: moveMotion.mjs).
//   channel: the active phase lasts while the button is held, up to `active` seconds, paying willPerSec.

import { CUT_SPECS, CUT_IDS, CUT_MODES, CUT_DIRECTIONS, cutId } from './cuts.mjs';

const move = (spec) => Object.freeze({
  kind: 'attack', weapon: null, startup: 0.1, active: 0.08, recovery: 0.2,
  stamina: 0, will: 0, cooldown: 0, damage: 0, range: 2.2, arc: 120, knockback: 0, stagger: 0.25,
  shieldMultiplier: 1, veilMultiplier: 1, hitAt: [0], blockable: true, chain: null, cancelInto: [], cancelFrom: Infinity,
  iframes: null, channel: false, willPerSec: 0, rootMotion: 0, damageKind: 'melee',
  ...spec,
  duration: (spec.startup ?? 0.1) + (spec.active ?? 0.08) + (spec.recovery ?? 0.2),
});

// Crystal forms: one crystal, four shapes.
export const WEAPONS = Object.freeze(['sword', 'dualBlades', 'staff', 'bow']);
// what the smugglers carry (not a crystal form: no Will needed to fire it)
export const CONTRABAND = Object.freeze(['sidearm']);

export const MOVES = Object.freeze({
  // ---- the sword's cuts by direction, in three modes: nine lines each (core/cuts.mjs)
  ...Object.fromEntries(Object.entries(CUT_SPECS).map(([id, spec]) => [id, move(spec)])),
  // ---- sword: precise, heavy finishers that punish a weakened defense
  swordLight1: move({ weapon: 'sword', startup: 0.11, active: 0.08, recovery: 0.2, stamina: 6, damage: 10,
    chain: { next: 'swordLight2', from: 0.17, to: 0.42 }, cancelInto: ['movement', 'power'], cancelFrom: 0.22 }),
  swordLight2: move({ weapon: 'sword', startup: 0.1, active: 0.08, recovery: 0.2, stamina: 6, damage: 10,
    chain: { next: 'swordLight3', from: 0.16, to: 0.4 }, cancelInto: ['movement', 'power'], cancelFrom: 0.2 }),
  // the finisher spins before it cuts: a longer wind-up, easier to see coming
  swordLight3: move({ weapon: 'sword', startup: 0.24, active: 0.1, recovery: 0.3, stamina: 8, damage: 15, knockback: 0.8,
    stagger: 0.45, cancelInto: ['movement'], cancelFrom: 0.44 }),
  swordHeavy: move({ weapon: 'sword', startup: 0.28, active: 0.1, recovery: 0.34, stamina: 14, damage: 22, knockback: 1.2,
    stagger: 0.6, shieldMultiplier: 1.15, cancelInto: ['movement'], cancelFrom: 0.5 }),

  // ---- reverse-grip dual blades: rapid hits that drain Will
  bladesLight1: move({ weapon: 'dualBlades', startup: 0.07, active: 0.05, recovery: 0.13, stamina: 4, damage: 5, veilMultiplier: 1.35,
    range: 1.8, chain: { next: 'bladesLight2', from: 0.1, to: 0.3 }, cancelInto: ['movement', 'power'], cancelFrom: 0.12 }),
  bladesLight2: move({ weapon: 'dualBlades', startup: 0.07, active: 0.05, recovery: 0.13, stamina: 4, damage: 5, veilMultiplier: 1.35,
    range: 1.8, chain: { next: 'bladesLight3', from: 0.1, to: 0.3 }, cancelInto: ['movement', 'power'], cancelFrom: 0.12 }),
  bladesLight3: move({ weapon: 'dualBlades', startup: 0.07, active: 0.05, recovery: 0.13, stamina: 4, damage: 5, veilMultiplier: 1.35,
    range: 1.8, chain: { next: 'bladesLight4', from: 0.1, to: 0.3 }, cancelInto: ['movement', 'power'], cancelFrom: 0.12 }),
  bladesLight4: move({ weapon: 'dualBlades', startup: 0.09, active: 0.08, recovery: 0.2, stamina: 5, damage: 8, veilMultiplier: 1.35,
    range: 1.8, knockback: 0.6, stagger: 0.4, cancelInto: ['movement'], cancelFrom: 0.2 }),
  bladesHeavy: move({ weapon: 'dualBlades', startup: 0.2, active: 0.16, recovery: 0.28, stamina: 12, damage: 8, hitAt: [0, 0.1],
    veilMultiplier: 1.35, range: 2, stagger: 0.5, rootMotion: 1.2, cancelInto: ['movement'], cancelFrom: 0.42 }),

  // ---- double-bladed staff: continuous offense and area control
  staffLight1: move({ weapon: 'staff', startup: 0.12, active: 0.12, recovery: 0.22, stamina: 6, damage: 8, arc: 220, range: 2.6,
    chain: { next: 'staffLight2', from: 0.2, to: 0.46 }, cancelInto: ['movement', 'power'], cancelFrom: 0.28 }),
  staffLight2: move({ weapon: 'staff', startup: 0.11, active: 0.12, recovery: 0.22, stamina: 6, damage: 8, arc: 360, range: 2.6,
    chain: { next: 'staffLight3', from: 0.2, to: 0.46 }, cancelInto: ['movement', 'power'], cancelFrom: 0.28 }),
  staffLight3: move({ weapon: 'staff', startup: 0.13, active: 0.14, recovery: 0.3, stamina: 8, damage: 11, arc: 260, range: 2.8,
    knockback: 0.9, stagger: 0.45, cancelInto: ['movement'], cancelFrom: 0.4 }),
  staffHeavy: move({ weapon: 'staff', startup: 0.22, active: 0.4, recovery: 0.3, stamina: 14, damage: 7, hitAt: [0, 0.15, 0.3],
    arc: 360, range: 2.8, knockback: 0.5, stagger: 0.35, cancelInto: ['movement'], cancelFrom: 0.72 }),

  // ---- strikes by direction (FLOW below): forward an advance that closes the distance, sideways a wide sweep,
  // back a turn that cuts all round. Their clips are made from the pack's heavy combo
  // (tools/duelist/blender/weapon_clips.py). chain has no `next`: FLOW says what may follow.
  swordAdvance: move({ weapon: 'sword', startup: 0.16, active: 0.1, recovery: 0.26, stamina: 7, damage: 10, range: 2.4, arc: 100,
    chain: { from: 0.24, to: 0.5 }, cancelInto: ['movement', 'power'], cancelFrom: 0.3 }),
  swordSweep: move({ weapon: 'sword', startup: 0.2, active: 0.12, recovery: 0.3, stamina: 8, damage: 11, range: 2.3, arc: 220,
    knockback: 0.5, stagger: 0.35, chain: { from: 0.3, to: 0.6 }, cancelInto: ['movement'], cancelFrom: 0.38 }),
  swordTurn: move({ weapon: 'sword', startup: 0.12, active: 0.16, recovery: 0.22, stamina: 6, damage: 7, range: 1.9, arc: 360,
    chain: { from: 0.24, to: 0.48 }, cancelInto: ['movement', 'power'], cancelFrom: 0.3 }),
  bladesAdvance: move({ weapon: 'dualBlades', startup: 0.1, active: 0.1, recovery: 0.16, stamina: 5, damage: 6, veilMultiplier: 1.35,
    range: 2.1, arc: 100, chain: { from: 0.16, to: 0.36 }, cancelInto: ['movement', 'power'], cancelFrom: 0.22 }),
  bladesSweep: move({ weapon: 'dualBlades', startup: 0.12, active: 0.1, recovery: 0.18, stamina: 5, damage: 6, veilMultiplier: 1.35,
    range: 1.9, arc: 220, stagger: 0.3, chain: { from: 0.18, to: 0.4 }, cancelInto: ['movement'], cancelFrom: 0.24 }),
  bladesTurn: move({ weapon: 'dualBlades', startup: 0.08, active: 0.12, recovery: 0.14, stamina: 4, damage: 4, veilMultiplier: 1.35,
    range: 1.7, arc: 360, chain: { from: 0.14, to: 0.32 }, cancelInto: ['movement', 'power'], cancelFrom: 0.2 }),
  staffLeap: move({ weapon: 'staff', startup: 0.24, active: 0.12, recovery: 0.3, stamina: 9, damage: 12, range: 2.8, arc: 120,
    knockback: 0.7, stagger: 0.4, chain: { from: 0.4, to: 0.64 }, cancelInto: ['movement'], cancelFrom: 0.46 }),
  staffSweep: move({ weapon: 'staff', startup: 0.2, active: 0.14, recovery: 0.3, stamina: 8, damage: 9, range: 2.8, arc: 300,
    knockback: 0.6, stagger: 0.4, chain: { from: 0.32, to: 0.62 }, cancelInto: ['movement'], cancelFrom: 0.4 }),

  // ---- bow / sniper: range, breaks shields. The active phase is the release; startup is the draw.
  bowShot: move({ weapon: 'bow', startup: 0.18, active: 0.04, recovery: 0.22, stamina: 4, damage: 12, range: 45, arc: 4,
    shieldMultiplier: 1.6, damageKind: 'projectile', blockable: true, cancelInto: ['movement'], cancelFrom: 0.22 }),
  sniperShot: move({ weapon: 'bow', startup: 1.1, active: 0.04, recovery: 0.4, stamina: 10, damage: 42, range: 90, arc: 2,
    shieldMultiplier: 2, damageKind: 'projectile', cooldown: 1.6, cancelInto: ['movement'], cancelFrom: 1.14 }),

  // ---- crystal-forged sidearm (the smugglers' contraband): its rounds are cut to drain a Veil
  sidearmShot: move({ weapon: 'sidearm', startup: 0.36, active: 0.04, recovery: 0.3, damage: 6, range: 28, arc: 3, veilMultiplier: 1.35,
    stagger: 0.1, damageKind: 'projectile', projectileSpeed: 46, cancelInto: ['movement'], cancelFrom: 0.4 }),
  sidearmBurst: move({ weapon: 'sidearm', startup: 0.55, active: 0.3, recovery: 0.45, damage: 5, hitAt: [0, 0.13, 0.26], range: 28, arc: 3,
    veilMultiplier: 1.35, stagger: 0.1, cooldown: 2.5, damageKind: 'projectile', projectileSpeed: 46, cancelInto: ['movement'], cancelFrom: 0.85 }),
  sidearmWhip: move({ weapon: 'sidearm', startup: 0.2, active: 0.08, recovery: 0.3, damage: 6, range: 1.7, arc: 100, knockback: 0.6, stagger: 0.35 }),

  // ---- Telekinesis (Will): push, pull, grip; Veil Breach; resist
  push: move({ kind: 'power', startup: 0.12, active: 0.1, recovery: 0.24, will: 16, cooldown: 1.4, damage: 4, range: 9, arc: 70,
    knockback: 4.5, stagger: 0.6, blockable: false, damageKind: 'telekinesis', cancelInto: ['movement'], cancelFrom: 0.3 }),
  pull: move({ kind: 'power', startup: 0.12, active: 0.1, recovery: 0.24, will: 16, cooldown: 1.4, damage: 2, range: 12, arc: 50,
    knockback: -4.2, stagger: 0.5, blockable: false, damageKind: 'telekinesis', cancelInto: ['movement', 'attack'], cancelFrom: 0.26 }),
  // Telekinesis (replaces "lightning"): lift the target and crush it while held, throw on release.
  grip: move({ kind: 'power', startup: 0.18, active: 1.4, recovery: 0.3, will: 12, willPerSec: 20, cooldown: 5, damage: 12, range: 10,
    arc: 40, stagger: 0, blockable: false, damageKind: 'telekinesis', channel: true }),
  gripThrow: move({ kind: 'power', startup: 0, active: 0.08, recovery: 0.3, will: 0, damage: 8, range: 10, arc: 40, knockback: 6,
    stagger: 0.8, blockable: false, damageKind: 'telekinesis' }),
  breach: move({ kind: 'power', startup: 0.14, active: 0.06, recovery: 0.2, will: 25, cooldown: 8, damage: 0, range: 4, arc: 60,
    stagger: 0, blockable: false, damageKind: 'breach', cancelInto: ['attack', 'movement'], cancelFrom: 0.2 }),
  // Resist: spend Will to throw off a grip or a breach. Usable while gripped or staggered.
  resist: move({ kind: 'defense', startup: 0, active: 0.05, recovery: 0.15, will: 15, cooldown: 3, damage: 0, range: 0 }),

  // ---- movement
  roll: move({ kind: 'movement', startup: 0, active: 0.42, recovery: 0.1, stamina: 20, damage: 0, range: 0, iframes: [0.06, 0.32],
    rootMotion: 3.6, cancelInto: ['power', 'attack'], cancelFrom: 0.3 }),
  dash: move({ kind: 'movement', startup: 0, active: 0.18, recovery: 0.08, will: 12, cooldown: 3, damage: 0, range: 0,
    iframes: [0, 0.18], rootMotion: 6, cancelInto: ['power', 'attack'], cancelFrom: 0.2 }),
  // In-air evasion: second Dash press within AIR_DASH.doubleTapSeconds while in a player jump.
  // One use per jump; no extra stamina/Will cost. The world validates height and the two presses.
  airDash: move({ kind: 'movement', startup: 0, active: 0.22, recovery: 0.06, stamina: 0, will: 0,
    damage: 0, range: 0, rootMotion: 4.5, iframes: [0.04, 0.16], cancelInto: [], cancelFrom: Infinity }),
  // a jump: the body arcs over the active phase (leap: its height, metres) and keeps the speed it had on the ground
  // (air: sim/world.mjs sets how far that carries it; from a standstill it goes straight up)
  jump: move({ kind: 'movement', startup: 0, active: 0.56, recovery: 0.08, stamina: 8, damage: 0, range: 0, leap: 1.1, air: true,
    cancelInto: ['attack', 'power'], cancelFrom: 0.5 }),

  // ---- class abilities (core/classes.mjs gives each class four of these and the powers above, and a special).
  //   effect: what the move does instead of (or besides) a hit, applied by sim/world.mjs through core/abilities.mjs;
  //   effectSeconds: how long it lasts; targets: 'ally' / 'enemy' (one, in range and arc) or none (yourself);
  //   aura: allies within that many metres share it; leap: the body arcs through the air over the active phase.
  leapStrike: move({ kind: 'power', startup: 0.16, active: 0.42, recovery: 0.3, will: 20, cooldown: 7, damage: 12, range: 3, arc: 360,
    hitAt: [0.4], knockback: 1.6, stagger: 0.7, blockable: false, rootMotion: 8, leap: 1.6, damageKind: 'telekinesis',
    cancelInto: ['movement'], cancelFrom: 0.8 }),
  repulse: move({ kind: 'power', startup: 0.22, active: 0.08, recovery: 0.3, will: 22, cooldown: 8, damage: 6, range: 5, arc: 360,
    knockback: 4.5, stagger: 0.6, blockable: false, damageKind: 'telekinesis', cancelInto: ['movement'], cancelFrom: 0.3 }),
  bladeThrow: move({ kind: 'power', startup: 0.2, active: 0.04, recovery: 0.32, will: 14, cooldown: 5, damage: 14, range: 16, arc: 4,
    stagger: 0.4, damageKind: 'projectile', projectileSpeed: 30, cancelInto: ['movement'], cancelFrom: 0.3 }),
  quickstep: move({ kind: 'power', startup: 0, active: 0.05, recovery: 0.05, will: 14, cooldown: 9, range: 0, blockable: false,
    effect: 'quick', effectSeconds: 3, damageKind: 'effect', cancelInto: ['movement', 'attack', 'power'], cancelFrom: 0 }),
  quickstepAura: move({ kind: 'power', startup: 0.05, active: 0.05, recovery: 0.1, will: 18, cooldown: 10, range: 0, blockable: false,
    effect: 'quick', effectSeconds: 3, aura: 6, damageKind: 'effect', cancelInto: ['movement', 'attack', 'power'], cancelFrom: 0.05 }),
  // a parry stance: a strike that meets it in front is answered with counterStrike
  counter: move({ kind: 'defense', startup: 0, active: 0.6, recovery: 0.15, will: 10, cooldown: 6, range: 0, blockable: false,
    effect: 'counter', damageKind: 'effect' }),
  counterStrike: move({ kind: 'attack', startup: 0.05, active: 0.08, recovery: 0.25, damage: 16, range: 2.4, arc: 140, knockback: 1,
    stagger: 0.6, blockable: false, cancelInto: ['movement'], cancelFrom: 0.2 }),
  cloak: move({ kind: 'power', startup: 0.1, active: 0.05, recovery: 0.1, will: 20, cooldown: 12, range: 0, blockable: false,
    effect: 'cloak', effectSeconds: 4, damageKind: 'effect', cancelInto: ['movement'], cancelFrom: 0.1 }),
  empower: move({ kind: 'power', startup: 0.05, active: 0.05, recovery: 0.1, will: 15, cooldown: 10, range: 0, blockable: false,
    effect: 'empower', effectSeconds: 8, charges: 3, damageKind: 'effect', cancelInto: ['movement', 'attack'], cancelFrom: 0.05 }),
  misdirect: move({ kind: 'power', startup: 0.12, active: 0.05, recovery: 0.2, will: 16, cooldown: 10, range: 12, arc: 40, blockable: false,
    effect: 'misdirect', effectSeconds: 3, targets: 'enemy', damageKind: 'effect', cancelInto: ['movement'], cancelFrom: 0.2 }),
  mend: move({ kind: 'power', startup: 0.2, active: 0.05, recovery: 0.25, will: 18, cooldown: 8, range: 18, arc: 60, blockable: false,
    effect: 'mend', effectSeconds: 3, heal: 30, targets: 'ally', damageKind: 'effect', cancelInto: ['movement'], cancelFrom: 0.25 }),
  levitate: move({ kind: 'movement', startup: 0, active: 0.1, recovery: 0.05, will: 14, cooldown: 7, range: 0, blockable: false,
    effect: 'levitate', effectSeconds: 2, damageKind: 'effect', cancelInto: ['attack', 'power'], cancelFrom: 0.1 }),

  // ---- class specials: the server-owned meter pays (core/classes.mjs: cost), never Will
  rage: move({ kind: 'power', startup: 0.3, active: 0.05, recovery: 0.2, range: 0, blockable: false, special: true,
    effect: 'rage', effectSeconds: 5, iframes: [0, 0.35], damageKind: 'effect' }),
  execution: move({ kind: 'attack', startup: 0.12, active: 0.06, recovery: 0.4, range: 2.1, arc: 90, blockable: false, special: true,
    execute: true, iframes: [0, 0.58], damageKind: 'execution' }),
  shadowExecution: move({ kind: 'attack', startup: 0.12, active: 0.06, recovery: 0.4, range: 2.3, arc: 90, blockable: false, special: true,
    execute: true, iframes: [0, 0.58], damageKind: 'execution' }),
  sanctuary: move({ kind: 'power', startup: 0.3, active: 0.05, recovery: 0.25, range: 0, blockable: false, special: true,
    effect: 'sanctuary', effectSeconds: 5, iframes: [0, 0.35], damageKind: 'effect' }),
});

// Flow: a light strike takes the direction the stick is held in as it is pressed, relative to where the fighter
// faces: forward, back or to a side. With no direction it is the next link of the form's chain. Inside a strike's
// chain window any light strike of the form may follow, never the same one twice running, and a chain is as long
// as the form's own (the sword's three, the twin blades' four, the staff's three).
export const STRIKE_DIRECTIONS = Object.freeze(['forward', 'side', 'back']);
const flow = (chain, turns) => Object.freeze({ chain: Object.freeze(chain), ...turns, strikes: new Set([...chain, ...Object.values(turns)]) });
// The sword cuts by direction in three modes (core/cuts.mjs): each mode has its own table of nine. With no
// direction its chain is the standing cut, the cut back along that line, then the cut down the middle.
const SWORD_MODES = Object.freeze(Object.fromEntries(CUT_MODES.map((mode) => [mode, Object.freeze({
  chain: Object.freeze([cutId('stand', mode), cutId('right', mode), cutId('forward', mode)]),
  ...Object.fromEntries(CUT_DIRECTIONS.map((d) => [d, cutId(d, mode)])),
})])));
export const FLOW = Object.freeze({
  sword: Object.freeze({ chain: SWORD_MODES.balanced.chain, modes: SWORD_MODES,
    // the older strikes still count as the sword's (the rules' own callers start them by name)
    strikes: new Set([...CUT_IDS, 'swordLight1', 'swordLight2', 'swordLight3', 'swordAdvance', 'swordSweep', 'swordTurn']) }),
  dualBlades: flow(['bladesLight1', 'bladesLight2', 'bladesLight3', 'bladesLight4'], { forward: 'bladesAdvance', side: 'bladesSweep', back: 'bladesTurn' }),
  // the staff's turn is its chain's second link: a direction takes it out of its turn
  staff: flow(['staffLight1', 'staffLight2', 'staffLight3'], { forward: 'staffLeap', side: 'staffSweep', back: 'staffLight2' }),
});

// Which move a button starts with each crystal form (the first of a chain).
export const BINDINGS = Object.freeze({
  sword: Object.freeze({ light: 'swordLight1', heavy: 'swordHeavy' }),
  dualBlades: Object.freeze({ light: 'bladesLight1', heavy: 'bladesHeavy' }),
  staff: Object.freeze({ light: 'staffLight1', heavy: 'staffHeavy' }),
  bow: Object.freeze({ light: 'bowShot', heavy: 'sniperShot' }),
  sidearm: Object.freeze({ light: 'sidearmShot', heavy: 'sidearmBurst' }),
});
export const POWER_BINDINGS = Object.freeze({ push: 'push', pull: 'pull', grip: 'grip', breach: 'breach', resist: 'resist', roll: 'roll', dash: 'dash', jump: 'jump' });

export const moveById = (id) => MOVES[id] || null;
