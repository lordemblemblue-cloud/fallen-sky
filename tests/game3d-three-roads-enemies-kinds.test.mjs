import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import {
  ENEMY_KINDS, ENEMY_KIND_FIELDS, ENEMY_TIERS, ENEMY_TIER_SCALE, ENEMY_AI_PROFILES,
  REQUIRED_CLIP_ROLES, OPTIONAL_CLIP_ROLES, getEnemyKind,
} from '../src/components/game3d/threeroads/enemies/enemyKinds.mjs';
import {
  planGroupPositions, groundIsStandable, seedFromText,
} from '../src/components/game3d/threeroads/enemies/enemyPlacement.mjs';
import { ENEMY_INTELLIGENCE_PROFILES } from '../src/components/game3d/ai/EnemyCombatIntelligence.mjs';
import { WOLFVEIL_ZOMBIE_OWNER_ASSETS } from '../src/components/game3d/wolfveil/WolfveilZombieOwnerAssets.mjs';
import {
  WOLFVEIL_ADMIN_C1_MODEL, WOLFVEIL_ADMIN_C1_ANIMATIONS,
} from '../src/components/game3d/wolfveil/WolfveilEnemyAssets.mjs';

test('the first three kinds exist and have every field', () => {
  assert.deepEqual(Object.keys(ENEMY_KINDS).sort(), ['echo', 'ink_shade', 'old_dead']);
  for (const [id, kind] of Object.entries(ENEMY_KINDS)) {
    assert.equal(kind.id, id);
    for (const field of ENEMY_KIND_FIELDS) assert.ok(field in kind, id + ' has ' + field);
    assert.ok(typeof kind.name === 'string' && kind.name.length > 1);
    assert.ok(kind.height > 1 && kind.height < 3, id + ' stands like a person');
    assert.ok(['ink', 'native'].includes(kind.look));
    assert.ok(ENEMY_AI_PROFILES.includes(kind.aiProfile));
    assert.ok(ENEMY_INTELLIGENCE_PROFILES[kind.aiProfile], 'the game knows the profile');
    assert.ok(ENEMY_TIERS.includes(kind.defaultTier));
    assert.equal(typeof kind.loadAssets, 'function');
    assert.ok(Object.isFrozen(kind));
  }
  assert.equal(getEnemyKind('ink_shade'), ENEMY_KINDS.ink_shade);
  assert.equal(getEnemyKind('toString'), null, 'no prototype keys');
  assert.equal(getEnemyKind('wolf'), null);
  assert.deepEqual(Object.keys(ENEMY_TIER_SCALE).sort(), [...ENEMY_TIERS].sort());
});

test('the tier scales match the game table', () => {
  const config = readFileSync(new URL('../src/components/game3d/gameWorldConfig.jsx', import.meta.url), 'utf8');
  for (const tier of ENEMY_TIERS) {
    const row = config.match(new RegExp("name: '" + tier + "'.*?scale: ([0-9.]+)"));
    assert.ok(row, tier + ' is in gameWorldConfig');
    assert.equal(ENEMY_TIER_SCALE[tier], Number(row[1]));
  }
});

test('old_dead and echo resolve to the assets the game already loads', async () => {
  const dead = await ENEMY_KINDS.old_dead.loadAssets();
  assert.equal(dead.model, WOLFVEIL_ZOMBIE_OWNER_ASSETS.model);
  assert.equal(dead.clips.dying, WOLFVEIL_ZOMBIE_OWNER_ASSETS.dying);
  assert.equal(dead.clips.death, WOLFVEIL_ZOMBIE_OWNER_ASSETS.death);
  assert.equal(ENEMY_KINDS.old_dead.deathChain, true);
  const echo = await ENEMY_KINDS.echo.loadAssets();
  assert.equal(echo.model, WOLFVEIL_ADMIN_C1_MODEL.modelUrl);
  assert.equal(echo.clips.attack, WOLFVEIL_ADMIN_C1_ANIMATIONS.attack.url);
  assert.equal(echo.clips.death, WOLFVEIL_ADMIN_C1_ANIMATIONS.death.url);
  assert.equal(echo.clips.walk, undefined, 'C1 has no walk: the run is slowed');
  for (const assets of [dead, echo]) {
    for (const role of REQUIRED_CLIP_ROLES) assert.match(assets.clips[role], /^https:\/\/.+\.fbx$/i, role);
    for (const role of Object.keys(assets.clips))
      assert.ok([...REQUIRED_CLIP_ROLES, ...OPTIONAL_CLIP_ROLES].includes(role), role);
  }
});

