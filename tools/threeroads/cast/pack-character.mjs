#!/usr/bin/env node
// Packs one person of the Three Roads cast into the single file the game loads:
// one GLB with the mesh, the skeleton and the clips the cast subsystem asks for
// by name (Idle, Talk, Walk).
//
// A generated character arrives as several files: the animated model (mesh and
// the clips that were paid for) and, separately, the walk that comes free with
// the skeleton. This tool copies clips from the other files into the first one
// (bones matched by name), renames clips, drops channels that never leave the
// rest pose, and shrinks the texture.
//
//   node tools/threeroads/cast/pack-character.mjs \
//     --in animated.glb --out public/game3d/threeroads/cast/<person_id>.glb \
//     --rename "Talk_with_Hands_Open=Talk" --clip "Walk=walk_armature.glb" \
//     --texture-max 1024
//
// --clip NAME=FILE[#CLIP]  copy a clip from another GLB (first clip unless #CLIP names one)
// --rename OLD=NEW         rename a clip of the --in file
// --keep A,B,C             keep only these clips (after renaming), in this order
// --texture-max N          shrink embedded images whose longer side is above N pixels
// --no-prune               keep channels that only repeat the rest pose

import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const { console, structuredClone } = globalThis;

const TYPE_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const FLOAT = 5126;
const REST = { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
// How far a channel may stray from the rest pose and still count as "never moves".
// Translations here are in the model's own units (centimetres for these rigs).
const PRUNE_TOLERANCE = { translation: 1e-3, rotation: 1e-5, scale: 1e-5 };

/** Reads a GLB into its JSON and one byte slice per buffer view. */
export function readGlb(bytes) {
  const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (data.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB file');
  const jsonLength = data.readUInt32LE(12);
  if (data.readUInt32LE(16) !== 0x4e4f534a) throw new Error('GLB: first chunk is not JSON');
  const json = JSON.parse(data.subarray(20, 20 + jsonLength).toString('utf8'));
  let bin = Buffer.alloc(0);
  const binHeader = 20 + jsonLength;
  if (binHeader + 8 <= data.length) {
    if (data.readUInt32LE(binHeader + 4) !== 0x004e4942) throw new Error('GLB: second chunk is not BIN');
    bin = data.subarray(binHeader + 8, binHeader + 8 + data.readUInt32LE(binHeader));
  }
  if ((json.buffers || []).length > 1 || json.buffers?.[0]?.uri) throw new Error('GLB with outside buffers is not supported');
  const views = (json.bufferViews || []).map(view => {
    const start = view.byteOffset || 0;
    if (start + view.byteLength > bin.length) throw new Error('GLB: a buffer view runs past the end of the data');
    const rest = { ...view };
    delete rest.buffer;
    delete rest.byteOffset;
    delete rest.byteLength;
    return { ...rest, bytes: bin.subarray(start, start + view.byteLength) };
  });
  return { json, views };
}

/** Writes the document back as a GLB, dropping accessors and views nothing uses. */
export function writeGlb(doc) {
  const json = structuredClone(doc.json);
  const usedAccessors = new Set();
  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      for (const index of Object.values(primitive.attributes || {})) usedAccessors.add(index);
      if (primitive.indices !== undefined) usedAccessors.add(primitive.indices);
      for (const target of primitive.targets || []) for (const index of Object.values(target)) usedAccessors.add(index);
    }
  }
  for (const skin of json.skins || []) if (skin.inverseBindMatrices !== undefined) usedAccessors.add(skin.inverseBindMatrices);
  for (const animation of json.animations || []) {
    for (const sampler of animation.samplers) { usedAccessors.add(sampler.input); usedAccessors.add(sampler.output); }
  }
  const accessorOrder = [...usedAccessors].sort((a, b) => a - b);
  const accessorMap = new Map(accessorOrder.map((old, next) => [old, next]));
  const remapAccessor = index => {
    if (!accessorMap.has(index)) throw new Error('accessor ' + index + ' is used but was not kept');
    return accessorMap.get(index);
  };

  const usedViews = new Set();
  for (const old of accessorOrder) {
    const accessor = json.accessors[old];
    if (accessor.sparse) throw new Error('sparse accessors are not supported');
    if (accessor.bufferView !== undefined) usedViews.add(accessor.bufferView);
  }
  for (const image of json.images || []) if (image.bufferView !== undefined) usedViews.add(image.bufferView);
  const viewOrder = [...usedViews].sort((a, b) => a - b);
  const viewMap = new Map(viewOrder.map((old, next) => [old, next]));

  const chunks = [];
  let offset = 0;
  json.bufferViews = viewOrder.map(old => {
    const { bytes, ...rest } = doc.views[old];
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
    const view = { buffer: 0, byteOffset: offset, byteLength: bytes.length, ...rest };
    chunks.push(bytes);
    offset += bytes.length;
    return view;
  });
  const tail = (4 - (offset % 4)) % 4;
  if (tail) { chunks.push(Buffer.alloc(tail)); offset += tail; }
  const bin = Buffer.concat(chunks, offset);

  json.accessors = accessorOrder.map(old => {
    const accessor = { ...json.accessors[old] };
    if (accessor.bufferView !== undefined) accessor.bufferView = viewMap.get(accessor.bufferView);
    return accessor;
  });
  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      for (const key of Object.keys(primitive.attributes || {})) primitive.attributes[key] = remapAccessor(primitive.attributes[key]);
      if (primitive.indices !== undefined) primitive.indices = remapAccessor(primitive.indices);
      for (const target of primitive.targets || []) for (const key of Object.keys(target)) target[key] = remapAccessor(target[key]);
    }
  }
  for (const skin of json.skins || []) {
    if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = remapAccessor(skin.inverseBindMatrices);
  }
  for (const animation of json.animations || []) {
    for (const sampler of animation.samplers) { sampler.input = remapAccessor(sampler.input); sampler.output = remapAccessor(sampler.output); }
  }
  for (const image of json.images || []) if (image.bufferView !== undefined) image.bufferView = viewMap.get(image.bufferView);
  json.buffers = [{ byteLength: bin.length }];

  let text = Buffer.from(JSON.stringify(json), 'utf8');
  const textPad = (4 - (text.length % 4)) % 4;
  if (textPad) text = Buffer.concat([text, Buffer.alloc(textPad, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + text.length + 8 + bin.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(text.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, text, binHeader, bin]);
}

/** The raw bytes of one accessor, tightly packed (a copy, never a shared slice). */
function accessorBytes(doc, index) {
  const accessor = doc.json.accessors[index];
  if (accessor.sparse || accessor.bufferView === undefined) throw new Error('accessor ' + index + ' has no plain data');
  const view = doc.views[accessor.bufferView];
  const size = TYPE_SIZE[accessor.type] * COMPONENT_BYTES[accessor.componentType];
  if (view.byteStride && view.byteStride !== size) throw new Error('accessor ' + index + ' is interleaved');
  const start = accessor.byteOffset || 0;
  return Buffer.from(view.bytes.subarray(start, start + accessor.count * size));
}

function accessorFloats(doc, index) {
  const accessor = doc.json.accessors[index];
  if (accessor.componentType !== FLOAT) return null;
  const bytes = accessorBytes(doc, index);
  const out = new Float32Array(bytes.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = bytes.readFloatLE(i * 4);
  return out;
}

/** Adds a tightly packed accessor holding a copy of one from another document. */
function copyAccessor(target, source, index) {
  const rest = { ...source.json.accessors[index] };
  delete rest.bufferView;
  delete rest.byteOffset;
  target.views.push({ bytes: accessorBytes(source, index) });
  target.json.accessors.push({ ...rest, bufferView: target.views.length - 1 });
  return target.json.accessors.length - 1;
}

/** Copies one clip from `source` into `target`; bones are matched by name. */
export function copyClip(target, source, { name, clip } = {}) {
  const animations = source.json.animations || [];
  const animation = clip === undefined ? animations[0] : animations.find(a => a.name === clip);
  if (!animation) throw new Error('clip ' + (clip ?? '(first)') + ' not found in the source file');
  const nodeByName = new Map();
  target.json.nodes.forEach((node, index) => {
    if (!node.name) return;
    if (nodeByName.has(node.name)) nodeByName.set(node.name, -1); // two nodes share the name: unsafe to match
    else nodeByName.set(node.name, index);
  });
  const accessorCopies = new Map();
  const copied = index => {
    if (!accessorCopies.has(index)) accessorCopies.set(index, copyAccessor(target, source, index));
    return accessorCopies.get(index);
  };
  const samplers = [];
  const channels = [];
  const skipped = [];
  for (const channel of animation.channels) {
    const sourceNode = source.json.nodes[channel.target.node];
    const targetIndex = nodeByName.get(sourceNode?.name);
    if (targetIndex === undefined || targetIndex < 0) { skipped.push(sourceNode?.name ?? '?'); continue; }
    const sampler = animation.samplers[channel.sampler];
    samplers.push({ ...sampler, input: copied(sampler.input), output: copied(sampler.output) });
    channels.push({ sampler: samplers.length - 1, target: { node: targetIndex, path: channel.target.path } });
  }
  if (!channels.length) throw new Error('no bone of the clip matches the target skeleton');
  target.json.animations = target.json.animations || [];
  target.json.animations.push({ name: name || animation.name, channels, samplers });
  return { copied: channels.length, skipped: [...new Set(skipped)] };
}

const isRestValue = (values, rest, path) => {
  const size = rest.length;
  const tolerance = PRUNE_TOLERANCE[path];
  for (let key = 0; key < values.length; key += size) {
    let direct = 0;
    let flipped = 0;
    for (let i = 0; i < size; i++) {
      direct = Math.max(direct, Math.abs(values[key + i] - rest[i]));
      flipped = Math.max(flipped, Math.abs(values[key + i] + rest[i]));
    }
    // A quaternion and its negative are the same turn.
    if ((path === 'rotation' ? Math.min(direct, flipped) : direct) > tolerance) return false;
  }
  return true;
};

/** Drops channels that only ever repeat the bone's rest pose. Returns how many. */
export function pruneRestChannels(doc) {
  let removed = 0;
  for (const animation of doc.json.animations || []) {
    const kept = [];
    for (const channel of animation.channels) {
      const node = doc.json.nodes[channel.target.node];
      const rest = !node || node.matrix ? null : node[channel.target.path] || REST[channel.target.path];
      const sampler = animation.samplers[channel.sampler];
      const values = rest && (sampler.interpolation || 'LINEAR') !== 'CUBICSPLINE' ? accessorFloats(doc, sampler.output) : null;
      if (values && isRestValue(values, rest, channel.target.path)) { removed++; continue; }
      kept.push(channel);
    }
    const samplerOrder = [...new Set(kept.map(channel => channel.sampler))];
    animation.samplers = samplerOrder.map(index => animation.samplers[index]);
    animation.channels = kept.map(channel => ({ ...channel, sampler: samplerOrder.indexOf(channel.sampler) }));
  }
  return removed;
}

/**
 * Shrinks embedded images whose longer side is above `max` pixels. A PNG with
 * nothing see-through in it is written as a JPEG, which is about a tenth of the
 * size for a painted skin; a PNG that really uses its transparency stays a PNG.
 */
export async function shrinkImages(doc, max) {
  const { default: sharp } = await import('sharp');
  const report = [];
  for (const image of doc.json.images || []) {
    if (image.bufferView === undefined) continue;
    const view = doc.views[image.bufferView];
    const meta = await sharp(view.bytes).metadata();
    const before = { width: meta.width, height: meta.height, bytes: view.bytes.length, type: image.mimeType };
    const isPng = image.mimeType === 'image/png';
    let opaque = !meta.hasAlpha;
    if (isPng && meta.hasAlpha) {
      const stats = await sharp(view.bytes).stats();
      opaque = stats.channels[stats.channels.length - 1].min === 255;
    }
    const tooBig = Math.max(meta.width, meta.height) > max;
    if (!tooBig && !(isPng && opaque)) { report.push({ before, after: before }); continue; }
    let pipeline = sharp(view.bytes);
    if (tooBig) pipeline = pipeline.resize({ width: max, height: max, fit: 'inside' });
    const keepPng = isPng && !opaque;
    const bytes = keepPng
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
      : await pipeline.removeAlpha().jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    view.bytes = bytes;
    if (!keepPng) image.mimeType = 'image/jpeg';
    const after = await sharp(bytes).metadata();
    report.push({ before, after: { width: after.width, height: after.height, bytes: bytes.length, type: image.mimeType } });
  }
  return report;
}

/** Width and height of a JPEG or PNG from its header, or null. */
export function imageSize(bytes) {
  if (bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length && bytes[offset] === 0xff) {
      const marker = bytes[offset + 1];
      const isFrameHeader = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrameHeader) return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      offset += 2 + bytes.readUInt16BE(offset + 2);
    }
  }
  return null;
}

