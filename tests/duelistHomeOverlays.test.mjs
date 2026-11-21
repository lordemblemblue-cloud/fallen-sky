import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { levelFromXp, xpForLevel, LEVEL_CAP, MILESTONES } from '../src/components/duelist/core/progression.mjs';

const load = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const menu = load('src/components/duelist/menu/MenuPages.jsx');
const routes = load('src/routes/duelist-next.$page.jsx');
const css = load('src/components/duelist/menu/duelistMenuOverlays.css');

test('home footer contains Settings but no Battle Pass or Plus', () => {
  const footer = menu.split('<footer className="duelist-hub-footer"')[1].split('</footer>')[0];
  assert.match(footer, /togglePanel\('settings'\)/);
  assert.doesNotMatch(footer, /BATTLE PASS|PLUS/);
  assert.match(menu, /aria-controls="duelist-play-drawer"/);
});

test('Play, Character and Settings share the home hangar overlay', () => {
  assert.match(menu, /activePanel === 'play'/);
  assert.match(menu, /activePanel === 'character'/);
  assert.match(menu, /activePanel === 'settings'/);
  assert.match(menu, /<FighterContent sharedPrefs=/);
  assert.match(menu, /<SettingsContent sharedPrefs=/);
  assert.match(menu, /className="duelist-hub-scrim"/);
  assert.match(routes, /<DuelistTemplateHub initialPanel=/);
  assert.match(css, /backdrop-filter: blur\(7px\)/);
});

test('routed menus use the bottom header for navigation', () => {
  const header = menu.split('<header className="duelist-menu-topbar"')[1].split('</header>')[0];
  assert.doesNotMatch(header, /CHARACTER|SETTINGS|BATTLE PASS|PLUS/);
  assert.match(menu, /duelist-menu-bottom-nav/);
  assert.match(menu, /params=\{\{ page: 'settings' \}\}/);
});

test('character milestones reflect actual class XP and never paid-pass placeholders', () => {
  assert.match(menu, /classProgressOf\(prefs\)/);
  assert.match(menu, /levelFromXp\(totalXp\)/);
  assert.match(menu, /Object.entries\(MILESTONES\)/);
  assert.match(menu, /role="progressbar"/);
  assert.equal(levelFromXp(0).level, 1);
  assert.equal(levelFromXp(xpForLevel(5)).level, 5);
  assert.equal(levelFromXp(xpForLevel(LEVEL_CAP)).capped, true);
  assert.deepEqual(Object.keys(MILESTONES).map(Number), [5, 10, 15, 20, 25]);
});
