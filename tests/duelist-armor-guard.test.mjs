import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { dressGuard, KITS } from '../src/components/duelist/client/guardKit.mjs';

function rig() {
  const model = new THREE.Group();
  const joints = {
    Hips:[0,.85,0], Spine:[0,1,0], Spine2:[0,1.25,0], Head:[0,1.5,0], HeadTop_End:[0,1.7,0],
    LeftArm:[.22,1.35,0], RightArm:[-.22,1.35,0],
    LeftForeArm:[.45,1.30,0], RightForeArm:[-.45,1.30,0],
    LeftHand:[.65,1.25,0], RightHand:[-.65,1.25,0],
    LeftLeg:[.13,.45,0], RightLeg:[-.13,.45,0],
    LeftFoot:[.13,.07,0], RightFoot:[-.13,.07,0],
  };
  for (const [name, position] of Object.entries(joints)) {
    const bone = new THREE.Bone(); bone.name = 'mixamorig' + name; bone.position.fromArray(position); model.add(bone);
  }
  model.updateMatrixWorld(true);
  return model;
}
const meshes = model => { const result = []; model.traverse(n => { if (n.isMesh) result.push(n); }); return result; };
const triangles = nodes => nodes.reduce((sum, n) => sum + (n.geometry.index?.count ?? n.geometry.attributes.position.count) / 3, 0);
test('hidden creates no guard armor meshes; low generates actual lower triangle count', () => {
  const full = rig(), low = rig(), hidden = rig();
  dressGuard(full, KITS.gunner, 'full');
  dressGuard(low, KITS.gunner, 'low');
  dressGuard(hidden, KITS.gunner, 'hidden');
  assert.ok(meshes(full).length > 0);
  assert.equal(meshes(low).length, meshes(full).length);
  assert.ok(triangles(meshes(low)) < triangles(meshes(full)));
  assert.equal(meshes(hidden).length, 0);
  assert.ok(meshes(full).every(n => n.castShadow));
  assert.ok(meshes(low).every(n => !n.castShadow));
});
