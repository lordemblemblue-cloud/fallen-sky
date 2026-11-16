// Other players see the 3-hit weapon combos: RemotePlayersManager plays the swing a remote's `anim` names
// (swordCombo1..3 / bowCombo1..3), baked once on the remote avatar from its rest pose, with a stand-in weapon
// of that family (weapons/remoteWeaponCombos.js). Driven through the real manager with synthetic packets
// shaped like MultiplayerSystem's: live webrtcMovementUpdate packets and the merged multiplayerPlayersUpdate.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { bakeWeaponComboClips, captureRestPose } from '../src/components/game3d/weapons/weaponComboClips.js';
import { bakeRemoteComboClips, remoteComboKind, REMOTE_COMBO_STAND_INS } from '../src/components/game3d/weapons/remoteWeaponCombos.js';

globalThis.self ??= globalThis;
const DEG = 180 / Math.PI;
const manifest = JSON.parse(readFileSync('public/game3d/weapons/manifest.json', 'utf8'));
const RIGS = {
  'fused-female-v1': 'public/models/characters/fused/Female_Fused_v2.glb',
  'fused-male-v1': 'public/models/characters/fused/Male_Fused_v2.glb',
};

// The real manager; the archer FBX loader is never called (assets come through options.loadAssets).
const bundled = await build({
  entryPoints: ['src/components/game3d/RemotePlayersManager.jsx'],
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'remote-players-fixtures', setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: import.meta.resolve('three'), external: true }));
    b.onResolve({ filter: /^three\/examples\/jsm\// }, (args) => ({
      path: import.meta.resolve(args.path.endsWith('.js') ? args.path : `${args.path}.js`), external: true }));
    b.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const useEffect=()=>{};export const useRef=()=>({});', loader: 'js' }));
  } }],
});
const { createRemotePlayersManager } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

const previousWindow = globalThis.window;
after(() => { globalThis.window = previousWindow; });

// Freshly loaded, never posed: exactly what the manager receives from its loader.
async function loadBody(rigId) {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'NO_IMAGE_DECODE', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  const bytes = readFileSync(RIGS[rigId]);
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  gltf.scene.userData.rigId = rigId;
  const clip = (name) => gltf.animations.find((c) => c.name === name);
  return { model: gltf.scene, idleClip: clip('Idle'), runClip: clip('Run') };
}

// FBXLoader gives each skinned mesh its own copy of every bone, nested (identity local transform) under the
// bone getObjectByName finds; the archer the remote players use has four meshes. Rebuild that on a fused
// body: a first mesh whose skeleton is all duplicates, so "the body skin's skeleton" misses the real bones.
function fbxStyleDuplicates(model) {
  let body = null;
  model.traverse((n) => { if (!body && n.isSkinnedMesh) body = n; });
  const dupes = body.skeleton.bones.map((bone) => {
    const dupe = new THREE.Bone();
    dupe.name = bone.name;
    bone.children.unshift(dupe); // FBXLoader adds the duplicate before the bone's own children
    dupe.parent = bone;
    return dupe;
  });
  const point = new THREE.BufferGeometry();
  point.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.6, 0.1], 3));
  point.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4));
  point.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
  const eyes = new THREE.SkinnedMesh(point, new THREE.MeshBasicMaterial());
  eyes.name = 'Duplicate_Skeleton_Mesh';
  model.add(eyes);
  model.children.unshift(model.children.pop());
  model.updateMatrixWorld(true);
  eyes.bind(new THREE.Skeleton(dupes));
  return { body, eyes };
}

