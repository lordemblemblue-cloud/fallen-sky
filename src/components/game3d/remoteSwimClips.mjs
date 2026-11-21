import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildRig } from '../../lib/mocap/rig.js';
import { retargetToRig } from '../../lib/mocap/retarget.js';

// Remote players are drawn with one shared Mixamo archer (RemotePlayersManager). When a packet's `anim` says the
// sender swims (swimIdle / swimForward: the hero's controller state, player/playerSwimState.mjs), the archer plays
// the same owner loops the hero does: the fused body's Swim_Idle / Swim_Forward (public/models/animations/mocap),
// retargeted once onto the archer's own skeleton in the browser (src/lib/mocap/retarget.js: rest alignment and the
// leg-length ratio), so the archer's neck sits at the water line where the sender floats. Presentation only.
export const REMOTE_SWIM_SOURCES = Object.freeze({
  swimIdle: '/models/animations/mocap/Swim_Idle.glb',
  swimForward: '/models/animations/mocap/Swim_Forward.glb',
});
export const REMOTE_SWIM_STATES = Object.freeze(Object.keys(REMOTE_SWIM_SOURCES));

/** retarget.js source (joints at rest, local rotations per frame) of a clip on its own loaded skeleton. */
export function clipSource(root, clip, { fps = 30 } = {}) {
  let hips = null;
  root.traverse((o) => { if (!hips && /hips$/i.test(o.name || '')) hips = o; });
  if (!hips) throw new Error('no Hips node in the clip source');
  const chain = [];
  for (let p = hips.parent; p; p = p.parent) chain.unshift(p);
  const order = [...chain];
  (function walk(o) { order.push(o); o.children.forEach(walk); })(hips);
  const k = new Map(order.map((o, i) => [o, i]));
  let s = 1;
  for (const c of chain) s *= c.scale.x; // an armature scale (Mixamo FBX: 0.01)
  const joints = order.map((o, i) => ({
    name: o.name, parent: i === 0 ? -1 : (k.get(o.parent) ?? -1),
    t: chain.includes(o) ? o.position.clone() : o.position.clone().multiplyScalar(s), r: o.quaternion.clone(),
  }));
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  const frames = [], count = Math.max(2, Math.round(clip.duration * fps) + 1);
  for (let f = 0; f < count; f++) {
    mixer.setTime(Math.min(clip.duration, f / fps));
    frames.push({ rotations: order.map((o) => o.quaternion.clone()), rootPosition: hips.position.clone().multiplyScalar(s) });
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  return { joints, frames, fps, rootIndex: k.get(hips), name: clip.name };
}

// FBX / glTF loaders drop the colon of "mixamorig:Hips"; the rig description wants it back to find the prefix.
const rigName = (name) => String(name || '').replace(/^(mixamorig\d*)(?!:)(?=[A-Z])/, '$1:');

/**
 * glTF-like JSON (nodes with their rest TRS) of a loaded skeleton, for src/lib/mocap/rig.js, plus the objects.
 * The hosted archer carries its skeleton four times (one per mesh part); only the first copy keeps the plain bone
 * names, because three.js binds a track to the first node of that name (PropertyBinding's depth-first search) and
 * the rig must solve that same copy, parents before children.
 */
export function rigOfObject(root) {
  const objects = [], index = new Map(), seen = new Map();
  root.traverse((o) => { index.set(o, objects.length); objects.push(o); });
  const json = {
    nodes: objects.map((o) => {
      let name = rigName(o.name);
      const copies = seen.get(name) || 0;
      seen.set(name, copies + 1);
      if (copies && name) name = `${name}~${copies}`;
      return {
        name, translation: o.position.toArray(), rotation: o.quaternion.toArray(), scale: o.scale.toArray(),
        children: o.children.map((c) => index.get(c)).filter((i) => i !== undefined),
      };
    }),
  };
  return { rig: buildRig(json), objects };
}

/** A clip on `sourceRoot`'s skeleton -> the same motion for `targetRoot`'s skeleton (both at rest), in place. */
export function retargetClipOnto(sourceRoot, clip, targetRoot, { name = clip.name, fps = 30 } = {}) {
  const source = clipSource(sourceRoot, clip, { fps });
  const { rig, objects } = rigOfObject(targetRoot);
  const solved = retargetToRig(rig, source, { fps, rootMotion: false });
  const times = Array.from(solved.times);
  const tracks = solved.bones.map((b) => new THREE.QuaternionKeyframeTrack(`${objects[b.node].name}.quaternion`, times, Array.from(b.rotations)));
  tracks.push(new THREE.VectorKeyframeTrack(`${objects[solved.hips.node].name}.position`, times, Array.from(solved.hips.translations)));
  const out = new THREE.AnimationClip(name, -1, tracks);
  out.userData = { loop: true, retargetedFrom: clip.name, mapped: solved.stats?.mapped?.length ?? 0 };
  return out;
}

/** Load the swim loops and retarget them onto the remote avatar's model (at rest). { swimIdle, swimForward } */
export async function loadRemoteSwimClips(targetModel, { loader = new GLTFLoader(), sources = REMOTE_SWIM_SOURCES } = {}) {
  const out = {};
  for (const [state, url] of Object.entries(sources)) {
    const gltf = await loader.loadAsync(url);
    const clip = gltf.animations?.[0];
    if (!clip) throw new Error(`${url} has no clip`);
    out[state] = retargetClipOnto(gltf.scene, clip, targetModel, { name: state });
  }
  return out;
}
