// Minimal, dependency-free GLB read/write for capture clips. Runs in the browser and in Node (Uint8Array/DataView
// only). Appending an animation adds accessors at the end of the BIN chunk; nothing already in the file moves.

const GLB = 0x46546c67, JSON_CHUNK = 0x4e4f534a, BIN_CHUNK = 0x004e4942;
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const enc = new TextEncoder(), dec = new TextDecoder();

export function parseGlb(data) {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, true) !== GLB) throw new Error('not a GLB');
  const jl = dv.getUint32(12, true), json = JSON.parse(dec.decode(u8.subarray(20, 20 + jl)));
  let bin = new Uint8Array(0);
  if (20 + jl < u8.byteLength) { const bl = dv.getUint32(20 + jl, true); bin = u8.slice(28 + jl, 28 + jl + bl); }
  return { json, chunks: [bin], length: bin.byteLength };
}

export function emptyGlb(generator = 'atomxe-mocap') {
  return { json: { asset: { version: '2.0', generator }, scene: 0, scenes: [{ nodes: [] }], nodes: [], accessors: [], bufferViews: [], buffers: [{ byteLength: 0 }] }, chunks: [], length: 0 };
}

function addView(glb, bytes) {
  const pad = (4 - (glb.length % 4)) % 4;
  if (pad) { glb.chunks.push(new Uint8Array(pad)); glb.length += pad; }
  const offset = glb.length;
  glb.chunks.push(bytes); glb.length += bytes.byteLength;
  glb.json.bufferViews = glb.json.bufferViews || [];
  if (!glb.json.buffers || !glb.json.buffers.length) glb.json.buffers = [{ byteLength: 0 }];
  glb.json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength });
  return glb.json.bufferViews.length - 1;
}

// floats: Float32Array (or array) of count * size(type) values
export function addAccessor(glb, floats, type, withMinMax = false) {
  const f = floats instanceof Float32Array ? floats : Float32Array.from(floats), n = SIZE[type], count = f.length / n;
  if (!Number.isInteger(count)) throw new Error(`accessor length ${f.length} is not a multiple of ${n}`);
  const acc = { bufferView: addView(glb, new Uint8Array(f.buffer, f.byteOffset, f.byteLength).slice()), componentType: 5126, count, type };
  if (withMinMax) {
    acc.min = new Array(n).fill(Infinity); acc.max = new Array(n).fill(-Infinity);
    for (let i = 0; i < count; i++) for (let k = 0; k < n; k++) { const x = f[i * n + k]; if (x < acc.min[k]) acc.min[k] = x; if (x > acc.max[k]) acc.max[k] = x; }
  }
  glb.json.accessors = glb.json.accessors || [];
  glb.json.accessors.push(acc);
  return glb.json.accessors.length - 1;
}

const nodeIndex = (glb, node) => {
  if (typeof node === 'number') return node;
  const i = glb.json.nodes.findIndex((n) => n.name === node);
  if (i < 0) throw new Error(`no node named ${node}`);
  return i;
};

// anim: { name, channels: [{ node: index | name, path: 'rotation'|'translation'|'scale'|'weights', times, values,
//         interpolation? }], extras? }
export function appendAnimation(glb, anim) {
  const samplers = [], channels = [], inputs = new Map();
  for (const ch of anim.channels) {
    const per = ch.path === 'rotation' ? 4 : ch.path === 'weights' ? 1 : 3, type = ch.path === 'weights' ? 'SCALAR' : per === 4 ? 'VEC4' : 'VEC3';
    if (ch.values.length % (ch.times.length * per)) throw new Error(`${ch.node} ${ch.path}: ${ch.values.length} values for ${ch.times.length} keys`);
    let input = inputs.get(ch.times);
    if (input === undefined) { input = addAccessor(glb, ch.times, 'SCALAR', true); inputs.set(ch.times, input); }
    samplers.push({ input, output: addAccessor(glb, ch.values, type), interpolation: ch.interpolation || 'LINEAR' });
    channels.push({ sampler: samplers.length - 1, target: { node: nodeIndex(glb, ch.node), path: ch.path } });
  }
  glb.json.animations = glb.json.animations || [];
  const a = { name: anim.name, samplers, channels };
  if (anim.extras) a.extras = anim.extras;
  glb.json.animations.push(a);
  return glb.json.animations.length - 1;
}

// A copy holding only the node hierarchy (names and rest TRS) of `glb`: no meshes, skins, materials or images.
// Clips exported on it bind by node name to the full character at runtime (three.js AnimationMixer).
export function skeletonOnly(src) {
  const out = emptyGlb();
  out.json.nodes = src.json.nodes.map((n) => {
    const m = { name: n.name };
    for (const k of ['translation', 'rotation', 'scale', 'matrix', 'children']) if (n[k]) m[k] = Array.isArray(n[k]) ? n[k].slice() : n[k];
    return m;
  });
  out.json.scenes = (src.json.scenes || [{ nodes: [0] }]).map((s) => ({ name: s.name, nodes: s.nodes.slice() }));
  out.json.scene = src.json.scene || 0;
  return out;
}

export function serializeGlb(glb) {
  const binLen = glb.length, binPad = (4 - (binLen % 4)) % 4;
  glb.json.buffers = glb.json.buffers && glb.json.buffers.length ? glb.json.buffers : [{ byteLength: 0 }];
  glb.json.buffers[0].byteLength = binLen;
  if (!binLen) { delete glb.json.buffers; if (!glb.json.bufferViews?.length) delete glb.json.bufferViews; if (!glb.json.accessors?.length) delete glb.json.accessors; }
  let js = enc.encode(JSON.stringify(glb.json)); const jsPad = (4 - (js.length % 4)) % 4;
  const total = 12 + 8 + js.length + jsPad + (binLen ? 8 + binLen + binPad : 0);
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, GLB, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, js.length + jsPad, true); dv.setUint32(16, JSON_CHUNK, true);
  out.set(js, 20); out.fill(0x20, 20 + js.length, 20 + js.length + jsPad);
  if (binLen) {
    let o = 20 + js.length + jsPad;
    dv.setUint32(o, binLen + binPad, true); dv.setUint32(o + 4, BIN_CHUNK, true); o += 8;
    for (const c of glb.chunks) { out.set(c, o); o += c.byteLength; }
  }
  if (glb.json.buffers) glb.json.buffers[0].byteLength = binLen;
  return out;
}

// read back an accessor as Float32Array (float accessors written by this module or by Blender)
export function readFloatAccessor(glb, index) {
  const a = glb.json.accessors[index], v = glb.json.bufferViews[a.bufferView], n = SIZE[a.type];
  if (a.componentType !== 5126) throw new Error('only float accessors');
  const bin = glb.chunks.length === 1 ? glb.chunks[0] : concat(glb.chunks), out = new Float32Array(a.count * n);
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength), stride = v.byteStride || n * 4, base = (v.byteOffset || 0) + (a.byteOffset || 0);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = dv.getFloat32(base + i * stride + k * 4, true);
  return out;
}

function concat(chunks) {
  const len = chunks.reduce((t, c) => t + c.byteLength, 0), out = new Uint8Array(len); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out;
}
