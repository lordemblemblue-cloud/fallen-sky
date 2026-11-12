import test from 'node:test';
import assert from 'node:assert/strict';
import {TARGETS} from './referenceTargets.mjs';
import {NATURE_ART_PROFILES,planNatureVisualContracts} from './natureVisualContracts.mjs';

test('all 19 source-backed reference features receive an explicit art profile',()=>{
 const r=planNatureVisualContracts();
 assert.equal(Object.keys(NATURE_ART_PROFILES).length,19);
 assert.equal(r.targetCount,19);
 assert.equal(r.contracts.length,TARGETS.length);
 assert.deepEqual(r.contracts.map(c=>c.sourceId),TARGETS.map(t=>t.sourceId));
 assert.ok(r.contracts.every(c=>c.referenceEvidence==='REFERENCE_PROPOSED_NOT_SURVEYED'));
});
test('proposed techniques never create geometry or bypass ownership dependencies',()=>{
 const r=planNatureVisualContracts();
 assert.equal(r.geometryActivated,false);
 assert.equal(r.assetsMounted,false);
 assert.equal(r.viewerShiftApplied,false);
 assert.ok(r.contracts.every(c=>!c.geometryCreated&&!c.collisionCreated&&!c.liveVisualVerified));
 const grove=r.contracts.find(c=>c.sourceId==='S30-LANTERN_GROVE');
 assert.equal(grove.approvalPending,'WS07_LANTERN_STRUCTURE_SPLIT_PENDING');
 assert.ok(grove.dependencies.includes('WS07_BUILT_LANTERNS'));
 const springs=r.contracts.find(c=>c.sourceId==='S30-STEAM_VENTS');
 assert.ok(springs.dependencies.includes('WS09_STEAM_FX'));
});
test('scene26 visual fidelity remains blocked by damaged original PNG',()=>{
 const r=planNatureVisualContracts();
 assert.deepEqual(r.contracts.filter(c=>c.scene26ImageUnverified).map(c=>c.sourceId),
  ['S26-REED_CLUSTER','S26-PEBBLE_BANK','S26-JAPANESE_MAPLE']);
});
test('source coordinates stay unchanged and unsupported new kinds fail closed',()=>{
 const before=JSON.stringify(TARGETS);
 const r=planNatureVisualContracts();
 assert.equal(JSON.stringify(TARGETS),before);
 assert.deepEqual(r.contracts.map(c=>[c.localXmm,c.localZmm]),
  TARGETS.map(t=>[t.xMm,t.zMm]));
 assert.throws(()=>planNatureVisualContracts({targets:[{...TARGETS[0],kind:'unreviewed-mesh'}]}),/Missing reviewed/);
 assert.throws(()=>planNatureVisualContracts({targets:[TARGETS[0],TARGETS[0]]}),/Duplicate/);
 assert.throws(()=>planNatureVisualContracts({targets:[{...TARGETS[0],runtimeVerified:true}]}),/evidence changed/);
});
