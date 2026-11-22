// The owner's 2026-11-22 kit fixes, in the shared rules (sim/world.mjs, core/moves.mjs, core/abilities.mjs):
// targets from the lock, the Healer's Mend and Levitate, the Assassin's Mind Dominance and cloaked Shadow Execution,
// the Warrior's Leap Strike, the Duelist's quick Counter and its seize-stab-shove Execution, the taunts, and the clips
// made for them (tools/duelist/blender/moments.py).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addFighter, step, bodyOf, chosenTarget } from '../src/components/duelist/sim/world.mjs';
import { CLASSES, SPECIAL_MAX, effectOn, MOVES, CLIENT_COMMANDS, moveFor, isInvulnerable, TAUNTS, MOTION_CLIPS, clipAt } from '../src/components/duelist/core/index.mjs';
import { encodeInput, sanitizeInput } from '../src/components/duelist/net/protocol.mjs';
import { DEFAULT_KEYS } from '../src/components/duelist/client/bindings.mjs';

const DT = 1 / 60;
function run(world, seconds, inputs = () => ({})) {
  const all = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) all.push(...step(world, DT, inputs(world.time)));
  return all;
}
const once = (id, command, extra = {}) => { let sent = false; return () => (sent ? {} : (sent = true, { [id]: { presses: [command], ...extra } })); };
const fighter = (world, id, classId, team, x, z, yaw = 0) =>
  addFighter(world, { id, team, classId, weapon: CLASSES[classId].weapon, x, z, yaw });
const dist = (world, a, b) => Math.hypot(bodyOf(world, a).x - bodyOf(world, b).x, bodyOf(world, a).z - bodyOf(world, b).z);

test('the lock rides the input: it survives the trip to the server, and an over-long id is dropped', () => {
  const sent = sanitizeInput(encodeInput(3, { move: { x: 0, z: 1 }, presses: ['ability1'], target: 'ally' }));
  assert.equal(sent.target, 'ally');
  assert.equal(sanitizeInput(encodeInput(4, { move: { x: 0, z: 0 } })).target, null);
  assert.equal(sanitizeInput({ s: 5, tg: 'x'.repeat(65) }).target, null);
});

test('Healer: Mend heals the ally she is locked on to, else herself; an enemy lock heals herself', () => {
  const world = createWorld({ arenaRadius: 40 });
  const healer = fighter(world, 'you', 'healer', 'blue', 0, 0);
  const ally = fighter(world, 'ally', 'warrior', 'blue', 6, -3); // behind her right shoulder: not in front
  const foe = fighter(world, 'foe', 'warrior', 'red', 0, 5, Math.PI);
  ally.vitals.hp = 40;
  healer.vitals.hp = 50;
  let effects = run(world, 0.6, once('you', 'ability1', { target: 'ally' }));
  assert.ok(effects.some((e) => e.type === 'heal' && e.target === 'ally'), 'the locked ally, wherever she looks');
  run(world, 8.5);
  effects = run(world, 0.6, once('you', 'ability1', { target: null }));
  assert.ok(effects.some((e) => e.type === 'heal' && e.target === 'you'), 'no lock: herself');
  run(world, 8.5);
  effects = run(world, 0.6, once('you', 'ability1', { target: 'foe' }));
  assert.ok(effects.some((e) => e.type === 'heal' && e.target === 'you'), 'an enemy is never mended');
  assert.ok(foe.vitals.hp === foe.vitals.max.hp);
});

