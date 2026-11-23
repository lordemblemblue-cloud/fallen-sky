// The motion pack (tools/duelist/build-motion-pack.mjs) and retargeting: clips authored on one Mixamo-named
// rig play on another (Fallen Sky's fused female and male today, the owner's own models later).
//
// Rotations: each bone keeps the source's motion in model space. With G the model-space rest rotation of a
// bone in each rig and C = inv(G_source) * G_target, a source key A becomes inv(C_parent) * A * C_bone on the
// target, which absorbs different bone rolls (the fused male's right arm is rolled 140 degrees from the
// female's) and needs no per-key hierarchy walk. Bones the clip leaves alone stay at the target's rest.
// The hips' position moves by the source's offset from rest, scaled by leg length. Other position and scale
// keys are dropped: the target keeps its own proportions.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MOTION_PACK_URL } from '../core/motionPack.data.mjs';

const packs = new Map();
// metres: a clip whose hips start farther than this from the rig's own spot was authored off-centre (two of the
// staff's Blender clips, staffB and staffLeap, start 1.3 m and 3.7 m to the side). It is moved back over the body,
// keeping its own motion: drawn where the rules have the fighter, the Assassin no longer flies across the arena
// when she turns in a strike (owner, 2026-11-22).
export const OFF_CENTRE = 0.5;

// { root, rig, clips: Map(name -> AnimationClip) } for a clip GLB, loaded once.
export function loadClipSource(url = MOTION_PACK_URL) {
  if (!packs.has(url)) {
    packs.set(url, new GLTFLoader().loadAsync(url).then((gltf) => ({
      root: gltf.scene,
      rig: describeRig(gltf.scene),
      clips: new Map(gltf.animations.map((c) => [c.name, c])),
    })).catch((error) => { packs.delete(url); throw error; }));
  }
  return packs.get(url);
}

// Rest rotations in model space (relative to `root`, so its own placement does not count), the hips and the
// leg length, for a rig at rest. Call before any animation has posed it.
export function describeRig(root) {
  root.updateMatrixWorld(true);
  const nodes = new Map();
  root.traverse((n) => { if (n !== root && n.name) nodes.set(n.name, n); });
  const modelRotation = (node) => {
    const q = new THREE.Quaternion();
    for (let n = node; n && n !== root; n = n.parent) q.premultiply(n.quaternion);
    return q;
  };
  const local = (node) => root.worldToLocal(node.getWorldPosition(new THREE.Vector3()));
  const rest = new Map();
  for (const [name, node] of nodes) rest.set(name, { node, rotation: modelRotation(node), parent: node.parent && node.parent !== root ? node.parent.name : null });
  const find = (part) => nodes.get(`mixamorig${part}`) || nodes.get(`mixamorig:${part}`) || null;
  const hips = find('Hips');
  const up = find('LeftUpLeg'), knee = find('LeftLeg'), foot = find('LeftFoot');
  const leg = up && knee && foot ? local(up).distanceTo(local(knee)) + local(knee).distanceTo(local(foot)) : 1;
  return {
    rest, hips: hips?.name || null, hipsRest: hips ? hips.position.clone() : new THREE.Vector3(), leg,
    parentRotation: (name) => { const p = rest.get(name)?.parent; return p ? rest.get(p).rotation : new THREE.Quaternion(); },
  };
}

/** The clip on the target rig (see the header). */
export function retargetClip(clip, source, target, name = clip.name) {
  const tracks = [];
  const inPlace = ['Front_Roll', 'Back_Flip', 'Flip_Left', 'Flip_Right'].includes(name);
  const scale = target.leg / Math.max(1e-6, source.leg);
  for (const track of clip.tracks) {
    const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
    const s = source.rest.get(nodeName);
    const t = target.rest.get(nodeName);
    if (!s || !t) continue;
    if (propertyName === 'quaternion') {
      const bone = s.rotation.clone().invert().multiply(t.rotation);
      const parent = source.parentRotation(nodeName).clone().invert().multiply(target.parentRotation(nodeName)).invert();
      const values = new Float32Array(track.values.length);
      const q = new THREE.Quaternion();
      for (let i = 0; i < track.times.length; i++) {
        q.fromArray(track.values, i * 4).premultiply(parent).multiply(bone).normalize();
        q.toArray(values, i * 4);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${t.node.name}.quaternion`, track.times, values));
    } else if (propertyName === 'position' && nodeName === source.hips && target.hips) {
      // offset from rest: into model space through the source parent, back out through the target's
      const into = source.parentRotation(nodeName);
      const outOf = target.parentRotation(nodeName).clone().invert();
      const values = new Float32Array(track.values.length);
      const v = new THREE.Vector3();
      // authored off-centre: the whole clip moves back over the body (OFF_CENTRE)
      let shiftX = 0;
      let shiftZ = 0;
      if (track.times.length) {
        v.fromArray(track.values, 0).sub(source.hipsRest).applyQuaternion(into).multiplyScalar(scale);
        if (Math.hypot(v.x, v.z) > OFF_CENTRE) { shiftX = v.x; shiftZ = v.z; }
      }
      for (let i = 0; i < track.times.length; i++) {
        v.fromArray(track.values, i * 3).sub(source.hipsRest).applyQuaternion(into).multiplyScalar(scale);
        v.x -= shiftX;
        v.z -= shiftZ;
        // The simulation moves the body through the arena. Keep the tumble centred on it.
        if (inPlace) { v.x = 0; v.z = 0; }
        v.applyQuaternion(outOf).add(target.hipsRest);
        v.toArray(values, i * 3);
      }
      tracks.push(new THREE.VectorKeyframeTrack(`${t.node.name}.position`, track.times, values));
    }
  }
  return new THREE.AnimationClip(name, clip.duration, tracks);
}

const cache = new WeakMap(); // source -> Map(rigKey -> Map(name -> clip))

/**
 * Clips for one body, retargeted from a source (the motion pack by default). `rigKey` names the body's rig
 * (bodies built from the same file share it) so their clips are made once; `names` limits the work.
 */
export async function clipsForBody(model, { rigKey, url = MOTION_PACK_URL, names = null } = {}) {
  const source = await loadClipSource(url);
  if (!cache.has(source)) cache.set(source, new Map());
  const perRig = cache.get(source);
  const key = rigKey || model.uuid;
  if (!perRig.has(key)) perRig.set(key, { rig: describeRig(model), clips: new Map() });
  const entry = perRig.get(key);
  const out = {};
  for (const [name, clip] of source.clips) {
    if (names && !names.includes(name)) continue;
    if (!entry.clips.has(name)) entry.clips.set(name, retargetClip(clip, source.rig, entry.rig));
    out[name] = entry.clips.get(name);
  }
  return out;
}
