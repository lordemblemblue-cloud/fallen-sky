// 3-hit sword and bow combos (weapons/weaponComboClips.js): baked on the real fused bodies with the weapon
// pack's own combat grips, chained by the real player controller, wired into GameWorld3D.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  bakeWeaponComboClips, captureRestPose, comboKindForWeapon, WEAPON_COMBO_STATES, WEAPON_COMBO_STATE_NAMES,
} from '../src/components/game3d/weapons/weaponComboClips.js';
import { createWeaponComboBinder } from '../src/components/game3d/weapons/weaponComboBinder.js';
import { COMBAT_STATES } from '../src/components/game3d/weapons/playerWeaponRuntime.js';

globalThis.self ??= globalThis;
const DEG = 180 / Math.PI;
const manifest = JSON.parse(readFileSync('public/game3d/weapons/manifest.json', 'utf8'));
const RIGS = {
  'fused-female-v1': 'public/models/characters/fused/Female_Fused_v2.glb',
  'fused-male-v1': 'public/models/characters/fused/Male_Fused_v2.glb',
};

async function loadBody(rigId) {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'NO_IMAGE_DECODE', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  const bytes = readFileSync(RIGS[rigId]);
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const model = gltf.scene;
  model.userData.rigId = rigId;
  // loadAvatarModel's normalisation: 1.7 m tall, feet on the ground, facing +Z
  const box = new THREE.Box3();
  model.updateMatrixWorld(true);
  model.traverse((n) => { if (n.isSkinnedMesh) box.expandByObject(n); });
  model.scale.multiplyScalar(1.7 / (box.max.y - box.min.y));
  model.updateMatrixWorld(true);
  return model;
}

const gripOf = (weaponId, rigId) => {
  const w = manifest.weapons.find((x) => x.id === weaponId);
  return { weapon: w, q: new THREE.Quaternion().fromArray(w.grips[rigId].combat.quaternion), grip: w.grips[rigId].combat };
};
const bone = (model, name) => model.getObjectByName(name);
// The held weapon's frame (+Y blade / upper limb, +Z edge / arrow) as a child of the hand, like the runtime.
function holdWeapon(model, weaponId, rigId) {
  const { weapon, grip } = gripOf(weaponId, rigId);
  const root = new THREE.Object3D();
  root.position.fromArray(grip.position);
  root.quaternion.fromArray(grip.quaternion);
  root.scale.setScalar(grip.scale);
  const tip = new THREE.Object3D();
  tip.position.fromArray(weapon.points?.tip || [0, weapon.length * 0.9, 0]);
  root.add(tip);
  bone(model, weapon.hand === 'left' ? 'mixamorigLeftHand' : 'mixamorigRightHand').add(root);
  return { root, tip, release: () => root.removeFromParent() };
}
const wristBend = (model, side) => {
  const S = side === 'left' ? 'Left' : 'Right';
  const fore = bone(model, `mixamorig${S}ForeArm`).getWorldPosition(new THREE.Vector3());
  const hand = bone(model, `mixamorig${S}Hand`).getWorldPosition(new THREE.Vector3());
  const knuckle = bone(model, `mixamorig${S}HandMiddle1`).getWorldPosition(new THREE.Vector3());
  return hand.clone().sub(fore).normalize().angleTo(knuckle.sub(hand).normalize()) * DEG;
};
function sample(model, clip, fn, rate = 120) {
  const mixer = new THREE.AnimationMixer(model);
  const action = mixer.clipAction(clip);
  const steps = Math.ceil(clip.duration * rate);
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = Math.min(clip.duration - 1e-4, (clip.duration * i) / steps);
    mixer.stopAllAction(); action.reset().play(); mixer.setTime(t);
    model.updateMatrixWorld(true);
    out.push(fn(t));
  }
  mixer.stopAllAction(); mixer.uncacheRoot(model);
  return out;
}
const JOINTS = ['Hips', 'Spine1', 'RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftUpLeg', 'RightUpLeg'];

