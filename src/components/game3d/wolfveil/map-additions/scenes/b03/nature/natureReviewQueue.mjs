/**
 * WS08 independent source-only nature review queue. Consumes separately
 * verified WS01 height-model, main-layout and WS07 proposal diagnostics.
 * This module NEVER calls an engine scene builder or approves a mesh.
 * It does not decide WS07, WS02, WS10, WS11 or WS12's review outcomes.
 */
import {TARGETS} from './referenceTargets.mjs';

const arr=v=>Array.isArray(v);
const checkedMap=(records,key)=>{
 const m=new Map();
 for(const record of records){
  const k=record?.[key];
  if(typeof k!=='string'||!k||m.has(k))throw new TypeError('Invalid or duplicated review record '+key);
  m.set(k,record);
 }
 return m;
};
const appendUnique=(reasons,value)=>{if(!reasons.includes(value))reasons.push(value);};

/**
 * Missing full inventory or mismatched source IDs fail closed.
 * Source-clearance report contains flagged targets only; its checkedTargets
 * confirms all other candidates were also screened, not automatically safe.
 * Source "2m" margins are a planning proposal, not an approved footpath.
 */
export function compileNatureReviewQueue({
 targets=TARGETS,groundSurvey,sourceClearance,architectureSeams,roadCenterlineAudit=null,
 g0OverlayAudit=null,
}={}){
 if(!arr(targets)||!arr(groundSurvey?.findings)
  ||!arr(sourceClearance?.findings)||!arr(architectureSeams?.exactOverlaps)
  ||!arr(architectureSeams?.proximityReviews))
  throw new TypeError('Require full independent ground, source and WS07 architecture reviews');
 if(groundSurvey.reviewedNatureTargetCount!==targets.length
  ||sourceClearance.checkedTargets!==targets.length
  ||architectureSeams.natureCount!==targets.length)
  throw new Error('Stale or incomplete WS08 inventory evidence');
 if(groundSurvey.geometryActivated||sourceClearance.activation
   ||architectureSeams.geometryActivated)
  throw new Error('Activated geometry is not valid source preflight evidence');
 const nature=checkedMap(targets,'id');
 const ground=checkedMap(groundSurvey.findings,'natureId');
 const source=checkedMap(sourceClearance.findings,'natureId');
 if(roadCenterlineAudit!==null) {
  if(!Array.isArray(roadCenterlineAudit.conflicts)
   ||roadCenterlineAudit.targetsReviewed!==targets.length
   ||roadCenterlineAudit.routesReviewed<1)
   throw new Error('Incomplete WS08 exact road-centerline audit');
  if(roadCenterlineAudit.geometryActivated||roadCenterlineAudit.routeModified
   ||roadCenterlineAudit.centerShiftApplied||roadCenterlineAudit.actorTravelVerified)
   throw new Error('Runtime/altered road evidence cannot be treated as authoring review');
 }
 if(ground.size!==nature.size)throw new Error('Missing analytical survey target');
 for(const id of ground.keys())if(!nature.has(id))throw new Error('Unknown analytical target');
 for(const id of source.keys())if(!nature.has(id))throw new Error('Unknown source-clearance target');
 // Optional source XZ join must NOT become physical raycast evidence.
 let surveyByNature=null;
 if(g0OverlayAudit!==null){
  if(!arr(g0OverlayAudit.rows)||g0OverlayAudit.checkedNature!==targets.length
   ||g0OverlayAudit.checkedBase200!==200||g0OverlayAudit.checkedOverlay14!==14
   ||g0OverlayAudit.checkedUnion214!==214
   ||g0OverlayAudit.verifiedWs11PriorityJoins!==17
   ||g0OverlayAudit.geometryActivated!==false
   ||g0OverlayAudit.authorizedPhysicalMeasurements!==0
   ||g0OverlayAudit.ws01ApprovedSha!==null
   ||g0OverlayAudit.ws10PhysicalQAApproved!==false
   ||g0OverlayAudit.ws12IndependentQAApproved!==false)
   throw new Error('WS01 214-point source join invalid or incorrectly promoted to physical QA');
  surveyByNature=checkedMap(g0OverlayAudit.rows,'natureId');
  if(surveyByNature.size!==nature.size)
   throw new Error('Incomplete WS08 nature G0 overlay join');
  for(const row of surveyByNature.values()){
   const original=nature.get(row.natureId);
   if(!original||row.sourceId!==original.sourceId||row.sceneId!==original.sceneId
    ||!Array.isArray(row.sourceLocalMm)||row.sourceLocalMm.length!==2
    ||row.sourceLocalMm[0]!==original.xMm||row.sourceLocalMm[1]!==original.zMm
    ||row.geometryActivationAuthorized!==false
    ||row.measuredMeshSurfaceYmm!==null||row.measuredColliderYmm!==null
    ||!Array.isArray(row.ws11PriorityRequestIds))
    throw new Error('Unknown, moved or prematurely measured WS08 overlay nature anchor');
  }
 }
 const hits=roadCenterlineAudit?.conflicts||[];
 for(const hit of hits){
  if(!nature.has(hit.natureId)||typeof hit.routeId!=='string'
    ||!Number.isFinite(hit.totalCenterlineIntersectionM)
    ||hit.totalCenterlineIntersectionM<=0||hit.solidColliderAuthorized!==false)
   throw new Error('Malformed or unknown exact WS08 road-centerline finding');
 }
 const arch=architectureSeams.exactOverlaps.concat(architectureSeams.proximityReviews);
 for(const hit of arch)if(!nature.has(hit.natureId))throw new Error('Unknown WS07 nature target');
 const items=targets.map(t=>{
  const g=ground.get(t.id),s=source.get(t.id);
  const reasons=[...g.reviewReasons];
  if(s?.routeReviews?.length)appendUnique(reasons,'EXISTING_ROUTE_APPROVAL_REQUIRED');
  const exactRouteHits=hits.filter(hit=>hit.natureId===t.id);
  if(exactRouteHits.length)appendUnique(reasons,'WS10_SOLID_NATURE_CENTERLINE_CONFLICT');
  if(!roadCenterlineAudit)appendUnique(reasons,'EXACT_ROAD_CENTERLINE_AUDIT_MISSING');
  if(s?.riverReview)appendUnique(reasons,'WS02_WATER_EDGE_APPROVAL_REQUIRED');
  if(s?.buildingOverlaps?.length)appendUnique(reasons,'EXISTING_BUILDING_CONFLICT');
  if(s?.housingOverlaps?.length)appendUnique(reasons,'EXISTING_HOUSING_CONFLICT');
  if(architectureSeams.exactOverlaps.some(a=>a.natureId===t.id))
   appendUnique(reasons,'WS07_EXACT_ENVELOPE_CONFLICT');
  if(architectureSeams.proximityReviews.some(a=>a.natureId===t.id))
   appendUnique(reasons,'WS07_PROVISIONAL_MARGIN_REVIEW');
  if(t.sceneId===26)appendUnique(reasons,'SCENE26_ORIGINAL_PNG_CORRUPT');
  if(t.ownershipGate)appendUnique(reasons,'EXTERNAL_OWNER_APPROVAL_PENDING');
  const survey=surveyByNature?.get(t.id)||null;
  if(!surveyByNature)appendUnique(reasons,'WS01_G0_OVERLAY_JOIN_NOT_PROVIDED');
  else if(!survey.proposedWs01ControlId)
   appendUnique(reasons,'NO_EXACT_WS01_G0_CONTROL_AT_NATURE_ANCHOR');
  else appendUnique(reasons,'WS01_G0_CONTROL_IS_NOT_PHYSICAL_CLEARANCE');
  if(survey?.ws11PriorityRequestIds.length)
   appendUnique(reasons,'WS11_PRIORITY_IS_NOT_PHYSICAL_CLEARANCE');
  // Every candidate still needs one authoritative WS01/11 source-to-physical
  // gate; no set of zero planning flags grants scene integration.
  appendUnique(reasons,'WS01_WS11_G0_PHYSICAL_APPROVAL_MISSING');
  return Object.freeze({
   natureId:t.id,sourceId:t.sourceId,sceneId:t.sceneId,
   reasons:Object.freeze(reasons),
   analyticalRangeMm:g.sampledRangeMm,
   existingRouteReviews:Object.freeze([...(s?.routeReviews||[])]),
   exactRoadCenterlineCrossings:Object.freeze(exactRouteHits.map(hit=>
    Object.freeze({routeId:hit.routeId,lengthM:hit.totalCenterlineIntersectionM}))),
   solidFootprintPlacementHeld:exactRouteHits.length>0||roadCenterlineAudit===null,
   proposedSurveyControlId:survey?.proposedWs01ControlId||null,
   proposedSurveyLayer:survey?.proposedControlLayer||null,
   ws11PrioritySurveyIds:Object.freeze([...(survey?.ws11PriorityRequestIds||[])]),
   overlaySurveyEvidenceOnly:true,
   architectureExactCount:architectureSeams.exactOverlaps.filter(a=>a.natureId===t.id).length,
   architectureMarginCount:architectureSeams.proximityReviews.filter(a=>a.natureId===t.id).length,
   status:'AWAITING_OWNER_AND_RUNTIME_QA',
   active:false,meshPlaced:false,collisionAuthorized:false,
  });
 });
 return Object.freeze({
  status:'SOURCE_ONLY_HOLD_QUEUE',count:items.length,items:Object.freeze(items),
  geometryAuthorized:false,worldTransformApplied:false,
  exactRoadCenterlineAuditProvided:roadCenterlineAudit!==null,
  g0OverlayCatalogJoinProvided:g0OverlayAudit!==null,
  realHeightRaycastVerified:false,independentQaApproved:false,
 });
}
