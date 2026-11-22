import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CLASS_IDS, CLASSES } from '../src/components/duelist/core/classes.mjs';
import { idleCandidates, chooseIdleClip } from '../src/components/duelist/menu/idlePreview.mjs';

const source = (name) => readFileSync(new URL(`../src/components/duelist/${name}`, import.meta.url), 'utf8');

test('every class requests the original weapon-matched AFK stance with a sword fallback', () => {
  const selected = { warrior: 'swordIdle', duelist: 'bladesIdle', assassin: 'staffIdle', healer: 'swordIdle' };
  for (const id of CLASS_IDS) {
    assert.equal(idleCandidates(id)[0], selected[id], `${id} must pose with its weapon form`);
    assert.equal(idleCandidates(id).at(-1), 'swordIdle');
    assert.ok(CLASSES[id]);
  }
});

test('an authored pack clip is preferred; fallback embedded clip never needs a T-pose', () => {
  const sword = { name: 'swordIdle', tracks: [{ name: 'spine' }] };
  const staff = { name: 'staffIdle', tracks: [{ name: 'arm' }] };
  const embedded = { name: 'Combat_Idle', tracks: [{ name: 'hips' }] };
  assert.equal(chooseIdleClip('assassin', { staffIdle: staff, swordIdle: sword }, embedded), staff);
  assert.equal(chooseIdleClip('assassin', { swordIdle: sword }, embedded), sword);
  assert.equal(chooseIdleClip('assassin', { staffIdle: { tracks: [] } }, embedded), embedded);
  assert.equal(chooseIdleClip('assassin', {}, null), null);
});

test('the home and character stages prepare a stance before showing each model', () => {
  for (const file of ['menu/DuelistHangarStage.jsx', 'menu/DuelistCharacterPreview.jsx']) {
    const content = source(file);
    assert.match(content, /await prepareIdlePreview/);
    assert.match(content, /if \(!active\) \{ prepared\.dispose\(\); return; \}/);
    assert.ok(content.indexOf('await prepareIdlePreview') < content.indexOf('scene.add(model)'));
    assert.match(content, /idlePose\?\.dispose\(\)/);
  }
  assert.match(source('menu/DuelistTemplateHub.jsx'), /DuelistHangarStage fighter=\{prefs\.fighter\} classId=\{prefs\.classId\}/);
});

test('full-size match rail uses live class, abilities, level and authoritative meter', () => {
  const rail = source('client/DuelistClassRail.jsx');
  const hud = source('client/DuelistHud.jsx');
  const css = source('client/duelistClassRail.css');
  assert.match(rail, /CLASSES\[hud\.classId\]/);
  assert.match(rail, /DuelistCharacterPreview fighter=\{fighter\} classId=\{hud\.classId\}/);
  assert.match(rail, /const charge = specialPercent\(hud\.specialMeter\)/);
  assert.match(rail, /const slots = hud\.abilities/);
  assert.match(rail, /onPower\?\.\('special'\)/);
  assert.match(rail, /aria-valuetext=\{charge === null \? 'Unavailable'/);
  assert.match(hud, /root\.clientWidth >= 1250/);
  assert.match(hud, /DuelistClassRail hud=\{hud\}/);
  assert.match(css, /\.dh-rail-identity::after, \.dh-rail-actions::before/);
  assert.match(css, /linear-gradient\(to bottom, transparent,/);
});
