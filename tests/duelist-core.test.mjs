// Duelist Adventure rules core: the Will system from the owner's design document (shield and armor, the
// Dimensional Veil, the body; Veil Collapse; Veil Breach), the frame data, chains and cancels, and the
// fair-play limits (cooldowns, one buffered press, the server's input budget).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VITALS, VEIL, BLOCK, BREACH, INPUT, MOVES,
  createVitals, veilState, regenerate, resolveHit,
  createFighter, press, update, takeEvents, stagger, isInvulnerable, isBreachedBy, blockedReason,
  strike, insideArc, createInputRateLimiter, isClientCommand,
} from '../src/components/duelist/core/index.mjs';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const bare = (v) => ({ vitals: v, invulnerable: false, guard: null, breached: false });
// run a fighter for `seconds` in 1/120 s steps from `from`; returns the time reached and the events
function run(f, from, seconds, step = 1 / 120) {
  let t = from;
  const events = [];
  for (let i = 0; i < Math.round(seconds / step); i++) { t += step; update(f, step, t); events.push(...takeEvents(f)); }
  return { t, events };
}

test('a hit meets the shield first, then the Veil spends Will; the body is untouched while the Veil holds', () => {
  const v = createVitals();
  const r = resolveHit(bare(v), { damage: 50 }, 0);
  assert.equal(r.outcome, 'hit');
  assert.ok(near(r.shieldDamage, VITALS.shield));
  assert.ok(near(r.willSpent, 50 - VITALS.shield));
  assert.equal(r.hpDamage, 0);
  assert.equal(v.hp, VITALS.hp);
  assert.equal(veilState(v), 'stable');
  // shield-breaking weapons count for more against shields
  const w = createVitals();
  const sniper = resolveHit(bare(w), { damage: 20, shieldMultiplier: 2 }, 0);
  assert.ok(near(sniper.shieldDamage, 40) && near(sniper.willSpent, 0), 'a 20-point sniper hit takes the whole 40-point shield');
});

test('an unstable Veil leaks part of each hit; at zero Will it collapses and the body takes the rest', () => {
  const v = createVitals({ shield: 0 });
  v.will = 30; // below 35 %: unstable
  assert.equal(veilState(v), 'unstable');
  const r = resolveHit(bare(v), { damage: 20 }, 0);
  assert.ok(near(r.hpDamage, 20 * VEIL.unstableLeak), `leak ${r.hpDamage}`);
  assert.ok(near(r.willSpent, 20 * (1 - VEIL.unstableLeak)));
  const big = resolveHit(bare(v), { damage: 40 }, 0.1); // 15 Will left
  assert.equal(big.collapsed, true);
  assert.equal(veilState(v), 'collapsed');
  assert.ok(near(v.hp, 100 - 5 - (40 - 15)), `hp ${v.hp}`); // 25 % leak of 40 = 10, Will stops 15 of 30, 15 through
  const after = resolveHit(bare(v), { damage: 10 }, 0.2);
  assert.equal(after.willSpent, 0);
  assert.equal(after.hpDamage, 10, 'collapsed: straight to the body');
});

test('the Veil re-forms only after its delay and enough Will; stamina and Will recover separately', () => {
  const v = createVitals();
  v.will = 0; v.collapsed = true; v.collapsedAt = 0;
  regenerate(v, 1, 3); // before the collapse delay
  assert.equal(v.will, 0);
  let t = VEIL.collapseRecoverDelay;
  while (v.collapsed && t < 30) { t += 0.1; regenerate(v, 0.1, t); }
  assert.ok(!v.collapsed && v.will >= VEIL.collapseRestoreAt - 1e-6, `re-formed at ${v.will.toFixed(1)} Will after ${t.toFixed(1)} s`);
  const s = createVitals();
  s.stamina = 0; s.winded = true; s.lastStaminaSpend = 0;
  regenerate(s, 0.5, 0.5);
  assert.equal(s.stamina, 0, 'stamina waits for its own delay');
  regenerate(s, 1, 2);
  assert.ok(s.stamina > 0 && s.will === VITALS.will);
});

