import test from 'node:test';
import assert from 'node:assert/strict';
import {TARGETS} from './referenceTargets.mjs';
import {natureFootprintSurveyPoints,surveyNatureAnalyticalGround}
 from './natureAnalyticalGroundSurvey.mjs';

test('nine symmetric source-local survey points include exact center, edges and corners',()=>{
 const t={xMm:-20000,zMm:35000,widthMm:10000,depthMm:6000};
 assert.deepEqual(natureFootprintSurveyPoints(t),[
  [-20,35],[-25,32],[-25,38],[-15,32],[-15,38],
  [-25,35],[-15,35],[-20,32],[-20,38],
 ]);
});
test('flat model is proposed only; does not certify placement or physics',()=>{
 const report=surveyNatureAnalyticalGround({heightAt:()=>99});
 assert.equal(report.sampledPointCount,19*9);
 assert.equal(report.pointsPerNatureTarget,9);
 assert.equal(report.geometryActivated,false);
 assert.equal(report.terrainModified,false);
 assert.equal(report.physicalTerrainSurveyVerified,false);
 assert.ok(report.findings.every(f=>f.status==='SOURCE_HEIGHT_MODEL_ONLY_NOT_MESH_RAYCAST'));
});
test('a real 3m analytic gradient triggers review at 2m only as planning threshold',()=>{
 const t=TARGETS.find(x=>x.sourceId==='S24-WILD_GRASS');
 const source={...t,analyticalYmm:120000};
 const result=surveyNatureAnalyticalGround({
  targets:[source],heightAt:(x,z)=>120+(x-source.xMm/1000)*3/(source.widthMm/1000),
 });
 assert.ok(result.findings[0].sampledRangeMm>=3000);
 assert.ok(result.findings[0].reviewReasons.includes('ANALYTIC_GROUND_VARIATION'));
 assert.equal(result.findings[0].centerReferenceDifferenceMm,0);
});
test('cave interiors, wetland water edge and grove ownership remain explicitly blocked',()=>{
 const report=surveyNatureAnalyticalGround({heightAt:()=>100});
 assert.ok(report.findings.filter(f=>[27,28].includes(f.sceneId)).every(f=>
  f.reviewReasons.includes('EXTERIOR_SURFACE_NOT_CAVE_FLOOR')));
 assert.ok(report.findings.filter(f=>f.sceneId===26).every(f=>
  f.reviewReasons.includes('WS02_WATER_EDGE_UNVERIFIED')));
 assert.ok(report.findings.find(f=>f.sourceId==='S30-LANTERN_GROVE')
  .reviewReasons.includes('EXTERNAL_OWNER_APPROVAL_PENDING'));
});
test('rejects unsafe numerical samples and invalid reference dimensions',()=>{
 assert.throws(()=>surveyNatureAnalyticalGround(),/height function/);
 assert.throws(()=>surveyNatureAnalyticalGround({heightAt:()=>Infinity}),/Nonfinite/);
 assert.throws(()=>surveyNatureAnalyticalGround({heightAt:()=>0,reviewRangeMm:-1}),/threshold/);
 assert.throws(()=>natureFootprintSurveyPoints({...TARGETS[0],widthMm:0}),/positive/);
 assert.throws(()=>surveyNatureAnalyticalGround({heightAt:()=>0,
  targets:[TARGETS[0],TARGETS[0]]}),/Duplicate/);
});
test('analysis does not move references, apply viewer offset or mutate source arrays',()=>{
 const before=JSON.stringify(TARGETS),a=surveyNatureAnalyticalGround({heightAt:()=>25});
 assert.equal(JSON.stringify(TARGETS),before);
 assert.equal(a.worldTransformApplied,false);
 assert.ok(a.findings.every(f=>f.centerLocalZmm===TARGETS.find(t=>t.sourceId===f.sourceId).zMm));
});
