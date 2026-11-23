import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLASSES } from '../src/components/duelist/core/classes.mjs';
import { describeDuelistTouchSkill, DUELIST_SKILL_TYPES } from '../src/components/mobile/duelistTouchSkill.mjs';
import { MOBILE_TOUCH_ACTIONS, defaultMobileTouchLayout } from '../src/components/mobile/mobileTouchModel.mjs';
import { createControls } from '../src/components/duelist/client/controls.mjs';

const source = file => readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');

test('all four class slots and the ultimate display the authored name, art identity and attack type', () => {
  const ids = new Set(MOBILE_TOUCH_ACTIONS.duelist.map(([id]) => id));
  for (const cls of Object.values(CLASSES)) {
    for (let i = 1; i <= 4; i++) {
      const skill = describeDuelistTouchSkill(cls.id, 'ability' + i);
      assert.ok(ids.has('ability' + i));
      assert.equal(skill.slot, i);
      assert.equal(skill.id, cls.abilities[i - 1].id);
      assert.equal(skill.name, cls.abilities[i - 1].name);
      assert.equal(skill.text, cls.abilities[i - 1].text);
      assert.equal(skill.type, DUELIST_SKILL_TYPES[skill.id]);
      assert.ok(skill.type.length > 2);
    }
    const ult = describeDuelistTouchSkill(cls.id, 'special');
    assert.equal(ult.id, cls.special.id);
    assert.equal(ult.name, cls.special.name);
    assert.equal(ult.type, DUELIST_SKILL_TYPES[ult.id]);
    assert.equal(ult.ultimate, true);
  }
  assert.equal(describeDuelistTouchSkill('unknown', 'ability1'), null);
  assert.equal(describeDuelistTouchSkill('duelist', 'ability5'), null);
  assert.equal(describeDuelistTouchSkill('duelist', 'heavy'), null);
  assert.equal(ids.has('heavy'), false, 'heavy stays hidden from Duelist mobile HUD');
});

test('touch input sends all four skills to the real Duelist controls and allows repeated taps', () => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const canvas = new EventTarget();
  globalThis.window = new EventTarget();
  globalThis.document = { pointerLockElement: null, exitPointerLock() {} };
  const controls = createControls(canvas);
  try {
    for (let repetition = 0; repetition < 3; repetition++) {
      for (let slot = 1; slot <= 4; slot++) {
        const command = 'ability' + slot;
        controls.touchActionDown(command);
        controls.touchActionUp(command);
        const inputs = controls.read();
        assert.ok(inputs.presses.includes(command), command + ' works after release');
        assert.ok(inputs.presses.includes('release'), command + ' releases cleanly');
      }
    }
    controls.setTouchMove({ x: .75, y: .45 });
    const first = controls.read().move;
    assert.ok(Math.hypot(first.x, first.z) > .8, 'joystick moves player');
    controls.setTouchMove({ x: 0, y: 0 });
    assert.deepEqual(controls.read().move, { x: 0, z: 0 }, 'finger lifting stops movement');
    controls.setTouchMove({ x: -1, y: .25 });
    assert.ok(Math.hypot(...Object.values(controls.read().move)) > .9,
      'a second joystick gesture regains movement');
    controls.touchActionDown('guard');
    assert.ok(controls.read().presses.includes('blockDown'), 'guard down works');
    controls.touchActionUp('guard');
    assert.ok(controls.read().presses.includes('blockUp'), 'guard up works');
    controls.touchActionDown('roll');
    assert.ok(controls.read().presses.includes('roll'), 'roll still activates with the redesigned HUD');
    controls.touchActionUp('roll');
  } finally {
    controls.dispose();
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

test('mobile touch capture is cleaned up when tapping off, cancelling, blurring, or editing controls', () => {
  const ui = source('components/mobile/MobileTouchControls.jsx');
  const game = source('components/duelist/client/DuelistGame.jsx');
  const css = source('components/mobile/mobileTouchControls.css');
  const art = source('components/mobile/DuelistTouchArtwork.jsx');
  assert.match(ui, /actionPointers = useRef\(new Map\(\)\)/);
  assert.match(ui, /onLostPointerCapture=\{joystickEnd\}/);
  assert.match(ui, /onLostPointerCapture=\{event => actEnd\(id, event\)\}/);
  assert.match(ui, /window\.addEventListener\('pointerup', finish\)/);
  assert.match(ui, /window\.addEventListener\('pointercancel', finish\)/);
  assert.match(ui, /window\.addEventListener\('blur', stop\)/);
  assert.match(ui, /document\.addEventListener\('visibilitychange', visibility\)/);
  assert.match(ui, /hasPointerCapture\?\.\(pointer\.current\.id\)/);
  assert.match(ui, /owners\.delete\(event\.pointerId\)/);
  assert.match(ui, /<DuelistTouchArtwork skillId=\{skill\.id\}/);
  assert.match(ui, /mobile-duelist-ability-type/);
  assert.match(game, /classId=\{hud\?\.classId\}/);
  assert.match(game, /abilityStatus=\{hud\?\.abilities\}/);
  assert.match(game, /willValue=\{hud\?\.you\?\.willValue\}/);
  assert.match(css, /mobile-duelist-ability-type \{/);
  assert.match(css, /pointer-events:none/);
  for (const id of new Set([...Object.keys(DUELIST_SKILL_TYPES)])) {
    assert.ok(art.includes(id + ':'), 'matching SVG for ' + id);
  }
  const p = defaultMobileTouchLayout('duelist', true);
  assert.ok(p.ability1.x >= 70 && p.ability4.x >= 90 && p.joystick.x < 30,
    'new artwork keeps the familiar two-thumb layout');
});