test('ink_shade uses the legacy creature rig and clips (read from the source, a .jsx)', () => {
  const kinds = readFileSync(new URL('../src/components/game3d/threeroads/enemies/enemyKinds.mjs', import.meta.url), 'utf8');
  assert.match(kinds, /import\('\.\.\/\.\.\/creatureAssets\.jsx'\)/);
  assert.equal(ENEMY_KINDS.ink_shade.look, 'ink');
  const creature = readFileSync(new URL('../src/components/game3d/creatureAssets.jsx', import.meta.url), 'utf8');
  for (const role of ['idle', 'walk', 'run', 'attack', 'death']) assert.match(creature, new RegExp('\\b' + role + ':'));
});

// Ground: flat at 10 m, with a cliff (no ground) east of x = 108 and a steep
// wall between z = 205 and 207.
const ground = (x, z) => {
  if (x > 108) return null;
  if (z > 205 && z < 207) return 10 + (z - 205) * 4;
  if (z >= 207) return 18;
  return 10;
};

test('placement keeps every monster inside the radius, on ground, and apart', () => {
  const points = planGroupPositions({ x: 100, z: 200, radius: 9, count: 6, sampleGroundY: ground, seed: 'g1' });
  assert.equal(points.length, 6);
  for (const p of points) {
    assert.ok(Math.hypot(p.x - 100, p.z - 200) <= 9, 'inside the radius');
    assert.ok(Number.isFinite(p.y));
    assert.equal(p.y, ground(p.x, p.z));
    assert.notEqual(groundIsStandable(ground, p.x, p.z), null, 'not at the cliff or on the wall');
  }
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++)
      assert.ok(Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z) >= 2.2, 'not stacked');
});

test('placement is the same for the same group id and different for another', () => {
  const a = planGroupPositions({ x: 0, z: 0, radius: 10, count: 5, sampleGroundY: () => 0, seed: 'wagon_yard' });
  const b = planGroupPositions({ x: 0, z: 0, radius: 10, count: 5, sampleGroundY: () => 0, seed: 'wagon_yard' });
  const c = planGroupPositions({ x: 0, z: 0, radius: 10, count: 5, sampleGroundY: () => 0, seed: 'other' });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.equal(seedFromText('x'), seedFromText('x'));
});

test('placement gives fewer points rather than bad ones, and nothing for no ground', () => {
  assert.deepEqual(planGroupPositions({ x: 0, z: 0, radius: 10, count: 6, sampleGroundY: () => null }), []);
  assert.deepEqual(planGroupPositions({ x: 0, z: 0, radius: 10, count: 6, sampleGroundY: () => NaN }), []);
  assert.deepEqual(planGroupPositions({ x: NaN, z: 0, radius: 10, count: 6, sampleGroundY: () => 0 }), []);
  assert.deepEqual(planGroupPositions({ x: 0, z: 0, radius: 10, count: 0, sampleGroundY: () => 0 }), []);
  assert.deepEqual(planGroupPositions(), []);
  // A tiny radius cannot hold twelve monsters 2.2 m apart.
  const crowded = planGroupPositions({ x: 0, z: 0, radius: 1, count: 12, sampleGroundY: () => 0 });
  assert.ok(crowded.length >= 1 && crowded.length < 12);
  // Steep everywhere: rises 3 m per metre.
  assert.deepEqual(planGroupPositions({ x: 0, z: 0, radius: 10, count: 4, sampleGroundY: (x) => x * 3 }), []);
});
