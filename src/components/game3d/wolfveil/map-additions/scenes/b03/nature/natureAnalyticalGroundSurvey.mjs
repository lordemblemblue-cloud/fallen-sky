/**
 * WS08 — unactivated, source-ANALYTICAL ground contact preflight.
 * A supplied heightAt(x,z) callback may be the original Wolfveil source
 * height function. This NEVER substitutes for terrain-mesh Y/raycast, cave
 * interiors, shore water grade, collision or navigation acceptance.
 */
import {TARGETS} from './referenceTargets.mjs';

const caveScenes=new Set([27,28]);
const wetlandScenes=new Set([26]);
const isMm=n=>Number.isSafeInteger(n)&&Math.abs(n)<=100000000;

/** Nine deterministic source-local points: center, four corners, four edges. */
export function natureFootprintSurveyPoints(target){
 if(!target||![target.xMm,target.zMm,target.widthMm,target.depthMm].every(isMm)
   ||target.widthMm<=0||target.depthMm<=0)
  throw new TypeError('Nature sample needs safe integer-mm center and positive footprint');
 const x=target.xMm/1000,z=target.zMm/1000;
 const a=target.widthMm/2000,b=target.depthMm/2000;
 return Object.freeze([
  [x,z], [x-a,z-b],[x-a,z+b],[x+a,z-b],[x+a,z+b],
  [x-a,z],[x+a,z],[x,z-b],[x,z+b],
 ].map(p=>Object.freeze(p)));
}

/**
 * A 2m sample range is only an optional planning REVIEW threshold.
 * The survey never proposes a Y placement, sculpt operation, foundation or
 * numeric LOD/navmesh clearance from this analytic approximation.
 */
export function surveyNatureAnalyticalGround({
 heightAt,targets=TARGETS,reviewRangeMm=2000,
}={}){
 if(typeof heightAt!=='function')throw new TypeError('Supply the existing analytic height function');
 if(!Array.isArray(targets))throw new TypeError('Supply explicit WS08 references');
 if(!isMm(reviewRangeMm)||reviewRangeMm<0)throw new RangeError('Invalid proposed review threshold');
 const seen=new Set();
 const findings=targets.map(t=>{
  if(typeof t?.id!=='string'||seen.has(t.id))throw new TypeError('Duplicate or missing nature target ID');
  seen.add(t.id);
  if(!isMm(t.analyticalYmm))throw new TypeError('Missing proposed source analytical center Y');
  const points=natureFootprintSurveyPoints(t);
  const ys=points.map(([x,z])=>heightAt(x,z));
  if(!ys.every(Number.isFinite))throw new Error('Nonfinite analytic ground sample: '+t.sourceId);
  const mm=ys.map(y=>y*1000);
  const spreadMm=Math.round(Math.max(...mm)-Math.min(...mm));
  const differenceMm=Math.round(mm[0]-t.analyticalYmm);
  const reviewReasons=[];
  if(spreadMm>reviewRangeMm)reviewReasons.push('ANALYTIC_GROUND_VARIATION');
  if(Math.abs(differenceMm)>1)reviewReasons.push('REFERENCE_CENTER_Y_MISMATCH');
  if(caveScenes.has(t.sceneId))reviewReasons.push('EXTERIOR_SURFACE_NOT_CAVE_FLOOR');
  if(wetlandScenes.has(t.sceneId))reviewReasons.push('WS02_WATER_EDGE_UNVERIFIED');
  if(t.ownershipGate)reviewReasons.push('EXTERNAL_OWNER_APPROVAL_PENDING');
  return Object.freeze({
   natureId:t.id,sourceId:t.sourceId,sceneId:t.sceneId,
   centerLocalXmm:t.xMm,centerLocalZmm:t.zMm,
   sourceCenterAnalyticalYmm:t.analyticalYmm,
   sampledAnalyticalCenterYmm:Math.round(mm[0]),
   centerReferenceDifferenceMm:differenceMm,
   sampledMinAnalyticalYmm:Math.round(Math.min(...mm)),
   sampledMaxAnalyticalYmm:Math.round(Math.max(...mm)),
   sampledRangeMm:spreadMm,samples:points.length,
   reviewReasons:Object.freeze(reviewReasons),
   requiresReview:reviewReasons.length>0,
   status:'SOURCE_HEIGHT_MODEL_ONLY_NOT_MESH_RAYCAST',
  });
 });
 return Object.freeze({
  status:'UNAPPROVED_9_POINT_ANALYTIC_SURVEY',
  pointsPerNatureTarget:9,sampledPointCount:findings.length*9,
  reviewedNatureTargetCount:findings.length,reviewRangeMm,
  findings:Object.freeze(findings),
  geometryActivated:false,terrainModified:false,worldTransformApplied:false,
  physicalTerrainSurveyVerified:false,caveInteriorsVerified:false,
 });
}
