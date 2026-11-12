import test from 'node:test';
import assert from 'node:assert/strict';
import { TARGETS } from './referenceTargets.mjs';
import { natureFootprint, architectureFootprint,
  rectangleOverlapM2, auditWs08ArchitectureSeams } from './architectureSeamAudit.mjs';

// Read-only snapshots of four proposed WS07 envelopes at draft PR #950. They
// are NOT runtime geometry and need re-audit when that independent PR changes.
const proposal = (sourceObjectId, xMm, zMm, w, d) => ({
  id: 'WV-' + sourceObjectId.slice(0, 3) + '-WS07-' + sourceObjectId.slice(4),
  xMm, zMm, targetEnvelopeMm: [w, d, 1000],
});
const S24 = proposal('S24-TRAIL_STEPS', -42000, 361000, 3600, 16000);
const S26 = proposal('S26-WATER_LOOKOUT', 143000, 68000, 8400, 6200);
const S27 = proposal('S27-SAFE_FLOOR', -224000, 80000, 4100, 13400);
const S30 = proposal('S30-BATHHOUSE_EXT', -105000, 330000, 22000, 18000);

test('footprints require local integer millimetres and positive sizes', () => {
  assert.throws(() => natureFootprint({id:'a',xMm:0,zMm:0,widthMm:0,depthMm:1}), /requires/);
  assert.throws(() => architectureFootprint({id:'a',xMm:0.5,zMm:0,targetEnvelopeMm:[1,2,3]}), /requires/);
  assert.deepEqual(architectureFootprint(S24), {xMm:-42000,zMm:361000,widthMm:3600,depthMm:16000});
});

test('a touching rectangle edge has zero physical intersection area', () => {
  const a={xMm:0,zMm:0,widthMm:2000,depthMm:2000};
  const b={xMm:2000,zMm:0,widthMm:2000,depthMm:2000};
  assert.equal(rectangleOverlapM2(a,b),0);
  assert.equal(rectangleOverlapM2(a,b,500),1);
});

test('S24 meadow grasses intersect proposed WS07 trail steps by 29.7 m²', () => {
  const result = auditWs08ArchitectureSeams({architectureTargets:[S24]});
  assert.equal(result.exactOverlaps.length,1);
  assert.equal(result.exactOverlaps[0].overlapM2,29.7);
  assert.equal(result.exactOverlaps[0].natureSceneId,24);
  assert.equal(result.geometryActivated,false);
});

test('S26 wetland pebble bank is near, not intersecting, WS07 lookout at a proposed 2m buffer', () => {
  const result = auditWs08ArchitectureSeams({architectureTargets:[S26]});
  assert.equal(result.exactOverlaps.length,0);
  assert.ok(result.proximityReviews.some(p=>p.natureId.includes('S26')&&p.expandedOverlapM2>0));
});

test('S27 cave floor and S30 bathhouse need buffer review, not asserted collisions', () => {
  const result = auditWs08ArchitectureSeams({architectureTargets:[S27,S30]});
  assert.equal(result.exactOverlaps.length,0);
  assert.equal(result.proximityReviews.length,3);
  assert.equal(result.status,'SOURCE_ONLY_UNAPPROVED_NOT_PHYSICS_QA');
});

test('reject missing architecture inventory rather than falsely declaring no conflicts', () => {
  assert.throws(()=>auditWs08ArchitectureSeams(),/nonempty WS07/);
  assert.throws(()=>auditWs08ArchitectureSeams({architectureTargets:[]}),/nonempty WS07/);
  assert.throws(()=>auditWs08ArchitectureSeams({architectureTargets:[S24],reviewSetbackMm:-1}),/setback/);
});

test('comparing coordinates does not mutate frozen WS08 source targets or candidate objects', () => {
  const before=JSON.stringify(TARGETS);
  const records=[S24,S26,S27,S30].map(Object.freeze);
  Object.freeze(records);
  const result=auditWs08ArchitectureSeams({architectureTargets:records});
  assert.equal(JSON.stringify(TARGETS),before);
  assert.equal(result.pairsExamined,19*4);
  assert.equal(result.sceneTransformApplied,false);
  assert.equal(result.geometryActivated,false);
});

test('S30 proposed maple canopy has no exact bathhouse overlap but sits within 2m review buffer',()=>{
 const grove=TARGETS.find(t=>t.sourceId==='S30-LANTERN_GROVE');
 const result=auditWs08ArchitectureSeams({architectureTargets:[S30]});
 assert.equal(result.exactOverlaps.length,0);
 assert.ok(result.proximityReviews.some(p=>p.natureId===grove.id&&p.expandedOverlapM2>0));
 assert.equal(result.natureCount,19);
 assert.equal(result.geometryActivated,false);
});
