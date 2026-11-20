// The hand always ends up holding exactly the equipped weapon (owner report 2026-11-18: old swords
// stayed in the hand after switching, and after a reload the equipped weapon never appeared).
// Every frame the summon reconciles the hand: interrupted melts are cleaned up, a dismissed weapon
// whose melt was cut short is unequipped, a failed or lost equip is retried, and stray pack
// weapons on the body are swept away.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPlayerWeaponSummon, WEAPON_EQUIP_RETRY } from '../src/components/game3d/weapons/playerWeaponSummon.js';
import { createPlayerWeaponRuntime } from '../src/components/game3d/weapons/playerWeaponRuntime.js';
import { WEAPON_CONSTRUCT_SECONDS } from '../src/components/game3d/weapons/weaponConstructFx.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const blade = (name) => {
  const root = new THREE.Group();
  root.name = name;
  root.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.9, 0.01).translate(0, 0.45, 0), new THREE.MeshStandardMaterial()));
  return root;
};

// The runtime's contract, with a hand bone and pack roots named like the real ones.
function fakeRuntime(model) {
  const hand = new THREE.Bone();
  hand.name = 'mixamorigRightHand';
  model.add(hand);
  let current = null;
  const rt = {
    hand,
    failNext: 0,
    calls: 0,
    async equip(id) {
      rt.calls++;
      await null;
      if (rt.failNext > 0) { rt.failNext--; return false; }
      if (current?.id === id) return true;
      current?.root.removeFromParent();
      const root = blade(`WeaponPack_${id}`);
      hand.add(root);
      current = { id, root };
      return true;
    },
    equipDaggers: () => rt.equip('daggers'),
    unequip() { current?.root.removeFromParent(); current = null; },
    orphan() { const roots = current ? [current.root] : []; current = null; return roots; },
    releaseHand() {}, setHandClosed() {}, setStanceWeight() {}, holdCombat() {}, update() {},
    getCurrent: () => (current ? { id: current.id } : null),
    getRoots: () => (current ? [current.root] : []),
    getHands: () => (current ? [{ side: 'right', handBone: hand, gripQuaternion: new THREE.Quaternion() }] : []),
    sweepStrays(keep = []) {
      const held = new Set([...(current ? [current.root] : []), ...keep]);
      const strays = [];
      model.traverse((n) => { if (/^WeaponPack_/.test(n.name) && !held.has(n)) strays.push(n); });
      strays.forEach((n) => n.removeFromParent());
      return strays.length;
    },
  };
  return rt;
}

function setup() {
  const scene = new THREE.Scene();
  const model = new THREE.Group();
  scene.add(model);
  const runtime = fakeRuntime(model);
  const errors = [];
  const summon = createPlayerWeaponSummon({ model, scene, runtime, getPixelScale: () => 900, onError: (e) => errors.push(e) });
  const inHand = () => runtime.hand.children.map((c) => c.name).sort();
  const run = async (seconds, dt = 1 / 30) => {
    for (let t = 0; t < seconds; t += dt) { summon.update(dt); await flush(); }
  };
  return { scene, model, runtime, summon, inHand, run, errors };
}

const sword = { instanceId: 'a', appearance: { weaponModelId: 'fantasy_sword' } };
const odachi = { instanceId: 'b', appearance: { weaponModelId: 'odachi' } };
const daggers = { instanceId: 'c' };

test('switching weapons leaves only the new weapon once the old one has melted', async () => {
  const s = setup();
  s.summon.sync(sword, 'sword'); await flush();
  assert.deepEqual(s.inHand(), ['WeaponPack_fantasy_sword']);
  s.summon.sync(daggers, 'dual_blades'); await flush();
  s.summon.sync(odachi, 'sword'); await flush();
  await s.run(WEAPON_CONSTRUCT_SECONDS.melt + 0.3);
  assert.deepEqual(s.inHand(), ['WeaponPack_odachi']);
  assert.equal(s.summon.getOrphanCount(), 0);
});

