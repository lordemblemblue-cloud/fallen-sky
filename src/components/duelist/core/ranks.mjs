// What a class's level does to its kit (core/progression.mjs has the levels): each ability's numbers at its rank,
// the special's at its tier. The rules read a fighter's moves through moveFor(), so the frame data in core/moves.mjs
// stays the first rank's. Timings never change with rank (the clips are mapped to them): what grows is the damage,
// the reach, how long an effect lasts and how soon the ability is ready again.
import { MOVES } from './moves.mjs';
import { classById } from './classes.mjs';
import { abilityRank, specialTier, RANK_MAX, TIER_MAX, SPECIAL_TIERS } from './progression.mjs';

// Per rank above the first: a number is a share of the first rank's value added each rank (negative: taken off);
// a list is the value at each rank.
export const GROWTH = Object.freeze({
  leapStrike: { damage: 0.12, cooldown: -0.05 },
  grip: { damage: 0.1, cooldown: -0.06 },
  gripThrow: { damage: 0.1 },
  repulse: { damage: 0.12, knockback: 0.06, range: 0.05 },
  bladeThrow: { damage: 0.12, cooldown: -0.05 },
  pull: { range: 0.06, cooldown: -0.06 },
  quickstep: { effectSeconds: 0.12, cooldown: -0.04 },
  counter: { cooldown: -0.07 },
  counterStrike: { damage: 0.12 },
  cloak: { effectSeconds: 0.12, cooldown: -0.05 },
  push: { damage: 0.12, knockback: 0.06, cooldown: -0.05 },
  empower: { charges: [3, 3, 4, 4, 5], cooldown: -0.04 },
  misdirect: { effectSeconds: 0.15, cooldown: -0.05 },
  mend: { heal: 0.15, cooldown: -0.04 },
  quickstepAura: { effectSeconds: 0.12, aura: 0.08, cooldown: -0.04 },
  levitate: { effectSeconds: 0.15, cooldown: -0.05 },
});
// a follow-up move takes its rank from the ability it belongs to
const FROM = Object.freeze({ gripThrow: 'grip', counterStrike: 'counter' });
// the specials' move fields that change with the tier (the rest of a tier is read where it is used)
const TIER_FIELDS = Object.freeze({ rage: ['effectSeconds'], sanctuary: ['effectSeconds', 'radius', 'healPerSecond'], shadowExecution: ['reach'] });

const round = (v) => Math.round(v * 1000) / 1000;
const cache = new Map();

/** A move at an ability rank (1-5): the first rank is the move as written. */
export function rankedMove(id, rank = 1) {
  const base = MOVES[id];
  const growth = GROWTH[id];
  const r = Math.max(1, Math.min(RANK_MAX, Math.floor(rank) || 1));
  if (!base || !growth || r === 1) return base || null;
  const key = `${id}#${r}`;
  if (!cache.has(key)) {
    const changed = {};
    for (const [field, g] of Object.entries(growth)) changed[field] = Array.isArray(g) ? g[r - 1] : round(base[field] * (1 + g * (r - 1)));
    cache.set(key, Object.freeze({ ...base, ...changed, rank: r }));
  }
  return cache.get(key);
}

/** A special's move at a tier (1-3). */
export function tieredMove(id, tier = 1) {
  const base = MOVES[id];
  const fields = TIER_FIELDS[id];
  const t = Math.max(1, Math.min(TIER_MAX, Math.floor(tier) || 1));
  if (!base || !fields) return base || null;
  const key = `${id}@${t}`;
  if (!cache.has(key)) {
    const changed = {};
    for (const field of fields) changed[field] = SPECIAL_TIERS[id][field][t - 1];
    if (changed.reach !== undefined) changed.range = changed.reach;
    cache.set(key, Object.freeze({ ...base, ...changed, tier: t }));
  }
  return cache.get(key);
}

const inKit = (f, id) => !!classById(f.classId)?.abilities.some((a) => a.id === id);
// Item Ability stat amplifies class ability damage/healing and effect duration, while passive
// haste shortens cooldowns. Normal attacks, blocks and movement animations are unchanged.
function itemTuned(f, move) {
  if (!move) return move;
  const ability = f.shopStats?.ability || 0;
  const haste = f.shopStats?.passive?.haste || 0;
  if (!ability && !haste) return move;
  const tuned = { ...move };
  if (ability) {
    for (const field of ['damage', 'heal', 'effectSeconds']) {
      if (Number.isFinite(tuned[field]) && tuned[field] > 0) tuned[field] = Math.round(tuned[field] * (1 + ability) * 1000) / 1000;
    }
  }
  if (haste && Number.isFinite(tuned.cooldown) && tuned.cooldown > 0) {
    tuned.cooldown = Math.round(tuned.cooldown * (1 - haste) * 1000) / 1000;
  }
  return Object.freeze(tuned);
}

/**
 * The move as this fighter does it: an ability of its class at the rank its level gives, its special at its tier,
 * anything else as written (a fighter without a class is always at the first rank).
 */
export function moveFor(f, id) {
  const base = MOVES[id] || null;
  if (!base || !f?.classId) return base;
  if (base.special) return classById(f.classId)?.special.id === id
    ? itemTuned(f, tieredMove(id, specialTier(f.matchBoost))) : base;
  return GROWTH[id] && inKit(f, FROM[id] || id) ? itemTuned(f, rankedMove(id, abilityRank(f.matchBoost))) : base;
}

