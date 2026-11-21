import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('all Duelist surfaces consume the same scoped theme', () => {
  const menu = source('src/components/duelist/menu/MenuPages.jsx');
  const arena = source('src/pages/DuelistNext.jsx');
  const css = source('src/components/duelist/menu/duelistUnifiedVisual.css');
  assert.match(menu, /import '\.\/duelistUnifiedVisual\.css'/);
  assert.match(arena, /import '@\/components\/duelist\/menu\/duelistUnifiedVisual\.css'/);
  assert.match(css, /\.duelist-hub-header,\.duelist-menu-topbar,\.duelist-arena-header/);
  assert.match(css, /\.duelist-menu-page \.duelist-menu-panel/);
  assert.match(css, /\.duelist-match-loading/);
});

test('mode gallery keeps playable buttons and marks unavailable categories honestly', () => {
  const menu = source('src/components/duelist/menu/MenuPages.jsx');
  assert.match(menu, /Choose your game mode/);
  assert.match(menu, /data-mode=\{mode\.id\}/);
  assert.match(menu, /<span>CASUAL<\/span>/);
  assert.match(menu, /<span>RANKED PLAY<\/span>/);
  assert.match(menu, /<span>TRAINING<\/span>/);
  assert.match(menu, /<span>CUSTOM<\/span>/);
  assert.match(menu, /disabled title="Custom lobbies are planned"/);
  assert.match(menu, /Ranked matchmaking is planned/);
});

test('match entry and reconnect present an accessible actual-status briefing', () => {
  const loading = source('src/components/duelist/client/MatchLoadingScreen.jsx');
  const game = source('src/components/duelist/client/DuelistGame.jsx');
  assert.match(loading, /role=\{isError \? 'alert' : 'status'\}/);
  assert.match(loading, /aria-live=\{isError \? 'assertive' : 'polite'\}/);
  assert.match(loading, /PREPARE ARENA/);
  assert.doesNotMatch(loading, /setInterval|Math\.random|fakeProgress/);
  assert.match(game, /net\.status === 'reconnecting'/);
  assert.match(game, /MatchLoadingScreen mode=\{mode\}/);
  assert.match(game, /variant="error"/);
});
