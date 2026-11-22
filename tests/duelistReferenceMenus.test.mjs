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
  assert.match(hub, /<DuelistCharacterMenu prefs=\{prefs\}/);
  assert.match(hub, /<DuelistStoryMenu lobby=\{lobby\}/);
  assert.match(hub, /<SettingsReferenceMenu prefs=\{prefs\}/);
  assert.match(css, /\.dxt-page--reference \.dxt-header \{ display:none/);
  assert.match(hub, /className="dxt-footer"/);
  assert.match(route, /\['story', 'fighter', 'character', 'settings'/);
});

test('character panel uses a model-only transparent stage and server-derived 25-level mastery', () => {
  const character = source('src/components/duelist/menu/DuelistCharacterMenu.jsx');
  const avatar = source('src/components/duelist/menu/DuelistCharacterPreview.jsx');
  const layout = source('src/components/duelist/menu/DuelistCharacterMenu.css');
  assert.equal(LEVEL_CAP, 25);
  assert.equal(levelFromXp(xpForLevel(25)).level,25);
  assert.equal(masteryAt(25).ultimatePoints,5);
  assert.match(character, /Object\.entries\(BODIES\)/);
  assert.match(character, /<DuelistCharacterPreview fighter=\{prefs\.fighter\}/);
  assert.match(character, /classProgressOf\(prefs\)/);
  assert.match(character, /masteryAt\(mastery\.level\)/);
  assert.match(character, /role="progressbar"/);
  assert.match(character, /\[5, 10, 15, 20, 25\]/);
  assert.match(character, /aria-pressed=\{prefs\.fighter === id\}/);
  assert.match(avatar, /renderer\.setClearColor\(0x08162d, 0\)/);
  assert.doesNotMatch(avatar, /new THREE\.Mesh\(|TorusGeometry|BoxGeometry|CylinderGeometry/);
  assert.match(layout, /duelist_character_scene_only\.webp/);
  assert.doesNotMatch(layout, /duelist_story_template\.png|0cd1862c-b869-465a/);
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
  assert.match(hub, /<DuelistCharacterMenu/);
  assert.match(hub, /<DuelistStoryMenu/);
  assert.match(hub, /<SettingsReferenceMenu/);
});

test('Story screen is reconstructed with one DOM frame and scenery-only artwork', () => {
  const story = source('src/components/duelist/menu/DuelistStoryMenu.jsx');
  const layout = source('src/components/duelist/menu/DuelistStoryMenu.css');
  assert.match(hub, /<DuelistStoryMenu lobby=\{lobby\}/);
  assert.match(story, /className="dsm-story"/);
  assert.match(story, /className="dsm-frame"/);
  assert.match(story, /className="dsm-tabs"/);
  assert.match(story, /className="dsm-timeline"/);
  assert.match(story, /className="dsm-detail"/);
  assert.match(story, /className="dsm-actions"/);
  assert.match(story, /SCENE_IMAGE = .*duelist_story_scene_clean\.jpg/);
  assert.doesNotMatch(layout, /duelist_story_template\.png|aa2d24798_/);
  assert.match(layout, /grid-template-columns:minmax\(185px,18%\)/);
  assert.match(layout, /@media\(max-width:900px\)/);
  assert.match(story, /STORY_MISSIONS\[missionIndex\]/);
  assert.match(story, /mode: 'story', mission: mission\.id/);
  assert.match(story, /disabled=\{!online\}/);
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
