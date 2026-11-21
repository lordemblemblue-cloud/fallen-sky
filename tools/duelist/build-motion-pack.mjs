// Builds Duelist Adventure's motion pack from the owner's clip pack (ActionForge, 80 clips on the fused
// female rig, 2026-11-18):
//   node tools/duelist/build-motion-pack.mjs <source.glb> [--keep-source] [--class-clips=<blender export.glb>]
// Writes
//   public/models/animations/duelist/duelist-motion.glb   skeleton + the clips the game uses, in place
//   src/components/duelist/core/motionPack.data.mjs     durations, strike timings, travel, natural speeds
// and with --keep-source also tools/duelist/source/actionforge-80.anim.glb: every clip with the meshes and
// textures stripped (the source of truth for later rebuilds; pass it back in as <source.glb>).
//
// In place: a looping clip that travels (walk, jog, sprint...) loses its average velocity but keeps its sway;
// a one-shot that travels (lunges, dashes, knockback) is pinned where it starts. What was removed is
// recorded (natural speed, travel curve) so the game can move the body to match.
/* global process, console, URL, TextDecoder, TextEncoder, Buffer */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

globalThis.self ??= globalThis;
const THREE = await import('three');
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const OUT_GLB = resolve(ROOT, 'public/models/animations/duelist/duelist-motion.glb');
const OUT_DATA = resolve(ROOT, 'src/components/duelist/core/motionPack.data.mjs');
const OUT_SOURCE = resolve(ROOT, 'tools/duelist/source/actionforge-80.anim.glb');
const BODY_HEIGHT = 1.7; // metres: the game scales every body to this (mesh bounds)

// game key -> source clip. Loops are named *_loop_* in the source (plus the sword idle).
const SELECTION = {
  // sword
  swordIdle: 'sword_idle_fit', swordA: 'sword_regular_a_fit', swordARec: 'sword_regular_a_rec_fit',
  swordB: 'sword_regular_b_fit', swordBRec: 'sword_regular_b_rec_fit', swordC: 'sword_regular_c_fit',
  swordCombo: 'sword_regular_combo_fit', swordHeavy: 'sword_attack_fit', swordHeavyCombo: 'sword_heavy_combo_fit',
  swordDash: 'sword_dash_fit', swordBlock: 'sword_block_fit',
  // being hit
  hitChest: 'hit_chest_fit', hitHead: 'hit_head_fit', knockback: 'hit_knockback_fit', getUp: 'laytoidle_fit',
  death: 'death01_fit', guardBreak: 'idle_shield_break_fit',
  // Telekinesis and the Veil
  castEnter: 'spell_simple_enter_fit', castHold: 'spell_simple_idle_loop_fit', castShoot: 'spell_simple_shoot_fit',
  castExit: 'spell_simple_exit_fit', throw: 'overhandthrow_fit', shieldBurst: 'shield_oneshot_fit',
  shieldIdle: 'idle_shield_loop_fit', shieldDash: 'shield_dash_fit',
  // unarmed
  punchJab: 'punch_jab_fit', punchCross: 'punch_cross_fit', hook: 'melee_hook_fit', hookRec: 'melee_hook_rec_fit',
  // moving
  idle: 'idle_loop_fit', walk: 'walk_loop_fit', jog: 'jog_fwd_loop_fit', sprint: 'sprint_loop_fit',
  crouchIdle: 'crouch_idle_loop_fit', crouchWalk: 'crouch_fwd_loop_fit', jumpStart: 'jump_start_fit',
  jumpLoop: 'jump_loop_fit', jumpLand: 'jump_land_fit', leapStart: 'ninjajump_start_fit', leapLoop: 'ninjajump_idle_loop_fit',
  leapLand: 'ninjajump_land_fit', slideStart: 'slide_start_fit', slideLoop: 'slide_loop_fit', slideExit: 'slide_exit_fit',
  climbUp: 'climbup_1m_fit',
  // the story mission: people, objectives and the smugglers' guns
  talk: 'idle_talking_loop_fit', foldArms: 'idle_foldarms_loop_fit', phone: 'idle_talkingphone_loop_fit',
  yes: 'yes_fit', no: 'idle_no_loop_fit', interact: 'interact_fit', chestOpen: 'chest_open_fit',
  pickup: 'pickup_table_fit', hack: 'fixing_kneeling_fit', consume: 'consume_fit',
  pistolIdle: 'pistol_idle_loop_fit', pistolShoot: 'pistol_shoot_fit', pistolReload: 'pistol_reload_fit',
};
const LOOPS = new Set(['swordIdle']);
const isLoop = (key, source) => LOOPS.has(key) || /_loop_/.test(source);
// strikes whose hand speed marks the contact
const STRIKES = new Set(['swordA', 'swordB', 'swordC', 'swordCombo', 'swordHeavy', 'swordHeavyCombo', 'swordDash', 'castShoot',
  'throw', 'shieldBurst', 'punchJab', 'punchCross', 'hook', 'pistolShoot']);

