import test from 'node:test';
import assert from 'node:assert/strict';
import {TARGETS} from './referenceTargets.mjs';
import {surveyNatureAnalyticalGround} from './natureAnalyticalGroundSurvey.mjs';
import {compileNatureReviewQueue} from './natureReviewQueue.mjs';

const natureId=id=>TARGETS.find(t=>t.sourceId===id).id;
const reports=()=>({
 groundSurvey:surveyNatureAnalyticalGround({heightAt:()=>0}),
 sourceClearance:{checkedTargets:19,activation:false,findings:[]},
 architectureSeams:{natureCount:19,geometryActivated:false,exactOverlaps:[],proximityReviews:[]},
});
test('fails closed until all three independently-owned full-scope reports arrive',()=>{
 assert.throws(()=>compileNatureReviewQueue(),/Require full/);
 const r=reports();delete r.groundSurvey;
 assert.throws(()=>compileNatureReviewQueue(r),/Require full/);
});
test('all nineteen remain blocked when source planning has no footprint alerts',()=>{
 const q=compileNatureReviewQueue(reports());
 assert.equal(q.count,19);
 assert.equal(q.geometryAuthorized,false);
 assert.equal(q.independentQaApproved,false);
 assert.ok(q.items.every(i=>!i.active&&!i.meshPlaced&&!i.collisionAuthorized));
 assert.ok(q.items.every(i=>i.reasons.includes('WS01_WS11_G0_PHYSICAL_APPROVAL_MISSING')));
});
test('wetland picture corruption and cave shell are never hidden by flat analytics',()=>{
 const q=compileNatureReviewQueue(reports());
 assert.ok(q.items.filter(i=>i.sceneId===26).every(i=>i.reasons.includes('SCENE26_ORIGINAL_PNG_CORRUPT')));
 assert.ok(q.items.filter(i=>[27,28].includes(i.sceneId)).every(i=>i.reasons.includes('EXTERIOR_SURFACE_NOT_CAVE_FLOOR')));
 assert.ok(q.items.find(i=>i.sourceId==='S30-LANTERN_GROVE').reasons.includes('EXTERNAL_OWNER_APPROVAL_PENDING'));
});
test('merges route, river, step exact conflict and bathhouse review without moving anchors',()=>{
 const r=reports();
 r.sourceClearance.findings=[
  {natureId:natureId('S21-CEDAR_01'),routeReviews:['west_woodland_fork'],riverReview:false},
  {natureId:natureId('S26-REED_CLUSTER'),routeReviews:[],riverReview:true},
 ];
 r.architectureSeams.exactOverlaps=[{natureId:natureId('S24-WILD_GRASS'),architectureId:'S24-TRAIL_STEPS'}];
 r.architectureSeams.proximityReviews=[{natureId:natureId('S30-LANTERN_GROVE'),architectureId:'S30-BATHHOUSE_EXT'}];
 const q=compileNatureReviewQueue(r);
 assert.ok(q.items.find(i=>i.sourceId==='S21-CEDAR_01').reasons.includes('EXISTING_ROUTE_APPROVAL_REQUIRED'));
 assert.ok(q.items.find(i=>i.sourceId==='S26-REED_CLUSTER').reasons.includes('WS02_WATER_EDGE_APPROVAL_REQUIRED'));
 assert.equal(q.items.find(i=>i.sourceId==='S24-WILD_GRASS').architectureExactCount,1);
 assert.equal(q.items.find(i=>i.sourceId==='S30-LANTERN_GROVE').architectureMarginCount,1);
 assert.equal(q.geometryAuthorized,false);
});
test('stale counts, extra target IDs and activated synthetic evidence are rejected',()=>{
 const x=reports();x.sourceClearance.checkedTargets=18;
 assert.throws(()=>compileNatureReviewQueue(x),/incomplete/);
 const y=reports();y.sourceClearance.findings=[{natureId:'NOT_WS08'}];
 assert.throws(()=>compileNatureReviewQueue(y),/Unknown source-clearance/);
 const z=reports();z.groundSurvey={...z.groundSurvey,geometryActivated:true};
 assert.throws(()=>compileNatureReviewQueue(z),/Activated geometry/);
});
test('input reports and source references remain unmodified',()=>{
 const r=reports(),before=JSON.stringify(r),refs=JSON.stringify(TARGETS);
 const q=compileNatureReviewQueue(r);
 assert.equal(JSON.stringify(r),before);
 assert.equal(JSON.stringify(TARGETS),refs);
 assert.equal(q.worldTransformApplied,false);
});

