// Riding with a drawn weapon (owner request 2026-11-18): the rider sits astride with the legs around the
// mount, one hand on the reins at the mount's back (with daggers, gripping its dagger too) and the other
// carrying the weapon out at its side. Checked on the real fused bodies on the Faction 1 bear (the mount
// whose model is in the repository); the winged mounts load from the owner's hosting and are checked in game.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createMountedRiderPose, RIDING_WEAPON_AIMS } from '../src/components/game3d/player/mountedRiderPose.mjs';
import { solveFallbackGrip } from '../src/components/game3d/weapons/playerWeaponRuntime.js';

globalThis.self ??= globalThis;
const DEG = 180 / Math.PI;
const manifest = JSON.parse(readFileSync('public/game3d/weapons/manifest.json', 'utf8'));
const RIGS = {
  'fused-female-v1': 'public/models/characters/fused/Female_Fused_v2.glb',
  'fused-male-v1': 'public/models/characters/fused/Male_Fused_v2.glb',
};
async function parse(path) {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'NO_IMAGE_DECODE', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  const bytes = readFileSync(path);
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}
async function loadRider(rigId) {
  const model = (await parse(RIGS[rigId])).scene;
  model.userData.rigId = rigId;
  const box = new THREE.Box3();
  model.updateMatrixWorld(true);
  model.traverse((n) => { if (n.isSkinnedMesh) box.expandByObject(n); });
  model.scale.multiplyScalar(1.7 / (box.max.y - box.min.y));
  const scene = new THREE.Scene();
  scene.add(model);
  model.updateMatrixWorld(true);
  return model;
}
// GameWorld3D's companion setup: the largest dimension 1.7 m x the definition's scale (1.4), on the ground.
async function loadBear() {
  const gltf = await parse('public/models/mounts/faction_bear.glb');
  const root = new THREE.Group();
  root.add(gltf.scene);
  const scene = new THREE.Scene();
  scene.add(root);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  root.scale.setScalar((1.7 / Math.max(size.x, size.y, size.z)) * 1.4);
  root.updateMatrixWorld(true);
  const ground = new THREE.Box3().setFromObject(root).min.y;
  root.position.y -= ground;
  root.updateMatrixWorld(true);
  return root;
}
const bone = (model, name) => model.getObjectByName(name);
const world = (o) => o.getWorldPosition(new THREE.Vector3());
// a weapon root at its combat grip in the hand, with a tip point, like the weapon runtime
function holdWeapon(model, side, grip, tipPoint, name) {
  const root = new THREE.Object3D();
  root.name = name;
  root.position.fromArray(grip.position);
  root.quaternion.fromArray(grip.quaternion);
  root.scale.setScalar(grip.scale ?? 1);
  const tip = new THREE.Object3D();
  tip.position.fromArray(tipPoint);
  root.add(tip);
  bone(model, `mixamorig${side}Hand`).add(root);
  return { side, root, tip };
}
// How deep a point sits inside the mount: the body column above and below it (real vertices within 4 cm
// in x and z). A leg resting on the back or hanging beside the flank is fine; one through the body is not.
function bodyDepth(mount) {
  const pts = [];
  mount.updateMatrixWorld(true);
  mount.traverse((n) => {
    const a = n.geometry?.attributes?.position;
    if (!n.isMesh || !a) return;
    n.skeleton?.update();
    for (let i = 0; i < a.count; i += Math.max(1, Math.ceil(a.count / 20000))) {
      const v = new THREE.Vector3();
      n.getVertexPosition(i, v);
      pts.push(v.applyMatrix4(n.matrixWorld));
    }
  });
  return (p) => {
    let top = -Infinity, bottom = Infinity;
    for (const v of pts) if (Math.abs(v.x - p.x) < 0.04 && Math.abs(v.z - p.z) < 0.04) { top = Math.max(top, v.y); bottom = Math.min(bottom, v.y); }
    return p.y > top || p.y < bottom ? 0 : top - p.y;
  };
}

let bear = null;
const riders = {};
test.before(async () => {
  bear = await loadBear();
  for (const id of Object.keys(RIGS)) riders[id] = await loadRider(id);
});

const setups = {
  sword: (model, rigId) => {
    const w = manifest.weapons.find((x) => x.id === 'fantasy_sword');
    return { family: 'sword', reins: 'Left', weapons: [holdWeapon(model, 'Right', w.grips[rigId].combat, w.points?.tip || [0, w.length * 0.9, 0], 'WeaponPack_fantasy_sword')] };
  },
  bow: (model, rigId) => {
    const w = manifest.weapons.find((x) => x.id === 'fantasy_bow');
    return { family: 'bow', reins: 'Right', weapons: [holdWeapon(model, 'Left', w.grips[rigId].combat, [0, 0.6, 0], 'WeaponPack_fantasy_bow')] };
  },
  dual_blades: (model) => {
    const weapons = ['Right', 'Left'].map((side) => {
      const solved = solveFallbackGrip(model, { hand: side.toLowerCase(), class: 'sword', handleRadius: 0.0155 }, ['combat'], 1.7);
      return holdWeapon(model, side, solved.grips.combat, [0, 0.37, 0], `WeaponPack_dagger_${side.toLowerCase()}`);
    });
    return { family: 'dual_blades', reins: 'Right', weapons };
  },
};

