import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { enemyHpPresentation } from '../src/components/game3d/enemyHpPresentation.mjs';

const source = (path) => readFileSync(new URL(`../src/components/game3d/${path}`, import.meta.url), 'utf8');

test('enemy HP percentage reflects authoritative damage, clamps bad values, and never divides by zero', () => {
  assert.equal(enemyHpPresentation(75, 100).percent, 75);
  assert.equal(enemyHpPresentation(0, 100).percent, 0);
  assert.equal(enemyHpPresentation(400, 100).percent, 100);
  assert.equal(enemyHpPresentation(-50, 100).percent, 0);
  assert.equal(enemyHpPresentation(NaN, 0).percent, 0);
  assert.equal(enemyHpPresentation(10, Infinity).percent, 100);
});

test('health readout remains understandable for both ordinary enemies and large bosses', () => {
  assert.equal(enemyHpPresentation(45, 100).readout, '45 / 100');
  assert.equal(enemyHpPresentation(1234, 10000).readout, '1.2K / 10K');
});

test('enemy health tanks are large, readable and anchored above the head rather than at the feet', () => {
  const bar = source('EnemyHealthBar.jsx');
  assert.match(bar, /data-testid="enemy-overhead-hp"/);
  assert.match(bar, /top: y/);
  assert.match(bar, /translate\(-50%, -100%\)/);
  assert.match(bar, /width: 'clamp\(148px, 13vw, 180px\)'/);
  assert.match(bar, /className="relative h-4/);
  assert.match(bar, /role="progressbar"/);
  assert.match(bar, /aria-valuenow=\{Math\.ceil\(current\)\}/);
  assert.match(bar, /\{readout\}/);
  assert.match(bar, /LV \{level\}/);
  assert.match(bar, /name \|\| 'Enemy'/);
  const world = source('GameWorld3D.jsx');
  assert.match(world, /enemy\.group\.position\.y \+ 2\.2/);
  assert.match(world, /<EnemyHealthBar key=\{e\.id\}/);
  const rogue = source('RogueAIHPBarLayer.jsx');
  assert.match(rogue, /<EnemyHealthBar/);
});
