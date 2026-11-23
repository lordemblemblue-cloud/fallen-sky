import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  defaultMobileTouchLayout, isMobileTouchDevice, MOBILE_TOUCH_ACTIONS, MOBILE_TOUCH_SECONDARY,
  normalizeMobileTouchLayout, touchLandscape, touchLayoutStorageKey,
} from '../src/components/mobile/mobileTouchModel.mjs';
import { createFallenTouchBridge } from '../src/components/mobile/fallenMobileTouchBridge.mjs';

test('touch devices are detected by pointer capability, not a hard-coded iPhone aspect ratio', () => {
  const host = (coarse, touches, search = '') => ({
    location: { search }, navigator: { maxTouchPoints: touches },
    matchMedia() { return { matches: coarse }; },
  });
  assert.equal(isMobileTouchDevice(host(false, 0)), false);
  assert.equal(isMobileTouchDevice(host(true, 1)), true);
  assert.equal(isMobileTouchDevice(host(false, 5)), true, 'hybrid touch laptop can use touch controls');
  assert.equal(isMobileTouchDevice(host(false, 0, '?touchControls=1')), true, 'desktop QA');
  assert.equal(isMobileTouchDevice(host(true, 5, '?touchControls=0')), false, 'explicit QA override');
  assert.equal(touchLandscape(844, 390), true);
  assert.equal(touchLandscape(390, 844), false);
});

test('each game and orientation has a persisted, bounded drag layout', () => {
  const wide = defaultMobileTouchLayout('duelist', true);
  const tall = defaultMobileTouchLayout('duelist', false);
  assert.notDeepEqual(wide, tall);
  assert.ok(wide.joystick.x < 30 && wide.light.x > 60);
  assert.ok(MOBILE_TOUCH_ACTIONS.duelist.some(([id]) => id === 'special'));
  assert.ok(MOBILE_TOUCH_ACTIONS.fallen.some(([id]) => id === 'ultimate'));
  assert.ok(MOBILE_TOUCH_SECONDARY.duelist.includes('shop'));
  assert.ok(MOBILE_TOUCH_SECONDARY.fallen.includes('skill9'));
  const saved = normalizeMobileTouchLayout('fallen', true, {
    attack: { x: 1000, y: -42 }, joystick: { x: 21, y: 83 }, invalid: { x: 12, y: 12 },
  });
  assert.deepEqual(saved.attack, { x: 93, y: 7 });
  assert.deepEqual(saved.joystick, { x: 21, y: 83 });
  assert.equal('invalid' in saved, false, 'stray persisted keys cannot inject controls');
  assert.notEqual(touchLayoutStorageKey('fallen', true), touchLayoutStorageKey('duelist', true));
  assert.notEqual(touchLayoutStorageKey('fallen', false), touchLayoutStorageKey('fallen', true));
});

function fakeHost() {
  class Key extends Event {
    constructor(type, args) { super(type, args); this.code = args.code; this.key = args.key; this.repeat = false; }
  }
  class Mouse extends Event {
    constructor(type, args) { super(type, args); this.button = args.button; this.buttons = args.buttons; }
  }
  class Custom extends Event {
    constructor(type, args) { super(type); this.detail = args.detail; }
  }
  const host = new EventTarget();
  const canvas = new EventTarget();
  host.KeyboardEvent = Key;
  host.MouseEvent = Mouse;
  host.CustomEvent = Custom;
  host.document = { querySelector: () => canvas };
  return { host, canvas };
}

test('Fallen Sky joystick uses edge-triggered real game key bindings and cleans up', () => {
  const { host, canvas } = fakeHost();
  const events = [];
  host.addEventListener('keydown', e => events.push(['down', e.code]));
  host.addEventListener('keyup', e => events.push(['up', e.code]));
  host.addEventListener('game3dMobileLook', e => events.push(['look', e.detail.dx]));
  canvas.addEventListener('mousedown', e => events.push(['mouseDown', e.button]));
  host.addEventListener('mouseup', e => events.push(['mouseUp', e.button]));
  const touch = createFallenTouchBridge(host);
  touch.move({ x: 0.75, y: 1 });
  touch.move({ x: 0.75, y: 1 });
  assert.deepEqual(events.filter(e => e[0] === 'down').map(e => e[1]), ['KeyW', 'KeyD']);
  touch.move({ x: -1, y: 0 });
  assert.ok(events.some(e => e[0] === 'up' && e[1] === 'KeyD'));
  assert.ok(events.some(e => e[0] === 'down' && e[1] === 'KeyA'));
  touch.down('ability1'); touch.up('ability1');
  touch.down('ultimate'); touch.up('ultimate');
  touch.down('attack'); touch.up('attack');
  touch.down('guard'); touch.up('guard');
  touch.look(12, -7);
  assert.ok(events.some(e => e[0] === 'down' && e[1] === 'Digit1'));
  assert.ok(events.some(e => e[0] === 'down' && e[1] === 'Digit0'));
  assert.ok(events.some(e => e[0] === 'mouseDown' && e[1] === 0));
  assert.ok(events.some(e => e[0] === 'mouseUp' && e[1] === 2));
  assert.ok(events.some(e => e[0] === 'look' && e[1] === 12));
  touch.dispose();
  assert.ok(events.some(e => e[0] === 'up' && e[1] === 'KeyA'));
});

test('the Fallen Sky dodge control sends actual double-tap keys through the existing detector', () => {
  const { host } = fakeHost();
  const log = [];
  host.addEventListener('keydown', e => log.push(['down', e.code]));
  host.addEventListener('keyup', e => log.push(['up', e.code]));
  const touch = createFallenTouchBridge(host);
  touch.down('dodge');
  assert.deepEqual(log.slice(0, 4), [
    ['down','KeyS'], ['up','KeyS'], ['down','KeyS'], ['up','KeyS'],
  ]);
  touch.dispose();
});

test('both games wire touch to their existing simulation inputs and camera math', () => {
  const read = path => readFileSync(new URL('../src/' + path, import.meta.url), 'utf8');
  const duel = read('components/duelist/client/DuelistGame.jsx');
  const duelControls = read('components/duelist/client/controls.mjs');
  const view = read('pages/GameView.jsx');
  const game = read('components/game3d/GameWorld3D.jsx');
  const root = read('routes/__root.jsx');
  const arena = read('components/duelist/menu/duelistUnifiedVisual.css');
  assert.match(duel, /<MobileTouchControls game="duelist"/);
  assert.match(duelControls, /setTouchMove/);
  assert.match(duelControls, /touchActionDown\(action\)/);
  assert.match(duelControls, /touchActionUp\(action\)/);
  assert.match(duelControls, /onShopToggle\?\.\(\)/);
  assert.match(view, /<MobileTouchControls game="fallen"/);
  assert.match(game, /game3dMobileLook/);
  assert.match(root, /viewport-fit=cover/);
  assert.match(arena, /height:100dvh/);
});
