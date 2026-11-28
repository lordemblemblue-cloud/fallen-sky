import './fixtures/three-roads-sample/install.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  threeRoadsEnabled, THREE_ROADS_DEFAULT_ON, THREE_ROADS_STORAGE_KEY,
  threeRoadsPreviewEnabled, THREE_ROADS_PREVIEW_STORAGE_KEY,
} from '../src/components/game3d/threeroads/threeRoadsFlag.mjs';
import {
  createThreeRoadsWorld, createThreeRoadsBus,
} from '../src/components/game3d/threeroads/ThreeRoadsWorld.mjs';
import { THREE_ROADS_SUBSYSTEMS } from '../src/components/game3d/threeroads/subsystems.mjs';

const win = (search = '', stored = null) => ({
  location: { search },
  localStorage: { getItem: key => (key === THREE_ROADS_STORAGE_KEY ? stored : null) },
});

test('the switch is off by default and follows the address bar, then storage', () => {
  assert.equal(THREE_ROADS_DEFAULT_ON, false);
  assert.equal(threeRoadsEnabled(win()), false);
  assert.equal(threeRoadsEnabled(win('?threeRoads=1')), true);
  assert.equal(threeRoadsEnabled(win('?a=b&threeRoads=on')), true);
  assert.equal(threeRoadsEnabled(win('', '1')), true);
  assert.equal(threeRoadsEnabled(win('?threeRoads=0', '1')), false, 'the address bar wins');
  assert.equal(threeRoadsEnabled(win('?threeRoads=maybe')), false);
  assert.equal(threeRoadsEnabled(undefined), false);
  // The builders' preview switch works only on top of the main one.
  assert.equal(THREE_ROADS_PREVIEW_STORAGE_KEY, 'game3d.threeRoadsPreview');
  assert.equal(threeRoadsPreviewEnabled(win('?threeRoads=1')), false);
  assert.equal(threeRoadsPreviewEnabled(win('?threeRoads=1&threeRoadsPreview=1')), true);
  assert.equal(threeRoadsPreviewEnabled(win('?threeRoadsPreview=1')), false, 'no preview without the story');
  assert.equal(threeRoadsPreviewEnabled(win('?threeRoads=0&threeRoadsPreview=1', '1')), false);
  assert.equal(threeRoadsPreviewEnabled(undefined), false);
});

test('a window whose storage or address throws still gives an answer', () => {
  const hostile = {
    get location() { throw new Error('no'); },
    get localStorage() { throw new Error('no'); },
  };
  assert.equal(threeRoadsEnabled(hostile), false);
});

test('subsystems are created, updated in order and disposed in reverse', () => {
  const log = [];
  const make = id => ({
    id,
    create: ctx => {
      log.push('create:' + id + ':' + ctx.worldArea);
      return {
        update: (dt, position) => log.push('update:' + id + ':' + dt + ':' + position.x),
        dispose: () => log.push('dispose:' + id),
      };
    },
  });
  const world = createThreeRoadsWorld({ worldArea: 'south' }, { subsystems: [make('a'), make('b')] });
  world.update(0.5, { x: 7 });
  world.dispose();
  world.dispose();
  world.update(1, { x: 9 });
  assert.deepEqual(log, [
    'create:a:south', 'create:b:south',
    'update:a:0.5:7', 'update:b:0.5:7',
    'dispose:b', 'dispose:a',
  ]);
  assert.deepEqual(world.status(), { a: 'disposed', b: 'disposed' });
});