const args = process.argv.slice(2);
const sourcePath = args.find((a) => !a.startsWith('--'));
if (!sourcePath) { console.error('usage: node tools/duelist/build-motion-pack.mjs <source.glb> [--keep-source]'); process.exit(1); }

const loader = new GLTFLoader();
loader.register(() => ({ name: 'NO_IMAGE_DECODE', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
const bytes = readFileSync(sourcePath);
const raw = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + bytes.readUInt32LE(12))));
const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const scene = gltf.scene;
scene.updateMatrixWorld(true);

// metres per source unit: from the meshes when present, else from a previous build's record
let unit = raw.asset?.extras?.duelistUnit;
const meshBox = new THREE.Box3();
scene.traverse((n) => { if (n.isSkinnedMesh) meshBox.expandByObject(n); });
if (!meshBox.isEmpty()) unit = BODY_HEIGHT / (meshBox.max.y - meshBox.min.y);
if (!unit) throw new Error('no meshes and no recorded unit: cannot tell the scale');
const bone = (name) => scene.getObjectByName(`mixamorig${name}`);
const hips = bone('Hips');
const legLength = bone('LeftLeg').position.length() + bone('LeftFoot').position.length(); // thigh + shin

// ---------- analysis: hand speed peaks (contacts), on the untouched clip ----------
function analyse(clip) {
  const mixer = new THREE.AnimationMixer(scene);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1); // sampled up to the last frame without wrapping to the first
  action.clampWhenFinished = true;
  action.play();
  const rate = 120;
  const n = Math.max(2, Math.round(clip.duration * rate));
  const hands = { right: bone('RightHand'), left: bone('LeftHand') };
  const prev = {};
  const speeds = { right: [], left: [] };
  for (let i = 0; i <= n; i++) {
    const t = Math.min(clip.duration - 1e-4, (i / n) * clip.duration);
    mixer.setTime(t);
    scene.updateMatrixWorld(true);
    for (const side of ['right', 'left']) {
      // relative to the hips, so a lunge's travel does not count as a swing
      const p = hands[side].getWorldPosition(new THREE.Vector3()).sub(hips.getWorldPosition(new THREE.Vector3())).multiplyScalar(unit);
      speeds[side].push(prev[side] ? p.distanceTo(prev[side]) * (n / clip.duration) : 0);
      prev[side] = p;
    }
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(scene);
  const peaks = [];
  for (const side of ['right', 'left']) {
    const s = speeds[side];
    const max = Math.max(...s);
    for (let i = 2; i < s.length - 2; i++) {
      if (s[i] >= max * 0.55 && s[i] >= s[i - 1] && s[i] >= s[i + 1] && s[i] >= s[i - 2] && s[i] >= s[i + 2]) {
        const t = (i / n) * clip.duration;
        const near = peaks.find((p) => p.hand === side && Math.abs(p.t - t) < 0.12);
        if (near) { if (s[i] > near.speed) { near.t = t; near.speed = s[i]; } } else peaks.push({ hand: side, t, speed: s[i] });
      }
    }
  }
  peaks.sort((a, b) => a.t - b.t);
  return peaks.map((p) => ({ hand: p.hand, t: +p.t.toFixed(3), speed: +p.speed.toFixed(2) }));
}

// ---------- in place ----------
const restLocal = new Map();
scene.traverse((n) => restLocal.set(n.name, { p: n.position.clone(), q: n.quaternion.clone(), s: n.scale.clone() }));

