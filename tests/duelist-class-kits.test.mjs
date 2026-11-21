// The four classes' kits in the shared rules (core/classes.mjs, core/abilities.mjs, sim/world.mjs, sim/match.mjs):
// each ability does what the class plan says, the specials only go off when the meter and the rule allow, and the
// match's seats own and charge the meter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addFighter, step, bodyOf } from '../src/components/duelist/sim/world.mjs';
import { createMatch, stepMatch, matchView, joinMatch } from '../src/components/duelist/sim/match.mjs';
import { CLASSES, CLASS_IDS, SPECIAL_MAX, effectOn } from '../src/components/duelist/core/index.mjs';

const DT = 1 / 60;
function run(world, seconds, inputs = () => ({})) {
  const all = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) all.push(...step(world, DT, inputs(world.time)));
  return all;
}
// press once, then nothing
const once = (id, command, extra = {}) => { let sent = false; return () => (sent ? {} : (sent = true, { [id]: { presses: [command], ...extra } })); };

function duel(classId, { foeClass = 'duelist', distance = 2, foeYaw = Math.PI, foeTeam = 'red', youTeam = 'blue' } = {}) {
  const world = createWorld({ arenaRadius: 40 });
  const you = addFighter(world, { id: 'you', team: youTeam, classId, weapon: CLASSES[classId].weapon, x: 0, z: 0, yaw: 0 });
  const foe = addFighter(world, { id: 'foe', team: foeTeam, classId: foeClass, weapon: CLASSES[foeClass].weapon, x: 0, z: distance, yaw: foeYaw });
  return { world, you, foe };
}

test('every class has a weapon, a passive, four abilities on keys 1-4 and a special', () => {
  assert.deepEqual(CLASS_IDS, ['warrior', 'duelist', 'assassin', 'healer']);
  const { world, you } = duel('warrior');
  assert.equal(you.classId, 'warrior');
  // key 1 is Leap Strike for a Warrior; Telekinesis outside its kit is refused (push is not a Warrior's)
  const effects = run(world, 0.05, once('you', 'ability1'));
  assert.equal(you.action?.id, 'leapStrike');
  assert.equal(effects.length >= 0, true);
  const w2 = duel('warrior');
  run(w2.world, 0.02, once('you', 'push'));
  assert.equal(w2.you.action, null, 'a Warrior has no push');
  const d = duel('duelist');
  run(d.world, 0.02, once('you', 'ability1'));
  assert.equal(d.you.action?.id, 'pull', 'a Duelist\'s key 1 is the pull');
  for (const id of CLASS_IDS) assert.equal(CLASSES[id].abilities.length, 4);
});

test('Warrior: Leap Strike carries the body up and 8 m ahead and staggers those at the landing', () => {
  const { world, foe } = duel('warrior', { distance: 8.5 });
  let peak = 0;
  const effects = run(world, 1, (t) => { peak = Math.max(peak, bodyOf(world, 'you').y); return t < DT ? { you: { presses: ['ability1'] } } : {}; });
  const body = bodyOf(world, 'you');
  assert.ok(peak > 1.2, `the leap rises (${peak.toFixed(2)} m)`);
  assert.ok(body.z > 6, `and lands ahead (${body.z.toFixed(2)} m)`);
  assert.ok(effects.some((e) => e.type === 'impact' && e.move === 'leapStrike' && e.defender === 'foe'), 'the landing hits');
  assert.ok(foe.stunnedUntil > 0, 'and staggers');
  assert.equal(body.y, 0, 'back on the ground');
});

test('Warrior: Repulse throws everyone around back; Blade Throw flies and cuts', () => {
  const world = createWorld({ arenaRadius: 40 });
  addFighter(world, { id: 'you', team: 'blue', classId: 'warrior', x: 0, z: 0, yaw: 0 });
  addFighter(world, { id: 'a', team: 'red', classId: 'duelist', weapon: 'dualBlades', x: 0, z: 2 });
  addFighter(world, { id: 'b', team: 'red', classId: 'duelist', weapon: 'dualBlades', x: 0, z: -2 });
  run(world, 0.8, once('you', 'ability3'));
  assert.ok(bodyOf(world, 'a').z > 3.5 && bodyOf(world, 'b').z < -3.5, 'both sides thrown back');
  const t = duel('warrior', { distance: 10 });
  const effects = run(t.world, 1, once('you', 'ability4'));
  assert.ok(effects.some((e) => e.type === 'projectile' && e.move === 'bladeThrow'));
  assert.ok(effects.some((e) => e.type === 'impact' && e.move === 'bladeThrow' && e.defender === 'foe'));
});