test('direct centerline crossings force explicit WS10 solid-geometry hold',()=>{
 const r=reports();
 r.roadCenterlineAudit={targetsReviewed:19,routesReviewed:10,
  geometryActivated:false,routeModified:false,centerShiftApplied:false,actorTravelVerified:false,
  conflicts:[{natureId:natureId('S21-MOSS_BOULDER'),routeId:'west_woodland_fork',
    totalCenterlineIntersectionM:3.66985,solidColliderAuthorized:false},
   {natureId:natureId('S24-BLACK_PINE'),routeId:'ridge_path',
    totalCenterlineIntersectionM:6.375,solidColliderAuthorized:false}],
 };
 const q=compileNatureReviewQueue(r);
 assert.equal(q.exactRoadCenterlineAuditProvided,true);
 for(const id of ['S21-MOSS_BOULDER','S24-BLACK_PINE']){
  const row=q.items.find(x=>x.sourceId===id);
  assert.equal(row.solidFootprintPlacementHeld,true);
  assert.ok(row.reasons.includes('WS10_SOLID_NATURE_CENTERLINE_CONFLICT'));
  assert.equal(row.exactRoadCenterlineCrossings.length,1);
 }
 assert.equal(q.geometryAuthorized,false);
});
test('missing centerline survey never masquerades as an all-clear',()=>{
 const q=compileNatureReviewQueue(reports());
 assert.equal(q.exactRoadCenterlineAuditProvided,false);
 assert.ok(q.items.every(x=>x.reasons.includes('EXACT_ROAD_CENTERLINE_AUDIT_MISSING')));
 assert.ok(q.items.every(x=>x.solidFootprintPlacementHeld===true));
});
test('stale or forged centerline records fail closed',()=>{
 const report=reports();
 report.roadCenterlineAudit={targetsReviewed:18,routesReviewed:10,conflicts:[]};
 assert.throws(()=>compileNatureReviewQueue(report),/Incomplete WS08/);
 report.roadCenterlineAudit={targetsReviewed:19,routesReviewed:10,geometryActivated:false,
  routeModified:false,centerShiftApplied:false,actorTravelVerified:false,
  conflicts:[{natureId:'UNLISTED',routeId:'ridge_path',
    totalCenterlineIntersectionM:1,solidColliderAuthorized:false}]};
 assert.throws(()=>compileNatureReviewQueue(report),/unknown exact WS08/);
 report.roadCenterlineAudit={...report.roadCenterlineAudit,
  conflicts:[],actorTravelVerified:true};
 assert.throws(()=>compileNatureReviewQueue(report),/Runtime\/altered road/);
});

