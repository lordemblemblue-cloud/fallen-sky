import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITY_PAGES, HUD_IMAGES, canPressAbility, captureText, healthNumbers, pageSwitchCommands, pointState, specialPercent } from '../src/components/duelist/client/glassHud.mjs';

test('each of the six visible widget template images exists and has a transparent SVG root', () => {
  assert.equal(Object.keys(HUD_IMAGES).length, 6);
  for (const url of Object.values(HUD_IMAGES)) {
    const svg = readFileSync(new URL('../public' + url, import.meta.url), 'utf8');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /viewBox=/);
    assert.doesNotMatch(svg, /<rect[^>]*fill="(?:white|black)"/i);
    assert.doesNotMatch(svg, /<text[ >]/i, 'numeric HUD data must never be baked into a template');
  }
});

test('exactly three visible abilities per page preserve all existing six powers', () => {
  assert.equal(ABILITY_PAGES.length, 2);
  assert.deepEqual(ABILITY_PAGES.map(p => p.length), [3, 3]);
  assert.deepEqual(new Set(ABILITY_PAGES.flat()), new Set(['push', 'pull', 'grip', 'breach', 'dash', 'resist']));
});

test('health readout uses real HP and guards against invalid amounts', () => {
  assert.equal(healthNumbers(83.1, 100), '84 / 100');
  assert.equal(healthNumbers(105, 100), '100 / 100');
  assert.equal(healthNumbers(-5, 100), '0 / 100');
  assert.equal(healthNumbers(undefined, 100), '— / —');
});

test('special does not invent charge before class backend is ready', () => {
  assert.equal(specialPercent(undefined), null);
  assert.equal(specialPercent(0), 0);
  assert.equal(specialPercent(55.2), 55);
  assert.equal(specialPercent(300), 100);
  assert.equal(specialPercent(-2), 0);
});

test('point owners, progress and contest messages come from authoritative state', () => {
  assert.equal(pointState({ id: 'A', owner: 'blue' }), 'blue');
  assert.equal(pointState({ id: 'B', owner: 'red', contested: true }), 'contested');
  assert.equal(pointState({ id: 'C', capturing: 'blue', progress: .37 }), 'capturing');
  assert.equal(captureText({ id: 'C', capturing: 'blue', progress: .37 }), 'C: blue capturing 37%');
  assert.equal(captureText({ id: 'B', owner: 'red', contested: true }), 'B: contested');
});


test('cooldown buttons cannot enqueue powers; a held grip releases when paging', () => {
  assert.equal(canPressAbility({ id: 'push', ready: 0 }), true);
  assert.equal(canPressAbility({ id: 'push', ready: 0.2 }), false);
  assert.equal(canPressAbility({ id: 'push', ready: -0.01 }), true);
  assert.equal(canPressAbility({ id: 'push', ready: NaN }), false);
  assert.equal(canPressAbility(undefined), false);
  assert.equal(canPressAbility({ id: 'grip', ready: 0 }, true), false);
  assert.deepEqual(pageSwitchCommands(true), ['release']);
  assert.deepEqual(pageSwitchCommands(false), []);
});

test('Duelist quiet HUD retains gameplay color while removing bulky neon frames', () => {
  const css = readFileSync(new URL('../src/components/duelist/client/duelist.css', import.meta.url), 'utf8');
  const quiet = css.slice(css.indexOf('Duelist Adventure quiet HUD pass'));
  assert.ok(quiet.startsWith('Duelist Adventure quiet HUD pass'));
  assert.match(quiet, /\.duelist-game \.duelist-player-glass[\s\S]*?border-radius:7px;filter:none;box-shadow:none/);
  assert.match(quiet, /\.duelist-game \.duelist-player-hp-rail > span[\s\S]*?background:#35c78e;box-shadow:none/);
  assert.match(quiet, /\.duelist-game \.duelist-ability-glass[\s\S]*?border-radius:6px;color:#e0e7e8/);
  assert.match(quiet, /\.duelist-game \.duelist-control-rail,[\s\S]*?background-image:none/);
  assert.match(quiet, /\.duelist-game \.duelist-feed > div[\s\S]*?background:rgba\(12,18,24,\.61\)/);
  assert.match(quiet, /\.duelist-game \.duelist-comms[\s\S]*?font-size:12px/);
  assert.match(quiet, /@media\(max-width:640px\)/);
});
