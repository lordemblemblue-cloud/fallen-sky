import test from 'node:test';
import assert from 'node:assert/strict';
import {TARGETS} from './referenceTargets.mjs';
import {proposeNatureExclusionPlan,subtractProposedEnvelope} from './natureExclusionPlan.mjs';

const proposed=(id,xMm,zMm,widthMm,depthMm)=>Object.freeze({
  id:'WV-'+id.slice(0,3)+'-WS07-'+id.slice(4),
  xMm,zMm,targetEnvelopeMm:[widthMm,depthMm,1000],
});
const S24=proposed('S24-TRAIL_STEPS',-42000,361000,3600,16000);
const S26=proposed('S26-WATER_LOOKOUT',143000,68000,8400,6200);
const S27=proposed('S27-SAFE_FLOOR',-224000,80000,4100,13400);
const S30=proposed('S30-BATHHOUSE_EXT',-105000,330000,22000,18000);
const source=(id)=>TARGETS.find(x=>x.sourceId===id);
const pair=(id,arch,buffer)=>proposeNatureExclusionPlan({natureTargets:[source(id)],architectureTargets:[arch],reviewSetbackMm:buffer}).proposals[0];

test('S24 original meadow source envelope stays 152.25 square metres',()=>{
 const p=pair('S24-WILD_GRASS',S24,0);
 assert.equal(p.originalAreaM2,152.25);
 assert.equal(p.hypotheticalExcludedAreaM2,29.7);
 assert.equal(p.hypotheticalRetainedAreaM2,122.55);
 assert.equal(p.fragments.length,3);
 assert.equal(p.requiresExternalApproval,true);
});
test('S24 optional 2m trail-steps clearance excludes 62.0125 square metres only as proposal',()=>{
 const p=pair('S24-WILD_GRASS',S24,2000);
 assert.equal(p.hypotheticalExcludedAreaM2,62.0125);
 assert.equal(p.hypotheticalRetainedAreaM2,90.2375);
 assert.equal(p.fragments.length,2);
 assert.equal(p.status,'UNAPPROVED_PLAN_VIEW_OPTION');
});
test('S26 wetland bank requires consultation only with conservative 2m buffer',()=>{
 const exact=pair('S26-PEBBLE_BANK',S26,0);
 const buffered=pair('S26-PEBBLE_BANK',S26,2000);
 assert.equal(exact.hypotheticalExcludedAreaM2,0);
 assert.equal(buffered.hypotheticalExcludedAreaM2,2.6975);
 assert.equal(exact.reviewContactIds.length,0);
 assert.equal(buffered.reviewContactIds.length,1);
});
test('S27 cave stalagmites are near proposed floor, not directly intersecting',()=>{
 assert.equal(pair('S27-STALAGMITES',S27,0).hypotheticalExcludedAreaM2,0);
 assert.equal(pair('S27-STALAGMITES',S27,2000).hypotheticalExcludedAreaM2,0.62);
});
test('S30 both proposed vents and maple canopy are near bathhouse structure',()=>{
 assert.equal(pair('S30-STEAM_VENTS',S30,2000).hypotheticalExcludedAreaM2,0.88);
 assert.equal(pair('S30-LANTERN_GROVE',S30,2000).hypotheticalExcludedAreaM2,1.08);
 assert.equal(pair('S30-LANTERN_GROVE',S30,0).hypotheticalExcludedAreaM2,0);
});
test('empty, edge-touching and total exclusions are deterministic',()=>{
 const src={minXmm:0,maxXmm:10000,minZmm:0,maxZmm:10000};
 assert.deepEqual(subtractProposedEnvelope(src,{minXmm:10000,maxXmm:11000,minZmm:0,maxZmm:10000}),[src]);
 assert.deepEqual(subtractProposedEnvelope(src,{minXmm:-100,maxXmm:10100,minZmm:-100,maxZmm:10100}),[]);
});
test('multiple proposed exclusion blocks never double subtract overlapping space',()=>{
 const n=source('S24-WILD_GRASS');
 const result=proposeNatureExclusionPlan({
   natureTargets:[n],architectureTargets:[S24,{...S24,id:'another-architectural-proposal'}],reviewSetbackMm:0,
 });
 assert.equal(result.proposals[0].hypotheticalExcludedAreaM2,29.7);
 assert.equal(result.proposals[0].hypotheticalRetainedAreaM2,122.55);
});
test('missing architecture, bad buffers and duplicate IDs fail closed',()=>{
 assert.throws(()=>proposeNatureExclusionPlan(),/supplied/);
 assert.throws(()=>proposeNatureExclusionPlan({architectureTargets:[S24],reviewSetbackMm:-1}),/setback/);
 assert.throws(()=>proposeNatureExclusionPlan({architectureTargets:[S24,S24]}),/Duplicate WS07/);
 assert.throws(()=>proposeNatureExclusionPlan({architectureTargets:[S24],natureTargets:[TARGETS[0],TARGETS[0]]}),/Duplicate WS08/);
});
test('native proposal functions never mutate references, shift viewers or create geometry',()=>{
 const before=JSON.stringify(TARGETS);
 const result=proposeNatureExclusionPlan({architectureTargets:[S24,S26,S27,S30]});
 assert.equal(result.sourceNatureTargetCount,19);
 assert.equal(result.architectureTargetCount,4);
 assert.equal(result.pairCount,76);
 assert.equal(result.reviewCount,5); // one direct + four proximity-only candidates
 assert.equal(result.activated,false);
 assert.equal(result.meshCreated,false);
 assert.equal(result.worldTransformApplied,false);
 assert.equal(JSON.stringify(TARGETS),before);
});
