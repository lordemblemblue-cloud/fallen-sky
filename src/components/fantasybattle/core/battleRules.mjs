/**
 * Fantasy Battle rules: rounds in which every fighter picks an action, then the round plays out in initiative order.
 * Pure and deterministic: the battle carries its own seeded random state, so a round with the same choices always
 * resolves the same way. No DOM, no three.js, no imports.
 *
 * A round: each living unit chooses an action -> order by action priority, then speed (ties by a seeded coin) ->
 * each actor in turn pays Focus, rolls each arrow (hit, crit, damage) against its target -> guards last until the
 * round ends -> Focus gains -> the battle ends when one side has no one standing.
 */

export const MAX_FOCUS = 3;

export const ACTIONS = Object.freeze({
  quickShot: Object.freeze({ id: 'quickShot', name: 'Quick Shot', skill: 'quickShot', hotkey: '1', kind: 'attack', power: 16, hits: 1, accuracy: 0.95, critChance: 0.1, priority: 1, focusCost: 0, focusGain: 1,
    summary: 'Fast. Acts early. +1 Focus.' }),
  chargedShot: Object.freeze({ id: 'chargedShot', name: 'Radiant Shot', skill: 'chargedShot', hotkey: '2', kind: 'attack', power: 38, hits: 1, accuracy: 0.85, critChance: 0.2, priority: -1, focusCost: 2, focusGain: 0,
    summary: 'Heavy hit. Acts last. Costs 2 Focus.' }),
  volley: Object.freeze({ id: 'volley', name: 'Triple Volley', skill: 'volley', hotkey: '3', kind: 'attack', power: 11, hits: 3, accuracy: 0.8, critChance: 0.08, priority: 0, focusCost: 1, focusGain: 0,
    summary: 'Three arrows, each rolls to hit. Costs 1 Focus.' }),
  guard: Object.freeze({ id: 'guard', name: 'Guard', skill: 'guard', hotkey: '4', kind: 'guard', priority: 3, focusCost: 0, focusGain: 2, guardFactor: 0.5,
    summary: 'Acts first. Halves damage this round. +2 Focus.' }),
});
export const ACTION_ORDER = Object.freeze(['quickShot', 'chargedShot', 'volley', 'guard']);

