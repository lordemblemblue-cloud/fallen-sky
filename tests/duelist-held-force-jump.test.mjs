import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addFighter, bodyOf, respawnFighter, step } from '../src/components/duelist/sim/world.mjs';
import { HELD_JUMP } from '../src/components/duelist/sim/heldJump.mjs';
import { CLASS_IDS } from '../src/components/duelist/core/classes.mjs';
import { createLevel } from '../src/components/duelist/sim/level.mjs';
import { encodeInput, sanitizeInput, encodeOwn, applyOwn } from '../src/components/duelist/net/protocol.mjs';

const DT = 1 / 60;
const input = (presses = [], jumpHeld = undefined) => ({
  move: { x: 0, z: 0 }, presses, ...(typeof jumpHeld === 'boolean' ? { jumpHeld } : {}),
});
const tick = (world, presses = [], held = undefined) => step(world, DT, { hero: input(presses, held) });
const advance = (world, count, held) => { for (let i = 0; i < count; i++) tick(world, [], held); };

test('new jump starts on first tick, supports three bounded hold stages and never floats indefinitely', () => {
  const world = createWorld({ arenaRadius: 30 });
  addFighter(world, { id: 'hero', classId: 'healer' });
  tick(world, ['jump'], true);
  const b = bodyOf(world, 'hero');
  assert.ok(b.y > 0, 'ascent starts on Space press, no pre-jump charging delay');
  assert.ok(b.heldJump, 'hold state belongs to the simulation');
  assert.equal(b.heldJump.stage, 0, 'ordinary launch precedes Force-style rise');
  advance(world, 4, true);
  assert.equal(b.heldJump.stage, 1, '50ms of continuous hold upgrades the jump');
  advance(world, 18, true);
  assert.equal(b.heldJump.stage, 2);
  advance(world, 16, true);
  assert.equal(b.heldJump.stage, 3);
  let highest = b.y;
  for (let i = 0; i < 200 && b.jumped; i++) {
    tick(world, [], true);
    highest = Math.max(highest, b.y);
  }
  assert.ok(highest > 5.7, 'a long hold climbs above the second stage');
  assert.ok(highest <= HELD_JUMP.stages[2].height + 0.03, 'never exceeds the server maximum');
  assert.equal(b.y, 0);
  assert.equal(b.jumped, false);
  assert.equal(b.heldJump, null);
  assert.equal(b.vy, 0);
});

test('Space release stops rising immediately and cannot be re-armed in midair', () => {
  for (const classId of CLASS_IDS) {
    const world = createWorld({ arenaRadius: 30 });
    addFighter(world, { id: 'hero', classId });
    tick(world, ['jump'], true);
    advance(world, 12, true);
    const b = bodyOf(world, 'hero');
    assert.ok(b.vy > 0 && b.y > 0, classId);
    const level = b.heldJump.stage;
    const y = b.y;
    tick(world, [], false);
    assert.equal(b.heldJump?.rising, false, 'release permanently ends ascent');
    assert.ok(b.vy <= 0, 'velocity is cut on the release tick');
    assert.ok(b.y <= y, 'release never raises the character again');
    tick(world, ['jump'], true);
    assert.equal(b.heldJump?.stage, level, 'midair jump/hold cannot gain another tier');
    assert.ok(b.vy <= 0, 'Space re-press is not an infinite jetpack');
    advance(world, 160, false);
    assert.equal(b.y, 0, classId);
    assert.equal(b.jumped, false, classId);
    tick(world, ['jump'], true);
    assert.equal(b.jumped, true, classId + ': a confirmed landing allows the next jump');
    assert.ok(b.y > 0);
  }
});

test('old input packets and bots without the held-jump flag retain the original bounded arc', () => {
  const world = createWorld({ arenaRadius: 30 });
  addFighter(world, { id: 'hero' });
  tick(world, ['jump']);
  const b = bodyOf(world, 'hero');
  assert.equal(b.heldJump, null);
  let peak = b.y;
  for (let i = 0; i < 100; i++) {
    tick(world);
    peak = Math.max(peak, b.y);
  }
  assert.ok(peak >= 1 && peak <= 1.11, `classic jump arc retained: ${peak}`);
  assert.equal(b.y, 0);
});

