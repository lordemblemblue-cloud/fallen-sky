import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENES,TARGETS} from './referenceTargets.mjs';
import {globalNatureTileKey,auditNatureStudyTiles,PROVISIONAL_WS01_MAP_BLOB_SHA}
 from './natureTileCoverage.mjs';

// Exact source-local B03 scene rectangles/centers from WS01's provisional
// COORDINATE_MAP_V1.json (blob d84b...). These are study views, not chunks.
const viewFixture={
 status:'SOURCE_DERIVED_WITH_PROPOSED_SCENE_BOUNDS',
 scenes:SCENES.map(s=>({id:s.id,
  canonical_center_xz_m:[s.centerXmm/1000,s.centerZmm/1000],
  bbox_local_m:[(s.centerXmm-50000)/1000,(s.centerXmm+50000)/1000,
   (s.centerZmm-50000)/1000,(s.centerZmm+50000)/1000],
 })),
};
const check=()=>auditNatureStudyTiles({coordinateMap:viewFixture,coordinateMapBlobSha:PROVISIONAL_WS01_MAP_BLOB_SHA});

test('signed global tile keys use Math.floor and do not clamp outside 500m core',()=>{
 assert.equal(globalNatureTileKey(-320000,65000),'G-X-032-Z+006');
 assert.equal(globalNatureTileKey(-1,-1),'G-X-001-Z-001');
 assert.equal(globalNatureTileKey(0,0),'G-X+000-Z+000');
 assert.equal(globalNatureTileKey(9999,-10000),'G-X+000-Z-001');
 assert.throws(()=>globalNatureTileKey(1.4,0),/integer/);
});
test('all 19 referenced nature object envelopes fit within home study view',()=>{
 const report=check();
 assert.equal(report.checkedTargets,19);
 assert.deepEqual(report.homeStudyViewWarnings,[]);
 assert.equal(report.geometryActivated,false);
 assert.equal(report.viewerTransformApplied,false);
});
test('15 of 19 nature targets extend beyond the 500m authoring core; none beyond 1100m preview',()=>{
 const report=check();
 assert.equal(report.outside500mAuthoringCoreCount,15);
 assert.equal(report.outside1100mPreviewCount,0);
});
test('source scene study rectangles overlap S24 black pine and S30 maple canopy views',()=>{
 const report=check();
 assert.deepEqual(report.crossDetailedSceneViews.map(f=>[f.sourceId,f.intersectsOtherDetailedStudySceneIds]),[
  ['S24-BLACK_PINE',[30]],['S30-LANTERN_GROVE',[24]],
 ]);
});
test('negative-boundary tile coverage uses half-open edges and actual object footprints',()=>{
 const report=check();
 const cedar=report.findings.find(f=>f.sourceId==='S21-CEDAR_01');
 assert.equal(cedar.centerGlobalTile,'G-X-033-Z+007');
 assert.deepEqual(cedar.touchedGlobalTiles,[
  'G-X-033-Z+007',
 ]);
 const grass=report.findings.find(f=>f.sourceId==='S24-WILD_GRASS');
 assert.ok(grass.touchedGlobalTiles.length>=4);
 const single={id:'WV-S21-WS08-A',sceneId:21,sourceId:'S21-A',xMm:-320000,zMm:65000,widthMm:10000,depthMm:10000};
 const report2=auditNatureStudyTiles({coordinateMap:viewFixture,coordinateMapBlobSha:PROVISIONAL_WS01_MAP_BLOB_SHA,targets:[single]});
 assert.equal(report2.findings[0].touchedGlobalTiles.length,2); // +60m/+70m half-open Z edges
 const shifted={...single,id:'WV-S21-WS08-B',sourceId:'S21-B',zMm:64000};
 const report3=auditNatureStudyTiles({coordinateMap:viewFixture,coordinateMapBlobSha:PROVISIONAL_WS01_MAP_BLOB_SHA,targets:[shifted]});
 assert.equal(report3.findings[0].touchedGlobalTiles.length,4);
});
test('refuses altered provisional map, duplicate source IDs and frame shift',()=>{
 assert.throws(()=>auditNatureStudyTiles({coordinateMap:viewFixture}),/changed/);
 assert.throws(()=>auditNatureStudyTiles({coordinateMap:{...viewFixture,status:'APPROVED'},coordinateMapBlobSha:PROVISIONAL_WS01_MAP_BLOB_SHA}),/Require provisional/);
 assert.throws(()=>auditNatureStudyTiles({coordinateMap:viewFixture,coordinateMapBlobSha:PROVISIONAL_WS01_MAP_BLOB_SHA,targets:[TARGETS[0],TARGETS[0]]}),/Duplicate WS08/);
 const altered={...viewFixture,scenes:viewFixture.scenes.map(s=>s.id===21?{...s,canonical_center_xz_m:[s.canonical_center_xz_m[0],s.canonical_center_xz_m[1]+70]}:s)};
 assert.throws(()=>auditNatureStudyTiles({coordinateMap:altered,coordinateMapBlobSha:PROVISIONAL_WS01_MAP_BLOB_SHA}),/differs/);
});
test('source reference objects remain unchanged and are not turned into terrain chunks',()=>{
 const before=JSON.stringify(TARGETS);
 const r=check();
 assert.equal(JSON.stringify(TARGETS),before);
 assert.equal(r.chunkInstantiation,false);
 assert.equal(r.status,'PROVISIONAL_WS01_SOURCE_PLANNING_ONLY');
 assert.equal(r.coordinateMapBlobSha,PROVISIONAL_WS01_MAP_BLOB_SHA);
});
