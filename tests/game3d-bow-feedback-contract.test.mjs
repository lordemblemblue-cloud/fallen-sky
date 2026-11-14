import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const text = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const world = text('src/components/game3d/GameWorld3D.jsx');
const bridge = text('src/components/game3d/rogueAttackBridge.jsx');
const bow = text('src/components/game3d/combat/BowCameraAim.mjs');
const vfx = text('src/components/game3d/vfx/Game3DBowSpiritBird.mjs');

test('a bow shot exists before the synchronous boss/rogue damage callback', () => {
  const afterAim = world.slice(world.indexOf('const bowAimTarget='));
  const fire = afterAim.indexOf('bowVisuals.fire({origin:model.position');
  const priority = afterAim.indexOf('attackConsumedByPriorityTarget=dispatchRogueAttack(');
  assert.ok(fire >= 0 && priority > fire, 'firing must occur before damage confirmation');
  assert.match(bridge,/game3dVerifiedBowHit/);
  assert.match(bridge,/game3dVerifiedBowMiss/);
  assert.match(bridge,/damage:applied/);
});

test('every ordinary single-target PvE bow miss and hit has one visible outcome', () => {
  assert.match(world,/!attackConsumedByPriorityTarget&&targetChoices\.length===0\)\s*bowVisuals\.confirmMiss\('MISS'\)/);
  assert.match(world,/bowVisuals\.confirmMiss\(strike\.kind==='dodge'\?'DODGED':'MISS'\)/);
  assert.match(world,/if\(appliedDamage>0\)bowVisuals\.confirmHit\(appliedDamage\)/);
  assert.match(world,/else bowVisuals\.confirmMiss\('MISS'\)/);
  assert.match(world,/window\.addEventListener\('game3dVerifiedBowHit',onBowVerifiedHit\)/);
  assert.match(world,/window\.addEventListener\('game3dVerifiedBowMiss',onBowVerifiedMiss\)/);
  assert.match(world,/window\.removeEventListener\('game3dVerifiedBowMiss',onBowVerifiedMiss\)/);
});

test('an input rejected by legitimate cooldown or stamina is not called a fired miss', () => {
  assert.match(world,/bowVisuals\.showNotice\('COOLDOWN'\)/);
  assert.match(world,/bowVisuals\.showNotice\('NO STAMINA'\)/);
  assert.match(vfx,/const showNotice=\(message\)=>/);
  assert.match(vfx,/No arrow was fired; do not recolor the previous shot/);
});

test('the VFX is entirely visual and does not award damage', () => {
  assert.match(vfx,/game3dBowResult/);
  assert.match(vfx,/confirmMiss/);
  assert.match(vfx,/0xff5d65/);
  assert.match(vfx,/0x81f6b1/);
  assert.doesNotMatch(vfx,/combatSystem\.applyDamage|awardXP|reportEnemyKill/);
});

test('one shot target is shared across ordinary, rogue, and boss paths', () => {
  assert.match(world,/dispatchRogueAttack\(playerDerivedRef,strikeMultiplier,bowAimTarget\)/);
  assert.match(bridge,/resolveBowPriorityTarget\(preselectedBowTarget\)/);
  assert.match(bridge,/preselectedBowTarget===undefined/);
  assert.match(bow,/aimRay\.setFromCamera\(\{ x: 0, y: 0 \}, camera\)/);
});

test('30-enemy shot selection avoids unnecessary FBX traversal and wall raycasting', () => {
  assert.match(bow,/const boundCache = new WeakMap\(\)/);
  assert.match(bow,/BOW_BOUNDS_REFRESH_MS = 750/);
  assert.match(bow,/candidateOffset\.lengthSq\(\) >/);
  assert.match(bow,/if \(!candidates\.length\) return null;/);
  assert.match(bow,/blockerRay\.far = candidates\[candidates\.length - 1\]\.rayDistance/);
  assert.match(bow,/clearMuzzlePath\(origin, candidate\.point, groundMeshes\)/);
});

test('local-only diagnostics expose outcome counts and timing, not server writes', () => {
  assert.match(vfx,/lastResolutionMs/);
  assert.match(vfx,/pending:Math\.max\(0,shotStats\.fired-shotStats\.hits-shotStats\.misses\)/);
  assert.match(world,/window\.__axe3dBowShotStats=bowVisuals\.stats/);
  assert.match(world,/window\.__axe3dBowShotStats===bowVisuals\.stats/);
});