const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); await new Promise((r) => setImmediate(r)); };
function setup(assets, options = {}) {
  globalThis.window = Object.assign(new EventTarget(), { location: { search: '' } });
  const scene = new THREE.Scene();
  const manager = createRemotePlayersManager(scene, { loadAssets: async () => assets, comboWeapons: false, ...options });
  const merged = new Map(); // MultiplayerSystem's otherPlayersMap
  const presence = () => window.dispatchEvent(new CustomEvent('multiplayerPlayersUpdate', { detail: { players: [...merged.values()] } }));
  // a live data-channel packet, then MultiplayerSystem's merged echo of it
  const live = (id, anim, lastUpdate, extra = {}) => {
    const p = { player_id: id, x: 0, y: 0.001, z: 0, yaw: 0, anim, last_update: lastUpdate, ...extra };
    window.dispatchEvent(new CustomEvent('webrtcMovementUpdate', { detail: p }));
    merged.set(id, { ...merged.get(id), ...p });
    presence();
  };
  // a PlayerState subscription event: a row written earlier, merged over the live state
  const row = (id, anim, lastUpdate) => {
    merged.set(id, { player_id: id, x: 0, y: 0.001, z: 0, yaw: 0, ...merged.get(id), anim, last_update: lastUpdate });
    presence();
  };
  const step = (seconds) => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) manager.update(1 / 60); };
  return { scene, manager, live, row, step, remote: (id) => manager.getRemotes().get(id) };
}
const weight = (action) => action?.getEffectiveWeight() ?? 0;
const sampleTrack = (clip, name, time) => {
  const track = clip.tracks.find((t) => t.name === name);
  return new THREE.Quaternion().fromArray(track.createInterpolant(new Float32Array(4)).evaluate(time));
};

for (const rigId of Object.keys(RIGS)) {
  test(`${rigId} remotes: the swing their anim names plays, baked once from the rest pose, facing their own way`, async () => {
    const assets = await loadBody(rigId);
    const rest = captureRestPose(assets.model);
    const net = setup(assets);
    net.live('a', 'idle', 1000, { yaw: 0.6, x: -1 });
    net.live('b', 'idle', 1000, { x: 1 });
    await flush();
    const a = net.remote('a');
    const b = net.remote('b');
    assert.ok(a && b, 'both remotes spawned');
    assert.deepEqual(Object.keys(a.comboClips), ['swordCombo1', 'swordCombo2', 'swordCombo3', 'bowCombo1', 'bowCombo2', 'bowCombo3']);
    assert.equal(a.comboClips, b.comboClips, 'one bake shared by every remote');
    // (the manager is a bundled copy: its own memo) the module keeps one bake per loaded model
    const once = bakeRemoteComboClips(assets.model);
    assert.equal(bakeRemoteComboClips(assets.model), once, 'kept per loaded model');
    assert.deepEqual(Object.keys(once), Object.keys(a.comboClips));
    for (const [bone, v] of rest) {
      const same = (p, q) => p.toArray().every((x, i) => Math.abs(x - q.toArray()[i]) < 1e-12);
      assert.ok(same(bone.quaternion, v.quaternion) && same(bone.position, v.position), `${bone.name} left at rest by the bake`);
    }
    // Solved from the rest pose: the body tracks match a bake from the rest captured at load. (On these bodies
    // the inverse bind matrices face -X; the facing and hips-height checks below would catch a bind solve.)
    const direct = bakeWeaponComboClips(assets.model, 'sword', {}, { rest });
    for (const name of ['mixamorigHips.quaternion', 'mixamorigHips.position', 'mixamorigSpine1.quaternion', 'mixamorigLeftUpLeg.quaternion']) {
      const mine = a.comboClips.swordCombo1.tracks.find((t) => t.name === name).values;
      const theirs = direct.swordCombo1.tracks.find((t) => t.name === name).values;
      assert.ok(mine.length === theirs.length && mine.every((v, i) => Math.abs(v - theirs[i]) < 1e-6), `${name}: solved from the rest captured at load`);
    }

    net.step(0.1);
    a.group.updateMatrixWorld(true);
    const restHipsY = a.group.getObjectByName('mixamorigHips').getWorldPosition(new THREE.Vector3()).y;
    net.live('a', 'swordCombo1', 1100);
    net.step(0.2);
    assert.equal(a.current, 'swordCombo1');
    assert.equal(b.current, 'idle', 'only the remote that swings');
    assert.equal(weight(a.comboAction), 1, 'faded in');
    assert.equal(weight(a.idleAction), 0, 'idle faded out');
    const fore = a.group.getObjectByName('mixamorigRightForeArm');
    const expected = sampleTrack(a.comboClips.swordCombo1, `${fore.name}.quaternion`, a.comboAction.time);
    assert.ok(fore.quaternion.angleTo(expected) * DEG < 0.01, 'the remote\'s own bones follow the baked clip');
    // through the whole swing the hips face the remote's yaw and stay at standing height
    const forward = new THREE.Vector3(Math.sin(0.6), 0, Math.cos(0.6));
    let worst = 1;
    for (let i = 0; i < 26; i++) {
      net.step(1 / 60);
      a.group.updateMatrixWorld(true);
      const l = a.group.getObjectByName('mixamorigLeftUpLeg').getWorldPosition(new THREE.Vector3());
      const r = a.group.getObjectByName('mixamorigRightUpLeg').getWorldPosition(new THREE.Vector3());
      const facing = new THREE.Vector3().crossVectors(l.sub(r), new THREE.Vector3(0, 1, 0)).setY(0).normalize();
      worst = Math.min(worst, facing.dot(forward));
      const hipsY = a.group.getObjectByName('mixamorigHips').getWorldPosition(new THREE.Vector3()).y;
      assert.ok(hipsY > restHipsY * 0.75, `hips at ${hipsY.toFixed(2)} m (idle ${restHipsY.toFixed(2)})`);
    }
    assert.ok(worst > Math.cos(50 / DEG), `hips stay facing the remote's yaw (worst ${(Math.acos(worst) * DEG).toFixed(0)} deg off)`);
    net.manager.dispose();
  });
}

