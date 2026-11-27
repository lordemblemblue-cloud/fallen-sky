// A new body chosen on the character screens is swapped into the running Game 3D world instead of rebuilding the
// whole world (docs/GAME3D_CHARACTER_SCREEN_PERF_20261122.md). Before: renderer, GPU device, scene and ~500 shaders
// again, about 34 s of frozen page on WebGPU right after Create character.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextWorldBuild } from '../src/components/game3d/player/game3dWorldBuildKey.mjs';

const world = readFileSync(new URL('../src/components/game3d/GameWorld3D.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const between = (from, to) => {
  const a = world.indexOf(from);
  assert.ok(a >= 0, 'found: ' + from);
  const b = world.indexOf(to, a + from.length);
  assert.ok(b > a, 'found after it: ' + to);
  return world.slice(a, b);
};

test('a body change on the character screens keeps the world when it can swap its actor', () => {
  const start = { key: 0, url: '/m/Male.glb' };
  assert.equal(nextWorldBuild(start, '/m/Male.glb', { entryMode: true, canSwap: true }), start, 'same body: nothing changes');
  assert.deepEqual(nextWorldBuild(start, '/m/Female.glb', { entryMode: true, canSwap: true }), { key: 0, url: '/m/Female.glb' });
});

test('a body change during play, or before the world can swap, rebuilds as before', () => {
  const start = { key: 3, url: '/m/Male.glb' };
  assert.deepEqual(nextWorldBuild(start, '/m/Female.glb', { entryMode: false, canSwap: true }), { key: 4, url: '/m/Female.glb' });
  assert.deepEqual(nextWorldBuild(start, '/m/Female.glb', { entryMode: true, canSwap: false }), { key: 4, url: '/m/Female.glb' });
});

test('the world effect depends on the build key, not on the body file', () => {
  const effect = between('const scene = new THREE.Scene();', '  }, [worldBuildKey]);');
  assert.ok(effect.length > 100000, 'the whole world effect');
  assert.doesNotMatch(effect, /\n {2}\}, \[avatarConfig\.model_url\]\);/);
  assert.match(world, /worldBuildRef\.current=nextWorldBuild\(worldBuildRef\.current,avatarConfig\.model_url,\n\s+\{entryMode,canSwap:!!swapPlayerAvatarRef\.current\}\);/);
  assert.match(world, /useEffect\(\(\) => \{ swapPlayerAvatarRef\.current\?\.\(avatarConfig\.model_url\); \}, \[avatarConfig\.model_url\]\);/);
});

test('a swapped body skips the world\'s one-time spawn, NPC and quest setup', () => {
  const setup = between('const setupPlayerAvatar = (fbx, swap = null) => {', '    let shownAvatarUrl = ');
  for (const guard of [
    'if(swap){fbx.position.copy(swap.position);fbx.quaternion.copy(swap.quaternion);}',
    'if (!swap&&!workflowSpawn&&!returnPosition&&!areaArrival) snapToGround(fbx, 0);',
    'if (!swap && !entryModeRef.current && resumeCheckpoint',
    'if(!swap&&region!==LUNAR_CAVE_REGION&&region!==ASTRAL_DUNGEON_REGION) QUEST_NPCS.forEach(',
    'if (!swap) spawnQuestEnemiesRef.current = createQuestEnemySpawner(',
    'if (!swap) spawnLivingQuestNPC({',
    'const workflowSpawn = !swap && ',
    'const areaArrival=!swap&&',
    'const returnPosition=!swap&&',
  ]) assert.ok(setup.includes(guard), guard);
  // the body itself is set up again: animation, weapons, armor sync, visual runtimes, the ready announcement
  for (const again of ['mixer = new THREE.AnimationMixer(fbx);', 'weaponRuntime = createPlayerWeaponRuntime(',
    'armorEquipSync = createAXEArmorEquipSync();', 'haloVisualRuntime = createAXEHaloVisualRuntime(',
    "new CustomEvent('game3dWorldAvatarReady'", 'loadPlayerAnimationClips(loader,fbx']) {
    assert.ok(setup.includes(again), again);
  }
});

test('the old body releases everything the world teardown releases for the actor', () => {
  const release = between('const releasePlayerAvatar = (old) => {', '    const swapPlayerAvatar = (url) => {');
  for (const name of ['heldBowPresentation', 'weaponEnchantVfx', 'enchantPercentCache', 'weaponSummon', 'weaponRuntime',
    'haloVisualRuntime', 'fusionVisualRuntime', 'ascensionVisualRuntime', 'ascendedGearVisualRuntime', 'armorEquipSync',
    'avatarDrawCalls', 'playerDeathAsh']) {
    assert.match(release, new RegExp(name + '\\?\\.dispose'), name + ' disposed');
    assert.ok(world.includes('      ' + name + '?.dispose') || world.includes(name + '?.dispose?.();'), name + ' is also in the teardown');
  }
  assert.match(release, /restoreMountedRider\(\);/);
  assert.match(release, /mixer\.uncacheRoot\(old\)/);
  assert.match(release, /disposeAvatarModel\(old, \{ keepGeometry: keepSharedMorphGeometry\(scene\) \}\)/);
  assert.match(release, /model = null; modelRef\.current = null; playerModelRef\.current = null;/);
});

test('a swap while riding dismounts first, the way F does, so the new character can walk', () => {
  const dismount = between('const dismountForSwap = (old) => {', '    // A new body on the character screens');
  for (const step of ['if (!isMountedRef.current) return;', 'restoreMountedRider();', 'isMountedRef.current = false;',
    'setIsMounted(false);', 'setMounted(false);', 'setAXEMountRiding(false);']) assert.ok(dismount.includes(step), step);
  const swap = between('const swapPlayerAvatar = (url) => {', '    swapPlayerAvatarRef.current = swapPlayerAvatar;');
  const order = ['dismountForSwap(old);', 'const swap = { position: old.position.clone()', 'releasePlayerAvatar(old);']
    .map((s) => swap.indexOf(s));
  assert.ok(order.every((at) => at > 0) && order[0] < order[1] && order[1] < order[2],
    'set down beside the mount before the new body takes the old one\'s place');
});

test('a swap is cancelled by the world teardown and announced like the first body', () => {
  const swap = between('const swapPlayerAvatar = (url) => {', '    swapPlayerAvatarRef.current = swapPlayerAvatar;');
  assert.match(swap, /if \(avatarLoadDisposed \|\| seq !== avatarSwapSeq\) \{ disposeAvatarModel\(fbx\); return; \}/);
  assert.match(swap, /releasePlayerAvatar\(old\);/);
  assert.match(swap, /setupPlayerAvatar\(fbx, swap\);/);
  assert.match(swap, /game3dWorldAvatarLoadError/, 'a failed body reports like a failed first load');
  assert.match(world, /avatarLoadDisposed=true;\n {6}avatarSwapSeq\+\+;\n {6}if \(swapPlayerAvatarRef\.current === swapPlayerAvatar\) swapPlayerAvatarRef\.current = null;/);
  assert.match(world, /model\.visible=entryPreviewModeRef\.current==='select'&&!avatarSwapPending;/, 'the old body hides while the new one loads');
});