/** A passive's value at a rank: the passives' numbers are lists of five (core/classes.mjs), or plain numbers. */
export const atRank = (value, rank) => (Array.isArray(value) ? value[Math.max(1, Math.min(RANK_MAX, rank)) - 1] : value);
/** The fighter's passive with its numbers at the fighter's rank, or null. */
export function passiveFor(f) {
  const passive = classById(f?.classId)?.passive;
  if (!passive) return null;
  const rank = abilityRank(f.matchBoost);
  const out = { id: passive.id, name: passive.name, rank };
  for (const [key, value] of Object.entries(passive)) if (typeof value === 'number' || Array.isArray(value)) out[key] = atRank(value, rank);
  return out;
}

// ---- words for the class picker and the HUD: what an ability, a special or a passive does at a level
const n = (v) => String(+(+v).toFixed(1));
const pct = (v) => `${Math.round((v - 1) * 100)}%`;
const ABILITY_TEXT = {
  leapStrike: (m) => `Jump up to ${n(m.rootMotion)} m ahead and slam down for ${n(m.damage)} damage, staggering everyone around the landing.`,
  grip: (m) => `Lift an enemy and crush it for ${n(m.damage)} damage a second while you hold; throw it when you let go.`,
  repulse: (m) => `Throw everyone within ${n(m.range)} m back and off their feet, for ${n(m.damage)} damage.`,
  bladeThrow: (m) => `A blade flies out and back, cutting whoever it meets for ${n(m.damage)} damage.`,
  pull: (m) => `Drag an enemy within ${n(m.range)} m into reach.`,
  quickstep: (m) => `For ${n(m.effectSeconds)} s: 40% faster on your feet and 20% faster strikes.`,
  counter: (m, f) => `A short parry stance: a strike that meets it is answered with a free riposte for ${n(moveFor(f, 'counterStrike').damage)} damage.`,
  cloak: (m) => `Unseen for ${n(m.effectSeconds)} s (a shimmer up close). Striking or being hit ends it.`,
  push: (m) => `Throw everyone in front of you back, for ${n(m.damage)} damage.`,
  empower: (m) => `Your next ${m.charges} strikes hit 40% harder without draining the target's Will.`,
  misdirect: (m) => `One enemy loses its lock on you and cannot target you for ${n(m.effectSeconds)} s.`,
  mend: (m) => `Heal the ally in front of you (or yourself) ${n(m.heal)} HP over ${n(m.effectSeconds)} s.`,
  quickstepAura: (m) => `You and allies within ${n(m.aura)} m: 40% faster on your feet and 20% faster strikes for ${n(m.effectSeconds)} s.`,
  levitate: (m) => `Rise and float for ${n(m.effectSeconds)} s.`,
};
const SPECIAL_TEXT = {
  rage: (t) => `For ${t.effectSeconds} s: double damage, 30% faster, and nothing staggers, grips or knocks you down.`,
  execution: (t) => `Finish an enemy at ${Math.round(t.threshold * 100)}% HP or less within reach. Costs a third of the meter.`,
  shadowExecution: (t) => `Finish any enemy from behind (its rear ${t.rearArc} degrees, within ${t.reach} m), whatever its health.`,
  sanctuary: (t) => `A dome ${t.radius} m around you for ${t.effectSeconds} s: allies inside take 80% less from powers and 35% less from strikes, and heal ${t.healPerSecond} HP a second.`,
};
const PASSIVE_TEXT = {
  heavyStance: (p) => `Strikes hit ${pct(p.strikeDamage)} harder; knockback moves you ${Math.round((1 - p.knockbackTaken) * 100)}% less; swings are a little slower.`,
  twinRhythm: (p) => `A four-hit chain. Each link hits ${Math.round(p.chainDamage * 100)}% harder than the one before it; every strike drains the Veil faster.`,
  shadowStep: (p) => `Rolls carry you ${pct(p.rollDistance)} farther; strikes from behind hit ${pct(p.backstab)} harder.`,
  swiftStance: (p) => `Faster, lighter swings. Unhurt for ${p.regenAfter} s, you mend ${n(p.regen)} HP a second; healing an ally charges your special.`,
};

/**
 * A class's kit in words at a level:
 * { level, rank, tier, passive: { id, name, rank, text }, abilities: [{ id, name, rank, text, cooldown }], special }.
 */
export function kitAt(classId, level = 1, matchBoost = 0) {
  const def = classById(classId);
  if (!def) return null;
  const f = { classId, level, matchBoost };
  const rank = abilityRank(matchBoost);
  const tier = specialTier(matchBoost);
  const passive = passiveFor(f);
  const tierOf = Object.fromEntries(Object.entries(SPECIAL_TIERS[def.special.id] || {}).map(([k, v]) => [k, v[tier - 1]]));
  return {
    level: Math.max(1, Math.floor(level) || 1), rank, tier,
    passive: { id: passive.id, name: passive.name, rank, text: PASSIVE_TEXT[passive.id]?.(passive) || def.passive.text },
    abilities: def.abilities.map((a) => {
      const move = moveFor(f, a.id);
      return { id: a.id, name: a.name, rank, text: ABILITY_TEXT[a.id]?.(move, f) || a.text, cooldown: move.cooldown };
    }),
    special: { id: def.special.id, name: def.special.name, tier, text: SPECIAL_TEXT[def.special.id]?.(tierOf) || def.special.text, cost: def.special.cost },
  };
}
