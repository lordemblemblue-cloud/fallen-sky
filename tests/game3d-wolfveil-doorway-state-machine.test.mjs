// Doorway state machine (audit section 5): ACTIVE -> APPROACH_GATE -> OCCLUDE
// -> LOAD -> COMMIT -> UNLOAD -> ACTIVE, with safe rollback.
/* global setTimeout */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDoorwayStateMachine, DOORWAY_STATE as S}
  from '../src/components/game3d/wolfveil/zones/WolfveilDoorwayStateMachine.mjs';
import {
  planGrottoDoorways, grottoFramePoint, GROTTO_PLAN,
} from '../src/components/game3d/wolfveil/zones/WolfveilGrottoZonePlan.mjs';
import {wolfveilHeight} from '../src/components/game3d/wolfveil/WolfveilLayout.js';

const DT = 1 / 30;
// A straight-line toy world: x < 0 is zone A, x > 0 is zone B. The relocating
// doorway's pocket is x in [-2, -1]; it moves the player to x = 10.
function toyDoorways() {
  return [
    {id: 'gate:in', door: 'gate', from: 'A', to: 'B', commit: 'relocate', anchor: {x: 10, y: 0, z: 0},
      requires: {onFoot: true, grounded: true},
      approach: p => p.x > -12 && p.x < 0, pocket: p => p.x >= -2 && p.x <= -1},
    {id: 'gate:out', door: 'gate', from: 'B', to: 'A', commit: 'relocate', anchor: {x: -5, y: 0, z: 0},
      requires: {onFoot: true, grounded: true},
      approach: p => p.x > 0 && p.x < 12, pocket: p => p.x >= 1 && p.x <= 2},
  ];
}
function toyZones({async = false, fail = false} = {}) {
  const log = [];
  const live = new Set();
  const runtime = id => ({
    kind: 'runtime',
    prefetch: () => log.push('prefetch:' + id),
    load({signal}) {
      log.push('load:' + id);
      if (fail) throw new Error('missing asset');
      const handle = {id, n: log.length};
      live.add(handle);
      if (!async) return handle;
      return new Promise(resolve => setTimeout(() => resolve(handle), 5)).then(h => { if (signal.aborted) log.push('late:' + id); return h; });
    },
    unload(handle) { log.push('unload:' + id); live.delete(handle); return {released: true}; },
  });
  return {
    log, live,
    zones: {
      A: {kind: 'legacy', load: () => 'legacy', unload: () => { log.push('unload:A'); return {legacy: true}; }},
      B: runtime('B'),
    },
  };
}
function run(machine, steps, sample) {
  const frames = [];
  for (let i = 0; i < steps; i++) frames.push(machine.update(DT, typeof sample === 'function' ? sample(i) : sample));
  return frames;
}

test('relocating doorway walks the audit sequence and moves the player exactly once', () => {
  const {zones, log} = toyZones();
  const moves = [];
  const machine = createDoorwayStateMachine({doorways: toyDoorways(), zones, initialZone: 'A',
    hooks: {relocate: anchor => { moves.push(anchor); return true; }}});
  assert.equal(machine.state, S.ACTIVE);
  machine.update(DT, {position: {x: -6, z: 0}});
  assert.equal(machine.state, S.APPROACH_GATE);
  assert.deepEqual(log, ['prefetch:B'], 'approach prefetches but builds nothing');
  machine.update(DT, {position: {x: -1.5, z: 0}});
  assert.equal(machine.state, S.OCCLUDE);
  const ramp = run(machine, 12, {position: {x: -1.5, z: 0}}).map(f => f.occlusion);
  assert.ok(ramp[0] > 0 && ramp.at(-1) === 1, 'the screen seals while the pocket hides the swap');
  assert.equal(machine.activeZone, 'B');
  assert.equal(moves.length, 1, 'moved once');
  assert.deepEqual(moves[0], {x: 10, y: 0, z: 0});
  assert.deepEqual(log, ['prefetch:B', 'load:B', 'unload:A']);
  run(machine, 10, {position: {x: 10, z: 0}});
  assert.equal(machine.loadedZones().join(), 'B', 'only B is resident');
  const types = machine.history().filter(e => e.type === 'state').map(e => e.to);
  assert.deepEqual(types.slice(0, 5), [S.APPROACH_GATE, S.OCCLUDE, S.LOAD, S.COMMIT, S.UNLOAD]);
  assert.ok(machine.history().some(e => e.type === 'active' && e.zone === 'B'));
});

