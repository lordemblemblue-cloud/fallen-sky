// The files of the Three Roads cast (public/game3d/threeroads/cast/<person_id>.glb)
// and the tool that packs them. The rules checked here are the "People" rules of
// docs/game3d/three-empires/BUILD_RULES.md.
import './fixtures/three-roads-sample/install.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  copyClip, describe, glbProblems, imageSize, pruneRestChannels, readGlb, writeGlb,
} from '../tools/threeroads/cast/pack-character.mjs';
import { threeRoadsPerson } from '../src/components/game3d/threeroads/script/cast.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const castFolder = join(root, 'public', 'game3d', 'threeroads', 'cast');
const castFiles = existsSync(castFolder) ? readdirSync(castFolder).filter(name => name.endsWith('.glb')) : [];

const floats = values => {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
  return bytes;
};
const readFloats = bytes => Array.from({ length: bytes.length / 4 }, (_, index) => bytes.readFloatLE(index * 4));
const accessor = (view, count, type, extra = {}) => ({ bufferView: view, componentType: 5126, count, type, ...extra });
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

// A two-bone body with one triangle and an Idle clip: the hips turn, the spine's
// scale channel only repeats the rest pose. One accessor (index 5) is used by nothing.
function body() {
  return {
    json: {
      asset: { version: '2.0' },
      scenes: [{ nodes: [0] }],
      nodes: [
        { name: 'Armature', children: [1, 3] },
        { name: 'Hips', translation: [0, 1, 0], children: [2] },
        { name: 'Spine' },
        { name: 'skin', mesh: 0, skin: 0 },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      skins: [{ joints: [1, 2], inverseBindMatrices: 1 }],
      accessors: [
        accessor(0, 3, 'VEC3', { min: [0, 0, 0], max: [1, 1, 0] }),
        accessor(1, 2, 'MAT4'),
        accessor(2, 2, 'SCALAR', { min: [0], max: [1] }),
        accessor(3, 2, 'VEC4'),
        accessor(4, 2, 'VEC3'),
        accessor(5, 1, 'SCALAR'),
      ],
      animations: [{
        name: 'Idle',
        samplers: [{ input: 2, output: 3 }, { input: 2, output: 4 }],
        channels: [
          { sampler: 0, target: { node: 1, path: 'rotation' } },
          { sampler: 1, target: { node: 2, path: 'scale' } },
        ],
      }],
    },
    views: [
      { bytes: floats([0, 0, 0, 1, 0, 0, 0, 1, 0]) },
      { bytes: floats([...IDENTITY, ...IDENTITY]) },
      { bytes: floats([0, 1]) },
      { bytes: floats([0, 0, 0, 1, 0, 0.7071068, 0, 0.7071068]) },
      { bytes: floats([1, 1, 1, 1, 1, 1]) },
      { bytes: floats([42]) },
    ],
  };
}

// The same bones in another order, plus one the body does not have.
function walkFile() {
  return {
    json: {
      asset: { version: '2.0' },
      nodes: [{ name: 'Spine' }, { name: 'Hips', translation: [0, 1, 0] }, { name: 'Tail' }],
      accessors: [
        accessor(0, 3, 'SCALAR', { min: [0], max: [1] }),
        accessor(1, 3, 'VEC3'),
        accessor(2, 3, 'VEC4'),
      ],
      animations: [{
        name: 'Armature|walking_man|baselayer',
        samplers: [{ input: 0, output: 1 }, { input: 0, output: 2 }],
        channels: [
          { sampler: 0, target: { node: 1, path: 'translation' } },
          { sampler: 1, target: { node: 2, path: 'rotation' } },
        ],
      }],
    },
    views: [
      { bytes: floats([0, 0.5, 1]) },
      { bytes: floats([0, 1, 0, 0, 1.05, 0, 0, 1, 0]) },
      { bytes: floats([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]) },
    ],
  };
}

test('a clip copied from another file lands on the bones of the same name', () => {
  const doc = body();
  const result = copyClip(doc, walkFile(), { name: 'Walk' });
  assert.equal(result.copied, 1);
  assert.deepEqual(result.skipped, ['Tail']);
  const walk = doc.json.animations.find(animation => animation.name === 'Walk');
  assert.equal(walk.channels.length, 1);
  assert.deepEqual(walk.channels[0].target, { node: 1, path: 'translation' });
  const output = doc.json.accessors[walk.samplers[0].output];
  assert.deepEqual(readFloats(doc.views[output.bufferView].bytes).map(v => +v.toFixed(3)), [0, 1, 0, 0, 1.05, 0, 0, 1, 0]);
});

test('a clip with no matching bone is refused', () => {
  const source = walkFile();
  source.json.nodes.forEach((node, index) => { node.name = 'Other' + index; });
  assert.throws(() => copyClip(body(), source, { name: 'Walk' }), /no bone/);
});

test('channels that only repeat the rest pose are dropped, the rest are kept', () => {
  const doc = body();
  assert.equal(pruneRestChannels(doc), 1);
  const idle = doc.json.animations[0];
  assert.equal(idle.channels.length, 1);
  assert.equal(idle.samplers.length, 1);
  assert.deepEqual(idle.channels[0], { sampler: 0, target: { node: 1, path: 'rotation' } });
  // A translation that sits still away from the rest pose is a pose, not noise.
  const held = body();
  held.json.animations[0].channels[1] = { sampler: 1, target: { node: 1, path: 'translation' } };
  assert.equal(pruneRestChannels(held), 0);
});

test('the written file is sound and carries only what is used', () => {
  const doc = body();
  copyClip(doc, walkFile(), { name: 'Walk' });
  pruneRestChannels(doc);
  const bytes = writeGlb(doc);
  assert.deepEqual(glbProblems(bytes), []);
  const back = readGlb(bytes);
  // POSITION, bind matrices, Idle time and turn, Walk time and move: six. The
  // unused accessor and the pruned scale values are gone.
  assert.equal(back.json.accessors.length, 6);
  assert.equal(back.views.length, 6);
  const info = describe(back);
  assert.equal(info.triangles, 1);
  assert.equal(info.joints, 2);
  assert.deepEqual(info.clips.map(clip => [clip.name, clip.channels, clip.seconds]), [['Idle', 1, 1], ['Walk', 1, 1]]);
  const walk = back.json.animations[1];
  const output = back.json.accessors[walk.samplers[walk.channels[0].sampler].output];
  assert.deepEqual(readFloats(back.views[output.bufferView].bytes).map(v => +v.toFixed(3)), [0, 1, 0, 0, 1.05, 0, 0, 1, 0]);
  assert.equal(bytes.length % 4, 0);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
});

test('image sizes are read from PNG and JPEG headers', () => {
  const png = Buffer.alloc(32);
  png.writeUInt32BE(0x89504e47, 0);
  png.writeUInt32BE(640, 16);
  png.writeUInt32BE(480, 20);
  assert.deepEqual(imageSize(png), { width: 640, height: 480 });
  // SOI, one application segment of 4 bytes, then a frame header 300 wide and 200 high.
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xc8, 0x01, 0x2c, 0x03, 0x00, 0x00]);
  assert.deepEqual(imageSize(jpeg), { width: 300, height: 200 });
  assert.equal(imageSize(Buffer.from('not an image')), null);
});

test('every cast file keeps the rules for people', () => {
  for (const file of castFiles) {
    const id = file.slice(0, -'.glb'.length);
    assert.ok(threeRoadsPerson(id), file + ' is not named after a person of the cast');
    const bytes = readFileSync(join(castFolder, file));
    assert.deepEqual(glbProblems(bytes), [], file);
    const info = describe(readGlb(bytes));
    assert.equal(info.primitives, 1, file + ': one draw call');
    assert.equal(info.materials, 1, file + ': one material');
    assert.ok(info.triangles <= 15000, file + ': ' + info.triangles + ' triangles');
    assert.ok(info.joints > 0, file + ': a skeleton');
    for (const clip of ['Idle', 'Talk', 'Walk']) {
      assert.ok(info.clips.some(entry => entry.name === clip && entry.seconds > 0.2), file + ': clip ' + clip);
    }
    assert.equal(info.images.length, 1, file + ': one texture');
    for (const image of info.images) {
      assert.ok(image.width > 0 && Math.max(image.width, image.height) <= 1024, file + ': texture ' + image.width + 'x' + image.height);
    }
    assert.ok(bytes.length <= 2 * 1048576, file + ': ' + bytes.length + ' bytes');
  }
});