test('Healer: Levitate lifts the enemy she is locked on to, helpless; with nobody to lift it is refused, not spent', () => {
  const world = createWorld({ arenaRadius: 40 });
  const healer = fighter(world, 'you', 'healer', 'blue', 0, 0);
  const lonely = run(world, 0.1, once('you', 'ability3'));
  assert.ok(lonely.some((e) => e.type === 'abilityRefused' && e.ability === 'levitate' && e.reason === 'no-target'));
  assert.equal(healer.cooldowns.levitate ?? -Infinity, -Infinity, 'no cooldown spent');
  const foe = fighter(world, 'foe', 'warrior', 'red', 4, 8, Math.PI);
  let peak = 0;
  const lift = once('you', 'ability3', { target: 'foe' });
  run(world, 1.2, () => { peak = Math.max(peak, bodyOf(world, 'foe').y); return lift(); });
  assert.ok(peak > 1.6, `the enemy rises (${peak.toFixed(2)} m)`);
  assert.ok(effectOn(foe, 'levitate', world.time), 'and floats');
  assert.ok(foe.stunnedUntil > world.time, 'helpless');
  assert.equal(bodyOf(world, 'you').y, 0, 'the Healer stays on her feet');
  const before = { x: bodyOf(world, 'foe').x, z: bodyOf(world, 'foe').z };
  run(world, 0.4, () => ({ foe: { move: { x: 1, z: 0 }, presses: ['light'] } }));
  assert.ok(Math.hypot(bodyOf(world, 'foe').x - before.x, bodyOf(world, 'foe').z - before.z) < 0.05, 'it cannot move');
  assert.equal(foe.action, null, 'nor strike');
  run(world, 2);
  assert.equal(bodyOf(world, 'foe').y, 0, 'down again');
  // Rage shrugs it off
  const w2 = createWorld({ arenaRadius: 40 });
  fighter(w2, 'you', 'healer', 'blue', 0, 0);
  const rager = fighter(w2, 'foe', 'warrior', 'red', 0, 5, Math.PI);
  rager.meter = SPECIAL_MAX;
  run(w2, 0.7, once('foe', 'special'));
  const resisted = run(w2, 0.4, once('you', 'ability3', { target: 'foe' }));
  assert.ok(resisted.some((e) => e.type === 'resisted' && e.defender === 'foe'));
  assert.ok(!effectOn(rager, 'levitate', w2.time));
});

test('Assassin: Mind Dominance holds the enemy for 2 s; the second hit it takes breaks it', () => {
  const world = createWorld({ arenaRadius: 40 });
  fighter(world, 'you', 'assassin', 'blue', 0, 0);
  const foe = fighter(world, 'foe', 'duelist', 'red', 0, 2, Math.PI);
  fighter(world, 'ally', 'warrior', 'blue', 1.2, 2.4, -Math.PI / 2);
  run(world, 0.5, once('you', 'ability4', { target: 'foe' }));
  const d = effectOn(foe, 'dominated', world.time);
  assert.equal(d?.by, 'you');
  assert.ok(foe.stunnedUntil >= world.time + 1.4, 'it stands helpless');
  // nobody touches it: it lasts its 2 s
  const solo = createWorld({ arenaRadius: 40 });
  fighter(solo, 'you', 'assassin', 'blue', 0, 0);
  const lone = fighter(solo, 'foe', 'duelist', 'red', 0, 2, Math.PI);
  run(solo, 0.5, once('you', 'ability4', { target: 'foe' }));
  run(solo, 1.4);
  assert.ok(effectOn(lone, 'dominated', solo.time) && lone.stunnedUntil > solo.time, 'held to the end');
  // first hit: still held; second hit: free
  const hits = [];
  for (let i = 0; i < 2; i++) {
    const effects = run(world, 0.55, once('ally', 'light'));
    hits.push(effects.filter((e) => e.type === 'impact' && e.defender === 'foe' && e.outcome === 'hit').length);
    if (i === 0) assert.ok(effectOn(foe, 'dominated', world.time), 'one hit does not break it');
  }
  assert.ok(hits[0] >= 1 && hits[1] >= 1, `two hits landed (${hits})`);
  assert.equal(effectOn(foe, 'dominated', world.time), null, 'the second breaks it');
  assert.ok(foe.stunnedUntil <= world.time + 0.3, 'and it can act again');
});

