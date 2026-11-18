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
//     `next` without waiting for the recovery.
//   cancelInto + cancelFrom: kinds of moves that may interrupt this one from that time on (roll into push).
//   iframes: [from, to] during which nothing can touch the fighter.
//   channel: the active phase lasts while the button is held, up to `active` seconds, paying willPerSec.

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

export const MOVES = Object.freeze({
  // ---- sword: precise, heavy finishers that punish a weakened defense
  swordLight1: move({ weapon: 'sword', startup: 0.11, active: 0.08, recovery: 0.2, stamina: 6, damage: 10,
    chain: { next: 'swordLight2', from: 0.17, to: 0.42 }, cancelInto: ['movement', 'power'], cancelFrom: 0.22 }),
  swordLight2: move({ weapon: 'sword', startup: 0.1, active: 0.08, recovery: 0.2, stamina: 6, damage: 10,
    chain: { next: 'swordLight3', from: 0.16, to: 0.4 }, cancelInto: ['movement', 'power'], cancelFrom: 0.2 }),
  swordLight3: move({ weapon: 'sword', startup: 0.14, active: 0.1, recovery: 0.28, stamina: 8, damage: 15, knockback: 0.8,
    stagger: 0.45, cancelInto: ['movement'], cancelFrom: 0.34 }),
  swordHeavy: move({ weapon: 'sword', startup: 0.28, active: 0.1, recovery: 0.34, stamina: 14, damage: 22, knockback: 1.2,
    stagger: 0.6, shieldMultiplier: 1.15, rootMotion: 0.8, cancelInto: ['movement'], cancelFrom: 0.5 }),

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
  staffLight2: move({ weapon: 'staff', startup: 0.11, active: 0.12, recovery: 0.22, stamina: 6, damage: 8, arc: 220, range: 2.6,
    chain: { next: 'staffLight3', from: 0.2, to: 0.46 }, cancelInto: ['movement', 'power'], cancelFrom: 0.28 }),
  staffLight3: move({ weapon: 'staff', startup: 0.13, active: 0.14, recovery: 0.3, stamina: 8, damage: 11, arc: 260, range: 2.8,
    knockback: 0.9, stagger: 0.45, cancelInto: ['movement'], cancelFrom: 0.4 }),
  staffHeavy: move({ weapon: 'staff', startup: 0.22, active: 0.4, recovery: 0.3, stamina: 14, damage: 7, hitAt: [0, 0.15, 0.3],
    arc: 360, range: 2.8, knockback: 0.5, stagger: 0.35, cancelInto: ['movement'], cancelFrom: 0.72 }),

  // ---- bow / sniper: range, breaks shields. The active phase is the release; startup is the draw.
  bowShot: move({ weapon: 'bow', startup: 0.18, active: 0.04, recovery: 0.22, stamina: 4, damage: 12, range: 45, arc: 4,
    shieldMultiplier: 1.6, damageKind: 'projectile', blockable: true, cancelInto: ['movement'], cancelFrom: 0.22 }),
  sniperShot: move({ weapon: 'bow', startup: 1.1, active: 0.04, recovery: 0.4, stamina: 10, damage: 42, range: 90, arc: 2,
    shieldMultiplier: 2, damageKind: 'projectile', cooldown: 1.6, cancelInto: ['movement'], cancelFrom: 1.14 }),

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
});

// Which move a button starts with each crystal form (the first of a chain).
export const BINDINGS = Object.freeze({
  sword: Object.freeze({ light: 'swordLight1', heavy: 'swordHeavy' }),
  dualBlades: Object.freeze({ light: 'bladesLight1', heavy: 'bladesHeavy' }),
  staff: Object.freeze({ light: 'staffLight1', heavy: 'staffHeavy' }),
  bow: Object.freeze({ light: 'bowShot', heavy: 'sniperShot' }),
});
export const POWER_BINDINGS = Object.freeze({ push: 'push', pull: 'pull', grip: 'grip', breach: 'breach', resist: 'resist', roll: 'roll', dash: 'dash' });

export const moveById = (id) => MOVES[id] || null;
