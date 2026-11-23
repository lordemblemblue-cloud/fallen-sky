import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStandardGamepadReader, STANDARD_GAMEPAD_BINDINGS, stickDeadzone } from '../src/components/mobile/mobileGamepad.mjs';
import { showLandscapeSuggestion, requestLandscapeOnGesture } from '../src/components/mobile/mobileLandscape.mjs';
import { defaultMobileTouchLayout, MOBILE_TOUCH_ACTIONS } from '../src/components/mobile/mobileTouchModel.mjs';
import { createFallenTouchBridge } from '../src/components/mobile/fallenMobileTouchBridge.mjs';

const file = path => readFileSync(new URL('../src/' + path, import.meta.url), 'utf8');

test('sideways mobile layout places large attack at bottom right with four skill buttons in a C arc', () => {
  for (const game of ['duelist', 'fallen']) {
    const positions = defaultMobileTouchLayout(game, true);
    const attack = positions[game === 'duelist' ? 'light' : 'attack'];
    const special = positions[game === 'duelist' ? 'special' : 'ultimate'];
    const skills = [1, 2, 3, 4].map(n => positions['ability' + n]);
    assert.ok(positions.joystick.x <= 25, game + ': joystick remains left');
    assert.ok(attack.x >= 85 && attack.y >= 75, game + ': attack bottom right');
    assert.ok(skills[0].y > skills[1].y && skills[1].y > skills[2].y && skills[2].y > skills[3].y,
      game + ': arc ascends around attack');
    assert.ok(skills[1].x < skills[0].x && skills[1].x < skills[2].x && skills[3].x > skills[2].x,
      game + ': C arc wraps round the attack control');
    assert.ok(Math.abs(special.x - 50) <= 3, game + ': ultimate is a separate center-screen button');
    assert.ok(positions.lock.x > 40 && positions.lock.x < 70, game + ': lock-on is not hidden');
    assert.ok(MOBILE_TOUCH_ACTIONS[game].some(([id]) => id === 'lock'));
  }
});

test('landscape auto-detection respects the actual phone orientation and never forcibly rotates unsupported Safari', async () => {
  assert.equal(showLandscapeSuggestion({ touch: true, width: 390, height: 844 }), true);
  assert.equal(showLandscapeSuggestion({ touch: true, width: 844, height: 390 }), false);
  assert.equal(showLandscapeSuggestion({ touch: false, width: 390, height: 844 }), false);
  const unsupported = { document: { documentElement: {} }, screen: { orientation: {} } };
  assert.equal(await requestLandscapeOnGesture(unsupported), false);
  let fullscreen = 0, locked = 0;
  const supported = {
    document: { documentElement: { requestFullscreen: async () => { fullscreen++; } } },
    screen: { orientation: { lock: async orientation => {
      assert.equal(orientation, 'landscape');
      locked++;
    } } },
  };
  assert.equal(await requestLandscapeOnGesture(supported), true);
  assert.equal(fullscreen, 1);
  assert.equal(locked, 1);
  const rejected = { document: { documentElement: {} }, screen: { orientation: {
    lock: async () => { throw new Error('iOS orientation lock unavailable'); },
  } } };
  assert.equal(await requestLandscapeOnGesture(rejected), false);
});

test('standard Bluetooth gamepad sends edge-triggered skills, lock, ultimate and analog look', () => {
  const events = [];
  const adapter = createStandardGamepadReader('duelist', {
    down: a => events.push(['down', a]),
    up: a => events.push(['up', a]),
    move: a => events.push(['move', a]),
    look: (dx, dy) => events.push(['look', dx, dy]),
  });
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  [0, 4, 7, 11, 12, 13].forEach(i => { buttons[i] = { pressed: true, value: 1 }; });
  const pad = { mapping: 'standard', connected: true, axes: [0.6, -0.7, 0.5, -0.4], buttons };
  assert.equal(adapter.update([null, pad]), true);
  assert.deepEqual(events.filter(e => e[0] === 'down').map(e => e[1]).sort(),
    ['jump','ability1','light','lock','special','ability4'].sort());
  assert.ok(events.some(e => e[0] === 'look' && e[1] > 0 && e[2] < 0));
  assert.ok(events.some(e => e[0] === 'move' && e[1].x > 0 && e[1].y > 0));
  adapter.update([pad]);
  assert.equal(events.filter(e => e[0] === 'down').length, 6, 'held buttons do not repeat/cast twice');
  adapter.update([]);
  assert.equal(events.filter(e => e[0] === 'up').length, 6, 'disconnect releases every held action');
  assert.ok(events.some(e => e[0] === 'move' && e[1].x === 0 && e[1].y === 0));
  assert.equal(adapter.connected(), false);
  assert.equal(STANDARD_GAMEPAD_BINDINGS.fallen[11], 'lock');
  assert.equal(STANDARD_GAMEPAD_BINDINGS.fallen[12], 'ultimate');
  assert.equal(stickDeadzone(0.1), 0);
});

test('Fallen Sky auto-lock button emits existing middle click at the actual screen reticle', () => {
  class TestMouse extends Event {
    constructor(type, options) {
      super(type, options); Object.assign(this, {
        button: options.button, clientX: options.clientX, clientY: options.clientY,
      });
    }
  }
  class TestKey extends Event {
    constructor(type, options) { super(type); this.code = options.code; this.key = options.key; }
  }
  const host = new EventTarget();
  const canvas = new EventTarget();
  canvas.getBoundingClientRect = () => ({ left: 100, top: 50, width: 800, height: 400 });
  host.document = { querySelector: () => canvas };
  host.MouseEvent = TestMouse;
  host.KeyboardEvent = TestKey;
  let shot = null;
  canvas.addEventListener('mousedown', event => { if (event.button === 1) shot = event; });
  const touch = createFallenTouchBridge(host);
  touch.down('lock');
  assert.equal(shot?.clientX, 500);
  assert.equal(shot?.clientY, 250);
  touch.dispose();
});

test('readable ultimate button inherits actual server meter and lock-on state; existing touch layout stays editable', () => {
  const jsx = file('components/mobile/MobileTouchControls.jsx');
  const css = file('components/mobile/mobileTouchControls.css');
  const game = file('components/duelist/client/DuelistGame.jsx');
  assert.match(game, /specialReady=\{!!hud\?\.classId/);
  assert.match(game, /CLASSES\[hud\.classId\]\?\.special\?\.cost/);
  assert.match(game, /specialCharge=\{hud\?\.specialMeter\}/);
  assert.match(game, /lockActive=\{!!hud\?\.lockOn\}/);
  assert.match(jsx, /createStandardGamepadReader/);
  assert.match(jsx, /TURN YOUR PHONE SIDEWAYS/);
  assert.match(jsx, /CONTINUE PORTRAIT/);
  assert.match(jsx, /requestLandscapeOnGesture/);
  assert.match(jsx, /sourceAction\(id, 'gamepad', true\)/);
  assert.match(jsx, /sourceAction\(id, 'touch', true\)/);
  assert.match(jsx, /MOVE CONTROLS/);
  assert.match(jsx, /aria-pressed=\{id === 'lock'/);
  assert.match(css, /min-width:76px/);
  assert.match(css, /min-width:62px/);
  assert.match(css, /env\(safe-area-inset-bottom/);
});
