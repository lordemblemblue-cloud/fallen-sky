import test from 'node:test';
import assert from 'node:assert/strict';
import {TARGETS} from './referenceTargets.mjs';
import {NATURE_DESIGN_PROFILE_RINGS} from './natureRouteAlternatives.mjs';
import {makeNaturePhysicalReviewerRequests} from './naturePhysicalVolumeRequests.mjs';

const packet=id=>makeNaturePhysicalReviewerRequests().packets.find(p=>p.sourceId===id);
test('two original-anchor asset requests carry seven physical-review layers total',()=>{
 const q=makeNaturePhysicalReviewerRequests();
 assert.equal(q.objectCount,2);
 assert.equal(q.requestedPhysicalParts,7);
 assert.equal(q.geometryAuthorized,false);
 assert.equal(q.physicsAuthoringPerformed,false);
 assert.equal(q.noCollisionBypassGranted,true);
 assert.deepEqual(q.packets.map(p=>p.sourceId),['S21-MOSS_BOULDER','S24-BLACK_PINE']);
});
test('seven original design rings remain available but NOT a measured collider',()=>{
 for(const id of ['S21-MOSS_BOULDER','S24-BLACK_PINE']){
  const p=packet(id);
  assert.deepEqual(p.originalDesignSectionsMm,NATURE_DESIGN_PROFILE_RINGS[id]);
  assert.equal(p.originalDesignSectionsMm.length,7);
  assert.equal(p.sourceProfile,'DESIGN_TARGET_NOT_A_MEASURED_GLTF_OR_COLLIDER');
  assert.equal(p.approvedMasterWorldSha,null);
  assert.equal(p.physicalSafeTraversalVerified,false);
 }
});
test('rock body must be reviewed as potential solid, not silently invisible',()=>{
 const p=packet('S21-MOSS_BOULDER');
 assert.deepEqual([p.originalXmm,p.originalZmm],[-310000,56000]);
 assert.equal(p.protectedExistingRoadId,'west_woodland_fork');
 assert.ok(p.proposedVolumetricCollisionLayers.some(x=>x.part==='stone_body'&&
  x.classification==='POTENTIAL_SOLID_ROCK'));
 assert.ok(p.proposedVolumetricCollisionLayers.every(x=>x.collisionDecision===null));
});
test('pine root, trunk, branches and crown are independent unknown physical layers',()=>{
 const p=packet('S24-BLACK_PINE');
 assert.deepEqual([p.originalXmm,p.originalZmm],[-72000,375000]);
 assert.equal(p.protectedExistingRoadId,'ridge_path');
 assert.deepEqual(p.proposedVolumetricCollisionLayers.map(x=>x.part),[
  'root_flare','trunk_core','branches_overhead','leaf_crown']);
 assert.ok(p.proposedVolumetricCollisionLayers.every(x=>x.actualLocalBoundsMm===null));
 assert.ok(p.proposedVolumetricCollisionLayers.every(x=>!x.lod0MatchVerified&&!x.lod1MatchVerified&&!x.lod2MatchVerified));
});
test('physical clearance, contact Y, collider ID and network/QA stay UNKNOWN',()=>{
 const q=makeNaturePhysicalReviewerRequests();
 for(const p of q.packets)for(const v of p.proposedVolumetricCollisionLayers){
  assert.equal(v.actualLocalGroundContactYMm,null);
  assert.equal(v.actualActorClearanceM,null);
  assert.equal(v.actualMountClearanceM,null);
  assert.equal(v.actualHeadroomM,null);
  assert.equal(v.actualSolidColliderId,null);
  assert.equal(v.measuredVolumeProvenance,null);
  assert.equal(v.ws10Approved,false);
  assert.equal(v.independentWs12Verified,false);
 }
});
test('fail closed on changed original source, incomplete profile or malformed provenance',()=>{
 const missing=TARGETS.filter(t=>t.sourceId!=='S24-BLACK_PINE');
 assert.throws(()=>makeNaturePhysicalReviewerRequests({targets:missing}),/Verified, unbuilt original/);
 const mutated=TARGETS.map(t=>t.sourceId==='S21-MOSS_BOULDER'?{...t,runtimeVerified:true}:t);
 assert.throws(()=>makeNaturePhysicalReviewerRequests({targets:mutated}),/Verified, unbuilt original/);
 assert.throws(()=>makeNaturePhysicalReviewerRequests({designProfiles:{
  ...NATURE_DESIGN_PROFILE_RINGS,'S21-MOSS_BOULDER':[],
 }}),/Original seven-section/);
 assert.throws(()=>makeNaturePhysicalReviewerRequests({expectedSourceLayoutBlob:'draft'}),/pinned layout blob/);
});
test('cannot overwrite or move source and keeps all seven ring records immutable',()=>{
 const original=JSON.stringify({TARGETS,NATURE_DESIGN_PROFILE_RINGS});
 const p=packet('S24-BLACK_PINE');
 assert.equal(Object.isFrozen(p),true);
 assert.equal(Object.isFrozen(p.originalDesignSectionsMm[0]),true);
 assert.equal(JSON.stringify({TARGETS,NATURE_DESIGN_PROFILE_RINGS}),original);
 assert.equal(p.geometryInstantiated,false);
 assert.equal(p.treeOrRockMoved,false);
});
