import test from 'node:test';
import assert from 'node:assert/strict';
import {wolfveilHeight} from '../../../../WolfveilLayout.js';
import {TARGETS} from './referenceTargets.mjs';
import {surveyNatureAnalyticalGround} from './natureAnalyticalGroundSurvey.mjs';

/**
 * Exact existing WolfveilLayout.js source was checked at Git blob
 * b4b10dd15737d62c62a476e500adb433a6d015b6.
 * This compares the ORIGINAL analytic terrain formula with source-proposed
 * nature dimensions; it does not verify mesh Y, cave interiors or physics.
 */
test('existing analytic terrain reproduces 19 source center Y values within 1mm',()=>{
 const r=surveyNatureAnalyticalGround({heightAt:wolfveilHeight});
 assert.equal(r.sampledPointCount,171);
 assert.equal(r.findings.length,19);
 assert.equal(TARGETS.length,19);
 assert.ok(r.findings.every(f=>Math.abs(f.centerReferenceDifferenceMm)<=1));
 assert.equal(r.physicalTerrainSurveyVerified,false);
});
test('source 2m grade variation is review-only: 16 candidates above proposed threshold',()=>{
 const r=surveyNatureAnalyticalGround({heightAt:wolfveilHeight});
 assert.equal(r.findings.filter(f=>f.sampledRangeMm>2000).length,16);
 assert.equal(r.findings.filter(f=>f.sampledRangeMm>5000).length,7);
 assert.equal(r.findings.filter(f=>f.sampledRangeMm>10000).length,1);
 assert.ok(r.findings.find(f=>f.sourceId==='S26-JAPANESE_MAPLE').sampledRangeMm>14000);
 assert.equal(r.geometryActivated,false);
});
test('actual original surface model cannot certify cave interior or wetland water',()=>{
 const r=surveyNatureAnalyticalGround({heightAt:wolfveilHeight});
 assert.equal(r.findings.filter(f=>[27,28].includes(f.sceneId)).length,3);
 assert.ok(r.findings.filter(f=>[27,28].includes(f.sceneId)).every(f=>
  f.reviewReasons.includes('EXTERIOR_SURFACE_NOT_CAVE_FLOOR')));
 assert.ok(r.findings.filter(f=>f.sceneId===26).every(f=>
  f.reviewReasons.includes('WS02_WATER_EDGE_UNVERIFIED')));
 assert.equal(r.caveInteriorsVerified,false);
});