test('chained hits switch at once; late packets and presence echoes never restart or cut a swing', async () => {
  const net = setup(await loadBody('fused-female-v1'));
  net.live('a', 'idle', 1000);
  await flush();
  const a = net.remote('a');
  net.live('a', 'swordCombo1', 1100);
  net.step(0.4);
  net.live('a', 'swordCombo2', 1500); // the sender's buffered press at the cancel point
  assert.equal(a.current, 'swordCombo2');
  net.step(0.1);
  const first = a.comboAction;
  const time = first.time;
  net.live('a', 'swordCombo1', 1300); // sent earlier, arrived late (the data channel is unordered)
  assert.equal(a.current, 'swordCombo2', 'a late packet does not restart the first hit');
  net.row('a', 'idle', 900); // a PlayerState row from before the chain
  assert.equal(a.current, 'swordCombo2', 'a stale row does not cut the swing');
  net.row('a', 'swordCombo3', 1450);
  assert.equal(a.current, 'swordCombo2', 'the presence list never starts a swing');
  assert.equal(a.comboAction, first);
  assert.equal(first.time, time, 'still the same swing, not restarted');
  net.step(0.7);
  assert.equal(a.current, 'swordCombo2', 'the next state is late: the swing holds its last (ready) pose');
  assert.equal(first.paused, true);
  assert.equal(weight(first), 1);
  net.row('a', 'idle', 2100);
  assert.equal(a.current, 'idle', 'a finished swing gives way to the presence list too');
  net.step(0.25);
  assert.equal(weight(first), 0, 'faded back to idle');
  assert.equal(weight(a.idleAction), 1);
  net.live('a', 'swordCombo3', 2200);
  assert.equal(a.current, 'swordCombo3');
  net.live('a', 'run', 2300); // moving cuts the recovery on the sender: the remote follows at once
  assert.equal(a.current, 'run');
  net.step(0.25);
  assert.equal(weight(a.runAction), 1);
  net.live('a', 'idle', 2300 - 1000); // late, inside the reorder window: dropped, and so is its presence echo
  assert.equal(a.current, 'run');
  net.live('a', 'idle', 2300 - 5000); // far older: the sender's clock was set back, not a reordered packet
  assert.equal(a.current, 'idle', 'accepted rather than freezing the avatar');
  net.live('a', 'walk', 2300 - 4900);
  assert.equal(a.current, 'run', 'and the packets after it play on (walk plays the run clip, as before)');
  net.manager.dispose();
});

test('presence rows the ordering cannot place never start or cut a swing', async () => {
  const net = setup(await loadBody('fused-female-v1'));
  net.row('a', 'idle', 500); // spawned from the presence list (PlayerState rows), no live packet yet
  await flush();
  const a = net.remote('a');
  net.row('a', 'swordCombo2', 600); // the last keepalive caught the player mid-swing
  assert.equal(a.current, 'idle', 'no phantom swing from a stored row');
  net.live('a', 'swordCombo1', 10000);
  net.step(0.1);
  net.row('a', 'idle', 0); // another writer reset the row (last_update 0): far outside the reorder window
  assert.equal(a.current, 'swordCombo1', 'does not cut the swing');
  net.step(0.6);
  net.row('a', 'idle', 0);
  assert.equal(a.current, 'idle', 'once the swing has played out, the row applies as before');
  net.manager.dispose();
});