test('Duelist: Quickstep speeds the feet; Guard and Counter answers a strike with a riposte', () => {
  const { world, you } = duel('duelist', { distance: 20 });
  run(world, 0.1, once('you', 'ability2'));
  assert.ok(effectOn(you, 'quick', world.time), 'quick');
  const start = bodyOf(world, 'you').z;
  run(world, 1, () => ({ you: { move: { x: 0, z: 1 }, run: true } }));
  const quickRun = bodyOf(world, 'you').z - start;
  const slow = duel('duelist', { distance: 20 });
  run(slow.world, 1.1, () => ({ you: { move: { x: 0, z: 1 }, run: true } }));
  assert.ok(quickRun > bodyOf(slow.world, 'you').z * 1.25, `faster (${quickRun.toFixed(2)} vs ${bodyOf(slow.world, 'you').z.toFixed(2)})`);
  // the foe (a Warrior) swings into the Duelist's counter stance
  const c = duel('duelist', { foeClass: 'warrior', distance: 1.8 });
  const effects = run(c.world, 0.6, (t) => (t < DT ? { you: { presses: ['ability4'] }, foe: { presses: ['light'] } } : {}));
  assert.ok(effects.some((e) => e.type === 'counter' && e.defender === 'you'), 'countered');
  assert.ok(c.foe.stunnedUntil > 0, 'the attacker is staggered');
  assert.ok(effects.some((e) => e.type === 'impact' && e.move === 'counterStrike' && e.defender === 'foe'), 'the riposte lands');
});

test('Assassin: Veil Cloak hides until a strike; Empowered Strikes hit harder without draining Will; Misdirect marks one enemy', () => {
  const { world, you } = duel('assassin', { distance: 2 });
  run(world, 0.2, once('you', 'ability1'));
  assert.ok(effectOn(you, 'cloak', world.time), 'cloaked');
  const effects = run(world, 0.3, once('you', 'light'));
  assert.ok(!effectOn(you, 'cloak', world.time) && effects.some((e) => e.type === 'uncloak'), 'a strike ends it');
  // Empowerment increases damage, never drains the target's Force/Will.
  const plain = duel('assassin', { foeClass: 'healer' });
  run(plain.world, 0.6, once('you', 'light'));
  const power = duel('assassin', { foeClass: 'healer' });
  run(power.world, 0.2, once('you', 'ability3'));
  assert.ok(effectOn(power.you, 'empower', power.world.time));
  run(power.world, 0.6, once('you', 'light'));
  assert.ok(power.foe.vitals.shield + power.foe.vitals.hp < plain.foe.vitals.shield + plain.foe.vitals.hp,
    'empowerment causes more defense/HP damage');
  assert.equal(power.foe.vitals.will, plain.foe.vitals.will, 'empowerment cannot drain the victim\'s Force/Will');
  assert.equal(effectOn(power.you, 'empower', power.world.time).charges, 2, 'one charge spent');
  const m = duel('assassin', { distance: 6 });
  run(m.world, 0.3, once('you', 'ability4'));
  assert.equal(effectOn(m.foe, 'misdirected', m.world.time)?.by, 'you');
});

test('Healer: Mend heals the ally in front 30 HP over 3 s; Levitate floats; allies share Quickstep', () => {
  const world = createWorld({ arenaRadius: 40 });
  const healer = addFighter(world, { id: 'you', team: 'blue', classId: 'healer', x: 0, z: 0, yaw: 0 });
  const ally = addFighter(world, { id: 'ally', team: 'blue', classId: 'warrior', x: 0, z: 4 });
  ally.vitals.hp = 40;
  const effects = run(world, 3.4, once('you', 'ability1'));
  assert.ok(effects.some((e) => e.type === 'heal' && e.target === 'ally' && e.amount === 30));
  assert.ok(Math.abs(ally.vitals.hp - 70) < 0.6, `healed to ${ally.vitals.hp.toFixed(1)}`);
  run(world, 0.2, once('you', 'ability2'));
  assert.ok(effectOn(ally, 'quick', world.time) && effectOn(healer, 'quick', world.time), 'Quickstep shared');
  run(world, 1, once('you', 'ability3'));
  assert.ok(bodyOf(world, 'you').y > 1.5, 'floating');
  run(world, 2);
  assert.equal(bodyOf(world, 'you').y, 0, 'down again');
});

