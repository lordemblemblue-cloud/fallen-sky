import test from 'node:test';
import assert from 'node:assert/strict';
import {WOLFVEIL_ROUTES,WOLFVEIL_BUILDINGS,WOLFVEIL_HOUSING_PLOTS,WOLFVEIL_RIVER} from '../../../../WolfveilLayout.js';
import {TARGETS} from './referenceTargets.mjs';
import {auditWs08SourceClearance} from './sourceClearanceAudit.mjs';

/** WS08 source-only full-layout review, NOT runtime collision evidence.
 * Compared to main WolfveilLayout.js blob b4b10dd15737d62c62a476e500adb433a6d015b6.
 * Updates to existing layout require explicit re-review, not auto-updating expected IDs.
 */
const sources=()=>({routes:WOLFVEIL_ROUTES,buildings:WOLFVEIL_BUILDINGS,
 housingPlots:WOLFVEIL_HOUSING_PLOTS,river:WOLFVEIL_RIVER});
const expected={
 'S21-CEDAR_01':['west_woodland_fork'],
 'S21-MOSS_BOULDER':['west_woodland_fork'],
 'S22-WOLF_STONE':['west_woodland_fork'],
 'S24-BLACK_PINE':['ridge_path'],
 'S26-REED_CLUSTER':[],
 'S26-PEBBLE_BANK':[],
 'S28-ROOT_ARCH':['west_woodland_fork'],
 'S30-LANTERN_GROVE':['ridge_path'],
};
test('actual protected catalog count and full source audit are consistent',()=>{
 const a=auditWs08SourceClearance(sources());
 assert.deepEqual([TARGETS.length,WOLFVEIL_ROUTES.length,WOLFVEIL_BUILDINGS.length,
  WOLFVEIL_HOUSING_PLOTS.length,WOLFVEIL_RIVER.points.length],[19,10,30,24,17]);
 assert.deepEqual([a.checkedTargets,a.checkedRoutes,a.checkedBuildings,a.checkedHousingPlots],[19,10,30,24]);
 assert.equal(a.activation,false);
 assert.equal(a.coordinateShiftApplied,false);
});
test('all eight full-layout candidate review flags remain source-only',()=>{
 const a=auditWs08SourceClearance(sources());
 assert.deepEqual(a.findings.map(f=>f.sourceId).sort(),Object.keys(expected).sort());
 for(const f of a.findings){
  assert.deepEqual(f.routeReviews,expected[f.sourceId]);
  assert.equal(f.riverReview,f.sourceId==='S26-REED_CLUSTER'||f.sourceId==='S26-PEBBLE_BANK');
  assert.equal(f.status,'AUTHORING_CLEARANCE_REVIEW_ONLY');
 }
});
test('all 30 protected buildings and 24 housing plots have zero WS08 plan-view overlaps',()=>{
 const a=auditWs08SourceClearance(sources());
 assert.ok(a.findings.every(f=>f.buildingOverlaps.length===0&&f.housingOverlaps.length===0));
 assert.equal(a.planningSetbackM,2); // Proposed, not game physics or navigable setback.
});
test('full-catalog review does not mutate source layout or flora targets',()=>{
 const before=JSON.stringify(sources()),targetsBefore=JSON.stringify(TARGETS);
 const a=auditWs08SourceClearance(sources());
 assert.equal(JSON.stringify(sources()),before);
 assert.equal(JSON.stringify(TARGETS),targetsBefore);
 assert.equal(a.status,'SOURCE_ONLY_NO_RUNTIME_COLLISION_EVIDENCE');
});