const bodies = {};
test.before(async () => {
  for (const id of Object.keys(RIGS)) bodies[id] = await loadBody(id);
});

for (const rigId of Object.keys(RIGS)) {
  for (const [weaponId, kind] of [['fantasy_sword', 'swordCombo'], ['odachi', 'swordCombo'], ['fantasy_bow', 'bowCombo']]) {
    test(`${rigId} ${weaponId}: three ${kind} hits, seamless, anatomical and facing forward`, () => {
      const model = bodies[rigId];
      const { weapon, q } = gripOf(weaponId, rigId);
      const rest = captureRestPose(model);
      const clips = bakeWeaponComboClips(model, weapon.class, { [weapon.hand]: q }, { rest, reach: weapon.length });
      assert.deepEqual(Object.keys(clips), [...WEAPON_COMBO_STATES[kind]]);
      // the bake leaves the rig exactly as it found it
      const same = (a, b) => a.toArray().every((x, i) => Math.abs(x - b.toArray()[i]) < 1e-9);
      for (const [b, v] of rest) assert.ok(same(b.quaternion, v.quaternion) && same(b.position, v.position), `${b.name} restored`);
      const held = holdWeapon(model, weaponId, rigId);
      try {
        for (const [index, clip] of Object.values(clips).entries()) {
          const { hit, cancel, sweep, combo } = clip.userData;
          assert.equal(combo, kind);
          assert.equal(clip.userData.index, index);
          assert.ok(hit > 0.1 && hit < cancel && cancel <= clip.duration && clip.duration <= 1, `${clip.name} timing ${hit}/${cancel}/${clip.duration}`);
          if (kind === 'swordCombo') assert.ok(sweep[0] < hit && hit < sweep[1] && sweep[1] <= clip.duration, `${clip.name} sweep around the hit`);
          for (const track of clip.tracks) {
            assert.ok(track.values.every(Number.isFinite), `${track.name} finite`);
            if (track.ValueTypeName === 'quaternion') {
              for (let i = 0; i < track.values.length; i += 4) assert.ok(Math.abs(Math.hypot(...track.values.slice(i, i + 4)) - 1) < 1e-4, `${track.name} unit`);
              // every hit starts and ends in the same ready pose, so the chain flows from one hit to the next
              const n = track.values.length;
              const first = new THREE.Quaternion().fromArray(track.values, 0);
              const last = new THREE.Quaternion().fromArray(track.values, n - 4);
              assert.ok(Math.abs(Math.abs(first.dot(last)) - first.lengthSq()) < 1e-5, `${clip.name} ${track.name} loops to ready`);
            }
          }
          // A wrist cannot twist: the hand's roll about the forearm stays small (the forearm pronates instead).
          // The old solver split it 50/50 and flipped sign between keys, swinging the blade through the floor.
          const wristTwist = (side) => {
            const hand = bone(model, `mixamorig${side}Hand`);
            const d = hand.quaternion.clone().multiply(rest.get(hand).quaternion.clone().invert());
            const axis = hand.position.clone().normalize();
            const tw = 2 * Math.atan2(d.x * axis.x + d.y * axis.y + d.z * axis.z, d.w);
            return Math.abs(Math.atan2(Math.sin(tw), Math.cos(tw))) * DEG;
          };
          const twists = sample(model, clip, () => wristTwist(weapon.hand === 'left' ? 'Left' : 'Right'), 60);
          assert.ok(Math.max(...twists) < 45, `${clip.name}: wrist twists ${Math.max(...twists).toFixed(0)} deg`);
          // continuous: no joint jumps between neighbouring samples
          let prev = null;
          let worst = { deg: 0 };
          const feet = [];
          const frames = sample(model, clip, (t) => {
            const qs = JOINTS.map((j) => bone(model, `mixamorig${j}`).getWorldQuaternion(new THREE.Quaternion()));
            if (prev) qs.forEach((qq, j) => { const d = qq.angleTo(prev[j]) * DEG; if (d > worst.deg) worst = { deg: d, joint: JOINTS[j], t }; });
            prev = qs;
            feet.push(['Left', 'Right'].map((s) => bone(model, `mixamorig${s}Foot`).getWorldPosition(new THREE.Vector3())));
            const l = bone(model, 'mixamorigLeftUpLeg').getWorldPosition(new THREE.Vector3());
            const r = bone(model, 'mixamorigRightUpLeg').getWorldPosition(new THREE.Vector3());
            const facing = new THREE.Vector3().crossVectors(l.sub(r), new THREE.Vector3(0, 1, 0)).setY(0).normalize();
            const wb = wristBend(model, weapon.hand);
            const tip = held.tip.getWorldPosition(new THREE.Vector3());
            const blade = tip.clone().sub(held.root.getWorldPosition(new THREE.Vector3())).normalize();
            const arrow = new THREE.Vector3(0, 0, 1).applyQuaternion(held.root.getWorldQuaternion(new THREE.Quaternion()));
            const head = bone(model, 'mixamorigHead').getWorldPosition(new THREE.Vector3());
            const drawHand = bone(model, 'mixamorigRightHand').getWorldPosition(new THREE.Vector3());
            return { t, facing, wb, tip, blade, arrow, head, drawHand };
          });
          assert.ok(worst.deg < 30, `${clip.name}: ${worst.joint} jumps ${worst.deg.toFixed(1)} deg at ${worst.t?.toFixed(3)} s`);
          // planted feet, body facing the game's forward (+Z) throughout
          for (const s of [0, 1]) {
            const drift = Math.max(...feet.map((f) => f[s].distanceTo(feet[0][s])));
            assert.ok(drift < 0.02, `${clip.name}: foot ${s} slides ${drift.toFixed(3)} m`);
          }
          for (const f of frames) assert.ok(f.facing.z > Math.cos(45 / DEG), `${clip.name} at ${f.t.toFixed(2)}: hips face ${f.facing.toArray().map((x) => x.toFixed(2))}`);
          const maxBend = Math.max(...frames.map((f) => f.wb));
          assert.ok(maxBend < 56, `${clip.name}: weapon wrist bends ${maxBend.toFixed(0)} deg`);
          const at = (time) => frames.reduce((a, b) => (Math.abs(b.t - time) < Math.abs(a.t - time) ? b : a));
          const hitFrame = at(hit);
          if (kind === 'bowCombo') {
            assert.ok(hitFrame.blade.y > Math.cos(25 / DEG), `${clip.name}: bow tilts ${(Math.acos(hitFrame.blade.y) * DEG).toFixed(0)} deg at release`);
            assert.ok(hitFrame.arrow.z > Math.cos(35 / DEG), `${clip.name}: arrow points ${hitFrame.arrow.toArray().map((x) => x.toFixed(2))} at release`);
            const anchor = at(hit - 0.03);
            assert.ok(anchor.drawHand.distanceTo(anchor.head) < 0.32, `${clip.name}: draw hand ${anchor.drawHand.distanceTo(anchor.head).toFixed(2)} m from the head at full draw`);
          } else {
            const low = frames.reduce((a, b) => (b.tip.y < a.tip.y ? b : a));
            assert.ok(low.tip.y > 0.03, `${clip.name}: the ${weaponId} tip digs ${low.tip.y.toFixed(2)} m into the ground at ${low.t.toFixed(2)} s`);
            const [a, b] = sweep.map(at);
            const right = (p) => -p.x; // the character's right is -X when facing +Z
            if (index === 0) assert.ok(right(a.tip) > 0.4 && right(b.tip) < -0.4, `forehand cuts right to left: ${right(a.tip).toFixed(2)} -> ${right(b.tip).toFixed(2)}`);
            if (index === 1) assert.ok(b.tip.y - a.tip.y > 0.8, `backhand rises: ${a.tip.y.toFixed(2)} -> ${b.tip.y.toFixed(2)} m`);
            if (index === 2) assert.ok(a.tip.y > a.head.y && hitFrame.tip.y < 0.9 && hitFrame.tip.z > 0.4, `chop from above the head (${a.tip.y.toFixed(2)}) down in front (${hitFrame.tip.y.toFixed(2)}, ${hitFrame.tip.z.toFixed(2)})`);
          }
        }
      } finally {
        held.release();
      }
    });
  }
}