test('a guard parries when fresh, blocks while it has stamina, and breaks when it runs dry', () => {
  const parry = resolveHit({ ...bare(createVitals()), guard: { since: 1, facing: true } }, { damage: 20 }, 1 + BLOCK.parryWindow / 2);
  assert.equal(parry.outcome, 'parried');
  const v = createVitals({ shield: 0 });
  const blocked = resolveHit({ ...bare(v), guard: { since: 0, facing: true } }, { damage: 20 }, 1);
  assert.equal(blocked.outcome, 'blocked');
  assert.ok(near(blocked.staminaSpent, 20 * BLOCK.staminaPerDamage));
  assert.ok(near(blocked.willSpent, 20 * BLOCK.chip), 'only the chip reaches the Veil');
  const tired = createVitals({ shield: 0 });
  tired.stamina = 5;
  const broke = resolveHit({ ...bare(tired), guard: { since: 0, facing: true } }, { damage: 20 }, 1);
  assert.equal(broke.outcome, 'guardBreak');
  assert.equal(broke.stagger, BLOCK.guardBreakStagger);
  assert.ok(tired.winded);
  // a guard covers the front only; telekinesis cannot be blocked
  assert.equal(resolveHit({ ...bare(createVitals()), guard: { since: 0, facing: false } }, { damage: 10 }, 1).outcome, 'hit');
  assert.equal(resolveHit({ ...bare(createVitals()), guard: { since: 0, facing: true } }, { damage: 10, blockable: false }, 1).outcome, 'hit');
  assert.ok(insideArc({ x: 0, z: 0 }, 0, { x: 0, z: 3 }, BLOCK.frontArcDeg) && !insideArc({ x: 0, z: 0 }, 0, { x: 0, z: -3 }, BLOCK.frontArcDeg));
});

test('Veil Breach lets one attacker reach the body for a moment; Resist throws it off', () => {
  const a = createFighter({ id: 'a' });
  const b = createFighter({ id: 'b' });
  const c = createFighter({ id: 'c' });
  b.vitals.shield = 0;
  assert.equal(press(a, 'breach', 0).accepted, true);
  assert.equal(a.vitals.will, VITALS.will - MOVES.breach.will);
  strike(a, b, 'breach', { now: 0.2 });
  assert.ok(isBreachedBy(b, 'a', 0.3) && !isBreachedBy(b, 'c', 0.3));
  const through = strike(a, b, 'swordLight1', { now: 0.4 });
  assert.equal(through.result.hpDamage, MOVES.swordLight1.damage, "the breaching attacker's hit reaches the body");
  const stopped = strike(c, b, 'swordLight1', { now: 0.5 });
  assert.equal(stopped.result.hpDamage, 0, "others still meet the Veil");
  assert.ok(!isBreachedBy(b, 'a', 0.2 + BREACH.seconds + 0.01), 'the breach ends');
  strike(a, b, 'breach', { now: 9 });
  assert.equal(press(b, 'resist', 9.1).accepted, true);
  assert.ok(!isBreachedBy(b, 'a', 9.2), 'resist clears it');
});

test('roll: invulnerable frames, then it flows straight into a push (roll into push)', () => {
  const f = createFighter({ id: 'f' });
  assert.equal(press(f, 'roll', 0).accepted, true);
  let { t } = run(f, 0, 0.02);
  assert.equal(press(f, 'push', t).reason, 'buffered', 'too early: waits');
  ({ t } = run(f, t, 0.08));
  assert.ok(isInvulnerable(f), 'i-frames');
  // the early press is older than the buffer allows before the cancel point arrives: dropped, still rolling
  ({ t } = run(f, t, MOVES.roll.cancelFrom - t - 0.02));
  assert.equal(f.buffer, null);
  assert.equal(f.action.id, 'roll');
  assert.equal(press(f, 'push', t).reason, 'buffered');
  const { events } = run(f, t, 0.1);
  assert.ok(events.some((e) => e.type === 'interrupt' && e.id === 'roll' && e.by === 'push'), 'the push cancels the roll at its window');
  assert.equal(f.action.id, 'push');
});

test('sword chains in its window; a late press starts the chain over after the recovery', () => {
  const f = createFighter({ id: 'f', weapon: 'sword' });
  press(f, 'light', 0);
  let { t } = run(f, 0, MOVES.swordCutStandBalanced.chain.from + 0.02);
  press(f, 'light', t);
  assert.equal(f.action.id, 'swordCutRightBalanced');
  ({ t } = run(f, t, MOVES.swordCutRightBalanced.chain.from + 0.02));
  press(f, 'light', t);
  assert.equal(f.action.id, 'swordCutDownBalanced');
  ({ t } = run(f, t, MOVES.swordCutDownBalanced.duration + 0.05));
  press(f, 'light', t);
  assert.equal(f.action.id, 'swordCutStandBalanced');
  // dual blades: four quick hits, each draining Will harder than the sword
  const blades = createFighter({ id: 'b', weapon: 'dualBlades' });
  const ids = [];
  let u = 0;
  press(blades, 'light', u);
  for (let i = 0; i < 3; i++) { ({ t: u } = run(blades, u, blades.action.move.chain.from + 0.01)); ids.push(blades.action.id); press(blades, 'light', u); }
  ids.push(blades.action.id);
  assert.deepEqual(ids, ['bladesCutStand', 'bladesCutRight', 'bladesCutDown', 'bladesCutUp']);
  assert.ok(MOVES.bladesLight1.veilMultiplier > MOVES.swordLight1.veilMultiplier);
});

