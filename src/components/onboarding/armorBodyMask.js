// Body masks for armor pieces (tools/avatar-armor). Each piece's glTF extras carry, per body
// primitive, two bitsets of body vertices (little-endian bits, base64):
//   bits  skin the piece covers away from its openings: hidden whenever the piece is worn;
//   band  covered skin next to an opening (cuff, hem, collar): it stays visible when the piece
//         is worn alone, so skin meets the opening, and is hidden once a second worn piece
//         covers it too (glove over sleeve, jacket over waistband, greave over trouser cuff).
// Body triangles whose three vertices are all hidden are dropped from the index, so skin
// cannot show through the armor in any pose. Tattoo and complexion overlays share the body
// geometry and follow it. Taking a piece off restores the original index.
import * as THREE from 'three';

/** The parsed body_mask of a bound layer ({mesh, rig_id, primitives:[{count, hidden, bits}]}), or null. */
export function layerBodyMask(layerRoot) {
  let mask = null;
  layerRoot?.traverse((n) => {
    const raw = n.userData?.body_mask;
    if (mask || !raw) return;
    try { mask = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { mask = null; }
  });
  return mask && Array.isArray(mask.primitives) ? mask : null;
}

const decoded = { bits: new WeakMap(), band: new WeakMap() };
const fromBase64 = (b64) => (typeof atob === 'function'
  ? atob(b64)
  : globalThis.Buffer.from(b64, 'base64').toString('binary'));

/** One byte per vertex (1 = set) for a mask primitive's `bits` (default) or `band`. */
export function decodeMaskBits(primitive, key = 'bits') {
  const cache = decoded[key];
  if (cache.has(primitive)) return cache.get(primitive);
  const count = primitive.count | 0, bin = fromBase64(primitive[key] || ''), out = new Uint8Array(count);
  for (let i = 0; i < count; i++) out[i] = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1;
  cache.set(primitive, out);
  return out;
}

/**
 * Hidden vertices of a body primitive with `count` vertices while every mask's piece is worn:
 * a vertex is hidden when one piece hides it outright, or when two pieces cover it.
 */
export function hiddenVertices(count, masks = []) {
  const solo = new Uint8Array(count), covers = new Uint8Array(count);
  for (const mask of masks) for (const primitive of mask?.primitives || []) {
    if ((primitive.count | 0) !== count) continue;
    const bits = primitive.hidden ? decodeMaskBits(primitive) : null;
    const band = primitive.band_count ? decodeMaskBits(primitive, 'band') : null;
    if (!bits && !band) continue;
    for (let i = 0; i < count; i++) {
      const b = bits ? bits[i] : 0;
      if (b) solo[i] = 1;
      if (b || (band && band[i])) covers[i]++;
    }
  }
  let any = false;
  for (let i = 0; i < count; i++) {
    if (solo[i] || covers[i] >= 2) { solo[i] = 1; any = true; }
  }
  return any ? solo : null;
}

/** Triangle list without the triangles whose three vertices are hidden. */
export function maskedIndex(source, hidden) {
  const keep = [];
  for (let t = 0; t + 2 < source.length; t += 3) {
    const a = source[t], b = source[t + 1], c = source[t + 2];
    if (!(hidden[a] && hidden[b] && hidden[c])) keep.push(a, b, c);
  }
  return keep;
}

// ---- two rules on top of the baked masks ----
// A piece's baked mask only hides skin that sits safely under it in the pose it was fitted in. Two places
// need more than that:
//   gloves  a hand closes round a weapon, and finger skin the mask left visible pushes out through the
//           glove. A worn glove therefore hides the whole hand it is skinned to (wrist and fingers), apart
//           from the skin at its cuff.
//   eyes    a helmet's mask can reach the eyelids and the eyeballs, and cutting those away leaves the face
//           looking asleep. The eyes are never hidden: every vertex the blink and look shapes move stays.
const HAND_BONE = /(Left|Right)Hand(?:(?:Thumb|Index|Middle|Ring|Pinky)\d)?$/;
const FINGER_BONE = /(Left|Right)Hand(?:Thumb|Index|Middle|Ring|Pinky)\d$/;
const EYE_SHAPE = /^FX_(?:Blink|Look)|blink|eyelid|eye_?(?:close|shut)/i;

/** For each vertex, the index (into the skin's bones) of the bone that moves it most. */
export function leadingBones(skinIndex, skinWeight, count) {
  const out = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    let best = 0;
    for (let k = 1; k < 4; k++) if (skinWeight[i * 4 + k] > skinWeight[i * 4 + best]) best = k;
    out[i] = skinIndex[i * 4 + best];
  }
  return out;
}

/** Which hands ('Left', 'Right') a glove covers: those with a finger bone leading some of its vertices. */
export function coveredHandSides(leading, boneNames) {
  const sides = new Set();
  for (let i = 0; i < leading.length && sides.size < 2; i++) {
    const side = FINGER_BONE.exec(boneNames[leading[i]] || '')?.[1];
    if (side) sides.add(side);
  }
  return sides;
}