test('combo kinds, state names and the runtime combat grip agree', () => {
  assert.equal(comboKindForWeapon('bow'), 'bowCombo');
  for (const c of ['sword', 'greatsword', 'dagger', 'blade']) assert.equal(comboKindForWeapon(c), 'swordCombo');
  assert.equal(comboKindForWeapon('staff'), null);
  assert.equal(comboKindForWeapon(undefined), null);
  assert.deepEqual(WEAPON_COMBO_STATE_NAMES, ['swordCombo1', 'swordCombo2', 'swordCombo3', 'bowCombo1', 'bowCombo2', 'bowCombo3']);
  for (const s of WEAPON_COMBO_STATE_NAMES) assert.ok(COMBAT_STATES.has(s), `${s} uses the combat grip`);
});

test('the binder bakes both combos at start and rebakes for the held weapon, never mid-swing', async () => {
  const model = await loadBody('fused-female-v1');
  const applied = [];
  let swinging = null;
  const controller = { setWeaponComboClips: (clips) => { applied.push(Object.keys(clips).join(',')); return true; }, getComboState: () => swinging };
  let held = null;
  const runtime = { getCurrent: () => held, getHands: () => (held ? [{ side: 'left', gripQuaternion: gripOf('fantasy_bow', 'fused-female-v1').q }] : []) };
  const binder = createWeaponComboBinder({ model, controller, runtime });
  assert.deepEqual(applied, ['swordCombo1,swordCombo2,swordCombo3', 'bowCombo1,bowCombo2,bowCombo3']);
  assert.equal(binder.bakedFor('bowCombo'), 'default');
  held = { id: 'fantasy_bow', cls: 'bow' };
  swinging = { state: 'bowCombo1' };
  assert.equal(binder.update(), false, 'not while a swing plays');
  swinging = null;
  assert.equal(binder.update(), true);
  assert.equal(binder.bakedFor('bowCombo'), 'fantasy_bow');
  assert.equal(binder.update(), false, 'once per weapon');
});

