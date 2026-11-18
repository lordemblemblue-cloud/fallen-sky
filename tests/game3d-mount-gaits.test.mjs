// The Faction 1 bear plays Idle, Walk and Run baked from the Baby Wolf companion's take
// (tools/avatar-motion/retarget-mounts.mjs). Compared before porting: the runtime dog-cycle retarget laid the bear's
// long spine flat in the gallop. The winged Faction 2/3 pets keep the runtime retarget (mountAnimations.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readGlb } from '../tools/avatar-motion/glb-io.mjs';
import { buildNodeGraph, animationSampler } from '../tools/avatar-motion/rig-graph.mjs';
import { MOUNTS, SEGMENTS } from '../tools/avatar-motion/retarget-mounts.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { GAME3D_FACTION_MOUNTS } from '../src/components/game3d/axe/factions/AXEFactionMountAssets.mjs';

const wp = (o) => o.getWorldPosition(new THREE.Vector3());

test('only the bear is baked; its definition plays the baked clips, the winged pets keep the runtime retarget', () => {
  assert.deepEqual(Object.keys(MOUNTS), ['bear']);
  assert.equal(GAME3D_FACTION_MOUNTS.AXE_Faction_1.bakedModelUrl, '/models/mounts/faction_bear.glb');
  assert.ok(existsSync('public' + GAME3D_FACTION_MOUNTS.AXE_Faction_1.bakedModelUrl));
  for (const id of ['AXE_Faction_2', 'AXE_Faction_3']) {
    assert.equal(GAME3D_FACTION_MOUNTS[id].bakedModelUrl, undefined, id);
    assert.ok(GAME3D_FACTION_MOUNTS[id].animationRigProfile, id);
  }
  // companionData.jsx (JSX: read as source): the baked file and its own clips override the runtime retarget
  const data = readFileSync('src/components/game3d/companionData.jsx', 'utf8');
  assert.match(data, /\.\.\.\(asset\.bakedModelUrl \? \{ modelUrl: asset\.bakedModelUrl, animationSource: 'embedded' \} : \{\}\),/);
  assert.match(data, /idleClipName: 'idle',\s*walkClipName: 'walk',\s*runClipName: 'run',/);
});

const cfg = MOUNTS.bear, glb = readGlb(cfg.file), g = buildNodeGraph(glb);
const clip = (name) => glb.json.animations.find((a) => a.name === name);
const paws = cfg.legs.map(([bones]) => g.byName.get(bones[bones.length - 1]));
const tops = cfg.legs.map(([bones]) => g.byName.get(bones[0]));
g.reset(); g.update();
const restTops = tops.map((o) => wp(o).y), height = Math.max(...restTops);

test('the bear carries Idle, Walk and Run loops baked from the Baby Wolf', () => {
  assert.deepEqual(glb.json.animations.map((a) => a.name), ['Idle', 'Walk', 'Run']);
  for (const [name, [t0, t1]] of Object.entries(SEGMENTS)) {
    const s = animationSampler(glb, clip(name));
    assert.ok(Math.abs(s.duration - (t1 - t0)) < 0.02, `${name} lasts ${s.duration}`);
    assert.equal(clip(name).extras.gait, name.toLowerCase());
  }
  assert.ok(clip('Run').extras.speed > clip('Walk').extras.speed * 3, 'the gallop covers ground much faster than the walk');
});

test('the bear gallops upright: every leg swings, the body stays up, the loop closes', () => {
  const s = animationSampler(glb, clip('Run'));
  const swing = paws.map(() => [Infinity, -Infinity]);
  let lowestTop = Infinity;
  const at = (t) => { g.reset(); s.apply(g, t); g.update(); };
  for (let i = 0; i <= 26; i++) {
    at((s.duration * i) / 26);
    paws.forEach((p, n) => { const z = wp(p).z; swing[n][0] = Math.min(swing[n][0], z); swing[n][1] = Math.max(swing[n][1], z); });
    tops.forEach((o, n) => { lowestTop = Math.min(lowestTop, wp(o).y / restTops[n]); });
  }
  swing.forEach(([lo, hi], n) => assert.ok(hi - lo > 0.25 * height, `leg ${n} swings ${(hi - lo).toFixed(3)} of ${height.toFixed(3)}`));
  assert.ok(lowestTop > 0.55, `leg tops stay above ${(lowestTop * 100).toFixed(0)}% of their standing height (no lying flat)`);
  at(0); const first = paws.map(wp);
  at(s.duration); const last = paws.map(wp);
  first.forEach((p, n) => assert.ok(p.distanceTo(last[n]) < 0.02 * height, 'the last frame meets the first'));
});
