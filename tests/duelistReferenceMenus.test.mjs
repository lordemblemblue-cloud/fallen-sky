import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STORY_MISSIONS } from '../src/components/duelist/menu/missions.js';
import { LEVEL_CAP, masteryAt, levelFromXp, xpForLevel } from '../src/components/duelist/core/progression.mjs';

const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const ui = source('src/components/duelist/menu/DuelistReferenceMenus.jsx');
const css = source('src/components/duelist/menu/duelistReferenceMenus.css');
const hub = source('src/components/duelist/menu/DuelistTemplateHub.jsx');
const route = source('src/routes/duelist-next.$page.jsx');

test('uploaded reference art maps to character story and settings separately', () => {
  assert.match(css, /dxr-art--character/);
  assert.match(css, /dxr-art--story/);
  assert.match(css, /dxr-art--settings/);
  assert.match(css, /deb569781_0cd1862c/);
  assert.match(css, /aa2d24798_duelist_story_template/);
  assert.match(css, /a5ba54ad4_duelist_settings_template/);
  assert.match(ui, /id="duelist-character-panel"/);
  assert.match(ui, /id="duelist-story-panel"/);
  assert.match(ui, /id="duelist-settings-panel"/);
});

test('visual references replace generic panels but global bottom navigation stays', () => {
  assert.match(hub, /isReferencePanel/);
  assert.match(hub, /dxt-page--reference/);
  assert.match(hub, /<CharacterReferenceMenu prefs=\{prefs\}/);
  assert.match(hub, /<DuelistStoryMenu lobby=\{lobby\}/);
  assert.match(hub, /<SettingsReferenceMenu prefs=\{prefs\}/);
  assert.match(css, /\.dxt-page--reference \.dxt-header \{ display:none/);
  assert.match(hub, /className="dxt-footer"/);
  assert.match(route, /\['story', 'fighter', 'character', 'settings'/);
});

test('character panel uses live fighter models and server-derived 25-level mastery', () => {
  assert.equal(LEVEL_CAP, 25);
  assert.equal(levelFromXp(xpForLevel(25)).level,25);
  assert.equal(masteryAt(25).ultimatePoints,5);
  assert.match(ui, /Object\.entries\(BODIES\)/);
  assert.match(ui, /<DuelistHangarStage fighter=\{prefs\.fighter\}/);
  assert.match(ui, /classProgressOf\(prefs\)/);
  assert.match(ui, /masteryAt\(mastery\.level\)/);
  assert.match(ui, /role="progressbar"/);
  assert.match(ui, /\[5,10,15,20,25\]/);
  assert.match(ui, /aria-pressed=\{prefs\.fighter === id\}/);
});

test('story uses actual operation content and real play routes with offline/online gating', () => {
  assert.deepEqual(STORY_MISSIONS.map(m => m.id), ['contraband','saltmarch']);
  assert.ok(STORY_MISSIONS.every(m=>m.parts.length===4));
  assert.match(ui, /STORY_MISSIONS\[missionIndex\]/);
  assert.match(ui, /mission\.parts\.map/);
  assert.match(ui, /mode:'story',mission:mission\.id/);
  assert.match(ui, /launch\(\{online:0\}\)/);
  assert.match(ui, /disabled=\{!lobby\.online\}/);
  assert.match(ui, /room\.length!==5/);
});

test('reference menus render one visible frame instead of stacked template and CSS boxes', () => {
  assert.match(css, /SINGLE-FRAME FIX/);
  assert.match(css, /@media \(min-width:801px\)/);
  assert.match(css, /\.dxr-character-details,\.dxr-story-details,\.dxr-settings-controls/);
  assert.match(css, /\.dxr-story-timeline,\.dxr-story-timeline button/);
  assert.match(css, /\.dxr-settings-rows label/);
  assert.match(css, /background:transparent; border:0; border-radius:0; box-shadow:none/);
  assert.match(css, /@media \(max-width:800px\)/);
  assert.match(css, /background-image:linear-gradient\(140deg/);
  assert.match(hub, /<CharacterReferenceMenu/);
  assert.match(hub, /<StoryReferenceMenu/);
  assert.match(hub, /<SettingsReferenceMenu/);
});

test('settings remains functional with a draft, Apply, Revert and persisted audio/prefs', () => {
  assert.match(ui, /GraphicsRuntimePanel sceneId="duelist-adventure"/);
  assert.match(ui, /KeyBindings keys=\{draft\.keys\|\|\{\}\}/);
  assert.match(ui, /setDraft\(prev=>/);
  assert.match(ui, /onPrefs\(\{sensitivity:/);
  assert.match(ui, /localStorage\.setItem\('duelist\.audio'/);
  assert.match(ui, /onClick=\{revert\}/);
  assert.match(ui, /onClick=\{apply\}/);
  assert.match(ui, /onClick=\{close\}/);
});