test('stepping back out of the pocket before the load costs nothing', () => {
  const {zones, log} = toyZones();
  const machine = createDoorwayStateMachine({doorways: toyDoorways(), zones, initialZone: 'A', hooks: {relocate: () => true}});
  machine.update(DT, {position: {x: -6, z: 0}});
  machine.update(DT, {position: {x: -1.5, z: 0}});
  assert.equal(machine.state, S.OCCLUDE);
  machine.update(DT, {position: {x: -4, z: 0}});
  assert.equal(machine.state, S.APPROACH_GATE);
  machine.update(DT, {position: {x: -30, z: 0}});
  assert.equal(machine.state, S.ACTIVE);
  assert.equal(machine.activeZone, 'A');
  assert.ok(!log.some(entry => entry.startsWith('load')), 'B was never constructed');
});

test('leaving during an async load aborts; the late zone is released on arrival', async () => {
  const {zones, log, live} = toyZones({async: true});
  const machine = createDoorwayStateMachine({doorways: toyDoorways(), zones, initialZone: 'A', hooks: {relocate: () => true}});
  machine.update(DT, {position: {x: -6, z: 0}});
  run(machine, 12, {position: {x: -1.5, z: 0}});
  assert.equal(machine.state, S.LOAD);
  machine.update(DT, {position: {x: -6, z: 0}});
  assert.equal(machine.state, S.ACTIVE);
  assert.equal(machine.counters().aborts, 1);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(live.size, 0, 'no orphaned B');
  assert.ok(log.includes('unload:B'));
  assert.equal(machine.activeZone, 'A');
});

test('a failed load, a timeout or a refused relocation keeps the player in A', async () => {
  const failing = toyZones({fail: true});
  const a = createDoorwayStateMachine({doorways: toyDoorways(), zones: failing.zones, initialZone: 'A', hooks: {relocate: () => true}});
  a.update(DT, {position: {x: -6, z: 0}});
  run(a, 14, {position: {x: -1.5, z: 0}});
  assert.equal(a.activeZone, 'A');
  assert.equal(a.counters().failures, 1);
  const slow = toyZones();
  slow.zones.B.load = () => new Promise(() => {});
  const b = createDoorwayStateMachine({doorways: toyDoorways(), zones: slow.zones, initialZone: 'A',
    hooks: {relocate: () => true}, options: {loadTimeoutSeconds: .2}});
  b.update(DT, {position: {x: -6, z: 0}});
  run(b, 30, {position: {x: -1.5, z: 0}});
  assert.equal(b.activeZone, 'A');
  assert.ok(b.history().some(e => e.type === 'load-failed' && e.reason === 'timeout'));
  const refused = toyZones();
  const c = createDoorwayStateMachine({doorways: toyDoorways(), zones: refused.zones, initialZone: 'A', hooks: {relocate: () => false}});
  c.update(DT, {position: {x: -6, z: 0}});
  run(c, 14, {position: {x: -1.5, z: 0}});
  assert.equal(c.activeZone, 'A');
  assert.equal(refused.live.size, 0, 'B released after the refused move');
});

test('mounted or airborne players are held at the doorway with a notice', () => {
  const {zones, log} = toyZones();
  const events = [];
  const machine = createDoorwayStateMachine({doorways: toyDoorways(), zones, initialZone: 'A',
    hooks: {relocate: () => true, onEvent: e => events.push(e)}});
  machine.update(DT, {position: {x: -6, z: 0}});
  run(machine, 20, {position: {x: -1.5, z: 0}, mounted: true});
  assert.equal(machine.state, S.APPROACH_GATE);
  assert.equal(events.filter(e => e.type === 'blocked').length, 1, 'one notice, not one per frame');
  run(machine, 20, {position: {x: -1.5, z: 0}, airborne: true});
  assert.equal(machine.activeZone, 'A');
  assert.ok(!log.includes('load:B'));
  run(machine, 14, {position: {x: -1.5, z: 0}});
  assert.equal(machine.activeZone, 'B', 'on foot and grounded it proceeds');
});

