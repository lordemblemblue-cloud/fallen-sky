import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LEVEL_UP_NOTICE_AUTO_CLOSE_MS,
  LEVEL_UP_NOTICE_ATTRIBUTES_SERVICE,
  shouldDismissLevelUpOnEscape,
} from '../src/components/game3d/notifications/levelUpNoticeRules.mjs';
import { getAXEServiceGroupForService } from '../src/components/game3d/axe/services/AXEServiceGroups.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('level-up popup duration is exactly 1.5 seconds, independent of other notices', () => {
  assert.equal(LEVEL_UP_NOTICE_AUTO_CLOSE_MS, 1500);
  const ui = read('src/components/game3d/notifications/Game3DLunarNotifications.jsx');
  assert.match(ui, /const PAUSE = \{message:8500, level:LEVEL_UP_NOTICE_AUTO_CLOSE_MS, story:9500\}/);
  assert.match(ui, /setTimeout\(dismiss, PAUSE\[active.kind\] \|\| 8000\)/);
  assert.match(ui, /return \(\)=>clearTimeout\(timeout\)/);
});

test('only Escape on an active level notice should close the box', () => {
  assert.equal(shouldDismissLevelUpOnEscape('level', {key:'Escape',repeat:false}), true);
  assert.equal(shouldDismissLevelUpOnEscape('level', {key:'Escape',repeat:true}), false);
  assert.equal(shouldDismissLevelUpOnEscape('story', {key:'Escape',repeat:false}), false);
  assert.equal(shouldDismissLevelUpOnEscape('message', {key:'Escape'}), false);
  assert.equal(shouldDismissLevelUpOnEscape('level', {key:'Enter'}), false);
  const ui = read('src/components/game3d/notifications/Game3DLunarNotifications.jsx');
  assert.match(ui, /window.addEventListener\('keydown', onEscape, true\)/);
  assert.match(ui, /window.removeEventListener\('keydown', onEscape, true\)/);
  assert.match(ui, /event\.preventDefault\(\)/);
  assert.match(ui, /event\.stopImmediatePropagation\?\.\(\)/);
});

test('clicking the level-up body navigates to real Character attributes service', () => {
  assert.equal(LEVEL_UP_NOTICE_ATTRIBUTES_SERVICE, 'character');
  assert.equal(getAXEServiceGroupForService('character')?.id, 'character');
  const ui = read('src/components/game3d/notifications/Game3DLunarNotifications.jsx');
  const page = read('src/pages/GameView.jsx');
  assert.match(ui, /className="axe-lunar-level-card" onClick=\{onAllocate\}/);
  assert.match(ui, /className="axe-lunar-close" aria-label="Dismiss level-up"/);
  assert.match(ui, /window.dispatchEvent\(new CustomEvent\('axeServiceRequested'/);
  assert.match(ui, /service: LEVEL_UP_NOTICE_ATTRIBUTES_SERVICE/);
  assert.match(page, /window.addEventListener\('axeServiceRequested', onService\)/);
  assert.match(page, /services\.controller\.open\(group\.id, \{ serviceId/);
});

test('compact glass and decorative gold design changes only level toast styles', () => {
  const css = read('src/components/game3d/notifications/Game3DLunarNotifications.css');
  const ui = read('src/components/game3d/notifications/Game3DLunarNotifications.jsx');
  assert.match(css, /\.axe-lunar-notifications--level\{\s*width:min\(430px,90vw\)/);
  assert.match(css, /\.axe-lunar-notifications--level \.axe-lunar-level\{/);
  assert.match(css, /backdrop-filter:blur\(7px\) saturate\(112%\)/);
  assert.match(css, /\.axe-lunar-level-filigree/);
  assert.match(ui, /viewBox="0 0 500 80"/);
  assert.match(ui, /className="axe-lunar-level-allocate">Open Attributes/);
  assert.match(ui, /notice\.pointsGained/);
  // The shared story and friend-message implementations must remain wired.
  assert.match(ui, /active\.kind==='story' && <StoryNotice/);
  assert.match(ui, /active\.kind==='message' && <MessageNotice/);
});
