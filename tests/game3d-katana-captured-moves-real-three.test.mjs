// The captured katana moves and the nine strikes, baked on the real fused
// bodies with the odachi's own grip under the real Three.js: the blade points
// where each key says, the second hand is on the hilt, the feet stay on the
// ground and nothing snaps between frames. Skipped where Three.js is not
// installed. Prints what it measured, and the baked poses themselves
// (KATANA_POSES lines) so a study picture can be drawn from the log.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { katanaCapturedMoves, katanaStrikeMoves, katanaComboMoves, KATANA_COMBOS } from '../src/components/game3d/weapons/katanaTechniques.mjs';

/* global process */
let THREE = null, GLTFLoader = null, baker = null;
try {
  THREE = await import('three');
  ({ GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js'));
  baker = await import('../src/components/game3d/weapons/weaponComboClips.js');
} catch { /* no Three.js here: the checks below are skipped */ }
const skip = THREE && baker ? false : 'Three.js is not installed here';

globalThis.self ??= globalThis;
const RIGS = {
  'fused-female-v1': 'public/models/characters/fused/Female_Fused_v2.glb',
  'fused-male-v1': 'public/models/characters/fused/Male_Fused_v2.glb',
};
const JOINTS = ['Hips', 'Spine2', 'Neck', 'Head', 'HeadTop_End', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];

async function loadBody(rigId) {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'NO_IMAGE_DECODE', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  const bytes = readFileSync(RIGS[rigId]);
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const model = gltf.scene;
  // loadAvatarModel's normalisation: 1.7 m tall, feet on the ground, facing +Z
  const box = new THREE.Box3();
  model.updateMatrixWorld(true);
  model.traverse((n) => { if (n.isSkinnedMesh) box.expandByObject(n); });
  model.scale.multiplyScalar(1.7 / (box.max.y - box.min.y));
  model.updateMatrixWorld(true);
  return model;
}

function setup(model, rigId, weaponId) {
  const manifest = JSON.parse(readFileSync('public/game3d/weapons/manifest.json', 'utf8'));
  const weapon = manifest.weapons.find((w) => w.id === weaponId);
  const grip = weapon.grips[rigId].combat;
  const bone = (name) => model.getObjectByName('mixamorig' + name);
  const root = new THREE.Object3D();
  root.position.fromArray(grip.position); root.quaternion.fromArray(grip.quaternion); root.scale.setScalar(grip.scale);
  const tip = new THREE.Object3D();
  tip.position.fromArray(weapon.points?.tip || [0, weapon.length * 0.9, 0]);
  root.add(tip); bone('RightHand').add(root);
  const world = (o) => o.getWorldPosition(new THREE.Vector3());
  const headY = world(bone('Head')).y;
  const k = headY / 1.55;   // the baker's body scale (feet on the ground at 0)
  return { weapon, bone, root, tip, world, k, gripQ: new THREE.Quaternion().fromArray(grip.quaternion) };
}

function poseAt(model, mixer, action, clip, t) {
  mixer.stopAllAction(); action.reset().play(); mixer.setTime(Math.min(clip.duration - 1e-4, Math.max(0, t)));
  model.updateMatrixWorld(true);
}

for (const rigId of Object.keys(RIGS)) {
  test('captured moves and strikes on ' + rigId + ' holding the odachi', { skip }, async () => {
    const model = await loadBody(rigId);
    const rest = baker.captureRestPose(model);
    const h = setup(model, rigId, 'odachi');
    const captured = katanaCapturedMoves(), strikes = katanaStrikeMoves();
    const clips = baker.bakeWeaponComboClips(model, 'greatsword', { right: h.gripQ }, { rest, reach: h.weapon.length, moves: [...captured, ...strikes] });
    assert.equal(Object.keys(clips).length, captured.length + strikes.length, 'every move bakes');
    const F = new THREE.Vector3(0, 0, 1), U = new THREE.Vector3(0, 1, 0), R = new THREE.Vector3(-1, 0, 0);
    const body = (v) => new THREE.Vector3().addScaledVector(F, v[0]).addScaledVector(U, v[1]).addScaledVector(R, v[2]);
    const standAnkle = Math.min(h.world(h.bone('LeftFoot')).y, h.world(h.bone('RightFoot')).y);
    const rows = [];
    for (const move of [...captured, ...strikes]) {
      const clip = clips[move.name];
      assert.ok(clip && Math.abs(clip.duration - move.keys.at(-1).t) < 1e-6, move.name + ' duration');
      assert.equal(clip.userData.technique, move.technique);
      assert.equal(clip.userData.hit, move.hit);
      const mixer = new THREE.AnimationMixer(model), action = mixer.clipAction(clip);
      const m = { blade: 0, bladeMean: 0, hilt: 0, ankle: Infinity, tip: Infinity, footMiss: 0, wrist: 0, n: 0 };
      const dump = { t: [], p: [] };
      for (const key of move.keys) {
        poseAt(model, mixer, action, clip, key.t);
        const along = new THREE.Vector3(0, 1, 0).applyQuaternion(h.root.getWorldQuaternion(new THREE.Quaternion()));
        if (key.r?.blade) {
          const error = along.angleTo(body(key.r.blade).normalize()) * 180 / Math.PI;
          m.blade = Math.max(m.blade, error); m.bladeMean += error; m.n++;
        }
        const rh = h.world(h.bone('RightHand')), lh = h.world(h.bone('LeftHand'));
        if (key.l?.hilt) m.hilt = Math.max(m.hilt, lh.distanceTo(rh.clone().addScaledVector(along, -key.l.hilt * h.k)) / h.k);
        for (const side of ['l', 'r']) {
          const ankle = h.world(h.bone(side === 'l' ? 'LeftFoot' : 'RightFoot'));
          m.ankle = Math.min(m.ankle, (ankle.y - standAnkle) / h.k);
        }
        m.tip = Math.min(m.tip, h.world(h.tip).y / h.k);
        const fore = h.world(h.bone('RightForeArm')), knuckle = h.world(h.bone('RightHandMiddle1'));
        m.wrist = Math.max(m.wrist, rh.clone().sub(fore).normalize().angleTo(knuckle.sub(rh).normalize()) * 180 / Math.PI);
        dump.t.push(key.t);
        dump.p.push([...JOINTS.map((name) => h.world(h.bone(name))), h.world(h.root), h.world(h.tip)]
          .flatMap((v) => [Math.round(v.x / h.k * 1000), Math.round(v.y / h.k * 1000), Math.round(v.z / h.k * 1000)]));
      }
      // nothing snaps: how far any joint or the blade tip moves in one sixtieth of a second
      let jump = 0, previous = null;
      for (let i = 0; i <= Math.ceil(clip.duration * 60); i++) {
        poseAt(model, mixer, action, clip, i / 60);
        const now = [...JOINTS.map((name) => h.world(h.bone(name))), h.world(h.tip)];
        if (previous) now.forEach((v, j) => { jump = Math.max(jump, v.distanceTo(previous[j]) / h.k * 60); });
        previous = now;
      }
      mixer.stopAllAction(); mixer.uncacheRoot(model);
      m.bladeMean = m.n ? m.bladeMean / m.n : 0;
      rows.push({ move: move.name, ...m, jump });
      if (captured.includes(move)) console.log('KATANA_POSES ' + JSON.stringify({ rig: rigId, move: move.name, hit: move.hit, ...dump }));
    }
    console.log('\n' + rigId + ', odachi (' + h.weapon.length + ' m): blade off the key (worst / mean degrees), second hand off the hilt (m), lowest ankle and blade tip (m), wrist bend, fastest point (m/s)');
    for (const r of rows) {
      console.log('  ' + r.move.padEnd(20) + ' blade ' + r.blade.toFixed(0).padStart(3) + ' / ' + r.bladeMean.toFixed(0).padStart(2) + '   hilt ' + r.hilt.toFixed(3)
        + '   ankle ' + r.ankle.toFixed(3) + '   tip ' + r.tip.toFixed(2) + '   wrist ' + r.wrist.toFixed(0).padStart(3) + '   fastest ' + r.jump.toFixed(1));
    }
    for (const r of rows) {
      assert.ok(r.bladeMean < 25, r.move + ': the blade follows its keys (mean ' + r.bladeMean.toFixed(1) + ' degrees off)');
      assert.ok(r.hilt < 0.12, r.move + ': the second hand is on the hilt (' + r.hilt.toFixed(3) + ' m off)');
      assert.ok(r.ankle > -0.03, r.move + ': no foot below the ground (' + r.ankle.toFixed(3) + ' m)');
      assert.ok(r.tip > 0.02, r.move + ': the blade stays out of the ground (' + r.tip.toFixed(2) + ' m)');
      assert.ok(r.jump < 60, r.move + ': nothing snaps (' + r.jump.toFixed(1) + ' m/s)');
    }
    // each combo bakes as the controller's three sword states, and hits that follow each other in the
    // capture meet: the body is in the same pose where one ends and the next begins
    for (const combo of KATANA_COMBOS) {
      const moves = katanaComboMoves(combo.id);
      const baked = baker.bakeWeaponComboClips(model, 'greatsword', { right: h.gripQ }, { rest, reach: h.weapon.length, moves });
      assert.deepEqual(Object.keys(baked), ['swordCombo1', 'swordCombo2', 'swordCombo3'], combo.name);
      const ends = [];
      for (const name of Object.keys(baked)) {
        const clip = baked[name];
        assert.deepEqual([clip.userData.combo, clip.userData.index], ['swordCombo', Object.keys(baked).indexOf(name)]);
        const mixer = new THREE.AnimationMixer(model), action = mixer.clipAction(clip);
        const at = (t) => { poseAt(model, mixer, action, clip, t); return JOINTS.map((j) => h.world(h.bone(j))); };
        ends.push({ start: at(0), end: at(clip.duration) });
        mixer.stopAllAction(); mixer.uncacheRoot(model);
      }
      const gaps = [0, 1].map((i) => Math.max(...ends[i].end.map((v, j) => v.distanceTo(ends[i + 1].start[j]) / h.k)));
      console.log('  combo ' + combo.id.padEnd(14) + ' joints apart between hits: ' + gaps.map((g) => g.toFixed(2)).join(' m, ') + ' m');
      if (combo.id === 'dojoFlow' || combo.id === 'kneelingStorm') gaps.forEach((g) => assert.ok(g < 0.02, combo.name + ' hits meet (' + g.toFixed(3) + ' m)'));
    }
    assert.ok(process.memoryUsage().heapUsed > 0);
  });
}