test('walk-through door: open after load, close behind, then release the old zone', () => {
  const log = [];
  const zone = id => ({kind: 'runtime', load: () => { log.push('load:' + id); return {id}; }, unload: () => { log.push('unload:' + id); }});
  const zones = {A: zone('A'), B: zone('B')};
  const doorways = [
    {id: 'door:in', door: 'door', from: 'A', to: 'B', commit: 'walk', requires: {grounded: true},
      approach: p => p.x > -7 && p.x <= 0, pocket: p => p.x >= -1.5 && p.x <= 0,
      passed: p => p.x >= 2.2, retreated: p => p.x <= -4.5},
    {id: 'door:out', door: 'door', from: 'B', to: 'A', commit: 'walk', requires: {grounded: true},
      approach: p => p.x < 7 && p.x >= 0, pocket: p => p.x <= 1.5 && p.x >= 0,
      passed: p => p.x <= -2.2, retreated: p => p.x >= 4.5},
  ];
  const machine = createDoorwayStateMachine({doorways, zones, initialZone: 'A'});
  machine.update(DT, {position: {x: -5, z: 0}});
  run(machine, 12, {position: {x: -1, z: 0}});
  assert.equal(machine.state, S.COMMIT);
  assert.deepEqual(machine.loadedZones().sort(), ['A', 'B'], 'brief overlap behind the door');
  run(machine, 20, {position: {x: -1, z: 0}});
  assert.equal(machine.doorOpen('door'), 1, 'door fully open');
  run(machine, 4, {position: {x: 3, z: 0}});
  assert.ok(machine.doorOpen('door') < 1, 'closing behind the player');
  run(machine, 20, {position: {x: 3, z: 0}});
  assert.equal(machine.activeZone, 'B');
  assert.deepEqual(machine.loadedZones(), ['B'], 'A released once the door shut');
  assert.equal(machine.doorOpen('door'), 0);
  // Retreat: open the way back, then turn around before crossing.
  run(machine, 14, {position: {x: 1, z: 0}});
  assert.deepEqual(machine.loadedZones().sort(), ['A', 'B']);
  machine.update(DT, {position: {x: 5, z: 0}});
  assert.equal(machine.activeZone, 'B');
  assert.deepEqual(machine.loadedZones(), ['B'], 'the half-loaded A is released again');
  assert.equal(log.filter(entry => entry === 'load:A').length, 2, 'returning reloads A; it was never resident');
});

test('evict leaves every runtime zone (respawn, teleport, reconnect)', () => {
  const {zones, live} = toyZones();
  const machine = createDoorwayStateMachine({doorways: toyDoorways(), zones, initialZone: 'A', hooks: {relocate: () => true}});
  machine.update(DT, {position: {x: -6, z: 0}});
  run(machine, 14, {position: {x: -1.5, z: 0}});
  assert.equal(machine.activeZone, 'B');
  assert.equal(machine.evict('A', 'respawn'), true);
  assert.equal(machine.activeZone, 'A');
  assert.deepEqual(machine.loadedZones(), ['A']);
  assert.equal(live.size, 0);
});

test('30 grotto round trips through the real doorway volumes end with no runtime zone resident', () => {
  const live = new Map();
  let loads = 0, unloads = 0;
  const runtime = id => ({kind: 'runtime',
    load: () => { loads++; const h = {id}; live.set(h, id); return h; },
    unload: h => { unloads++; live.delete(h); }});
  const zones = {surface: {kind: 'legacy', load: () => 'legacy', unload: () => null},
    grotto_hall: runtime('grotto_hall'), grotto_chamber: runtime('grotto_chamber')};
  let player = null;
  const machine = createDoorwayStateMachine({doorways: planGrottoDoorways(), zones, initialZone: 'surface',
    hooks: {relocate: anchor => { player = {...anchor}; return true; }}});
  const D = GROTTO_PLAN.door;
  const door = s => ({...grottoFramePoint(D.a + D.normal.a * s, D.l + D.normal.l * s), y: D.floorY});
  const surface = (a) => { const p = grottoFramePoint(a, 0); return {...p, y: wolfveilHeight(p.x, p.z)}; };
  const hold = (p, frames = 40) => { for (let i = 0; i < frames; i++) machine.update(DT, {position: p}); };
  for (let trip = 0; trip < 30; trip++) {
    hold(surface(-4.5), 3);
    hold(surface(1), 30);
    assert.equal(machine.activeZone, 'grotto_hall', 'trip ' + trip + ': entered the hall');
    assert.ok(player && Math.abs(player.y - 6.2) < 1e-9, 'moved onto the hall floor');
    hold(door(-1));
    assert.equal(machine.doorOpen('grotto_inner'), 1);
    hold(door(3.2));
    assert.equal(machine.activeZone, 'grotto_chamber');
    assert.deepEqual(machine.loadedZones(), ['grotto_chamber'], 'hall released behind the door');
    hold(door(1));
    hold(door(-3.2));
    assert.deepEqual(machine.loadedZones(), ['grotto_hall'], 'chamber released behind the door');
    hold({...grottoFramePoint(4.8, 0), y: 6.2}, 30);
    assert.equal(machine.activeZone, 'surface', 'trip ' + trip + ': back in the valley');
    hold(surface(-20), 5);
  }
  assert.equal(live.size, 0, 'no runtime zone handle survives');
  assert.equal(loads, unloads);
  assert.equal(machine.counters().transitions, 30 * 4);
  assert.equal(machine.counters().aborts, 0);
});
