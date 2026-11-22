/* global URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { inspectValleyKit, LIT_MATERIAL, GLOW_MATERIAL } from '../tools/threeroads/kits/valley/valleyKitInspect.mjs';
import {
  VALLEY_KIT_PIECES, VALLEY_KIT_LIMITS, VALLEY_KIT_URL,
} from '../src/components/game3d/threeroads/kits/valleyKitPieces.mjs';

const FILE = new URL(`../public${VALLEY_KIT_URL}`, import.meta.url);
const report = inspectValleyKit(readFileSync(FILE));

test('the valley kit file is under its size limit', () => {
  assert.ok(statSync(FILE).size <= VALLEY_KIT_LIMITS.maxBytes, `${statSync(FILE).size} bytes`);
});

test('every piece in the table is in the file as LOD0 and LOD1, and nothing else is', () => {
  const names = new Set(report.rows.map(r => r.name));
  for (const entry of VALLEY_KIT_PIECES) {
    assert.ok(names.has(`${entry.id}_LOD0`), `${entry.id}_LOD0 missing`);
    assert.ok(names.has(`${entry.id}_LOD1`), `${entry.id}_LOD1 missing`);
  }
  const misnamed = report.failures.filter(f => f.includes('not in the piece table') || f.includes('missing'));
  assert.deepEqual(misnamed, []);
});

test('every piece matches its table size within 5 percent and stands on its pivot', () => {
  const wrong = report.failures.filter(f => /size|pivot|centre|moved/.test(f));
  assert.deepEqual(wrong, []);
});

test('triangle limits per piece and for the whole kit', () => {
  for (const r of report.rows) {
    const limit = r.lod === 0 ? VALLEY_KIT_LIMITS.maxTrianglesLod0PerPiece : VALLEY_KIT_LIMITS.maxTrianglesLod1PerPiece;
    assert.ok(r.triangles <= limit, `${r.name}: ${r.triangles} > ${limit}`);
  }
  assert.ok(report.totals.lod0 <= VALLEY_KIT_LIMITS.maxTrianglesLod0Total, `LOD0 total ${report.totals.lod0}`);
});

test('two materials and one 2048 atlas for the whole kit; glow only where the table says', () => {
  assert.deepEqual([...report.materials].sort(), [GLOW_MATERIAL, LIT_MATERIAL].sort());
  assert.equal(report.images.length, 1);
  assert.equal(report.images[0].width, VALLEY_KIT_LIMITS.atlasPixels);
  assert.equal(report.images[0].height, VALLEY_KIT_LIMITS.atlasPixels);
  for (const r of report.rows) {
    const entry = VALLEY_KIT_PIECES.find(p => p.id === r.id);
    assert.deepEqual(r.materials, [entry.material === 'glow' ? GLOW_MATERIAL : LIT_MATERIAL], r.name);
  }
});

test('the inspector reports no failures at all', () => {
  assert.deepEqual(report.failures, []);
});