const proposedOverlayFixture=()=>({
 checkedNature:19,checkedBase200:200,checkedOverlay14:14,checkedUnion214:214,
 verifiedWs11PriorityJoins:17,geometryActivated:false,
 authorizedPhysicalMeasurements:0,ws01ApprovedSha:null,
 ws10PhysicalQAApproved:false,ws12IndependentQAApproved:false,
 rows:TARGETS.map(t=>({
  natureId:t.id,sourceId:t.sourceId,sceneId:t.sceneId,
  sourceLocalMm:[t.xMm,t.zMm],
  proposedWs01ControlId:t.sourceId==='S28-ROOT_ARCH'?'WV-CTRL-0133':
   t.sourceId==='S30-LANTERN_GROVE'?'WV-CTRL-0214':null,
  proposedControlLayer:t.sourceId==='S28-ROOT_ARCH'?'ORIGINAL_200':
   t.sourceId==='S30-LANTERN_GROVE'?'PROPOSED_14':null,
  ws11PriorityRequestIds:t.sourceId==='S30-LANTERN_GROVE'?['G0-S30-LANTERN-GROVE']:[],
  geometryActivationAuthorized:false,
  measuredMeshSurfaceYmm:null,measuredColliderYmm:null,
 })),
});
test('provisional 214-point survey IDs never release geometry',()=>{
 const result=compileNatureReviewQueue({...reports(),
  g0OverlayAudit:proposedOverlayFixture()});
 assert.equal(result.g0OverlayCatalogJoinProvided,true);
 assert.equal(result.geometryAuthorized,false);
 const root=result.items.find(x=>x.sourceId==='S28-ROOT_ARCH');
 const grove=result.items.find(x=>x.sourceId==='S30-LANTERN_GROVE');
 assert.equal(root.proposedSurveyControlId,'WV-CTRL-0133');
 assert.equal(root.proposedSurveyLayer,'ORIGINAL_200');
 assert.equal(grove.proposedSurveyControlId,'WV-CTRL-0214');
 assert.deepEqual(grove.ws11PrioritySurveyIds,['G0-S30-LANTERN-GROVE']);
 for(const x of [root,grove]){
  assert.ok(x.reasons.includes('WS01_G0_CONTROL_IS_NOT_PHYSICAL_CLEARANCE'));
  assert.equal(x.active,false);
  assert.equal(x.meshPlaced,false);
  assert.equal(x.collisionAuthorized,false);
 }
 assert.ok(grove.reasons.includes('WS11_PRIORITY_IS_NOT_PHYSICAL_CLEARANCE'));
 assert.ok(grove.reasons.includes('EXTERNAL_OWNER_APPROVAL_PENDING'));
});
test('unmatched S21 rock and S24 pine cannot gain fake survey clearance',()=>{
 const result=compileNatureReviewQueue({...reports(),
  g0OverlayAudit:proposedOverlayFixture()});
 for(const id of ['S21-MOSS_BOULDER','S24-BLACK_PINE']){
  const row=result.items.find(x=>x.sourceId===id);
  assert.equal(row.proposedSurveyControlId,null);
  assert.deepEqual(row.ws11PrioritySurveyIds,[]);
  assert.ok(row.reasons.includes('NO_EXACT_WS01_G0_CONTROL_AT_NATURE_ANCHOR'));
  assert.ok(row.reasons.includes('WS01_WS11_G0_PHYSICAL_APPROVAL_MISSING'));
 }
});
test('absent survey catalog is clearly marked and holds all nineteen assets',()=>{
 const result=compileNatureReviewQueue(reports());
 assert.equal(result.g0OverlayCatalogJoinProvided,false);
 assert.ok(result.items.every(x=>x.reasons.includes('WS01_G0_OVERLAY_JOIN_NOT_PROVIDED')));
 assert.ok(result.items.every(x=>x.overlaySurveyEvidenceOnly));
});
test('forged/old/moved survey overlays are rejected before placement decisions',()=>{
 const inputs=reports(),audit=proposedOverlayFixture();
 assert.throws(()=>compileNatureReviewQueue({...inputs,g0OverlayAudit:{
  ...audit,checkedUnion214:200}}),/214-point source join invalid/);
 assert.throws(()=>compileNatureReviewQueue({...inputs,g0OverlayAudit:{
  ...audit,authorizedPhysicalMeasurements:1}}),/214-point source join invalid/);
 assert.throws(()=>compileNatureReviewQueue({...inputs,g0OverlayAudit:{
  ...audit,rows:audit.rows.map(x=>x.sourceId==='S28-ROOT_ARCH'?
   {...x,sourceLocalMm:[x.sourceLocalMm[0],x.sourceLocalMm[1]+70000]}:x),
 }}),/Unknown, moved or prematurely measured/);
 assert.throws(()=>compileNatureReviewQueue({...inputs,g0OverlayAudit:{
  ...audit,rows:audit.rows.map(x=>x.sourceId==='S30-LANTERN_GROVE'?
   {...x,measuredColliderYmm:102000}:x),
 }}),/Unknown, moved or prematurely measured/);
});
