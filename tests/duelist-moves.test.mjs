// Duelist Adventure's own animations, baked on Fallen Sky's fused bodies: one clip per move, as long as the
// move, smooth (no joint pops), feet planted, facing forward, the crystal blade never in the ground.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { bakeDuelMoves, DUEL_MOVES, CRYSTAL_SWORD } from '../src/components/duelist/client/duelMoves.mjs';
import { MOVES } from '../src/components/duelist/core/index.mjs';

globalThis.self ??= globalThis;
const DEG = 180 / Math.PI;
const BODIES = {
  female: 'public/models/characters/fused/Female_Fused_v2.glb',
  male: 'public/models/characters/fused/Male_Fused_v2.glb',
};
async function loadBody(file) {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'NO_IMAGE_DECODE', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  const bytes = readFileSync(file);
  const model = (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  const box = new THREE.Box3();
  model.updateMatrixWorld(true);
  model.traverse((n) => { if (n.isSkinnedMesh) box.expandByObject(n); });
  model.scale.multiplyScalar(1.7 / (box.max.y - box.min.y));
  model.updateMatrixWorld(true);
  return model;
}
const bone = (model, name) => model.getObjectByName(name);
const JOINTS = ['Hips', 'Spine1', 'RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftUpLeg', 'RightUpLeg'];

for (const [gender, file] of Object.entries(BODIES)) {
  test(`${gender}: every Duelist move bakes smooth, planted and facing forward`, async () => {
    const model = await loadBody(file);
    const { clips, grip } = bakeDuelMoves(model);
    assert.ok(grip, 'the crystal sword has a grip in the right hand');
    assert.deepEqual(Object.keys(clips), DUEL_MOVES.map((m) => m.name));
    // the weapon frame as the runtime holds it
    const root = new THREE.Object3D();
    root.position.fromArray(grip.position); root.quaternion.fromArray(grip.quaternion); root.scale.setScalar(grip.scale);
    const tip = new THREE.Object3D(); tip.position.set(0, CRYSTAL_SWORD.length, 0); root.add(tip);
    bone(model, 'mixamorigRightHand').add(root);
    try {
      for (const clip of Object.values(clips)) {
        if (MOVES[clip.name]) assert.ok(Math.abs(clip.duration - MOVES[clip.name].duration) < 1e-6 || clip.name === 'grip', `${clip.name} lasts as long as its move`);
        const mixer = new THREE.AnimationMixer(model);
        const action = mixer.clipAction(clip);
        let prev = null;
        let worst = { deg: 0 };
        const feet = [];
        let lowestTip = Infinity;
        const steps = Math.ceil(clip.duration * 120);
        for (let i = 0; i <= steps; i++) {
          const t = Math.min(clip.duration - 1e-4, (clip.duration * i) / steps);
          mixer.stopAllAction(); action.reset().play(); mixer.setTime(t); model.updateMatrixWorld(true);
          const qs = JOINTS.map((j) => bone(model, `mixamorig${j}`).getWorldQuaternion(new THREE.Quaternion()));
          if (prev) qs.forEach((q, j) => { const d = q.angleTo(prev[j]) * DEG; if (d > worst.deg) worst = { deg: d, joint: JOINTS[j], t }; });
          prev = qs;
          feet.push(['Left', 'Right'].map((s) => bone(model, `mixamorig${s}Foot`).getWorldPosition(new THREE.Vector3())));
          const l = bone(model, 'mixamorigLeftUpLeg').getWorldPosition(new THREE.Vector3());
          const r = bone(model, 'mixamorigRightUpLeg').getWorldPosition(new THREE.Vector3());
          const facing = new THREE.Vector3().crossVectors(l.sub(r), new THREE.Vector3(0, 1, 0)).setY(0).normalize();
          assert.ok(facing.z > Math.cos(50 / DEG), `${clip.name} at ${t.toFixed(2)} s: hips face ${facing.toArray().map((x) => x.toFixed(2))}`);
          lowestTip = Math.min(lowestTip, tip.getWorldPosition(new THREE.Vector3()).y);
        }
        mixer.stopAllAction(); mixer.uncacheRoot(model);
        assert.ok(worst.deg < 30, `${clip.name}: ${worst.joint} jumps ${worst.deg.toFixed(1)} deg at ${worst.t?.toFixed(3)} s`);
        for (const s of [0, 1]) {
          const drift = Math.max(...feet.map((f) => f[s].distanceTo(feet[0][s])));
          assert.ok(drift < 0.03, `${clip.name}: foot ${s} slides ${drift.toFixed(3)} m`);
        }
        assert.ok(lowestTip > 0.03, `${clip.name}: the blade tip reaches ${lowestTip.toFixed(2)} m (into the ground)`);
      }
    } finally {
      root.removeFromParent();
    }
  });
}