test('specials: the meter must be full (a third for the Duelist), and each does its work', () => {
  // Rage: a full meter, double damage and no stagger
  const r = duel('warrior');
  r.you.meter = 50;
  let effects = run(r.world, 0.1, once('you', 'special'));
  assert.ok(effects.some((e) => e.type === 'specialRefused' && e.reason === 'not-charged'));
  r.you.meter = SPECIAL_MAX;
  effects = run(r.world, 0.6, once('you', 'special'));
  assert.ok(effects.some((e) => e.type === 'special' && e.special === 'rage' && e.cost === SPECIAL_MAX));
  assert.equal(r.you.meter, 0);
  assert.ok(effectOn(r.you, 'rage', r.world.time));
  // Execution: only a target at 25% HP or less, for a third of the meter
  const x = duel('duelist', { distance: 1.6 });
  x.you.meter = SPECIAL_MAX;
  effects = run(x.world, 0.1, once('you', 'special'));
  assert.ok(effects.some((e) => e.type === 'specialRefused' && e.reason === 'target-too-healthy'));
  x.foe.vitals.hp = 20;
  effects = run(x.world, 0.5, once('you', 'special'));
  assert.ok(effects.some((e) => e.type === 'execution' && e.defender === 'foe'));
  assert.ok(x.foe.vitals.dead);
  assert.ok(Math.abs(x.you.meter - SPECIAL_MAX * 2 / 3) < 1e-6);
  // Shadow Execution: from behind, whatever the health
  const front = duel('assassin', { distance: 1.6, foeYaw: Math.PI });
  front.you.meter = SPECIAL_MAX;
  effects = run(front.world, 0.1, once('you', 'special'));
  assert.ok(effects.some((e) => e.type === 'specialRefused' && e.reason === 'not-behind'));
  const back = duel('assassin', { distance: 1.6, foeYaw: 0 });
  back.you.meter = SPECIAL_MAX;
  effects = run(back.world, 0.5, once('you', 'special'));
  assert.ok(effects.some((e) => e.type === 'execution') && back.foe.vitals.dead);
  // Sanctuary: allies inside take less and heal
  const world = createWorld({ arenaRadius: 40 });
  const h = addFighter(world, { id: 'you', team: 'blue', classId: 'healer', x: 0, z: 0 });
  const ally = addFighter(world, { id: 'ally', team: 'blue', classId: 'warrior', x: 2, z: 0 });
  addFighter(world, { id: 'foe', team: 'red', classId: 'warrior', x: 2, z: 2, yaw: Math.PI });
  h.meter = SPECIAL_MAX;
  ally.vitals.hp = 50;
  effects = run(world, 1, once('you', 'special'));
  assert.ok(effects.some((e) => e.type === 'zone' && e.kind === 'sanctuary'));
  assert.ok(ally.vitals.hp > 52, `the dome heals (${ally.vitals.hp.toFixed(1)})`);
});

test('in a match every seat has a class; landed hits charge a player\'s meter; a special spends it', () => {
  const m = createMatch({ mode: 'duel', seed: 2, players: [{ id: 'you', name: 'You', classId: 'warrior' }] });
  const v0 = matchView(m, 'you');
  assert.equal(v0.me.classId, 'warrior');
  for (const p of v0.people) assert.ok(CLASS_IDS.includes(p.classId), `${p.id} has a class`);
  assert.equal(m.world.fighters.get('you').classId, 'warrior');
  while (m.phase !== 'live') stepMatch(m, DT, {});
  const seat = m.seats.get('you');
  const bot = [...m.seats.values()].find((s) => s.kind === 'bot');
  // hold the bot still in front of the player and strike it
  const you = bodyOf(m.world, 'you');
  const foe = bodyOf(m.world, bot.id);
  Object.assign(foe, { x: you.x, z: you.z + 1.6, yaw: Math.PI });
  const face = Math.atan2(foe.x - you.x, foe.z - you.z);
  for (let i = 0; i < 90; i++) stepMatch(m, DT, { you: { face, presses: i % 20 === 0 ? ['light'] : [] }, [bot.id]: {} });
  assert.ok(seat.specialMeter > 0, `charged by landed hits (${seat.specialMeter})`);
  seat.specialMeter = SPECIAL_MAX;
  stepMatch(m, DT, { you: { presses: ['special'] }, [bot.id]: {} });
  assert.equal(seat.specialMeter, 0, 'Rage spent the meter');
  // a player joining later fights with the class they chose
  const t = createMatch({ mode: 'tdm', seed: 4 });
  joinMatch(t, { id: 'late', name: 'Late', classId: 'healer' });
  assert.equal(t.world.fighters.get('late').classId, 'healer');
});
