import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME3D_MENU_HOTKEYS, getGame3DMenuShortcut } from
  '../src/components/game3d/axe/services/game3dMenuHotkeys.mjs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const event = (code, props = {}) => ({
  code, key: code === 'Equal' ? '=' : code.slice(3).toLowerCase(),
  repeat: false, defaultPrevented: false, ctrlKey: false, altKey: false,
  metaKey: false, shiftKey: false, isComposing: false,
  target: { isContentEditable: false, closest: () => null },
  ...props,
});

test('eight unmodified game keys map to owner-approved menus without overlap', () => {
  assert.deepEqual({ ...GAME3D_MENU_HOTKEYS }, {
    KeyI: 'appearance',
    KeyC: 'character',
    KeyL: 'quest_logbook',
    KeyK: 'skills',
    KeyP: 'companion',
    KeyM: 'map',
    KeyJ: 'spiritual',
    Equal: 'blacksmith',
  });
  assert.equal(new Set(Object.values(GAME3D_MENU_HOTKEYS)).size, 8);
  for (const [code, menu] of Object.entries(GAME3D_MENU_HOTKEYS))
    assert.equal(getGame3DMenuShortcut(event(code)), menu, code);
});

test('typing, chatting, repeat, composition, and modifiers never activate a menu', () => {
  const props = [
    { repeat: true }, { defaultPrevented: true }, { isComposing: true },
    { ctrlKey: true }, { altKey: true }, { metaKey: true },
    { shiftKey: true }, { target: { isContentEditable: true } },
    { target: { closest: () => ({ tagName: 'INPUT' }) } },
  ];
  for (const x of props) assert.equal(getGame3DMenuShortcut(event('KeyI', x)), null);
  assert.equal(getGame3DMenuShortcut(event('KeyZ')), null);
  assert.equal(getGame3DMenuShortcut(null), null);
});

test('main and clone use one toggle controller, not key-specific duplicate overlays', () => {
  const view = read('src/pages/GameView.jsx');
  const hud = read('src/components/game3d/hud/JadeSoulHUD.jsx');
  const world = read('src/components/game3d/GameWorld3D.jsx');
  assert.match(view, /getGame3DMenuShortcut\(event\)/);
  assert.match(view, /getSnapshot\(\)\.groupId/);
  assert.match(view, /currentGroup === destination\) services\.controller\.close\(\)/);
  assert.match(view, /services\.controller\.open\(destination\)/);
  assert.match(view, /setRequestedCharacterTab\(closingCharacter \? null : 'attributes'\)/);
  assert.match(view, /addEventListener\('keydown', onServiceKey, true\)/);
  assert.match(view, /new Event\('axeCloseWorldMap'\)/);
  assert.match(view, /new CustomEvent\('axeOpenWorldMap'/);
  assert.match(hud, /window\.addEventListener\('axeCloseWorldMap', close\)/);
  assert.match(hud, /\{mapOpen && !serviceMode && createPortal/);
  assert.match(hud, /e\.code!=='KeyC'\|\|!e\.shiftKey/);
  assert.doesNotMatch(world, /if \(k === 'i'\)/);
  assert.doesNotMatch(world, /if \(k === '='\)/);
  assert.match(world, /e\.code === 'F9' && e\.shiftKey/);
});