for (const rigId of Object.keys(RIGS)) {
  for (const family of Object.keys(setups)) {
    test(`${rigId} rides the bear astride, ${family} drawn: reins on its back, the weapon out at the side`, () => {
      const player = riders[rigId];
      const depth = bodyDepth(bear);
      const { weapons, ...holdSpec } = setups[family](player, rigId);
      try {
        const pose = createMountedRiderPose({ player, mount: bear, definition: { id: 'faction_bear', companionId: 'faction_bear' } });
        assert.ok(pose.supported);
        // the hips bone sits above the seated body's underside: the seat rises so the rider rests on the back
        const lift = pose.getStatus().seatLift;
        assert.ok(lift > 0.01 && lift < 0.15, `seat lifted ${lift?.toFixed(3)} m onto the back`);
        assert.equal(pose.getStatus().weaponAttached, false, 'pack weapons stay in their own hands');
        const hold = { ...holdSpec, weapons: weapons.map(({ side, root }) => ({ side, root })) };
        for (const weaponHand of [false, true]) {
          assert.ok(pose.update({ weaponHand, hold }));
          const status = pose.getStatus();
          const free = status.free;
          assert.equal(status.reins, hold.reins);
          const seat = status.seat;
          const forward = new THREE.Vector3(0, 0, 1);
          const outward = (side) => (side === 'Left' ? 1 : -1); // facing +Z the left side is +X
          // seated: hips on the seat, both legs around the body, feet hanging on the flanks
          assert.ok(world(bone(player, 'mixamorigHips')).distanceTo(seat) < 0.2, 'hips on the saddle');
          for (const side of ['Left', 'Right']) {
            const thigh = world(bone(player, `mixamorig${side}UpLeg`));
            const knee = world(bone(player, `mixamorig${side}Leg`));
            const foot = world(bone(player, `mixamorig${side}Foot`));
            assert.ok(seat.y - foot.y > 0.25, `${side} foot hangs ${(seat.y - foot.y).toFixed(2)} m below the seat`);
            // a leg bone rests on the back or hangs beside the flank: at most its own thickness under the surface
            for (const [name, p] of [['mid-thigh', thigh.clone().lerp(knee, 0.5)], ['knee', knee], ['mid-shin', knee.clone().lerp(foot, 0.5)], ['foot', foot]]) {
              const d = depth(p);
              assert.ok(d < 0.09, `${side} ${name} is ${d.toFixed(2)} m inside the bear`);
            }
            assert.ok((knee.x - seat.x) * outward(side) > 0.25, `${side} knee straddles the body`);
          }
          // the reins hand rests on the mount's back near the withers
          const reinsHand = world(bone(player, `mixamorig${hold.reins}Hand`));
          assert.ok(reinsHand.distanceTo(status.reinsGrip) < 0.1 && Math.abs(reinsHand.z - status.rightGrip.z) < 0.15, `reins hand ${reinsHand.distanceTo(status.reinsGrip).toFixed(2)} m from the reins, at the withers`);
          // the weapon hand is out at its own side (raised while attacking)
          const freeHand = world(bone(player, `mixamorig${free}Hand`));
          const out = (freeHand.x - seat.x) * outward(free);
          assert.ok(out > 0.25, `${free} hand ${out.toFixed(2)} m out at its side`);
          if (weaponHand) assert.ok(freeHand.y > seat.y + 0.2, 'raised to strike');
          // each weapon points where the riding aim says (within the wrist's reach)
          const aims = RIDING_WEAPON_AIMS[family];
          for (const w of weapons) {
            const spec = w.side === hold.reins ? aims.reins : weaponHand ? aims.attack : aims.carry;
            const want = forward.clone().multiplyScalar(spec[0]).add(new THREE.Vector3(0, spec[1], 0))
              .add(new THREE.Vector3(outward(w.side) * spec[2], 0, 0)).normalize();
            const got = world(w.tip).sub(world(w.root)).normalize();
            const angle = got.angleTo(want) * DEG;
            assert.ok(angle < 40, `${w.side} ${family} points ${angle.toFixed(0)} deg off its riding aim (${got.toArray().map((x) => x.toFixed(2))})`);
            assert.ok(world(w.tip).y > 0.1, 'the weapon tip stays above the ground');
          }
        }
        pose.restore();
      } finally {
        weapons.forEach((w) => w.root.removeFromParent());
      }
    });
  }
}

test('GameWorld3D: a drawn pack weapon rides along in the hand; riding never melts it away', () => {
  const world = readFileSync('src/components/game3d/GameWorld3D.jsx', 'utf8');
  assert.match(world, /weaponSummon\?\.setSuspended\(!!isMountedRef\.current && !ridingWithPack\);/);
  assert.match(world, /if \(ridingWithPack && !weaponSummon\.isOut\(\)\) weaponSummon\.ensureOut\(\);/);
  assert.match(world, /moving: weaponPlayerMoving && !isMountedRef\.current,/);
  assert.match(world, /mountedRider\.update\(\{ weaponHand: mountedAttackSeconds > 0, hold \}\);/);
  assert.match(world, /reins: ridingFamily === 'dual_blades' \|\| ridingHands\.every\(\(h\) => h\.side === 'left'\) \? 'Right' : 'Left',/);
});