function processClip(key, clip, loop) {
  const tracks = [];
  let travel = null;
  let naturalSpeed = null;
  for (const track of clip.tracks) {
    const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
    const node = scene.getObjectByName(nodeName);
    if (!node) continue;
    let values = Float32Array.from(track.values);
    const times = Float32Array.from(track.times);
    const size = values.length / times.length;
    if (node === hips && propertyName === 'position') {
      const k = times.length;
      const x0 = values[0], z0 = values[2];
      const dx = values[(k - 1) * 3] - x0, dz = values[(k - 1) * 3 + 2] - z0;
      let excursion = 0;
      for (let i = 0; i < k; i++) excursion = Math.max(excursion, Math.hypot(values[i * 3] - x0, values[i * 3 + 2] - z0));
      if (loop && Math.hypot(dx, dz) * unit > 0.05) {
        // keep the sway, lose the average velocity
        naturalSpeed = +((Math.hypot(dx, dz) * unit) / clip.duration).toFixed(3);
        for (let i = 0; i < k; i++) {
          const f = clip.duration > 0 ? times[i] / clip.duration : 0;
          values[i * 3] -= dx * f;
          values[i * 3 + 2] -= dz * f;
        }
      } else if (!loop && excursion * unit > 0.12) {
        // pinned where it starts; the curve says where the body went (forward = armature +X, right = +Z)
        const samples = 24;
        const forward = [];
        const right = [];
        for (let s = 0; s <= samples; s++) {
          const t = (s / samples) * clip.duration;
          let i = 0;
          while (i < k - 2 && times[i + 1] < t) i++;
          const span = Math.max(1e-6, times[i + 1] - times[i]);
          const u = Math.min(1, Math.max(0, (t - times[i]) / span));
          forward.push(+(((values[i * 3] + (values[(i + 1) * 3] - values[i * 3]) * u) - x0) * unit).toFixed(3));
          right.push(+(((values[i * 3 + 2] + (values[(i + 1) * 3 + 2] - values[i * 3 + 2]) * u) - z0) * unit).toFixed(3));
        }
        travel = { forward, right, distance: +(Math.hypot(dx, dz) * unit).toFixed(3) };
        for (let i = 0; i < k; i++) { values[i * 3] = x0; values[i * 3 + 2] = z0; }
      }
    }
    // drop tracks that never leave the rest pose
    const rest = restLocal.get(node.name);
    const restValue = propertyName === 'quaternion' ? rest.q.toArray() : propertyName === 'position' ? rest.p.toArray() : rest.s.toArray();
    let still = true;
    for (let i = 0; i < times.length && still; i++) {
      if (propertyName === 'quaternion') {
        const dot = values[i * 4] * restValue[0] + values[i * 4 + 1] * restValue[1] + values[i * 4 + 2] * restValue[2] + values[i * 4 + 3] * restValue[3];
        if (Math.abs(dot) < 1 - 1e-7) still = false; // more than ~0.05 degrees from rest
      } else {
        for (let c = 0; c < size; c++) if (Math.abs(values[i * size + c] - restValue[c]) > 1e-4) { still = false; break; }
      }
    }
    if (still) continue;
    const Track = track.constructor;
    tracks.push(new Track(track.name, times, values));
  }
  return { clip: new THREE.AnimationClip(key, clip.duration, tracks), travel, naturalSpeed };
}

// ---------- GLB writer: skeleton nodes + animations ----------
function writeGlb(rootObject, clips, extras) {
  const nodes = [];
  const index = new Map();
  const visit = (o) => {
    if (o.isMesh || o.isSkinnedMesh) return -1;
    const i = nodes.length;
    index.set(o, i);
    const node = { name: o.name };
    if (o.position.lengthSq() > 0) node.translation = o.position.toArray();
    if (Math.abs(o.quaternion.w - 1) > 1e-9) node.rotation = o.quaternion.toArray();
    if (Math.abs(o.scale.x - 1) + Math.abs(o.scale.y - 1) + Math.abs(o.scale.z - 1) > 1e-9) node.scale = o.scale.toArray();
    nodes.push(node);
    const children = o.children.map(visit).filter((c) => c >= 0);
    if (children.length) node.children = children;
    return i;
  };
  const roots = rootObject.children.map(visit).filter((c) => c >= 0);
  const byName = new Map(nodes.map((n, i) => [n.name, i]));
  const chunks = [];
  let offset = 0;
  const bufferViews = [];
  const accessors = [];
  const add = (array, type, count, minmax = false) => {
    const bytesIn = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    chunks.push(bytesIn);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytesIn.byteLength });
    offset += bytesIn.byteLength;
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { chunks.push(new Uint8Array(pad)); offset += pad; }
    const accessor = { bufferView: bufferViews.length - 1, componentType: 5126, count, type };
    if (minmax) { accessor.min = [array[0]]; accessor.max = [array[array.length - 1]]; }
    accessors.push(accessor);
    return accessors.length - 1;
  };
  const animations = clips.map((clip) => {
    const samplers = [];
    const channels = [];
    const timeAccessors = new Map();
    for (const track of clip.tracks) {
      const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
      const node = byName.get(nodeName);
      if (node === undefined) continue;
      const path = { quaternion: 'rotation', position: 'translation', scale: 'scale' }[propertyName];
      if (!path) continue;
      const timeKey = Array.from(track.times).join(',');
      if (!timeAccessors.has(timeKey)) timeAccessors.set(timeKey, add(Float32Array.from(track.times), 'SCALAR', track.times.length, true));
      const output = add(Float32Array.from(track.values), path === 'rotation' ? 'VEC4' : 'VEC3', track.times.length);
      samplers.push({ input: timeAccessors.get(timeKey), output, interpolation: 'LINEAR' });
      channels.push({ sampler: samplers.length - 1, target: { node, path } });
    }
    return { name: clip.name, samplers, channels };
  });
  const json = {
    asset: { version: '2.0', generator: 'Duelist Adventure motion pack builder', extras },
    scene: 0, scenes: [{ name: 'Motion', nodes: roots }], nodes, animations, accessors, bufferViews,
    buffers: [{ byteLength: offset }],
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + offset;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonBytes.length + jsonPad, 12); out.writeUInt32LE(0x4e4f534a, 16);
  out.set(jsonBytes, 20); out.fill(0x20, 20 + jsonBytes.length, 20 + jsonBytes.length + jsonPad);
  let at = 20 + jsonBytes.length + jsonPad;
  out.writeUInt32LE(offset, at); out.writeUInt32LE(0x004e4942, at + 4); at += 8;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