test('a bow combo shows a stand-in bow in the left hand: nocked while drawing, one arrow per release, put away after the chain', async () => {
  const loads = [];
  const loader = { loadAsync: async (url) => { loads.push(url); const scene = new THREE.Group(); scene.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 1, 0.02))); return { scene }; } };
  const net = setup(await loadBody('fused-female-v1'), { comboWeapons: { manifest, loader } });
  net.live('a', 'idle', 1000);
  net.live('b', 'idle', 1000, { x: 2 });
  await flush();
  const a = net.remote('a');
  assert.equal(a.comboWeapon.getWeapon(), null, 'nothing in hand before a swing');
  net.live('a', 'bowCombo1', 1100);
  await flush();
  assert.equal(a.comboWeapon.getWeapon()?.id, REMOTE_COMBO_STAND_INS.bowCombo);
  assert.deepEqual(loads, [getUrl('fantasy_bow')]);
  const root = a.group.getObjectByName('WeaponPack_fantasy_bow');
  assert.equal(root?.parent, a.group.getObjectByName('mixamorigLeftHand'), 'in this remote\'s own left hand');
  assert.equal(net.remote('b').group.getObjectByName('WeaponPack_fantasy_bow'), undefined, 'not in the other remote\'s');
  const combat = manifest.weapons.find((w) => w.id === 'fantasy_bow').grips['fused-female-v1'].combat.quaternion;
  net.step(1 / 60);
  assert.ok(root.quaternion.clone().normalize().angleTo(new THREE.Quaternion().fromArray(combat).normalize()) < 1e-3, 'formed straight into the combat grip');
  const flying = () => net.scene.children.filter((n) => n.name === 'WeaponPackArrow');
  const nocked = () => root.children.find((n) => n.name === 'WeaponPackArrow');
  net.step(0.15);
  assert.equal(nocked()?.visible, true, 'an arrow on the string while drawing');
  assert.equal(flying().length, 0);
  net.step(0.2); // past the release at 0.31 s
  assert.equal(flying().length, 1, 'one arrow loosed at the release');
  assert.equal(nocked()?.visible, false);
  net.live('a', 'bowCombo2', 1500);
  net.step(0.3);
  assert.equal(flying().length, 2, 'the second release looses a second arrow');
  assert.equal(a.comboWeapon.getWeapon()?.id, 'fantasy_bow', 'the same bow through the chain');
  a.group.visible = false; // legacy remotes switched off (LegacyRemotesVisibilityToggle)
  net.live('a', 'bowCombo3', 1800);
  net.step(0.65);
  assert.equal(flying().length, 2, 'a hidden avatar looses no arrow');
  a.group.visible = true;
  net.live('a', 'idle', 1900);
  net.step(1.0);
  assert.equal(a.comboWeapon.getWeapon()?.id, 'fantasy_bow', 'kept for a moment after the chain');
  net.step(0.3);
  assert.equal(a.comboWeapon.getWeapon(), null, 'put away');
  assert.equal(a.group.getObjectByName('WeaponPack_fantasy_bow'), undefined);
  net.manager.dispose();
  assert.equal(net.scene.children.filter((n) => n.name === 'WeaponPackArrow').length, 0, 'arrows go with the remote');
});

function getUrl(id) { return manifest.weapons.find((w) => w.id === id).url; }

test('a sword combo shows the stand-in sword in the right hand; without stand-ins the swing still plays', async () => {
  const loader = { loadAsync: async () => ({ scene: new THREE.Group() }) };
  const withWeapons = setup(await loadBody('fused-male-v1'), { comboWeapons: { manifest, loader } });
  withWeapons.live('a', 'idle', 1000);
  await flush();
  withWeapons.live('a', 'swordCombo2', 1100);
  await flush();
  const a = withWeapons.remote('a');
  assert.equal(a.comboWeapon.getWeapon()?.id, REMOTE_COMBO_STAND_INS.swordCombo);
  assert.equal(a.group.getObjectByName('WeaponPack_fantasy_sword')?.parent, a.group.getObjectByName('mixamorigRightHand'));
  withWeapons.manager.dispose();

  const bare = setup(await loadBody('fused-male-v1'), { comboWeapons: false });
  bare.live('a', 'idle', 1000);
  await flush();
  bare.live('a', 'swordCombo2', 1100);
  bare.step(0.1);
  assert.equal(bare.remote('a').comboWeapon, null);
  assert.equal(bare.remote('a').current, 'swordCombo2');
  bare.manager.dispose();
});