/** One byte per vertex: 1 where the leading bone is the wrist or a finger of a covered hand. */
export function handVertices(leading, boneNames, sides) {
  const flags = new Uint8Array(leading.length);
  if (!sides?.size) return flags;
  const covered = boneNames.map((name) => { const side = HAND_BONE.exec(name || '')?.[1]; return !!side && sides.has(side); });
  for (let i = 0; i < leading.length; i++) if (covered[leading[i]]) flags[i] = 1;
  return flags;
}

/** One byte per vertex: 1 where a blink or look shape moves it (the eyelids and the eyeballs). shapes: {name: Float32Array of xyz offsets}. */
export function eyeVertices(shapes, count) {
  let flags = null;
  for (const [name, offsets] of Object.entries(shapes || {})) {
    if (!EYE_SHAPE.test(name) || !offsets) continue;
    flags ||= new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      if (offsets[i * 3] !== 0 || offsets[i * 3 + 1] !== 0 || offsets[i * 3 + 2] !== 0) flags[i] = 1;
    }
  }
  return flags;
}

/** One byte per vertex: 1 where some mask keeps the skin next to its opening (its band). */
export function bandVertices(count, masks = []) {
  let flags = null;
  for (const mask of masks) for (const primitive of mask?.primitives || []) {
    if ((primitive.count | 0) !== count || !primitive.band_count) continue;
    const band = decodeMaskBits(primitive, 'band');
    flags ||= new Uint8Array(count);
    for (let i = 0; i < count; i++) if (band[i]) flags[i] = 1;
  }
  return flags;
}

const leadingCache = new WeakMap(), eyeCache = new WeakMap();
const leadingOf = (mesh) => {
  const g = mesh.geometry, index = g.attributes.skinIndex, weight = g.attributes.skinWeight;
  if (!mesh.isSkinnedMesh || !index || !weight || !mesh.skeleton) return null;
  if (!leadingCache.has(g)) leadingCache.set(g, leadingBones(index.array, weight.array, index.count));
  return leadingCache.get(g);
};

/** The hands a worn glove layer covers ('Left' / 'Right'), from the bones its meshes are skinned to. */
export function gloveHandSides(layerRoot) {
  const sides = new Set();
  layerRoot?.traverse((n) => {
    const leading = n.isSkinnedMesh ? leadingOf(n) : null;
    if (leading) coveredHandSides(leading, n.skeleton.bones.map((b) => b.name)).forEach((side) => sides.add(side));
  });
  return sides;
}

/**
 * Apply the union of `masks` to every body mesh under root (layers and overlays excluded).
 * gloveSides: the hands worn gloves cover (gloveHandSides); their skin is hidden whole.
 */
export function applyBodyMasks(root, masks = [], { gloveSides = null } = {}) {
  const meshes = [];
  root?.traverse((n) => { if (n.isMesh && n.geometry && !n.userData?.creatorLayer && !n.userData?.customizationSurface) meshes.push(n); });
  for (const mesh of meshes) {
    const geometry = mesh.geometry, count = geometry.attributes.position?.count || 0;
    let hidden = hiddenVertices(count, masks);
    const leading = gloveSides?.size ? leadingOf(mesh) : null;
    if (leading) {
      const hand = handVertices(leading, mesh.skeleton.bones.map((b) => b.name), gloveSides), band = bandVertices(count, masks);
      for (let i = 0; i < count; i++) {
        if (hand[i] && !(band && band[i])) { hidden ||= new Uint8Array(count); hidden[i] = 1; }
      }
    }
    if (hidden && mesh.morphTargetDictionary && geometry.morphAttributes?.position) {
      if (!eyeCache.has(geometry)) {
        const shapes = Object.fromEntries(Object.entries(mesh.morphTargetDictionary).map(([name, i]) => [name, geometry.morphAttributes.position[i]?.array]));
        eyeCache.set(geometry, eyeVertices(shapes, count));
      }
      const eyes = eyeCache.get(geometry);
      if (eyes) { for (let i = 0; i < count; i++) if (eyes[i]) hidden[i] = 0; if (!hidden.some((v) => v)) hidden = null; }
    }
    const original = geometry.userData.creatorOriginalIndex;
    if (!hidden) {
      if (original) { geometry.setIndex(new THREE.BufferAttribute(original, 1)); delete geometry.userData.creatorOriginalIndex; }
      continue;
    }
    const source = original || (geometry.index ? geometry.index.array.slice() : Uint32Array.from({ length: count }, (_, i) => i));
    geometry.userData.creatorOriginalIndex = source;
    const keep = maskedIndex(source, hidden);
    geometry.setIndex(new THREE.BufferAttribute(count > 65535 ? new Uint32Array(keep) : new Uint16Array(keep), 1));
  }
}