/** mulberry32 step on an explicit state: returns [value in [0, 1), next state]. */
export function rngNext(state) {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

function makeRoller(state) {
  const roller = { state, next() { const [v, s] = rngNext(roller.state); roller.state = s; return v; } };
  return roller;
}

const clone = (x) => JSON.parse(JSON.stringify(x));

export function createBattle({ seed = 1, units } = {}) {
  if (!Array.isArray(units) || units.length < 2) throw new Error('a battle needs at least two units');
  const ids = new Set();
  const list = units.map((u) => {
    if (!u.id || ids.has(u.id)) throw new Error(`unit id ${u.id} missing or repeated`);
    ids.add(u.id);
    for (const key of ['maxHp', 'atk', 'def', 'spd']) if (!(Number(u[key]) > 0)) throw new Error(`unit ${u.id}: ${key} must be > 0`);
    return { id: u.id, name: u.name || u.id, team: u.team, maxHp: u.maxHp, hp: u.hp ?? u.maxHp, atk: u.atk, def: u.def, spd: u.spd,
      focus: Math.min(MAX_FOCUS, u.focus ?? 1), guarding: false, ko: false };
  });
  if (new Set(list.map((u) => u.team)).size < 2) throw new Error('a battle needs two teams');
  return { round: 1, rng: (seed >>> 0) || 1, units: list, phase: 'choose', winner: null, history: [] };
}

export function unitById(battle, id) {
  return battle.units.find((u) => u.id === id) || null;
}

export function opponentsOf(battle, id) {
  const me = unitById(battle, id);
  return battle.units.filter((u) => u.team !== me.team && !u.ko);
}

/** Every action with whether this unit may take it now. */
export function legalActions(battle, unitId) {
  const unit = unitById(battle, unitId);
  return ACTION_ORDER.map((id) => {
    const a = ACTIONS[id];
    let reason = null;
    if (!unit || unit.ko) reason = 'down';
    else if (battle.phase !== 'choose') reason = 'battle over';
    else if (unit.focus < a.focusCost) reason = `needs ${a.focusCost} Focus`;
    return { id, action: a, enabled: reason === null, reason };
  });
}

export function isLegal(battle, unitId, actionId) {
  return legalActions(battle, unitId).some((a) => a.id === actionId && a.enabled);
}

/**
 * Damage of one arrow. variance in [0, 1) maps to x0.9..x1.1; attack and defence scale by their square-root ratio.
 */
export function computeDamage({ power, atk, def, variance = 0.5, crit = false, guarded = false, guardFactor = 0.5 }) {
  const ratio = Math.sqrt(atk / def);
  let dmg = power * ratio * (0.9 + 0.2 * variance);
  if (crit) dmg *= 1.5;
  if (guarded) dmg *= guardFactor;
  return Math.max(1, Math.round(dmg));
}

/**
 * Initiative for a round: higher action priority first, then higher speed, then a seeded coin.
 * @param {object} choices { unitId: actionId }
 * @returns {{order:string[], rng:number}}
 */
export function turnOrder(battle, choices, rng = battle.rng) {
  const roller = makeRoller(rng);
  const entries = battle.units.filter((u) => !u.ko && choices[u.id]).map((u) => ({ id: u.id, priority: ACTIONS[choices[u.id]]?.priority ?? 0, spd: u.spd, coin: roller.next() }));
  entries.sort((a, b) => b.priority - a.priority || b.spd - a.spd || b.coin - a.coin);
  return { order: entries.map((e) => e.id), rng: roller.state };
}

/** The opponent's pick: guard when hurt and low on Focus, the heavy shot when it can, otherwise mostly quick shots. */
export function chooseAiAction(battle, unitId) {
  const unit = unitById(battle, unitId);
  const r = rngNext((battle.rng ^ 0x9e3779b9 ^ (battle.round * 7919)) >>> 0)[0];
  const legal = new Set(legalActions(battle, unitId).filter((a) => a.enabled).map((a) => a.id));
  const hurt = unit.hp / unit.maxHp < 0.35;
  if (hurt && unit.focus < 2 && r < 0.45 && legal.has('guard')) return 'guard';
  if (legal.has('chargedShot') && r < 0.7) return 'chargedShot';
  if (legal.has('volley') && r < 0.45) return 'volley';
  if (r > 0.9 && legal.has('guard')) return 'guard';
  return 'quickShot';
}

/**
 * Resolve one round. Throws on an illegal choice.
 * @param {object} choices { unitId: actionId } for every living unit
 * @returns {{battle:object, round:object}} the next battle state and what happened, step by step (for animation):
 *   round.steps[i] = { actor, action, target, skipped?, focus: [before, after], hits: [{ hit, crit, damage, guarded,
 *   hpBefore, hpAfter, ko }] }
 */
export function resolveRound(battle, choices) {
  if (battle.phase !== 'choose') throw new Error('the battle is over');
  for (const u of battle.units) {
    if (u.ko) continue;
    if (!choices[u.id]) throw new Error(`no action for ${u.id}`);
    if (!isLegal(battle, u.id, choices[u.id])) throw new Error(`${u.id} cannot use ${choices[u.id]}`);
  }
  const next = clone(battle);
  const { order, rng } = turnOrder(next, choices);
  const roller = makeRoller(rng);
  const steps = [];
  for (const actorId of order) {
    const actor = unitById(next, actorId);
    const action = ACTIONS[choices[actorId]];
    if (actor.ko) { steps.push({ actor: actorId, action: action.id, skipped: 'down', hits: [] }); continue; }
    const targets = opponentsOf(next, actorId);
    if (targets.length === 0) { steps.push({ actor: actorId, action: action.id, skipped: 'no target', hits: [] }); continue; }
    const target = targets[0];
    const focusBefore = actor.focus;
    actor.focus -= action.focusCost;
    const step = { actor: actorId, action: action.id, target: target.id, hits: [] };
    if (action.kind === 'guard') {
      actor.guarding = true;
    } else {
      for (let i = 0; i < action.hits; i += 1) {
        if (target.ko) break;
        const hit = roller.next() < action.accuracy;
        const crit = hit && roller.next() < action.critChance;
        const variance = roller.next();
        const hpBefore = target.hp;
        const damage = hit ? computeDamage({ power: action.power, atk: actor.atk, def: target.def, variance, crit, guarded: target.guarding, guardFactor: ACTIONS.guard.guardFactor }) : 0;
        target.hp = Math.max(0, target.hp - damage);
        if (target.hp === 0) target.ko = true;
        step.hits.push({ index: i, hit, crit, damage, guarded: hit && target.guarding, hpBefore, hpAfter: target.hp, ko: target.ko });
      }
    }
    actor.focus = Math.min(MAX_FOCUS, actor.focus + action.focusGain);
    step.focus = [focusBefore, actor.focus];
    steps.push(step);
  }
  for (const u of next.units) u.guarding = false;
  next.rng = roller.state;
  const teamsStanding = new Set(next.units.filter((u) => !u.ko).map((u) => u.team));
  if (teamsStanding.size <= 1) {
    next.phase = 'over';
    next.winner = teamsStanding.size === 1 ? [...teamsStanding][0] : null;
  }
  const round = { number: battle.round, choices: { ...choices }, order, steps };
  next.history = [...battle.history, { number: round.number, choices: round.choices, order }];
  next.round = battle.round + 1;
  return { battle: next, round };
}