/** What the packed file holds, for the report and for the checks below. */
export function describe(doc) {
  const { json } = doc;
  let triangles = 0;
  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      const count = json.accessors[primitive.indices ?? primitive.attributes.POSITION].count;
      triangles += Math.floor(count / 3);
    }
  }
  const clips = (json.animations || []).map(animation => ({
    name: animation.name,
    channels: animation.channels.length,
    seconds: Math.max(0, ...animation.samplers.map(sampler => json.accessors[sampler.input].max?.[0] ?? 0)),
  }));
  return {
    meshes: (json.meshes || []).length,
    primitives: (json.meshes || []).reduce((sum, mesh) => sum + (mesh.primitives || []).length, 0),
    triangles,
    materials: (json.materials || []).length,
    joints: json.skins?.[0]?.joints?.length ?? 0,
    clips,
    images: (json.images || []).filter(image => image.bufferView !== undefined).map(image => {
      const bytes = doc.views[image.bufferView].bytes;
      return { ...(imageSize(bytes) || { width: 0, height: 0 }), bytes: bytes.length };
    }),
  };
}

/** Problems with a written file: every index in range, every slice inside its view. */
export function glbProblems(bytes) {
  const problems = [];
  const doc = readGlb(bytes);
  const { json, views } = doc;
  (json.accessors || []).forEach((accessor, index) => {
    if (accessor.bufferView === undefined) return;
    const view = views[accessor.bufferView];
    if (!view) { problems.push('accessor ' + index + ' names a missing buffer view'); return; }
    const size = TYPE_SIZE[accessor.type] * COMPONENT_BYTES[accessor.componentType];
    const stride = view.byteStride || size;
    const end = (accessor.byteOffset || 0) + (accessor.count - 1) * stride + size;
    if (end > view.bytes.length) problems.push('accessor ' + index + ' runs past its buffer view');
  });
  for (const animation of json.animations || []) {
    for (const channel of animation.channels) {
      if (!json.nodes[channel.target.node]) problems.push('clip ' + animation.name + ' moves a missing node');
      const sampler = animation.samplers[channel.sampler];
      if (!sampler) { problems.push('clip ' + animation.name + ' has a channel without a sampler'); continue; }
      const input = json.accessors[sampler.input];
      const output = json.accessors[sampler.output];
      if (!input || !output) { problems.push('clip ' + animation.name + ' names a missing accessor'); continue; }
      const perKey = sampler.interpolation === 'CUBICSPLINE' ? 3 : 1;
      if (output.count !== input.count * perKey) problems.push('clip ' + animation.name + ': keys and values differ in number');
    }
  }
  for (const image of json.images || []) {
    if (image.bufferView !== undefined && !views[image.bufferView]) problems.push('an image names a missing buffer view');
  }
  return problems;
}