test('the archer FBX layout (a duplicate bone per skinned mesh) bakes and swings', async () => {
  const assets = await loadBody('fused-female-v1');
  const { eyes } = fbxStyleDuplicates(assets.model);
  const hips = assets.model.getObjectByName('mixamorigHips');
  assert.ok(!eyes.skeleton.bones.includes(hips), 'the first skin does not hold the bones found by name');
  const rest = captureRestPose(assets.model);
  assert.ok(rest.has(hips) && rest.has(eyes.skeleton.bones[0]), 'every bone, duplicates included');
  const net = setup(assets);
  net.live('a', 'idle', 1000);
  await flush();
  const a = net.remote('a');
  assert.equal(Object.keys(a.comboClips).length, 6);
  net.live('a', 'bowCombo3', 1100);
  net.step(0.3);
  assert.equal(a.current, 'bowCombo3');
  const fore = a.group.getObjectByName('mixamorigLeftForeArm');
  assert.ok(fore.quaternion.angleTo(sampleTrack(a.comboClips.bowCombo3, `${fore.name}.quaternion`, a.comboAction.time)) * DEG < 0.01);
  net.manager.dispose();
});

test('an avatar without the arm bones keeps the plain idle / run switch', async () => {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.7, 0.3));
  body.name = 'body';
  root.add(body);
  const clip = (name, x) => new THREE.AnimationClip(name, 1, [new THREE.NumberKeyframeTrack('body.position[x]', [0, 1], [x, x])]);
  const net = setup({ model: root, idleClip: clip('idle', 0), runClip: clip('run', 2) }, { comboWeapons: {} });
  net.live('a', 'idle', 1000);
  await flush();
  const a = net.remote('a');
  assert.deepEqual(Object.keys(a.comboClips), []);
  assert.equal(a.comboWeapon, null);
  net.live('a', 'swordCombo1', 1100);
  assert.equal(a.current, 'idle', 'no clip for it: idle, as before');
  net.live('a', 'walk', 1200);
  net.step(0.3);
  assert.equal(a.current, 'run');
  assert.ok(Math.abs(a.group.getObjectByName('body').position.x - 2) < 1e-6);
  net.manager.dispose();
});

test('combo states map to their family; the wiring this relies on is in place', () => {
  assert.equal(remoteComboKind('swordCombo3'), 'swordCombo');
  assert.equal(remoteComboKind('bowCombo1'), 'bowCombo');
  for (const s of ['idle', 'run', 'kick', 'attack', undefined]) assert.equal(remoteComboKind(s), null);
  assert.deepEqual(REMOTE_COMBO_STAND_INS, { swordCombo: 'fantasy_sword', bowCombo: 'fantasy_bow' });
  for (const id of Object.values(REMOTE_COMBO_STAND_INS)) assert.ok(getUrl(id), `${id} is in the weapon pack`);
  // the sender puts the controller state (swordCombo1..3 / bowCombo1..3 during a swing) in `anim`...
  const world = readFileSync('src/components/game3d/GameWorld3D.jsx', 'utf8');
  assert.match(world, /anim: mounted \? companionCurrentAnimRef\.current\s*: playerAnim\?\.getCurrent\?\.\(\)/);
  assert.match(world, /remoteManagerRef\.current = createRemotePlayersManager\(scene\);/);
  // ...MultiplayerSystem sends it with the sender's timestamp, and the data channel hands it to the manager
  const mp = readFileSync('src/components/game/MultiplayerSystem.jsx', 'utf8');
  assert.match(mp, /x: s\.x, y: s\.y, z: s\.z, yaw: s\.yaw, anim: s\.anim,\s*last_update: Date\.now\(\),/);
  const rtc = readFileSync('src/components/shared/useWebRTCVoice.jsx', 'utf8');
  assert.match(rtc, /new CustomEvent\('webrtcMovementUpdate', \{\s*detail: \{ \.\.\.data\.payload, player_id: peerId \}/);
});
