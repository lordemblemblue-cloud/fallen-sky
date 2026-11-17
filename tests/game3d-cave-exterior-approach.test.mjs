import test from 'node:test';
import assert from 'node:assert/strict';
import { entrance } from '../src/components/game3d/cave/caveLayout.js';
import {
  approachHalfWidth, approachPointDistance, getAshenCliffApproach,
} from '../src/components/game3d/cave/exterior/approachPlan.js';
import { solidClearance } from '../src/components/game3d/cave/exterior/collision.js';
import { ensureCaveExteriorGrade } from '../src/components/game3d/cave/exterior/terrainGrade.js';
import { createCaveExteriorMaterials } from '../src/components/game3d/cave/exterior/materials.js';
import { wolfveilHeight } from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import { wolfveilForestTrunkColliders } from '../src/components/game3d/wolfveil/WolfveilForestLayout.js';

const approach = getAshenCliffApproach();

function walk(offset = 0) {
  const samples = [];
  const points = approach.points;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dz = b.z - a.z, dy = b.y - a.y;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) continue;
    const steps = Math.max(1, Math.ceil(len / 0.4));
    const lx = -dz / len, lz = dx / len;
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      samples.push({
        x: a.x + dx * t + lx * offset,
        z: a.z + dz * t + lz * offset,
        y: a.y + dy * t,
        rise: Math.abs(dy) / len,
        kind: b.kind,
      });
    }
  }
  return samples;
}

test('entrance anchor is the shared handoff into the interior', () => {
  assert.equal(entrance, approach.entrance);
  assert.equal(entrance.id, 'ashen_cliff_mouth');
  assert.equal(entrance.name, 'Ashen Cliff Mouth');
  for (const point of [entrance.position, entrance.interiorStart]) {
    assert.ok([point.x, point.y, point.z].every(Number.isFinite));
  }
  const along = (entrance.interiorStart.x - entrance.position.x) * entrance.inward.x
    + (entrance.interiorStart.z - entrance.position.z) * entrance.inward.z;
  assert.ok(along > 5 && along < 6.2, 'interior starts a few metres inside the mouth');
  assert.ok(Math.abs(entrance.interiorStart.y - entrance.position.y) < 0.45);
  assert.ok(entrance.opening.width >= 4 && entrance.opening.height >= 4);
  assert.equal(entrance.worldOffsetZ, 70);
});

test('the path leaves the quarry trail and stays walkable into the mouth', () => {
  const points = approach.points;
  const start = points[0];
  assert.ok(Math.hypot(start.x - 350, start.z + 40) < 1, 'starts on the Quarry Approach');
  assert.ok(points.some(point => point.kind === 'threshold'));
  assert.equal(points.at(-1).kind, 'interior');
  let maxGrade = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const run = Math.hypot(b.x - a.x, b.z - a.z);
    assert.ok(run > 0.05);
    maxGrade = Math.max(maxGrade, Math.abs(b.y - a.y) / run);
  }
  assert.ok(maxGrade <= 0.28, 'grade ' + maxGrade.toFixed(3) + ' is too steep to walk');

  let previous = null;
  for (const sample of walk(0)) {
    if (previous) {
      const step = Math.hypot(sample.x - previous.x, sample.z - previous.z);
      const rise = Math.abs(sample.y - previous.y);
      assert.ok(rise <= 0.2, 'foot rise ' + rise.toFixed(3) + ' over ' + step.toFixed(2) + 'm');
    }
    assert.ok(solidClearance(sample.x, sample.z, approach.solids) >= 0.85,
      'centre of the path is blocked near ' + sample.x.toFixed(1) + ',' + sample.z.toFixed(1));
    previous = sample;
  }
  for (const offset of [-0.9, 0.9]) {
    for (const sample of walk(offset)) {
      assert.ok(solidClearance(sample.x, sample.z, approach.solids) >= 0.7);
      const half = approachHalfWidth(0, sample.kind);
      assert.ok(Math.abs(offset) < half);
    }
  }
});

test('graded terrain matches the ribbon and the cliff rises beside the mouth', () => {
  ensureCaveExteriorGrade();
  const mouth = entrance.position;
  const floor = wolfveilHeight(mouth.x, mouth.z);
  assert.ok(Math.abs(floor - mouth.y) < 0.35, 'mouth floor ' + floor.toFixed(2));
  const side = wolfveilHeight(mouth.x + 1, mouth.z + 8);
  assert.ok(side > mouth.y + 3.5, 'shoulder ' + side.toFixed(2) + ' should rise beside the arch');
  for (const sample of walk(0)) {
    if (sample.kind === 'turn') continue;
    const terrain = wolfveilHeight(sample.x, sample.z);
    assert.ok(Math.abs(terrain - sample.y) < 0.45,
      'terrain ' + terrain.toFixed(2) + ' vs path ' + sample.y.toFixed(2));
  }
  const interior = entrance.interiorStart;
  assert.ok(Math.abs(wolfveilHeight(interior.x, interior.z) - interior.y) < 0.45);
});

test('trees and props stay off the tread', () => {
  const trunks = wolfveilForestTrunkColliders();
  for (const sample of walk(0)) {
    for (const tree of trunks) {
      assert.ok(Math.hypot(sample.x - tree.x, sample.z - tree.z) > tree.radius + 1.1);
    }
  }
  for (const prop of approach.props) {
    const near = approachPointDistance(prop.x, prop.z, approach);
    assert.ok(near, prop.id + ' lost the path');
    if (prop.kind === 'ring' || prop.kind === 'tooth') continue;
    assert.ok(near.d > 2.6, prop.id + ' sits on the tread at ' + near.d.toFixed(2));
  }
});

test('placeholder materials are one swap point until the materials module exists', () => {
  const materials = createCaveExteriorMaterials();
  assert.equal(materials.source, 'placeholder');
  for (const key of ['cliff', 'path', 'timber', 'torch', 'throat']) {
    assert.equal(materials[key].isMaterial, true, key);
  }
  materials.path.dispose();
  materials.cliff.dispose();
  materials.timber.dispose();
  materials.bronze.dispose();
  materials.moss.dispose();
  materials.torch.dispose();
  materials.ember.dispose();
  materials.throat.dispose();
  materials.sign.dispose();
  for (const texture of materials.ownedTextures) texture.dispose();
});