// ---- the real player controller with stand-in clips ----
const built = buildSync({
  entryPoints: ['src/components/game3d/player/LunaDashboardPlayerController.jsx'],
  bundle: true, platform: 'node', format: 'cjs', write: false, outdir: 'unused', external: ['three'],
}).outputFiles;
function controller(clock) {
  const runtime = { exports: {} };
  new Function('module', 'exports', 'require', 'performance', built[0].text)(
    runtime, runtime.exports, createRequire(import.meta.url), { now: () => clock.seconds * 1000 },
  );
  const root = new THREE.Group();
  const b = new THREE.Bone();
  b.name = 'Root';
  root.add(b);
  const mixer = new THREE.AnimationMixer(root);
  const ctl = runtime.exports.createLunaDashboardPlayerController({ mixer });
  const clip = (name, d = 1, userData = null) => {
    const c = new THREE.AnimationClip(name, d, [new THREE.QuaternionKeyframeTrack('Root.quaternion', [0, d], [0, 0, 0, 1, 0, 0, 0, 1])]);
    if (userData) c.userData = userData;
    return c;
  };
  ctl.bindClips(Object.fromEntries(['idle', 'walk', 'run', 'kick', 'attack', 'hitReact'].map((k) => [k, clip(k)])));
  const combos = (kind) => Object.fromEntries(WEAPON_COMBO_STATES[kind].map((name, index) => [name, clip(name, 0.6, { combo: kind, index, hit: 0.3, sweep: [0.15, 0.4], cancel: 0.4 })]));
  return { ctl, mixer, clip, combos, exports: runtime.exports };
}
const advance = ({ ctl, mixer }, clock, seconds, movement = { moving: false }) => {
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) {
    clock.seconds += 1 / 60;
    ctl.updateActionState(movement);
    ctl.updateAnimation(1 / 60);
    mixer.update(1 / 60);
    ctl.updateMotion(new THREE.Object3D(), 1 / 60, 0);
    events.push(...ctl.pollComboEvents().map((e) => `${e.type}:${e.state}`));
  }
  return events;
};