test('no spamming: cooldowns, one buffered press that expires, costs paid up front, the server budget', () => {
  const f = createFighter({ id: 'f' });
  let accepted = 0;
  let t = 0;
  for (let i = 0; i < 400; i++) { // mash push for 4 s
    if (press(f, 'push', t).accepted) accepted += 1;
    update(f, 0.01, t += 0.01);
    takeEvents(f);
  }
  assert.ok(accepted <= Math.ceil(4 / MOVES.push.cooldown), `${accepted} pushes in 4 s`);
  // a buffered press waits at most INPUT.bufferSeconds
  const g = createFighter({ id: 'g' });
  press(g, 'heavy', 0);
  press(g, 'heavy', 0.01);
  run(g, 0.01, INPUT.bufferSeconds + 0.05);
  assert.equal(g.buffer, null, 'dropped once too old');
  // costs: no Will, no power
  const h = createFighter({ id: 'h' });
  h.vitals.will = 5;
  assert.equal(blockedReason(h, 'push', 0), 'will');
  // winded: no roll until stamina has recovered
  const w = createFighter({ id: 'w' });
  w.vitals.stamina = 0; w.vitals.winded = true;
  assert.equal(press(w, 'roll', 0).reason, 'stamina');
  // the server drops floods
  const limiter = createInputRateLimiter();
  let ok = 0;
  for (let i = 0; i < 100; i++) if (limiter.allow(i * 0.001)) ok += 1;
  assert.ok(ok <= INPUT.burst + 1, `${ok} of 100 presses in 0.1 s`);
  assert.ok(isClientCommand('push') && !isClientCommand('damage'));
});

test('a stagger interrupts; a staggered or held fighter can only Resist', () => {
  const f = createFighter({ id: 'f' });
  press(f, 'heavy', 0);
  stagger(f, 0.6, 0.05);
  assert.equal(f.action, null);
  assert.equal(press(f, 'light', 0.1).reason, 'stunned');
  f.heldBy = 'x';
  assert.equal(press(f, 'push', 1).reason, 'held');
  assert.equal(press(f, 'resist', 1).accepted, true);
  assert.equal(f.heldBy, null);
});

test('Telekinesis grip: holds, crushes while Will lasts, throws on release; the target can Resist', () => {
  const a = createFighter({ id: 'a' });
  const b = createFighter({ id: 'b' });
  b.vitals.shield = 0; b.vitals.will = 0; b.vitals.collapsed = true; b.vitals.collapsedAt = 0;
  assert.equal(press(a, 'grip', 0).accepted, true);
  let t = 0;
  let crushed = 0;
  let thrown = false;
  for (let i = 0; i < 120; i++) {
    t += 1 / 60;
    if (i === 60) press(a, 'release', t);
    update(a, 1 / 60, t);
    for (const e of takeEvents(a)) {
      if (e.type === 'hit' && e.id === 'grip') strike(a, b, 'grip', { now: t });
      if (e.type === 'tick') crushed += strike(a, b, 'grip', { now: t, dt: e.dt }).result?.hpDamage || 0;
      if (e.type === 'hit' && e.id === 'gripThrow') thrown = strike(a, b, 'gripThrow', { now: t }).effects.some((x) => x.type === 'knockback');
    }
  }
  assert.ok(crushed > 5 && crushed < MOVES.grip.damage * 1.2, `crushed ${crushed.toFixed(1)} HP over ~1 s`);
  assert.ok(thrown && b.heldBy === null, 'thrown on release');
  assert.ok(a.vitals.will < VITALS.will - MOVES.grip.will, 'the grip costs Will while held');
  // resisting breaks the hold: no more crush
  const c = createFighter({ id: 'c' });
  const d = createFighter({ id: 'd' });
  press(c, 'grip', 0);
  run(c, 0, MOVES.grip.startup + 0.01);
  strike(c, d, 'grip', { now: 0.2 });
  press(d, 'resist', 0.3);
  assert.equal(strike(c, d, 'grip', { now: 0.4, dt: 0.1 }).result, null);
});

test('a parry staggers the attacker; the dead take no more hits', () => {
  const a = createFighter({ id: 'a' });
  const b = createFighter({ id: 'b' });
  press(b, 'blockDown', 0);
  const out = strike(a, b, 'swordLight1', { now: 0.05 });
  assert.equal(out.result.outcome, 'parried');
  assert.ok(a.stunnedUntil > 0.05 && out.effects.some((e) => e.type === 'parry'));
  b.vitals.dead = true;
  assert.equal(strike(a, b, 'swordHeavy', { now: 3 }).result, null);
});
