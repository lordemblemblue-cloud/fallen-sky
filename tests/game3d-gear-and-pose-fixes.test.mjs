// Three things a player sees on the character: gloves hide the whole hand (no finger pushes through a
// closed fist), a helmet never cuts the eyes away, and the standing pose is upright. The first part is
// pure; the rest runs on the real bodies and armor pieces and needs Three.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* global console */
let THREE = null, GLTFLoader = null, masks = null, upright = null, native = null;
try {
  THREE = await import('three');
  ({ GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js'));
  globalThis.self ??= globalThis;
  masks = await import('../src/components/onboarding/armorBodyMask.js');
  upright = await import('../src/components/game3d/player/uprightStandingClip.js');
  native = await import('../src/components/game3d/player/playerNativeAnimationClips.js');
} catch { /* no Three.js here */ }
const skip = THREE && masks ? false : 'Three.js is not installed here';
const DIR = 'public/models/characters/fused/';
const BODIES = { female: ['Female_Fused_v2.glb', 'fused-female-v1'], male: ['Male_Fused_v2.glb', 'fused-male-v1'] };
const armor = JSON.parse(fs.readFileSync(DIR + 'armor/manifest.json', 'utf8'));

async function parse(path) {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'NO_IMAGE_DECODE', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  const bytes = fs.readFileSync(path);
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}
// bind a piece to the body the way the customization runtime does: its meshes use the body's own bones
function bindToBody(piece, body) {
  const bones = new Map(); body.traverse((n) => { if (n.isBone) bones.set(n.name, n); });
  piece.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const target = mesh.skeleton.bones.map((b) => bones.get(b.name));
    assert.ok(target.every(Boolean), 'every bone of the piece is on the body');
    mesh.bind(new THREE.Skeleton(target, mesh.skeleton.boneInverses.map((m) => m.clone())), mesh.bindMatrix.clone());
    mesh.userData.creatorLayer = true;
  });
}
const bodyMeshes = (body) => { const out = []; body.traverse((n) => { if (n.isSkinnedMesh && !n.userData.creatorLayer && /Skin_/.test(n.material?.name || '')) out.push(n); }); return out; };
const triangles = (mesh) => mesh.geometry.index.count / 3;

test('the rules themselves: leading bones, covered hands, hand and eye vertices', { skip }, () => {
  const names = ['Hips', 'mixamorigRightHand', 'mixamorigRightHandIndex1', 'mixamorigLeftHandThumb2', 'mixamorigRightForeArm', 'mixamorigLeftHand'];
  const index = [0, 1, 0, 0, 2, 1, 0, 0, 4, 1, 0, 0, 3, 5, 0, 0, 5, 3, 0, 0], weight = [1, 0, 0, 0, 0.6, 0.4, 0, 0, 0.7, 0.3, 0, 0, 0.9, 0.1, 0, 0, 0.8, 0.2, 0, 0];
  const leading = masks.leadingBones(index, weight, 5);
  assert.deepEqual([...leading], [0, 2, 4, 3, 5]);
  assert.deepEqual([...masks.coveredHandSides(leading, names)].sort(), ['Left', 'Right']);
  assert.deepEqual([...masks.coveredHandSides(masks.leadingBones([1, 0, 0, 0, 4, 0, 0, 0], [1, 0, 0, 0, 1, 0, 0, 0], 2), names)], [], 'a bracer that reaches no finger covers no hand');
  assert.deepEqual([...masks.handVertices(leading, names, new Set(['Right']))], [0, 1, 0, 0, 0], 'the forearm and the other hand stay');
  assert.deepEqual([...masks.handVertices(leading, names, new Set(['Left', 'Right']))], [0, 1, 0, 1, 1]);
  const eyes = masks.eyeVertices({ FX_Blink_L: new Float32Array([0, 0, 0, 0, 0.01, 0, 0, 0, 0]), FX_LookUp: new Float32Array([0, 0, 0, 0, 0, 0, 0.001, 0, 0]), FX_Smile_L: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1]), CC_EyeSize: new Float32Array(9).fill(1) }, 3);
  assert.deepEqual([...eyes], [0, 1, 1], 'blink and look shapes mark the eyes; a smile or a face-shape slider does not');
  assert.equal(masks.eyeVertices({ FX_Smile_L: new Float32Array(9) }, 3), null);
});