test('presses chain 1 -> 2 -> 3 -> 1; a press mid-swing is buffered to the cancel point', () => {
  const clock = { seconds: 0 };
  const c = controller(clock);
  assert.equal(c.ctl.setWeaponComboClips(c.combos('swordCombo')), true);
  assert.equal(c.ctl.requestAttack('swordCombo', { speed: 1 }), true);
  assert.equal(c.ctl.getCurrent(), 'swordCombo1');
  let events = advance(c, clock, 0.2);
  assert.equal(c.ctl.requestAttack('swordCombo'), true, 'accepted');
  assert.equal(c.ctl.getComboState().queued, true, 'buffered, not started');
  assert.equal(c.ctl.getCurrent(), 'swordCombo1');
  events = events.concat(advance(c, clock, 0.25));
  assert.equal(c.ctl.getCurrent(), 'swordCombo2', 'started at the cancel point');
  assert.deepEqual(events.slice(0, 2), ['sweep:swordCombo1', 'hit:swordCombo1'], 'each cue once, in order');
  advance(c, clock, 0.45);
  c.ctl.requestAttack('swordCombo');
  assert.equal(c.ctl.getCurrent(), 'swordCombo3', 'past the cancel point: starts at once');
  advance(c, clock, 0.45);
  c.ctl.requestAttack('swordCombo');
  assert.equal(c.ctl.getCurrent(), 'swordCombo1', 'the chain wraps');
});

test('the chain resets after its grace window; skills pick their step; heavy is the finisher', () => {
  const clock = { seconds: 0 };
  const c = controller(clock);
  c.ctl.setWeaponComboClips(c.combos('bowCombo'));
  c.ctl.requestAttack('bowCombo');
  advance(c, clock, 0.6 + c.exports.WEAPON_COMBO_CHAIN_GRACE_SECONDS - 0.1);
  c.ctl.requestAttack('bowCombo');
  assert.equal(c.ctl.getCurrent(), 'bowCombo2', 'inside the window the chain continues');
  advance(c, clock, 0.6 + c.exports.WEAPON_COMBO_CHAIN_GRACE_SECONDS + 0.2);
  c.ctl.requestAttack('bowCombo');
  assert.equal(c.ctl.getCurrent(), 'bowCombo1', 'after it, the chain starts over');
  advance(c, clock, 1.5);
  c.ctl.requestAttack('bowCombo', { hitIndex: 2, combo: true });
  assert.equal(c.ctl.getCurrent(), 'bowCombo3', 'a skill hit picks its own step');
  advance(c, clock, 1.5);
  c.ctl.requestAttack('bowCombo', { heavy: true });
  assert.equal(c.ctl.getCurrent(), 'bowCombo3', 'heavy = finisher');
});

test('moving cancels only the recovery; combo clips survive montage rebinds; swaps wait for the swing', () => {
  const clock = { seconds: 0 };
  const c = controller(clock);
  c.ctl.setWeaponComboClips(c.combos('swordCombo'));
  c.ctl.requestAttack('swordCombo');
  advance(c, clock, 0.2, { moving: true, running: true });
  assert.equal(c.ctl.getCurrent(), 'swordCombo1', 'the strike is committed');
  assert.equal(c.ctl.setWeaponComboClips(c.combos('swordCombo')), false, 'no clip swap mid-swing');
  advance(c, clock, 0.25, { moving: true, running: true });
  assert.equal(c.ctl.getCurrent(), 'run', 'after the cancel point, moving takes over');
  c.ctl.bindClips(Object.fromEntries(['idle', 'walk', 'run', 'kick'].map((k) => [k, c.clip(k)])));
  assert.ok(WEAPON_COMBO_STATES.swordCombo.every((s) => c.ctl.has(s)), 'combo clips kept across bindClips');
  advance(c, clock, 0.5);
  assert.equal(c.ctl.setWeaponComboClips(c.combos('swordCombo')), true);
});