test('Assassin: cloaked, Shadow Execution steps to the back of an enemy 10 m away and finishes it', () => {
  const world = createWorld({ arenaRadius: 40 });
  const you = fighter(world, 'you', 'assassin', 'blue', 0, 0);
  const foe = fighter(world, 'foe', 'warrior', 'red', 0, 10, Math.PI); // facing her: no back to strike
  you.meter = SPECIAL_MAX;
  const open = run(world, 0.1, once('you', 'special', { target: 'foe' }));
  assert.ok(open.some((e) => e.type === 'specialRefused'), 'uncloaked, too far and in front: refused');
  run(world, 0.3, once('you', 'ability1')); // Veil Cloak
  assert.ok(effectOn(you, 'cloak', world.time));
  const effects = run(world, 0.8, once('you', 'special', { target: 'foe' }));
  const blink = effects.find((e) => e.type === 'blink');
  assert.ok(blink, 'she steps through the veil');
  assert.ok(effects.some((e) => e.type === 'execution' && e.defender === 'foe') && foe.vitals.dead, 'and finishes it');
  assert.ok(dist(world, 'you', 'foe') < 1.6, 'right behind it');
  assert.ok(!effectOn(you, 'cloak', world.time), 'the cloak falls away');
});

test('Warrior: Leap Strike leaps at the enemy it is locked on to, off to the side, and lands on it', () => {
  const world = createWorld({ arenaRadius: 40 });
  fighter(world, 'you', 'warrior', 'blue', 0, 0, 0);
  const foe = fighter(world, 'foe', 'duelist', 'red', 6, 5, -Math.PI / 2); // ahead and to the right
  const leap = once('you', 'ability1', { target: 'foe' });
  let landedAt = null;
  const effects = run(world, 1, () => { if (!landedAt && world.fighters.get('you').action?.t >= 0.58) landedAt = { ...bodyOf(world, 'you') }; return leap(); });
  const short = Math.hypot(landedAt.x - 6, landedAt.z - 5);
  assert.ok(short > 0.8 && short < 1.6, `landed on it, just short (${short.toFixed(2)} m from where it stood)`);
  assert.ok(effects.some((e) => e.type === 'impact' && e.move === 'leapStrike' && e.defender === 'foe'), 'the slam hits it');
  assert.ok(foe.stunnedUntil > 0, 'and staggers it');
  // locked on to someone out of reach: the leap goes at the nearest ahead, or straight on
  assert.equal(moveFor({ classId: 'warrior' }, 'leapStrike').seek >= 10, true);
});

test('Duelist: Guard and Counter costs no Will and is ready again in 1.5 s', () => {
  const world = createWorld({ arenaRadius: 40 });
  const you = fighter(world, 'you', 'duelist', 'blue', 0, 0);
  fighter(world, 'foe', 'warrior', 'red', 0, 1.8, Math.PI);
  const will = you.vitals.will;
  run(world, 0.05, once('you', 'ability4'));
  assert.equal(you.action?.id, 'counter');
  assert.equal(you.vitals.will, will, 'no Will');
  assert.equal(MOVES.counter.cooldown, 1.5);
  run(world, 1.5);
  run(world, 0.05, once('you', 'ability4'));
  assert.equal(you.action?.id, 'counter', 'ready again');
  // and it still answers a strike
  const c = createWorld({ arenaRadius: 40 });
  fighter(c, 'you', 'duelist', 'blue', 0, 0);
  const foe = fighter(c, 'foe', 'warrior', 'red', 0, 1.8, Math.PI);
  const effects = run(c, 0.6, (t) => (t < DT ? { you: { presses: ['ability4'] }, foe: { presses: ['light'] } } : {}));
  assert.ok(effects.some((e) => e.type === 'counter' && e.defender === 'you'));
  assert.ok(foe.stunnedUntil > 0);
});