for (const [gender, [file, rigId]] of Object.entries(BODIES)) {
  test(gender + ': worn gloves hide the whole hand, a worn helmet keeps the eyes', { skip }, async () => {
    const pieces = armor[gender];
    for (const entry of pieces.filter((p) => p.slot === 'gloves' || p.slot === 'helmet')) {
      const body = (await parse(DIR + file)).scene;
      const layer = (await parse('public' + entry.url)).scene;
      bindToBody(layer, body);
      const mask = masks.layerBodyMask(layer);
      assert.ok(mask, entry.id + ' carries a body mask');
      const meshes = bodyMeshes(body), full = meshes.map(triangles);
      const hand = (mesh) => { const lead = masks.leadingBones(mesh.geometry.attributes.skinIndex.array, mesh.geometry.attributes.skinWeight.array, mesh.geometry.attributes.position.count); return masks.handVertices(lead, mesh.skeleton.bones.map((b) => b.name), new Set(['Left', 'Right'])); };
      const eye = (mesh) => masks.eyeVertices(Object.fromEntries(Object.entries(mesh.morphTargetDictionary || {}).map(([n, i]) => [n, mesh.geometry.morphAttributes.position[i].array])), mesh.geometry.attributes.position.count);
      // triangles still drawn whose three corners are all hand (or all eye) vertices
      const left = (mesh, flags) => { if (!flags) return 0; const a = mesh.geometry.index.array; let n = 0; for (let t = 0; t < a.length; t += 3) if (flags[a[t]] && flags[a[t + 1]] && flags[a[t + 2]]) n++; return n; };
      const skinBody = meshes.find((m) => /Skin_Body/.test(m.material.name)), skinHead = meshes.find((m) => /Skin_Head/.test(m.material.name));
      const handAll = left(skinBody, hand(skinBody)), eyeAll = left(skinHead, eye(skinHead));
      masks.applyBodyMasks(body, [mask]);                                                   // the baked mask alone
      const handBaked = left(skinBody, hand(skinBody)), eyeBaked = left(skinHead, eye(skinHead));
      const sides = entry.slot === 'gloves' ? masks.gloveHandSides(layer) : new Set();
      masks.applyBodyMasks(body, [mask], { gloveSides: sides });                            // with the two rules
      const handNow = left(skinBody, hand(skinBody)), eyeNow = left(skinHead, eye(skinHead));
      console.log('  ' + entry.id.padEnd(22) + (entry.slot === 'gloves'
        ? ' hand triangles drawn: ' + handAll + ' bare, ' + handBaked + ' with the baked mask alone, ' + handNow + ' now'
        : ' eye triangles drawn: ' + eyeAll + ' bare, ' + eyeBaked + ' with the baked mask alone, ' + eyeNow + ' now'));
      if (entry.slot === 'gloves') {
        assert.deepEqual([...sides].sort(), ['Left', 'Right'], entry.id + ' covers both hands');
        assert.ok(handBaked > handAll * 0.2, entry.id + ': the baked mask alone leaves hand skin to push through');
        assert.ok(handNow <= handAll * 0.03, entry.id + ': the hand is hidden (' + handNow + ' of ' + handAll + ' triangles left)');
        assert.equal(eyeNow, eyeAll, 'gloves do not touch the face');
      } else {
        assert.equal(eyeNow, eyeAll, entry.id + ': every eye triangle is still drawn');
        assert.ok(triangles(skinHead) < full[meshes.indexOf(skinHead)], entry.id + ': the helmet still hides the skin under it');
      }
      masks.applyBodyMasks(body, []);
      assert.deepEqual(meshes.map(triangles), full, entry.id + ': taking it off restores the body');
    }
  });

  test(gender + ': the standing pose is upright, and only the standing clips change', { skip }, async () => {
    const gltf = await parse(DIR + file);
    const model = gltf.scene; model.animations = gltf.animations;
    const clips = native.nativePlayerAnimationClips(model);
    const fixed = upright.withUprightStanding(model, clips);
    for (const key of Object.keys(clips)) if (!['idle', 'afk'].includes(key)) assert.equal(fixed[key], clips[key], key + ' is left alone');
    assert.equal(upright.withUprightStanding(model, clips).idle, fixed.idle, 'worked out once');
    const world = (name) => model.getObjectByName('mixamorig' + name).getWorldPosition(new THREE.Vector3());
    const stand = (clip) => {
      const mixer = new THREE.AnimationMixer(model); const out = [];
      for (const t of [0, clip.duration / 2]) {
        mixer.stopAllAction(); mixer.clipAction(clip).reset().play(); mixer.setTime(t); model.updateMatrixWorld(true);
        const k = world('Head').y / 1.55, ankles = world('LeftFoot').add(world('RightFoot')).multiplyScalar(0.5);
        const forward = world('LeftToeBase').sub(world('LeftFoot')).setY(0).normalize();
        const spine = world('Neck').sub(world('Hips'));
        out.push({ hips: world('Hips').sub(ankles).dot(forward) / k * 100, head: world('Head').sub(ankles).dot(forward) / k * 100,
          torso: Math.atan2(spine.dot(forward), spine.y) * 180 / Math.PI, sole: (world('LeftToeBase').y - world('LeftFoot').y) / k * 100, hipsY: world('Hips').y / k });
      }
      mixer.stopAllAction(); mixer.uncacheRoot(model);
      return out;
    };
    for (const key of ['idle', 'afk']) {
      const copy = clips[key].tracks.map((t) => Array.from(t.values));
      const before = stand(clips[key]), after = stand(fixed[key]);
      assert.deepEqual(clips[key].tracks.map((t) => Array.from(t.values)), copy, 'the clip handed in is not changed');
      console.log('  ' + rigId + ' ' + key.padEnd(4) + ' (' + clips[key].name + '): hips ' + before[0].hips.toFixed(1) + ' -> ' + after[0].hips.toFixed(1) + ' cm and head ' + before[0].head.toFixed(1) + ' -> ' + after[0].head.toFixed(1)
        + ' cm ahead of the ankles; torso ' + before[0].torso.toFixed(1) + ' -> ' + after[0].torso.toFixed(1) + ' degrees; correction ' + JSON.stringify(fixed[key].userData?.uprightStanding || 'none'));
      for (const [i, a] of after.entries()) {
        assert.ok(Math.abs(a.hips) < 3, key + ': the hips are over the ankles (' + a.hips.toFixed(1) + ' cm)');
        assert.ok(a.head > -6 && a.head < 8, key + ': the head is over the body (' + a.head.toFixed(1) + ' cm)');
        assert.ok(a.torso > -3 && a.torso < 3, key + ': the back is upright (' + a.torso.toFixed(1) + ' degrees)');
        assert.ok(Math.abs(a.sole - before[i].sole) < 1, key + ': the soles stay as flat as they were');
        assert.ok(Math.abs(a.hipsY - before[i].hipsY) < 0.01, key + ': she stands as tall as before');
      }
    }
    const lean = stand(clips.idle)[0];
    if (gender === 'female') assert.ok(lean.hips > 5 && lean.head > 9, 'the female Stand clip does lean as it comes (' + lean.hips.toFixed(1) + ', ' + lean.head.toFixed(1) + ')');
  });
}
