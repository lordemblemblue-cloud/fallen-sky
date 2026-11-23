import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEVEL_CAP, masteryAt, levelFromXp, xpForLevel } from '../src/components/duelist/core/progression.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const hub = read('src/components/duelist/menu/DuelistTemplateHub.jsx');
const character = read('src/components/duelist/menu/DuelistCharacterMenu.jsx');
const preview = read('src/components/duelist/menu/DuelistCharacterPreview.jsx');
const css = read('src/components/duelist/menu/DuelistCharacterMenu.css');
const theme = read('src/components/duelist/menu/duelistDarkBlueTheme.css');

test('Character opens the new single-frame menu rather than the old screenshot-overlay menu', () => {
  assert.match(hub, /<DuelistCharacterMenu prefs=\{prefs\} onPrefs=\{onPrefs\} close=\{close\}/);
  assert.doesNotMatch(hub, /<CharacterReferenceMenu/);
  assert.match(character, /className="dcm-root"/);
  assert.match(character, /className="dcm-roster-panel"/);
  assert.match(character, /className="dcm-showcase"/);
  assert.match(character, /className="dcm-skin-tray"/);
  assert.match(character, /className="dcm-mastery-panel"/);
  assert.match(character, /className="dcm-confirm"/);
  assert.match(css, /duelist_character_scene_only\.webp/);
  assert.doesNotMatch(css, /duelist_story_template\.png|deb569781_0cd1862c/);
});

test('The 3D preview paints a transparent fighter, never the home cyan hangar backdrop', () => {
  assert.match(character, /<DuelistCharacterPreview fighter=\{prefs\.fighter\}/);
  assert.match(preview, /createSceneRenderer\('duelist-adventure',/);
  assert.match(preview, /alpha: true/);
  assert.match(preview, /renderer\.setClearColor\(0x08162d, 0\)/);
  assert.match(preview, /scene\.background = null/);
  assert.match(preview, /loadFighterBody\(fighter\)/);
  assert.doesNotMatch(preview, /new THREE\.Mesh\(|TorusGeometry|BoxGeometry|CylinderGeometry/);
  assert.doesNotMatch(preview, /\.fog = new THREE\.Fog/);
});

test('The character screen retains real class XP, milestones and fighter selection', () => {
  assert.equal(LEVEL_CAP,25);
  assert.equal(levelFromXp(xpForLevel(25)).level,25);
  assert.equal(masteryAt(25).ultimatePoints,5);
  assert.match(character, /classProgressOf\(prefs\)/);
  assert.match(character, /masteryAt\(mastery\.level\)/);
  assert.match(character, /role="progressbar"/);
  assert.match(character, /\[5, 10, 15, 20, 25\]/);
  assert.match(character, /onPrefs\(\{fighter:id\}\)/);
  assert.match(character, /onPrefs\(\{classId:id\}\)/);
  assert.match(character, /onClick=\{close\}/);
});

test('Dark-blue styles are shared across home, mode selection, character, story, settings, store, routed pages, loading and HUD', () => {
  assert.match(theme, /\.dxt-page,\.duelist-menu-page,\.duelist-hub,\.duelist-game,\.duelist-arena-page/);
  for(const name of ['.dxt-home-intro','.dxt-surface','.dxt-mode-detail','.dxt-store-info',
    '.dsm-story','.dxt-page--reference .dxr-art--settings','.duelist-menu-page',
    '.duelist-game','.duelist-match-loading']) assert.ok(theme.includes(name),name);
  assert.match(hub, /import '\.\/duelistDarkBlueTheme\.css'/);
  assert.match(read('src/components/duelist/menu/MenuPages.jsx'), /import '\.\/duelistDarkBlueTheme\.css'/);
  assert.match(read('src/components/duelist/client/DuelistGame.jsx'), /import '\.\.\/menu\/duelistDarkBlueTheme\.css'/);
  assert.match(theme, /#08162d/);
  assert.match(theme, /#ffbd6b/);
  assert.match(theme, /NEVER recolor HP\/team semantic bars/);
});

test('Character layout has its own mobile and desktop breakpoints and keeps bottom navigation', () => {
  assert.match(css, /@media\(max-width:980px\)/);
  assert.match(css, /@media\(max-width:600px\)/);
  assert.match(hub, /className="dxt-footer"/);
  assert.match(hub, /id: 'settings', label: 'SETTINGS'/);
});