test('Duelist: Execution seizes an enemy at 30% from 6 m, draws it in, runs it through and pushes the body away', () => {
  const world = createWorld({ arenaRadius: 40 });
  const you = fighter(world, 'you', 'duelist', 'blue', 0, 0);
  const foe = fighter(world, 'foe', 'warrior', 'red', 0, 6, Math.PI);
  you.meter = SPECIAL_MAX;
  foe.vitals.hp = 30;
  const seized = run(world, 0.05, once('you', 'special', { target: 'foe' }));
  assert.ok(seized.some((e) => e.type === 'special' && e.special === 'execution' && e.target === 'foe'));
  assert.ok(seized.some((e) => e.type === 'seized' && e.target === 'foe'));
  run(world, 0.6);
  assert.ok(dist(world, 'you', 'foe') < 1.4, `drawn in (${dist(world, 'you', 'foe').toFixed(2)} m)`);
  assert.ok(!foe.vitals.dead, 'not yet: the blade goes in at the end of the wind-up');
  assert.ok(isInvulnerable(you, world.time), 'nothing touches the Duelist meanwhile');
  const effects = run(world, 0.3);
  assert.ok(effects.some((e) => e.type === 'execution' && e.defender === 'foe') && foe.vitals.dead, 'run through');
  const after = run(world, 1.2);
  assert.ok(after.some((e) => e.type === 'shove' && e.target === 'foe'), 'the blade comes out and the body is pushed');
  assert.ok(dist(world, 'you', 'foe') > 3.5, `pushed away (${dist(world, 'you', 'foe').toFixed(2)} m)`);
});

test('T taunts, each class its own: a client command and a key; moving off cuts it short', () => {
  assert.ok(CLIENT_COMMANDS.has('taunt'));
  assert.equal(DEFAULT_KEYS.taunt, 'KeyT');
  const world = createWorld({ arenaRadius: 40 });
  const you = fighter(world, 'you', 'healer', 'blue', 0, 0);
  run(world, 0.1, once('you', 'taunt'));
  assert.equal(you.action?.id, 'tauntHealer');
  run(world, 0.1, () => ({ you: { move: { x: 1, z: 0 } } }));
  assert.equal(you.action, null, 'moving off ends it');
  run(world, 0.05, once('you', 'taunt'));
  assert.equal(you.action, null, 'not again so soon');
  // every class has a taunt of its own, with a clip made for it; a fighter with no class has the plain one
  const clips = new Set();
  for (const [classId, id] of Object.entries(TAUNTS)) {
    const w = createWorld({ arenaRadius: 40 });
    const f = fighter(w, 'f', classId, 'blue', 0, 0);
    run(w, 0.05, once('f', 'taunt'));
    assert.equal(f.action?.id, id, classId);
    const { clip } = clipAt(id, 1);
    assert.equal(MOTION_CLIPS[clip].source, 'blender', `${id} plays a clip made for it`);
    clips.add(clip);
  }
  assert.equal(clips.size, 4, 'four different taunts');
  const plain = createWorld({ arenaRadius: 40 });
  const nobody = addFighter(plain, { id: 'n', team: 'blue', weapon: 'sword', x: 0, z: 0 });
  run(plain, 0.05, once('n', 'taunt'));
  assert.equal(nobody.action?.id, 'taunt');
});

test("the Execution's clip drives the blade in as the rules kill, and the Rage roars over its wind-up", () => {
  const ex = MOVES.execution;
  const { clip } = clipAt('execution', ex.startup);
  assert.equal(clip, 'bladesExecution');
  const thrust = MOTION_CLIPS[clip].peaks.filter((p) => p.hand === 'right').sort((a, b) => b.speed - a.speed)[0];
  const kill = clipAt('execution', ex.startup).time;
  assert.ok(thrust.t <= kill && kill - thrust.t < 0.1, `the right hand drives in at ${thrust.t} s, the kill at ${kill} s`);
  assert.equal(clipAt('rage', 0.3).clip, 'swordRoar');
  assert.equal(clipAt('dominate', 0.1).clip, 'staffDominate');
});

test('a lock on someone who does not qualify is passed over', () => {
  const world = createWorld({ arenaRadius: 60 });
  const you = fighter(world, 'you', 'assassin', 'blue', 0, 0);
  fighter(world, 'far', 'warrior', 'red', 0, 30, Math.PI);
  const near = fighter(world, 'near', 'warrior', 'red', 0, 5, Math.PI);
  you.lock = 'far';
  assert.equal(chosenTarget(world, you, bodyOf(world, 'you'), moveFor(you, 'dominate'), 'enemy'), near, 'out of reach: the nearest in front');
  you.lock = 'nobody';
  assert.equal(chosenTarget(world, you, bodyOf(world, 'you'), moveFor(you, 'dominate'), 'enemy'), near);
});
