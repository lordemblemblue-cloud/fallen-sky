import test from 'node:test';
import assert from 'node:assert/strict';
import {APPROVED_WS01_SPEC_SHA,SCENES,TARGETS,COORDINATES,viewerPosition,planNatureAnchors}
  from './referenceTargets.mjs';

test('WS08 preflight has ten 100-tile scenes and nineteen proposed natural reference targets',()=>{
 assert.equal(SCENES.length,10);
 assert.equal(SCENES.reduce((n,s)=>n+s.numberOf10mTiles,0),1000);
 assert.equal(TARGETS.length,19);
 assert.equal(TARGETS.some(t=>t.sceneId===25),false);
 assert.equal(new Set(TARGETS.map(t=>t.id)).size,TARGETS.length);
 assert.ok(TARGETS.every(t=>t.id.includes('-WS08-')&&t.evidence==='REFERENCE_PROPOSED'));
 assert.equal(APPROVED_WS01_SPEC_SHA,null);
});
test('local coordinates are not mutated by conditional viewer Z offset',()=>{
 const source=TARGETS.find(t=>t.sourceId==='S21-CEDAR_01');
 assert.deepEqual(viewerPosition(source),{xMm:-327000,zMm:73000});
 assert.deepEqual(viewerPosition(source,true),{xMm:-327000,zMm:143000});
 assert.equal(source.zMm,73000);
 assert.equal(COORDINATES.tileSideMm,10000);
});
test('dry-run requires explicit terrain and clearance interfaces',()=>{
 assert.throws(()=>planNatureAnchors(),/authoritative/);
 assert.throws(()=>planNatureAnchors({heightAt:()=>0}),/authoritative/);
});
test('dry-run never activates objects and records protected clearance blocks',()=>{
 let rejected=0;
 const result=planNatureAnchors({
   heightAt:(x,z)=>x/10+z/10,
   clearanceAt:(x,z)=>{const ok=x!==-327;if(!ok)rejected++;return ok;},
 });
 assert.equal(result.activated,false);
 assert.equal(result.worldTransformApplied,false);
 assert.equal(result.blocked.length,rejected+1); // owner-gated grove is also blocked
 assert.ok(result.blocked.some(t=>t.sourceId==='S21-CEDAR_01'));
 assert.equal(result.safe.length+result.blocked.length,TARGETS.length);
});
test('reference anchors do not certify a runtime mesh or physics elevation',()=>{
 assert.ok(TARGETS.every(t=>t.runtimeVerified===false));
 assert.ok(SCENES.every(s=>Number.isInteger(s.centerXmm)&&Number.isInteger(s.centerZmm)));
 assert.ok(TARGETS.every(t=>t.widthMm>0&&t.depthMm>0&&t.heightMm>0));
});

test('S30 lantern grove is a canopy-only candidate with proposed envelope and guarded ownership',()=>{
 const grove=TARGETS.find(t=>t.sourceId==='S30-LANTERN_GROVE');
 assert.ok(grove);
 assert.deepEqual([grove.xMm,grove.zMm,grove.analyticalYmm,grove.widthMm,grove.depthMm,grove.heightMm],[-88000,337000,106696,8300,7200,8700]);
 assert.equal(grove.kind,'maple-grove-canopy');
 assert.equal(grove.ownershipGate,'WS07_LANTERN_STRUCTURE_SPLIT_PENDING');
 assert.deepEqual(viewerPosition(grove,true),{xMm:-88000,zMm:407000});
 assert.equal(grove.runtimeVerified,false);
});

test('gated S30 grove cannot be approved by a spatial callback alone',()=>{
 const report=planNatureAnchors({heightAt:()=>100,clearanceAt:()=>true});
 assert.equal(report.blocked.length,1);
 assert.equal(report.blocked[0].sourceId,'S30-LANTERN_GROVE');
 assert.equal(report.blocked[0].blockedReason,'OWNERSHIP_APPROVAL_PENDING');
 assert.equal(report.safe.length,TARGETS.length-1);
 assert.equal(report.runtimeAuthorized,false);
 assert.equal(report.sourceClearanceOnly,true);
 assert.equal(report.approvedWs01SpecSha,null);
});
test('dry-run rejects nonboolean clearance results instead of treating them as truthy',()=>{
 assert.throws(()=>planNatureAnchors({heightAt:()=>0,clearanceAt:()=>1}),/must return a boolean/);
 assert.throws(()=>planNatureAnchors({heightAt:()=>0,clearanceAt:()=>undefined}),/must return a boolean/);
 assert.throws(()=>planNatureAnchors({heightAt:()=>Infinity,clearanceAt:()=>true}),/Invalid sampled height/);
});
