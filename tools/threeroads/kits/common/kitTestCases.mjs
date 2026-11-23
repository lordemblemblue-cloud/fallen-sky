// The checks every kit GLB must pass, as node:test cases. Each kit's test file
// calls defineKitTests('<kit>', test, assert).
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inspectKit, KITS, kitMaterials } from './kitInspect.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export function defineKitTests(kitId, test, assert) {
  const kit = KITS[kitId];
  const file = path.resolve(here, `../../../../public${kit.url}`);
  const report = inspectKit(readFileSync(file), kitId);
  const mats = kitMaterials(kitId);

  test(`${kitId} kit: the file is under its size limit`, () => {
    assert.ok(statSync(file).size <= kit.limits.maxBytes, `${statSync(file).size} bytes`);
  });

  test(`${kitId} kit: every piece is in the file as LOD0 and LOD1, and nothing else is`, () => {
    const names = new Set(report.rows.map(r => r.name));
    for (const entry of kit.pieces) {
      assert.ok(names.has(`${entry.id}_LOD0`), `${entry.id}_LOD0 missing`);
      assert.ok(names.has(`${entry.id}_LOD1`), `${entry.id}_LOD1 missing`);
    }
    assert.deepEqual(report.failures.filter(f => /not in the piece table|missing/.test(f)), []);
  });

  test(`${kitId} kit: every piece matches its table size and pivot, skirt included`, () => {
    assert.deepEqual(report.failures.filter(f => /size|spans|top at|hull bottom|moved/.test(f)), []);
  });

  test(`${kitId} kit: triangle limits per piece and for the whole kit`, () => {
    for (const r of report.rows) {
      const limit = r.lod === 0 ? kit.limits.maxTrianglesLod0PerPiece : kit.limits.maxTrianglesLod1PerPiece;
      assert.ok(r.triangles <= limit, `${r.name}: ${r.triangles} > ${limit}`);
    }
    assert.ok(report.totals.lod0 <= kit.limits.maxTrianglesLod0Total, `LOD0 total ${report.totals.lod0}`);
  });

  test(`${kitId} kit: two materials and one ${kit.limits.atlasPixels} atlas; glow only where the table says`, () => {
    const used = new Set(kit.pieces.map(p => (p.material === 'glow' ? mats.glow : mats.lit)));
    assert.deepEqual([...report.materials].sort(), [...used].sort());
    assert.equal(report.images.length, 1);
    assert.equal(report.images[0].width, kit.limits.atlasPixels);
    assert.equal(report.images[0].height, kit.limits.atlasPixels);
  });

  test(`${kitId} kit: the inspector reports no failures at all`, () => {
    assert.deepEqual(report.failures, []);
  });
}
