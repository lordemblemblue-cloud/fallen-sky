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

// The sheet's style rules as { prelude, body }, comments removed (at-rule blocks are walked into).
function cssRules(text) {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const open = [];
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '{') { open.push(src.slice(start, i).trim()); start = i + 1; }
    else if (src[i] === '}') {
      const prelude = open.pop();
      if (prelude && !prelude.startsWith('@')) rules.push({ prelude: prelude.replace(/\s+/g, ' '), body: src.slice(start, i).replace(/\s+/g, ' ').trim() });
      start = i + 1;
    }
  }
  return rules;
}
// Split on commas outside parentheses (`:is(a,b)` stays whole).
function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === separator && depth === 0) { parts.push(current.trim()); current = ''; }
    else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}
const rules = cssRules(css);
const rule = prelude => {
  const found = rules.filter(r => r.prelude === prelude);
  assert.ok(found.length, `missing rule ${prelude}`);
  return found.map(r => r.body).join(' ');
};

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
    '.dxt-page--reference .dcm-layout','.dxt-page--reference .dsm-layout']) {
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
  assert.match(css, /\.duelist-game\[data-mobile-ui='true'\] \.dh-bc,html \.duelist-game\[data-mobile-ui='true'\] \.dh-br \{ display:none; \}/);
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

test('every override outranks the route stylesheets whichever of them loaded last', () => {
  // The menu and the match both import this sheet, so a player who opens one page and then the
  // other gets the other page's own sheets AFTER it. Equal specificity would then hand the tie to
  // them, e.g. the HUD's compact rule below, and the phone layout would depend on the visit path.
  assert.match(source('components/duelist/client/duelistHud.css'), /\.duelist-game\[data-hud='compact'\] \.dh-tr \{/);
  assert.match(source('components/duelist/client/duelistHud.css'), /\.duelist-game\[data-hud\] \.duelist-sound \{/);
  assert.match(source('components/duelist/menu/DuelistStoryMenu.css'), /\.dsm-story \.dsm-tab \{/);
  assert.ok(rules.length > 120, `parsed ${rules.length} rules`);
  for (const { prelude } of rules) {
    for (const selector of splitTopLevel(prelude, ',')) {
      assert.ok(selector.startsWith('html '), `"${selector}" must start with "html " to win ties`);
    }
  }
});

test('settings on a landscape phone: every tab reachable, panes apart, buttons above the footer', () => {
  // Settings is the liquid-glass surface (691325e7, 10d5dc81): its own sheet lays it out on phones and outranks
  // this one, so this sheet keeps no settings rules that could fight it (the old ones overlapped panes at 667
  // wide and pushed tabs off screen at 844).
  assert.ok(!rules.some(r => /dxr-art--settings|dxr-settings-/.test(r.prelude)), 'no settings rules in the mobile sheet');
  assert.match(source('components/duelist/menu/DuelistReferenceMenus.jsx'), /className="dxr-art dxr-art--settings dxr-settings-glass"/);
  const glass = source('components/duelist/menu/duelistReferenceMenus.css');
  const glassRules = cssRules(glass);
  const glassRule = prelude => glassRules.filter(r => r.prelude === prelude).map(r => r.body).join(' ');
  const surface = 'html .dxt-page--reference .dxr-art--settings.dxr-settings-glass';
  // tabs, controls and actions each own a grid area, so they cannot cover one another
  assert.match(glassRule(surface), /grid-template-areas:"heading heading heading" "tabs divider controls" "tabs divider actions";/);
  // the tab column and the controls scroll, so every tab and setting stays reachable on a short screen
  assert.match(glassRule(surface + ' .dxr-settings-tabs'), /flex-direction:column;[^]*overflow-y:auto;/);
  assert.match(glassRule(surface + ' .dxr-settings-controls'), /overflow-y:auto;/);
  // on a landscape phone the surface stops at the 52 px footer, which this sheet sets
  const phone = glass.slice(glass.indexOf('@media (orientation:landscape) and (max-width:1100px) and (max-height:600px)'));
  assert.match(phone, new RegExp(surface.replace(/[.]/g, '\\.') + ' \\{[^}]*position:absolute; inset:0 0 52px;'));
  assert.match(phone, /\.dxr-settings-actions \{position:static;\}/);
  assert.match(rule('html .dxt-page .dxt-footer'), /height:52px;/);
});

test('match class picker shows its countdown and first rows on a short screen', () => {
  // The 3D stage is z-index 3 and overlaps the footer (countdown, class name) when the screen is short.
  assert.match(source('components/duelist/menu/DuelistCharacterMenu.css'), /\.dcm-avatar-stage \{[^}]*z-index:3;/);
  assert.match(rule("html .duelist-game[data-mobile-ui='true'] .dcp-model-footer"), /z-index:4;/);
  // Centered flex columns that overflow cannot scroll back to their first rows.
  assert.match(source('components/duelist/client/duelistClassPicker.css'), /\.duelist-game \.dcp-classes, \.duelist-game \.dcp-details \{ display: flex; flex-direction: column; justify-content: center; \}/);
  assert.match(rule("html .duelist-game[data-mobile-ui='true'] .dcp-details"), /justify-content:flex-start;/);
  assert.match(rule("html .duelist-game[data-mobile-ui='true'] .dcp-classes"), /justify-content:flex-start;/);
});

test('kill counter ends left of the default MORE button; shop and character close buttons are reachable', () => {
  const more = defaultMobileTouchLayout('duelist', true).more;
  const killCounter = rule("html .duelist-game[data-mobile-ui='true'] .dh-tr");
  const right = killCounter.match(/right:calc\(max\(([\d.]+)%, 30px \+ env\(safe-area-inset-right,0px\)\) \+ (\d+)px\);/);
  assert.ok(right, killCounter);
  assert.equal(Number(right[1]), 100 - more.x, 'mirrors the MORE button\'s default x');
  // the same clamp the touch buttons use, and MORE is at most 52px wide on a landscape phone
  assert.match(source('components/mobile/mobileTouchControls.css'), /left:clamp\(calc\(30px \+ env\(safe-area-inset-left,0px\)\),var\(--touch-x\),calc\(100% - 30px - env\(safe-area-inset-right,0px\)\)\);/);
  assert.match(source('components/mobile/mobileTouchControls.css'), /--mobile-button-size:clamp\(52px,7vmin,64px\);/);
  assert.ok(Number(right[2]) >= 52 / 2 + 6, 'clears half the button plus a gap');
  assert.match(rule("html .duelist-game[data-mobile-ui='true'] .duelist-shop-close"), /min-width:40px; min-height:40px;/);
  assert.match(rule('html .dxt-page--reference .dcm-close'), /top:-3px; right:-3px;/);
});

test('safe-area padding puts the left inset on the left and the right inset on the right', () => {
  for (const { prelude, body } of rules) {
    for (const declaration of splitTopLevel(body, ';')) {
      const [property, value] = declaration.split(/:(.*)/s);
      if (property.trim() !== 'padding' || !/safe-area-inset-(left|right)/.test(value)) continue;
      const sides = splitTopLevel(value.trim(), ' ');
      if (sides.length < 4) continue;
      assert.doesNotMatch(sides[1], /inset-left/, `${prelude}: right padding uses the left inset`);
      assert.doesNotMatch(sides[3], /inset-right/, `${prelude}: left padding uses the right inset`);
    }
  }
});
