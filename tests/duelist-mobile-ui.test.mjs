// Duelist-only mobile UI regression. This is intentionally a responsive
// presentation layer: real gameplay still uses shared touch input and server rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { defaultMobileTouchLayout, MOBILE_TOUCH_ACTIONS } from '../src/components/mobile/mobileTouchModel.mjs';

const source = path => readFileSync(new URL('../src/' + path, import.meta.url), 'utf8');
const css = source('components/duelist/menu/duelistMobileUI.css');
const menu = source('components/duelist/menu/DuelistTemplateHub.jsx');
const game = source('components/duelist/client/DuelistGame.jsx');
const touch = source('components/mobile/MobileTouchControls.jsx');

test('same Duelist mobile stylesheet is used by live/practice game and home/panel menus', () => {
  assert.match(menu, /import '\.\/duelistMobileUI\.css'/);
  assert.match(game, /import '\.\.\/menu\/duelistMobileUI\.css'/);
  assert.match(menu, /DuelistCharacterMenu/);
  assert.match(menu, /DuelistStoryMenu/);
  assert.match(menu, /SettingsReferenceMenu/);
  assert.match(game, /<DuelistHud hud=\{hud\}/);
  assert.match(game, /<MobileTouchControls game="duelist"/);
});

test('landscape menu is a real scrollable thumb UI with two columns of modes and a persistent footer', () => {
  assert.match(css, /@media \(orientation:landscape\) and \(max-width:1100px\) and \(max-height:600px\)/);
  for (const selector of ['.dxt-page .dxt-header','.dxt-page .dxt-footer',
    '.dxt-page .dxt-mode-grid','.dxt-page .dxt-mode-detail',
    '.dxt-page--reference .dcm-layout','.dxt-page--reference .dsm-layout',
    '.dxt-page--reference .dxr-art--settings']) {
    assert.ok(css.includes(selector), selector);
  }
  assert.match(css, /overflow-y:auto/);
  assert.match(css, /overscroll-behavior:contain/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /height:100dvh/);
  assert.match(css, /env\(safe-area-inset-left/);
  assert.match(css, /env\(safe-area-inset-right/);
});

test('landscape combat prioritizes readable HP and live score without duplicate keyboard ability HUD', () => {
  assert.match(css, /\.duelist-game\[data-mobile-ui='true'\] \.dh-bl \{/);
  assert.match(css, /\.duelist-game\[data-mobile-ui='true'\] \.dh-vitals \{ margin:0; \}/);
  assert.match(css, /\.duelist-game\[data-mobile-ui='true'\] \.dh-bc,\.duelist-game\[data-mobile-ui='true'\] \.dh-br \{ display:none; \}/);
  assert.match(css, /\.duelist-game\[data-mobile-ui='true'\] \.dh-tc \{/);
  assert.match(css, /\.duelist-game\[data-mobile-ui='true'\] \.dh-tr \{/);
  assert.match(css, /\.duelist-game\[data-mobile-ui='true'\] \.duelist-classpick\.dcp-root \{/);
  assert.match(css, /\.duelist-game\[data-mobile-ui='true'\] \.duelist-shop \{/);
  assert.match(css, /\.duelist-game\[data-mobile-ui='true'\] \.mobile-control-toolbar \{/);
  assert.match(css, /\.duelist-game\[data-mobile-ui='true'\] \.mobile-control-instructions \{/);
  assert.match(game, /className="duelist-gpu-tools"/);
  assert.match(game, /data-mobile-ui=\{typeof window !== 'undefined' && isMobileTouchDevice\(window\)/);
  assert.match(game, /hp: share\(v\.hp, v\.max\.hp\), hpValue: v\.hp, hpMax: v\.max\.hp/);
});

test('landscape gate is already shared by both games; Duelist keeps its own UI styling', () => {
  assert.match(touch, /const showRotate = showLandscapeSuggestion\(/);
  assert.match(touch, /data-landscape-required=\{showRotate/);
  assert.match(touch, /aria-modal="true"/);
  assert.doesNotMatch(touch, /CONTINUE PORTRAIT/);
  assert.match(touch, /requestLandscapeOnGesture\(window\)/);
  assert.match(touch, /TURN YOUR PHONE SIDEWAYS/);
  const positions = defaultMobileTouchLayout('duelist', true);
  assert.ok(positions.joystick.x < 30, 'movement must remain on the left');
  for (const n of [1, 2, 3, 4]) {
    assert.ok(MOBILE_TOUCH_ACTIONS.duelist.some(([id]) => id === 'ability' + n));
    assert.ok(positions['ability' + n].x > 60, 'ability arc is right side');
  }
  assert.ok(positions.light.x > 80 && positions.special.x > 40);
});

test('mobile UI CSS uses its own scoped selectors and keeps desktop unchanged', () => {
  assert.ok(css.startsWith('/* Duelist Adventure mobile UI'));
  assert.match(css, /@media \(max-width: 850px\)/);
  assert.match(css, /@media \(orientation:portrait\) and \(max-width:600px\)/);
  assert.doesNotMatch(css, /\.duelist-game\s*\{\s*display:none/);
  const open = (css.match(/\{/g)||[]).length;
  const close = (css.match(/\}/g)||[]).length;
  assert.equal(open, close, 'malformed CSS grouping can break the entire mobile menu');
});
