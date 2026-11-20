import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { DEATH_FALL_MS, DEATH_ASH_MS, DEATH_UI_DELAY_MS, deathAshProgress } from '../src/components/game3d/death/deathSequence.mjs';

test('fall precedes ash and the spawn screen waits for the dissolve', () => {
  assert.ok(DEATH_FALL_MS >= 1000);
  assert.ok(DEATH_ASH_MS >= 900);
  assert.ok(DEATH_UI_DELAY_MS > DEATH_FALL_MS + DEATH_ASH_MS);
  assert.equal(deathAshProgress(0), 0);
  assert.equal(deathAshProgress(DEATH_FALL_MS), 0);
  assert.ok(deathAshProgress(DEATH_FALL_MS + DEATH_ASH_MS / 2) > .4);
  assert.equal(deathAshProgress(DEATH_FALL_MS + DEATH_ASH_MS), 1);
  assert.equal(deathAshProgress(Infinity), 0);
});

test('live world has death/respawn event wiring and restores visual state', () => {
  const world = readFileSync(new URL('../src/components/game3d/GameWorld3D.jsx', import.meta.url), 'utf8');
  assert.match(world, /playerDeathAnimation/);
  assert.match(world, /createPlayerDeathAsh/);
  assert.match(world, /deathAshProgress\(/);
  assert.match(world, /playerDeathAsh\?\.reset\(\)/);
  assert.match(world, /playerDeathAsh\?\.dispose\(\)/);
  assert.match(world, /respond\?\.\(\{ ok: true/);
});

test('death UI does not hide the falling actor behind a premature black tips overlay', () => {
  const controller = readFileSync(new URL('../src/components/game3d/death/DeathFlowController.jsx', import.meta.url), 'utf8');
  assert.match(controller, /DEATH_UI_DELAY_MS/);
  assert.doesNotMatch(controller, /<DeathTipsOverlay/);
});