function parseArguments(argv) {
  const options = { clips: [], renames: [], prune: true };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(flag + ' needs a value');
      return argv[++i];
    };
    if (flag === '--in') options.input = value();
    else if (flag === '--out') options.output = value();
    else if (flag === '--clip') {
      const [name, rest] = value().split(/=(.*)/s);
      const [file, clip] = rest.split(/#(.*)/s);
      options.clips.push({ name, file, clip: clip || undefined });
    } else if (flag === '--rename') {
      const [from, to] = value().split(/=(.*)/s);
      options.renames.push({ from, to });
    } else if (flag === '--keep') options.keep = value().split(',').map(name => name.trim()).filter(Boolean);
    else if (flag === '--texture-max') options.textureMax = Number(value());
    else if (flag === '--no-prune') options.prune = false;
    else throw new Error('unknown option ' + flag);
  }
  if (!options.input || !options.output) throw new Error('--in and --out are required');
  return options;
}

async function main(argv) {
  const options = parseArguments(argv);
  const doc = readGlb(readFileSync(options.input));
  for (const { from, to } of options.renames) {
    const animation = (doc.json.animations || []).find(a => a.name === from);
    if (!animation) throw new Error('clip ' + from + ' not found in ' + options.input);
    animation.name = to;
  }
  for (const extra of options.clips) {
    const result = copyClip(doc, readGlb(readFileSync(extra.file)), { name: extra.name, clip: extra.clip });
    console.log('clip ' + extra.name + ': ' + result.copied + ' channels copied'
      + (result.skipped.length ? ', no bone for ' + result.skipped.join(', ') : ''));
  }
  if (options.keep) {
    const byName = new Map((doc.json.animations || []).map(animation => [animation.name, animation]));
    doc.json.animations = options.keep.map(name => {
      if (!byName.has(name)) throw new Error('clip ' + name + ' is not in the file');
      return byName.get(name);
    });
  }
  if (options.prune) console.log('channels that never leave the rest pose, removed: ' + pruneRestChannels(doc));
  if (options.textureMax) {
    for (const { before, after } of await shrinkImages(doc, options.textureMax)) {
      console.log('image ' + before.width + 'x' + before.height + ' (' + Math.round(before.bytes / 1024) + ' KB) -> '
        + after.width + 'x' + after.height + ' (' + Math.round(after.bytes / 1024) + ' KB)');
    }
  }
  doc.json.asset = { ...doc.json.asset, extras: { ...doc.json.asset?.extras, packedBy: 'tools/threeroads/cast/pack-character.mjs' } };
  const bytes = writeGlb(doc);
  const problems = glbProblems(bytes);
  if (problems.length) throw new Error('the packed file is not sound:\n  ' + problems.join('\n  '));
  writeFileSync(options.output, bytes);
  const summary = describe(readGlb(bytes));
  console.log(options.output + ': ' + (bytes.length / 1048576).toFixed(2) + ' MB, ' + summary.triangles + ' triangles, '
    + summary.primitives + ' draw call(s), ' + summary.joints + ' bones');
  for (const clip of summary.clips) console.log('  ' + clip.name + ': ' + clip.seconds.toFixed(2) + ' s, ' + clip.channels + ' channels');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