test('without combo clips the regular attack plays; riding never swings', () => {
  const clock = { seconds: 0 };
  const c = controller(clock);
  assert.equal(c.ctl.requestAttack('swordCombo'), true);
  assert.equal(c.ctl.getCurrent(), 'kick', 'the legacy melee montage');
  assert.equal(c.ctl.getComboState(), null);
  const d = controller({ seconds: 0 });
  d.ctl.setWeaponComboClips(d.combos('swordCombo'));
  d.ctl.setMounted(true);
  assert.equal(d.ctl.requestAttack('swordCombo'), false);
});

test('GameWorld3D: summoned weapons fight with their combo; trails and arrows follow the swing', () => {
  const world = readFileSync('src/components/game3d/GameWorld3D.jsx', 'utf8');
  const summonAt = world.indexOf('weaponSummon = createPlayerWeaponSummon(');
  const binderAt = world.indexOf('weaponCombos = createWeaponComboBinder({ model: fbx, controller: playerAnim, runtime: weaponRuntime');
  assert.ok(summonAt > 0 && binderAt > summonAt && binderAt - summonAt < 600, 'the binder is made with the runtime, at model load (rest pose)');
  assert.match(world, /const weaponComboKind = \(rangedClick = false\) => \{\s*if \(isMountedRef\.current \|\| !weaponSummon\) return null;/);
  assert.equal((world.match(/hitIndex: comboKind && !isSkillStrike \? undefined : pendingSkillStrike\?\.hitIndex \?\? 0,/g) || []).length, 2,
    'PvE and duel basic presses continue the chain');
  const after = world.indexOf('weaponSummon?.update(delta,');
  assert.ok(world.indexOf('playerAnim?.pollComboEvents?.()', after) > after, 'combo cues are read after the summon update (posed hands)');
  assert.match(world, /record: cue\.seconds,/);
  assert.match(world, /weaponRuntime\.fireArrow\(\{ target: comboArrowTarget \}\);/);
  assert.match(world, /drawing: comboSwing\?\.kind === 'bowCombo' \? comboSwing\.time > 0\.04 && comboSwing\.time < comboSwing\.hit : null,/);
});

test('blade trails record for the combo\'s own cut length', async () => {
  const trailsBuilt = buildSync({
    entryPoints: ['src/components/game3d/vfx/CombatWeaponTrails.jsx'],
    bundle: true, platform: 'node', format: 'cjs', write: false, outdir: 'unused', external: ['three'],
  }).outputFiles;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', trailsBuilt[0].text)(mod, mod.exports, createRequire(import.meta.url));
  const scene = new THREE.Scene();
  const trails = mod.exports.createCombatWeaponTrails({ scene });
  const actor = new THREE.Group();
  scene.add(actor);
  const base = new THREE.Object3D();
  const tip = new THREE.Object3D();
  tip.position.y = 0.9;
  actor.add(base, tip);
  trails.emit({ actor, weaponPath: 'melee', blade: { base, tip }, record: 0.4 });
  const ribbon = () => scene.children.find((n) => n.name === 'AXEBladeSweep')?.children[0];
  const drawn = [];
  for (let t = 0; t < 0.5; t += 1 / 60) { actor.rotation.y += 0.05; trails.update(1 / 60); drawn.push(ribbon()?.geometry.drawRange.count ?? -1); }
  assert.ok(drawn[22] > drawn[10], 'still recording past the default 0.2 s');
  assert.ok(ribbon(), 'alive for record + fade');
  for (let t = 0; t < 0.3; t += 1 / 60) trails.update(1 / 60);
  assert.equal(ribbon(), undefined, 'released after record + 0.16 s');
  trails.dispose();
});