// ---------- the class weapons' clips, made in Blender (tools/duelist/blender/weapon_clips.py) ----------
// The Blender export has a skeleton of its own: the same bones, at Blender's rest pose and bone axes. Both
// skeletons are put in the same known pose of the pack (the first frame of the sword stance, exported as
// `__ref`), so a bone's turn from there in one is the same turn in the other. `__check` is a clip of the pack
// sent through Blender and back: it is compared with the original here, bone by bone.
const CLASS_SOURCE = resolve(ROOT, 'tools/duelist/source/class-weapons.anim.glb');
const CLASS_LOOPS = new Set(['bladesIdle', 'staffIdle']);
const CLASS_STANCES = new Set(['bladesIdle', 'staffIdle', 'bladesGuard', 'staffGuard']); // no strike to time

function posed(root, clip, time, read) {
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  mixer.setTime(Math.min(time, clip.duration - 1e-4));
  root.updateMatrixWorld(true);
  const out = read();
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  root.updateMatrixWorld(true);
  return out;
}

// a bone that holds one pose through a clip needs two keys, not sixty a second
function thin(track) {
  const size = track.getValueSize();
  const v = track.values;
  for (let i = size; i < v.length; i++) if (Math.abs(v[i] - v[i % size]) > 1e-6) return track;
  const Track = track.constructor;
  return new Track(track.name, [track.times[0], track.times[track.times.length - 1]], [...v.slice(0, size), ...v.slice(0, size)]);
}

async function loadClassClips(path) {
  const { describeRig, retargetClip } = await import('../../src/components/duelist/client/motionLibrary.mjs');
  const file = readFileSync(path);
  const other = await loader.parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '');
  const theirs = new Map(other.animations.map((c) => [c.name, c]));
  const ref = theirs.get('__ref');
  const check = theirs.get('__check');
  if (!ref || !check) throw new Error('class clips: __ref and __check are missing (export with weapon_clips.py)');
  const from = posed(other.scene, ref, 0, () => describeRig(other.scene));
  const to = posed(scene, byName.get('sword_idle_fit'), 0, () => describeRig(scene));
  const original = byName.get('sword_regular_a_fit');
  const back = retargetClip(check, from, to, '__check');
  const bones = [];
  scene.traverse((n) => { if (back.tracks.some((t) => t.name === `${n.name}.quaternion`)) bones.push(n); });
  const read = () => ({ q: bones.map((b) => b.getWorldQuaternion(new THREE.Quaternion())), hips: hips.getWorldPosition(new THREE.Vector3()) });
  let worst = 0;
  let worstBone = '';
  let worstHips = 0;
  for (let k = 0; k / 12 <= original.duration + 1e-6; k++) { // every other key of the pack: a frame of the export
    const a = posed(scene, original, k / 12, read);
    const b = posed(scene, back, k / 12, read);
    a.q.forEach((q, i) => {
      const angle = THREE.MathUtils.radToDeg(q.angleTo(b.q[i]));
      if (angle > worst) { worst = angle; worstBone = bones[i].name; }
    });
    worstHips = Math.max(worstHips, a.hips.distanceTo(b.hips) * unit);
  }
  console.log(`class clips: through Blender and back, the worst bone is ${worst.toFixed(2)} degrees off (${worstBone}), the hips ${(worstHips * 100).toFixed(1)} cm (${bones.length} bones)`);
  if (worst > 2 || worstHips > 0.02) throw new Error('class clips: the Blender export does not line up with the pack');
  const out = new Map();
  for (const [name, clip] of theirs) {
    if (name.startsWith('__')) continue;
    const fitted = retargetClip(clip, from, to, name);
    fitted.tracks = fitted.tracks.filter((t) => /^mixamorig/.test(t.name)); // the wig's bones are not the clips' to move
    out.set(name, fitted);
  }
  return out;
}

