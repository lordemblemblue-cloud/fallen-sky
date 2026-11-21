// Duelist Adventure combat tuning: every number the rules core uses, in one place.
// Seconds, metres, points. Proposals for playtesting; the owner tunes them here, not in the rules.

export const VITALS = Object.freeze({
  hp: 100,
  stamina: 100,
  will: 100,
  shield: 40,
  // Stamina is reserved for defensive maneuvers and guard endurance; attacks and sprinting are free.
  // Running dry ("winded") still blocks stamina-based evasions until recovery.
  staminaRegenPerSec: 28,
  staminaRegenDelay: 0.8,
  staminaRecoverAt: 25,
  // Will powers the Veil and Telekinesis.
  willRegenPerSec: 7,
  willRegenDelay: 2.5,
  // Shield / armor plating recharges after a pause without hits.
  shieldRegenPerSec: 10,
  shieldRegenDelay: 4,
});

// The Dimensional Veil: spends Will to keep the body out of reach.
export const VEIL = Object.freeze({
  willPerDamage: 1, // Will spent for each point of damage the Veil stops
  unstableBelow: 0.35, // share of max Will under which the Veil is unstable
  unstableLeak: 0.25, // share of each hit that slips through an unstable Veil to the body
  // Veil Collapse: at zero Will the body is tangible until Will has recovered this far, and Will only
  // starts recovering after collapseRecoverDelay.
  collapseRestoreAt: 35,
  collapseRecoverDelay: 3.5,
});

// Veil Breach: synchronize with a nearby opponent's Veil so your hits reach their body for a moment.
export const BREACH = Object.freeze({ seconds: 1.6, range: 4 });

export const BLOCK = Object.freeze({
  parryWindow: 0.16, // a block raised this soon before the hit parries it (no cost, the attacker staggers)
  staminaPerDamage: 0.6, // stamina a guard spends per point of blocked damage
  chip: 0.15, // share of a blocked hit that still reaches the protection layers
  guardBreakStagger: 0.9, // seconds of stagger when the guard runs out of stamina
  parryStagger: 0.7, // seconds the parried attacker staggers
  frontArcDeg: 150, // a guard covers this arc in front of the fighter
});

// Fair play: one buffered press, a server-side input budget.
export const INPUT = Object.freeze({
  bufferSeconds: 0.25, // a press during an action waits this long for its window, then is dropped
  maxPerSecond: 14, // token bucket refill per fighter (server)
  burst: 6, // token bucket size
});

// A push or a throw that drives a body this far (m) knocks it down (a pull never does): it lies, then rises, and nothing reaches it
// until it stands again (a fallen fighter cannot be juggled or held down).
export const KNOCKDOWN = Object.freeze({ distance: 3, lie: 0.7, rise: 0.95 });

// Sprint is unrestricted by stamina; the zero cost is kept for consumers of the tuning object.
export const SPRINT = Object.freeze({ staminaPerSec: 0, speed: 7.2 });
// Three damaging, unblocked hits in one short exchange grant a window to fight back.
export const STAGGER_IMMUNITY = Object.freeze({ hits: 3, comboWindowSeconds: 2, seconds: 1 });
export const MOVE_SPEED = Object.freeze({ walk: 2.2, run: 4.6 });
