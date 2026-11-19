// Adam's fused body was repaired in place by tools/avatar-repair/repair-adam-neck-mouth.mjs (closed mouth, clean
// neck seam, padded skin atlases). These guard what the rest of the game relies on: the mesh keeps its vertex counts
// and order (armor body masks, hair, tattoos and animations index into it), both files carry the same repaired mesh,
// the seam vertices shared by head and body bend together, and the lips stay closed.
// Run: node --test tests/game3d-adam-neck-mouth-repair.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readGlb, readAccessor } from '../tools/avatar-motion/glb-io.mjs';

const FILES = ['public/models/characters/fused/Male_Fused_v1.glb', 'public/models/characters/fused/Male_Fused_v2.glb'];
const load = (file) => {
  const glb = readGlb(file);
  const J = glb.json;
  const mesh = J.meshes[J.nodes.find((n) => n.name === 'Male_Body' && n.mesh !== undefined).mesh];
  const prim = (name) => mesh.primitives.find((p) => J.materials[p.material].name === name);
  return { glb, J, mesh, body: prim('Skin_Body'), head: prim('Skin_Head') };
};

test('both Adam files carry the repair and keep the mesh layout the armor masks and animations index into', () => {
  for (const file of FILES) {
    const { J, mesh, body, head } = load(file);
    assert.equal(J.asset.extras?.fusedBodyRepair?.version, 1, `${file}: repair marker`);
    assert.equal(J.accessors[body.attributes.POSITION].count, 40820, `${file}: body vertices`);
    assert.equal(J.accessors[head.attributes.POSITION].count, 9222, `${file}: head vertices`);
    assert.equal(J.accessors[body.indices].count, 42849, `${file}: body indices`);
    assert.equal(J.accessors[head.indices].count, 29541, `${file}: head indices`);
    assert.equal(mesh.extras.targetNames.length, 73, `${file}: shape keys`);
    assert.ok(mesh.extras.targetNames.includes('FX_JawOpen'));
  }
});

test('v1 (creator file) and v2 (world file) hold the same repaired mesh', () => {
  const [a, b] = FILES.map(load);
  for (const key of ['body', 'head']) for (const attr of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'WEIGHTS_0']) {
    const ra = readAccessor(a.glb, a[key].attributes[attr]), rb = readAccessor(b.glb, b[key].attributes[attr]);
    const max = Math.max(...ra.map((r, i) => Math.max(...r.map((x, k) => Math.abs(x - rb[i][k])))));
    assert.ok(max < 1e-6, `${key} ${attr} differs by ${max}`);
  }
});

test('the neck seam: every vertex the head and body share has the same skin weights on both sides', () => {
  const { glb, body, head } = load(FILES[1]);
  const read = (p) => ({ P: readAccessor(glb, p.attributes.POSITION), J: readAccessor(glb, p.attributes.JOINTS_0), W: readAccessor(glb, p.attributes.WEIGHTS_0) });
  const B = read(body), H = read(head);
  const key = (v) => v.map((x) => Math.round(x * 1e5)).join(',');
  const bodyAt = new Map();
  B.P.forEach((p, i) => { if (p[1] > 0.75) bodyAt.set(key(p), i); });
  let shared = 0;
  H.P.forEach((p, i) => {
    const j = bodyAt.get(key(p));
    if (j === undefined) return;
    shared++;
    const wb = new Map(B.J[j].map((jn, k) => [jn, B.W[j][k]])), wh = new Map(H.J[i].map((jn, k) => [jn, H.W[i][k]]));
    for (const [jn, w] of wh) if (w > 1e-4) assert.ok(Math.abs((wb.get(jn) || 0) - w) < 1e-4, `seam vertex ${i}: joint ${jn} ${w} vs ${wb.get(jn)}`);
  });
  assert.ok(shared >= 55, `${shared} shared seam vertices`);
});

test('the lips meet: no opening wider than 1.5 mm (model units) between them at the centre of the mouth', () => {
  const { glb, mesh, head } = load(FILES[1]);
  const P = readAccessor(glb, head.attributes.POSITION);
  const I = readAccessor(glb, head.indices).map((r) => (Array.isArray(r) ? r[0] : r));
  const D = readAccessor(glb, head.targets[mesh.extras.targetNames.indexOf('FX_JawOpen')].POSITION);
  const zmax = Math.max(...P.map((p) => p[2]));
  const jaw = P.filter((p, i) => Math.hypot(...D[i]) > 2e-5 && p[2] > zmax - 0.04);
  const xc = jaw.reduce((s, p) => s + p[0], 0) / jaw.length;
  const split = Math.max(...jaw.filter((p) => Math.abs(p[0] - xc) < 0.006).map((p) => p[1]));
  const tris = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = P[I[t]], b = P[I[t + 1]], c = P[I[t + 2]];
    if (Math.abs((a[0] + b[0] + c[0]) / 3 - xc) < 0.03 && Math.abs((a[1] + b[1] + c[1]) / 3 - split) < 0.03 && Math.max(a[2], b[2], c[2]) > zmax - 0.07) tris.push([a, b, c]);
  }
  const hit = (x, y) => {
    let best = -Infinity;
    for (const [a, b, c] of tris) {
      const v0x = b[0] - a[0], v0y = b[1] - a[1], v1x = c[0] - a[0], v1y = c[1] - a[1], den = v0x * v1y - v1x * v0y;
      if (Math.abs(den) < 1e-14) continue;
      const u = ((x - a[0]) * v1y - v1x * (y - a[1])) / den, v = (v0x * (y - a[1]) - (x - a[0]) * v0y) / den;
      if (u >= 0 && v >= 0 && u + v <= 1) best = Math.max(best, a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]));
    }
    return best;
  };
  // per column across the middle of the mouth, the longest run of rows that sit 0.8 mm behind the lips above and below
  let worst = 0;
  for (let x = xc - 0.012; x <= xc + 0.012; x += 0.002) {
    const rows = [];
    for (let y = split - 0.02; y <= split + 0.016; y += 0.0002) rows.push(hit(x, y));
    let run = 0;
    rows.forEach((z, i) => {
      const up = Math.max(...rows.slice(i + 1, i + 21)), dn = Math.max(...rows.slice(Math.max(0, i - 20), i));
      const pit = z !== -Infinity && Number.isFinite(up) && Number.isFinite(dn) && z < Math.min(up, dn) - 0.0008 && Math.abs(split - (split - 0.02 + i * 0.0002)) < 0.008;
      run = pit ? run + 1 : 0;
      worst = Math.max(worst, run * 0.0002);
    });
  }
  assert.ok(worst <= 0.0015, `widest opening ${worst.toFixed(4)}`);
});