// ---------- build ----------
const byName = new Map(gltf.animations.map((c) => [c.name, c]));
if (args.includes('--keep-source')) {
  mkdirSync(dirname(OUT_SOURCE), { recursive: true });
  writeFileSync(OUT_SOURCE, writeGlb(scene, gltf.animations, { duelistUnit: unit, note: 'ActionForge pack, meshes stripped' }));
  console.log('source kept:', OUT_SOURCE, (readFileSync(OUT_SOURCE).length / 1e6).toFixed(2), 'MB');
}
const built = [];
const data = {};
for (const [key, sourceName] of Object.entries(SELECTION)) {
  const clip = byName.get(sourceName);
  if (!clip) { console.warn('missing in the source:', sourceName); continue; }
  const loop = isLoop(key, sourceName);
  const peaks = STRIKES.has(key) ? analyse(clip) : [];
  const { clip: processed, travel, naturalSpeed } = processClip(key, clip, loop);
  built.push(processed);
  data[key] = {
    source: sourceName, duration: +clip.duration.toFixed(3), loop,
    ...(naturalSpeed ? { naturalSpeed } : {}), ...(travel ? { travel } : {}), ...(peaks.length ? { peaks } : {}),
  };
  console.log(key.padEnd(16), sourceName.padEnd(30), clip.duration.toFixed(2) + 's', loop ? 'loop' : '    ',
    naturalSpeed ? `speed ${naturalSpeed}` : '', travel ? `travel ${travel.distance}` : '',
    peaks.length ? 'peaks ' + peaks.map((p) => `${p.hand[0]}@${p.t}(${p.speed})`).join(' ') : '', `tracks ${processed.tracks.length}/${clip.tracks.length}`);
}
// the class weapons' clips (a Blender export beside the source, or --class-clips=<glb>)
const classArg = args.find((a) => a.startsWith('--class-clips='));
const classPath = classArg ? classArg.slice('--class-clips='.length) : (existsSync(CLASS_SOURCE) ? CLASS_SOURCE : null);
if (classPath) {
  for (const [key, clip] of await loadClassClips(classPath)) {
    const loop = CLASS_LOOPS.has(key);
    const peaks = CLASS_STANCES.has(key) ? [] : analyse(clip);
    const { clip: processed, travel, naturalSpeed } = processClip(key, clip, loop);
    processed.tracks = processed.tracks.map(thin);
    built.push(processed);
    data[key] = {
      source: 'blender', duration: +clip.duration.toFixed(3), loop,
      ...(naturalSpeed ? { naturalSpeed } : {}), ...(travel ? { travel } : {}), ...(peaks.length ? { peaks } : {}),
    };
    console.log(key.padEnd(16), 'made in Blender'.padEnd(30), clip.duration.toFixed(2) + 's', loop ? 'loop' : '    ',
      travel ? `travel ${travel.distance}` : '', peaks.length ? 'peaks ' + peaks.map((p) => `${p.hand[0]}@${p.t}(${p.speed})`).join(' ') : '',
      `tracks ${processed.tracks.length}/${clip.tracks.length}`);
  }
} else console.warn('no class clips: the twin blades and the staff will have none of their own');
mkdirSync(dirname(OUT_GLB), { recursive: true });
writeFileSync(OUT_GLB, writeGlb(scene, built, { duelistUnit: unit }));
const header = `// Generated by tools/duelist/build-motion-pack.mjs from the owner's ActionForge clip pack. Do not edit by hand.
// Per clip: source name, duration (s), loop, natural speed (m/s, loops that walk), travel (m, one-shots that
// move the body: forward/right samples over the clip and the total), peaks (hand speed maxima: strikes).
// Distances are metres for a ${BODY_HEIGHT} m body.
`;
writeFileSync(OUT_DATA, `${header}export const MOTION_PACK_URL = '/models/animations/duelist/duelist-motion.glb';
export const MOTION_SOURCE_LEG = ${+(legLength * unit).toFixed(4)}; // thigh + shin of the source rig, metres
export const MOTION_CLIPS = Object.freeze(${JSON.stringify(data, null, 2)});
`);
console.log('wrote', OUT_GLB, (readFileSync(OUT_GLB).length / 1e6).toFixed(2), 'MB;', built.length, 'clips; unit', unit.toFixed(4));
