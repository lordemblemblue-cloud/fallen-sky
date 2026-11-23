// Regression: switching viewport size (including browser F11) must not swap
// the match back to its retired character-preview rail or hide live HP.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const hud = read('src/components/duelist/client/DuelistHud.jsx');
const css = read('src/components/duelist/client/duelistHud.css');
const game = read('src/components/duelist/client/DuelistGame.jsx');
const arena = read('src/pages/DuelistNext.jsx');

test('F11/resize only recalculates HUD scaling, never the retired right-side preview rail', () => {
  assert.match(hud, /const \{ scale, layout \} = hudScale\(root\.clientWidth, root\.clientHeight\)/);
  assert.match(hud, /new ResizeObserver\(apply\)/);
  assert.match(hud, /game\.dataset\.hud = layout/);
  assert.doesNotMatch(hud, /setRail\(|data-rail=|<DuelistClassRail|root\.clientWidth >= 1080/);
  assert.match(hud, /\{!pickerOpen && <>\s*<Special hud=\{hud\}/);
  assert.match(hud, /<Skills hud=\{hud\}/);
});

test('HP, portrait, actual health values and EXP stay mounted across window/fullscreen layouts', () => {
  assert.match(hud, /<Vitals you=\{hud\.you\}/);
  assert.match(hud, /healthNumbers\(you\.hpValue, you\.hpMax\)/);
  assert.match(hud, /className="dh-part dh-portrait"/);
  assert.match(hud, /className="dh-hp" data-tone=\{tone\} role="progressbar"/);
  assert.match(hud, /className="dh-exp" role="progressbar"/);
  assert.match(css, /\.dh-bl \{[^}]*scale\(var\(--dh-s, 1\)\)/);
  assert.match(css, /\.dh-vitals \{[^}]*background-color: rgba\(7, 17, 32, \.80\)/);
  assert.doesNotMatch(hud, /display:\s*none|opacity:\s*0/);
});

test('live and preview enter the same game HUD regardless of online/offline source', () => {
  assert.match(arena, /<DuelistGame mode=\{mode\} online=\{online\}/);
  assert.match(game, /<DuelistHud hud=\{hud\}/);
  assert.match(game, /pickerOpen=\{!!showPicker\}/);
  assert.match(game, /setHud\(\{[\s\S]*?you: mine \? snapshot\(mine, world\.time\) : null/);
  assert.match(game, /hp: share\(v\.hp, v\.max\.hp\), hpValue: v\.hp, hpMax: v\.max\.hp/);
});
