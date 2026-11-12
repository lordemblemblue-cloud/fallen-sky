import test from 'node:test';
import assert from 'node:assert/strict';
import {TARGETS} from './referenceTargets.mjs';
import {natureRectangleLocalMeters,clipNatureRoadSegment,auditNatureRoadCenterlines}
 from './natureRoadCenterlineAudit.mjs';

// Exact source controls taken from main WolfveilLayout.js blob
// b4b10dd15737d62c62a476e500adb433a6d015b6.
// The full source catalog integration test must be run before G0 acceptance.
const routes=[
 {id:'west_woodland_fork',width:2.7,points:[[-135,-105],[-230,-35],[-320,65],[-335,145],[-325,235]]},
 {id:'ridge_path',width:2.8,points:[[4,220],[-55,265],[-105,330],[0,470],[35,680]]},
];
const by=id=>TARGETS.find(t=>t.sourceId===id);

test('S21 moss boulder exact centerline incursion matches independent WS12 report',()=>{
 const r=auditNatureRoadCenterlines({routes,targets:[by('S21-MOSS_BOULDER')]});
 assert.equal(r.centerlineIntersectionCount,1);
 const hit=r.conflicts[0];
 assert.equal(hit.routeId,'west_woodland_fork');
 assert.equal(hit.totalCenterlineIntersectionM,3.66985);
 assert.deepEqual(hit.segments[0].entry,[-310.145,54.05]);
 assert.deepEqual(hit.segments[0].exit,[-312.6,56.777778]);
 assert.equal(hit.solidColliderAuthorized,false);
});
test('S24 black pine cross-corridor analysis catches second source direct intersection',()=>{
 const r=auditNatureRoadCenterlines({routes,targets:[by('S24-BLACK_PINE')]});
 assert.equal(r.centerlineIntersectionCount,1);
 assert.equal(r.conflicts[0].routeId,'ridge_path');
 assert.equal(r.conflicts[0].totalCenterlineIntersectionM,6.375);
 assert.equal(r.actorTravelVerified,false);
});
test('nearby cedar warning is not a direct centerline crossing',()=>{
 const r=auditNatureRoadCenterlines({routes,targets:[by('S21-CEDAR_01')]});
 assert.equal(r.centerlineIntersectionCount,0);
 assert.equal(r.routesReviewed,2);
 assert.equal(r.targetsReviewed,1);
});
test('simple clipping tests corner tangency, boundary segment and parallel miss',()=>{
 const b={minX:0,maxX:10,minZ:0,maxZ:5};
 assert.equal(clipNatureRoadSegment([-5,-5],[0,0],b),null);
 assert.equal(clipNatureRoadSegment([-5,5],[15,5],b).segmentDistanceM,10);
 assert.equal(clipNatureRoadSegment([-5,6],[15,6],b),null);
 assert.equal(clipNatureRoadSegment([0,0],[0,0],b),null);
 assert.equal(clipNatureRoadSegment([-5,2.5],[15,2.5],b).segmentDistanceM,10);
});
test('original local-mm rectangle and viewer-independent axes are preserved',()=>{
 const p=by('S21-MOSS_BOULDER'),b=natureRectangleLocalMeters(p);
 assert.deepEqual(b,{minX:-312.6,maxX:-307.4,minZ:54.05,maxZ:57.95});
 const before=JSON.stringify({routes,TARGETS});
 const report=auditNatureRoadCenterlines({routes});
 assert.equal(JSON.stringify({routes,TARGETS}),before);
 assert.equal(report.geometryActivated,false);
 assert.equal(report.routeModified,false);
 assert.equal(report.centerShiftApplied,false);
});
test('missing or duplicate roads, invalid targets, coordinate noise fail closed',()=>{
 assert.throws(()=>auditNatureRoadCenterlines(),/complete existing/);
 assert.throws(()=>auditNatureRoadCenterlines({routes:[routes[0],routes[0]]}),/Invalid or duplicated existing/);
 assert.throws(()=>auditNatureRoadCenterlines({routes,targets:[by('S21-MOSS_BOULDER'),by('S21-MOSS_BOULDER')]}),/Invalid or duplicated WS08/);
 assert.throws(()=>clipNatureRoadSegment([0,NaN],[1,1],{minX:0,maxX:1,minZ:0,maxZ:1}),/Invalid road/);
});