test('an old weapon whose melt is cut short is still removed', async () => {
  const s = setup();
  s.summon.sync(sword, 'sword'); await flush();
  const old = s.runtime.getRoots()[0];
  s.summon.sync(odachi, 'sword'); await flush();
  // something else plays an effect on the melting root (it replaces the melt, which never reports done)
  s.summon.constructOn(old);
  await s.run(WEAPON_CONSTRUCT_SECONDS.build + WEAPON_CONSTRUCT_SECONDS.settle + 0.3);
  assert.equal(old.parent, null, 'the old sword left the hand');
  assert.deepEqual(s.inHand(), ['WeaponPack_odachi']);
});

test('a failed equip is retried until the weapon is in the hand', async () => {
  const s = setup();
  s.runtime.failNext = 2;
  s.summon.sync(odachi, 'sword'); await flush();
  assert.deepEqual(s.inHand(), [], 'the first load failed');
  assert.equal(s.summon.isOut(), true);
  await s.run(WEAPON_EQUIP_RETRY.firstWait * 3 + 0.5);
  assert.deepEqual(s.inHand(), ['WeaponPack_odachi']);
  assert.equal(s.runtime.calls, 3);
});

test('after every retry fails, the weapon counts as put away and drawing it tries again', async () => {
  const s = setup();
  s.runtime.failNext = 99;
  s.summon.sync(odachi, 'sword'); await flush();
  await s.run(WEAPON_EQUIP_RETRY.firstWait * 2 ** (WEAPON_EQUIP_RETRY.attempts + 1));
  assert.equal(s.summon.isOut(), false);
  assert.equal(s.runtime.calls, WEAPON_EQUIP_RETRY.attempts + 1);
  assert.equal(s.errors.length, 1);
  s.runtime.failNext = 0;
  s.summon.ensureOut(); await flush();
  assert.deepEqual(s.inHand(), ['WeaponPack_odachi']);
});

test('a weapon lost from the hand while out is drawn again', async () => {
  const s = setup();
  s.summon.sync(sword, 'sword'); await flush();
  s.runtime.unequip(); // e.g. an unexpected unequip from elsewhere
  await s.run(0.2);
  assert.deepEqual(s.inHand(), ['WeaponPack_fantasy_sword']);
});

test('a dismissed weapon whose melt was cut short does not stay solid in the hand', async () => {
  const s = setup();
  s.summon.sync(sword, 'sword'); await flush();
  await s.run(0.1);
  const root = s.runtime.getRoots()[0];
  s.summon.dismiss();
  s.summon.constructOn(root); // replaces the melt, whose clean-up never runs
  await s.run(WEAPON_CONSTRUCT_SECONDS.build + WEAPON_CONSTRUCT_SECONDS.settle + 0.3);
  assert.deepEqual(s.inHand(), []);
  assert.equal(s.summon.isOut(), false);
});

test('riding keeps the hand empty and dismounting draws the weapon again', async () => {
  const s = setup();
  s.summon.sync(sword, 'sword'); await flush();
  s.summon.setSuspended(true);
  await s.run(0.5);
  assert.deepEqual(s.inHand(), []);
  s.summon.setSuspended(false); await flush();
  await s.run(0.1);
  assert.deepEqual(s.inHand(), ['WeaponPack_fantasy_sword']);
});

test('dispose removes weapons that are still melting', async () => {
  const s = setup();
  s.summon.sync(sword, 'sword'); await flush();
  const old = s.runtime.getRoots()[0];
  s.summon.sync(odachi, 'sword'); await flush();
  s.summon.dispose();
  assert.equal(old.parent, null);
});

test('the runtime sweeps pack weapons it no longer holds, but keeps the ones melting away', () => {
  const model = new THREE.Group();
  const hand = new THREE.Bone();
  hand.name = 'mixamorigRightHand';
  model.add(hand);
  const runtime = createPlayerWeaponRuntime({ model, scene: new THREE.Scene(), manifest: { weapons: [], rigs: {} } });
  const stray = blade('WeaponPack_fantasy_sword');
  const melting = blade('WeaponPack_odachi');
  const ownPart = new THREE.Group(); ownPart.name = 'WeaponBowString';
  hand.add(stray, melting, ownPart);
  assert.equal(runtime.sweepStrays([melting]), 1);
  assert.equal(stray.parent, null);
  assert.equal(melting.parent, hand);
  assert.equal(ownPart.parent, hand, 'only pack roots are swept');
  runtime.dispose();
});