test('story rooms remain within the first-stage ceiling-safety cap until vertical collision exists', () => {
  const world = createWorld({ level: createLevel(), arenaRadius: 30 });
  addFighter(world, { id: 'hero' });
  tick(world, ['jump'], true);
  const b = bodyOf(world, 'hero');
  let peak = b.y;
  for (let i = 0; i < 150 && b.jumped; i++) {
    tick(world, [], true);
    peak = Math.max(peak, b.y);
  }
  assert.ok(peak >= 3.0 && peak <= 3.34, `safe story ascent is bounded: ${peak}`);
});

test('air dash and respawn stop the old ascent and cannot mint fresh boost', () => {
  const world = createWorld({ arenaRadius: 30 });
  addFighter(world, { id: 'hero' });
  tick(world, ['jump'], true);
  advance(world, 10, true);
  const b = bodyOf(world, 'hero');
  assert.ok(b.heldJump?.rising);
  tick(world, ['dash'], true);
  advance(world, 6, true);
  tick(world, ['dash'], true);
  assert.equal(b.airDashUsed, true, 'double-tap air dash still works');
  assert.equal(b.heldJump, null, 'air dash ends force ascent');
  respawnFighter(world, 'hero');
  assert.equal(bodyOf(world, 'hero').heldJump, null);
  assert.equal(bodyOf(world, 'hero').jumped, false);
});

test('wire accepts only boolean held state, and private snapshots carry enough for prediction replay', () => {
  const good = sanitizeInput(encodeInput(7, input(['jump'], true)));
  assert.equal(good.jumpHeld, true);
  assert.equal(sanitizeInput(encodeInput(8, input([], false))).jumpHeld, false);
  for (const forged of [null, -1, 2, '1', { stage: 3, height: 99 }]) {
    assert.equal(Object.hasOwn(sanitizeInput({ s: 7, jh: forged, p: ['jump'] }), 'jumpHeld'),
      false, 'unknown jump tiers cannot be submitted');
  }
  assert.ok(!Object.hasOwn(sanitizeInput({ s: 7, p: ['jump'] }), 'jumpHeld'),
    'legacy clients retain their old jump arc');

  const server = createWorld({ arenaRadius: 30 });
  const f = addFighter(server, { id: 'hero' });
  tick(server, ['jump'], true);
  advance(server, 14, true);
  const data = JSON.parse(JSON.stringify(encodeOwn(f, bodyOf(server, 'hero'), server.time)));
  assert.ok(data.jh?.[1] >= 1, 'server sends private timer and tier for reconciliation');
  const mirror = createWorld({ arenaRadius: 30 });
  const restored = addFighter(mirror, { id: 'hero' });
  applyOwn(restored, bodyOf(mirror, 'hero'), data);
  mirror.time = data.at;
  for (let i = 0; i < 28; i++) {
    tick(server, [], true);
    tick(mirror, [], true);
  }
  assert.ok(Math.abs(bodyOf(server, 'hero').y - bodyOf(mirror, 'hero').y) < 1e-4,
    'client prediction replays exactly the server-owned hold clock after snapshots');
  assert.equal(bodyOf(server, 'hero').heldJump?.stage, bodyOf(mirror, 'hero').heldJump?.stage);
});


test('rebindable Space input holds until release, and pausing/blur never leave jump charging', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const browser = new EventTarget();
  const canvas = new EventTarget();
  globalThis.window = browser;
  globalThis.document = { pointerLockElement: canvas, exitPointerLock() {} };
  const { createControls } = await import('../src/components/duelist/client/controls.mjs');
  const controls = createControls(canvas);
  const send = (type, code, repeat = false) =>
    browser.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code, repeat }));
  try {
    send('keydown', 'Space');
    const first = controls.read();
    assert.equal(first.jumpHeld, true);
    assert.deepEqual(first.presses, ['jump'], 'one press starts immediate takeoff');
    send('keydown', 'Space', true);
    const held = controls.read();
    assert.equal(held.jumpHeld, true);
    assert.ok(!held.presses.includes('jump'), 'keyboard repeats cannot double-jump');
    send('keyup', 'Space');
    assert.equal(controls.read().jumpHeld, false, 'release reaches the next simulation tick');
    send('keydown', 'Space');
    browser.dispatchEvent(new Event('blur'));
    assert.equal(controls.read().jumpHeld, false, 'focus loss safely cuts the upward hold');
    send('keydown', 'Space');
    controls.setPaused(true);
    assert.equal(controls.read().jumpHeld, false, 'opening a menu cancels held ascent');
  } finally {
    controls.dispose();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