test('a subsystem that returns null is idle and one that throws cannot hurt the others', () => {
  const warnings = [];
  let ticks = 0;
  let disposedBroken = 0;
  const world = createThreeRoadsWorld({}, {
    warn: (...args) => warnings.push(args[0]),
    subsystems: [
      { id: 'idle', create: () => null },
      { id: 'badStart', create: () => { throw new Error('boom'); } },
      { id: 'badUpdate', create: () => ({
        update: () => { throw new Error('later'); },
        dispose: () => { disposedBroken++; },
      }) },
      { id: 'good', create: () => ({ update: () => { ticks++; } }) },
    ],
  });
  assert.deepEqual(world.status(), { idle: 'idle', badStart: 'failed', badUpdate: 'on', good: 'on' });
  world.update(0.1, { x: 0 });
  world.update(0.1, { x: 0 });
  assert.equal(ticks, 2);
  assert.equal(world.status().badUpdate, 'failed');
  assert.equal(disposedBroken, 1, 'a failed subsystem is disposed once, at the failure');
  world.dispose();
  assert.equal(disposedBroken, 1);
  assert.equal(warnings.length, 2);
  assert.equal(world.get('good') !== null, true);
  assert.equal(world.get('idle'), null);
});

test('the bus delivers to listeners, survives a failing one, and can be left', () => {
  const bus = createThreeRoadsBus();
  const seen = [];
  const original = globalThis.console.warn;
  globalThis.console.warn = () => {};
  try {
    bus.on('x', () => { throw new Error('listener'); });
    const off = bus.on('x', detail => seen.push(detail));
    bus.emit('x', 1);
    off();
    bus.emit('x', 2);
    bus.emit('nobody', 3);
  } finally {
    globalThis.console.warn = original;
  }
  assert.deepEqual(seen, [1]);
});

test('the shipped list names four subsystems and every stub is safe to create', () => {
  assert.deepEqual(THREE_ROADS_SUBSYSTEMS.map(entry => entry.id),
    ['places', 'enemies', 'cast', 'pledges']);
  const world = createThreeRoadsWorld({ region: 'wolfveil', worldArea: 'town' });
  world.update(0.016, { x: 0, y: 0, z: 0 });
  world.dispose();
});

test('collision is asked of every live subsystem and a failing one is switched off', () => {
  const warnings = [];
  const world = createThreeRoadsWorld({}, {
    warn: (...args) => warnings.push(args[0]),
    subsystems: [
      { id: 'wall', create: () => ({
        resolveCollision: (position, from) => {
          if (position.x <= 5) return false;
          position.x = from.x;
          return true;
        },
      }) },
      { id: 'broken', create: () => ({ resolveCollision: () => { throw new Error('bad'); } }) },
      { id: 'noCollision', create: () => ({ update: () => {} }) },
    ],
  });
  const free = { x: 1, z: 0 };
  assert.equal(world.resolveCollision(free, { x: 0, z: 0 }, 0.6), false);
  assert.equal(world.status().broken, 'failed');
  const blocked = { x: 9, z: 0 };
  assert.equal(world.resolveCollision(blocked, { x: 4, z: 0 }, 0.6), true);
  assert.equal(blocked.x, 4);
  assert.equal(warnings.length, 1);
  world.dispose();
  assert.equal(world.resolveCollision({ x: 9, z: 0 }, { x: 4, z: 0 }, 0.6), false);
  assert.equal(world.resolveCollision(null, null, 0.6), false);
});

test('GameWorld3D no longer mounts the story tools: the War of Three Roads hook is gone', () => {
  const source = readFileSync(
    new globalThis.URL('../src/components/game3d/GameWorld3D.jsx', import.meta.url), 'utf8');
  const count = pattern => (source.match(pattern) || []).length;
  assert.equal(count(/createThreeRoadsWorld/g), 0);
  assert.equal(count(/threeRoadsEnabled/g), 0);
  assert.equal(count(/\bthreeRoads\b/g), 0, 'no use of a Three Roads world in GameWorld3D');
  assert.equal(count(/__gw3dThreeRoads/g), 0);
  // What is left is the admin test preview another agent added on 2026-11-23.
  const imported = [...source.matchAll(/from '\.\/threeroads\/([\w/]+)\.mjs'/g)].map(match => match[1]).sort();
  assert.deepEqual(imported, ['questTestRuntime']);
});
