/**
 * Wolfveil WS08 — original-anchor S21 rock / S24 pine collider-review packets.
 * Pure source-level REVIEW REQUESTS; no fabricated trunk collider, branch
 * headroom, root/soil height, material flags, actual LOD or mesh instances.
 * WS10 / WS12, not WS08 source math, must validate physical behavior.
 */
import {TARGETS} from './referenceTargets.mjs';
import {NATURE_DESIGN_PROFILE_RINGS} from './natureRouteAlternatives.mjs';

const requested=[
 {sourceId:'S21-MOSS_BOULDER',routeId:'west_woodland_fork',parts:[
  ['stone_body','POTENTIAL_SOLID_ROCK','Source stone cannot be made invisible/non-solid to hide road intrusion'],
  ['stone_ground_bearing','TERRAIN_CONTACT_UNKNOWN','Every actual bearing point requires physical mesh-ground Y'],
  ['moss_surface','SURFACE_DRESSING_UNKNOWN','Moss may be decorative, but cannot erase stone-body clearance requirement'],
 ]},
 {sourceId:'S24-BLACK_PINE',routeId:'ridge_path',parts:[
  ['root_flare','PHYSICAL_ROOT_UNKNOWN','Verify roots and soil contact independent of overall crown envelope'],
  ['trunk_core','SOLID_TRUNK_UNKNOWN','Find real trunk collider and road lateral corridor, not AABB crown shortcut'],
  ['branches_overhead','OVERHEAD_COLLISION_UNKNOWN','Verify player and mount headroom, branch sway, sightline'],
  ['leaf_crown','VISUAL_CANOPY_COLLISION_UNKNOWN','Non-colliding leaf crown is an approval decision, not a default'],
 ]},
];

const safe=n=>Number.isSafeInteger(n)&&Math.abs(n)<=100000000;
const copyObject=x=>Object.freeze(x);

export function makeNaturePhysicalReviewerRequests({
 targets=TARGETS,designProfiles=NATURE_DESIGN_PROFILE_RINGS,
 expectedSourceLayoutBlob='b4b10dd15737d62c62a476e500adb433a6d015b6',
}={}){
 if(!Array.isArray(targets)||!designProfiles||typeof designProfiles!=='object'
   ||typeof expectedSourceLayoutBlob!=='string'||!/^[0-9a-f]{40}$/.test(expectedSourceLayoutBlob))
  throw new TypeError('Source references, design rings and pinned layout blob required');
 const bySource=new Map();
 for(const t of targets){
  if(!t||typeof t.sourceId!=='string'||bySource.has(t.sourceId))
   throw new Error('Duplicate or missing original nature reference ID');
  bySource.set(t.sourceId,t);
 }
 const result=requested.map(def=>{
  const t=bySource.get(def.sourceId),rings=designProfiles[def.sourceId];
  if(!t||![t.xMm,t.zMm,t.widthMm,t.depthMm,t.heightMm].every(safe)
   ||t.widthMm<=0||t.depthMm<=0||t.heightMm<=0
   ||t.evidence!=='REFERENCE_PROPOSED'||t.runtimeVerified!==false)
   throw new Error('Verified, unbuilt original source nature envelope required: '+def.sourceId);
  if(!Array.isArray(rings)||rings.length!==7||rings.some(row=>
   !Array.isArray(row)||row.length!==5||!row.every(safe)||
   row[0]<0||row[3]<=0||row[4]<=0))
   throw new Error('Original seven-section design profile required: '+def.sourceId);
  const sections=Object.freeze(rings.map(row=>Object.freeze([...row])));
  const parts=Object.freeze(def.parts.map(([part,classification,question])=>copyObject({
   reviewId:t.id+'/PHYSICAL/'+part.toUpperCase().replaceAll('_','-'),
   part,classification,reviewQuestion:question,
   // Unknown properties are not filled from a visual envelope or design rings.
   actualLocalBoundsMm:null,actualLocalGroundContactYMm:null,
   actualActorClearanceM:null,actualMountClearanceM:null,
   actualHeadroomM:null,actualSolidColliderId:null,
   collisionDecision:null,measuredVolumeProvenance:null,
   lod0MatchVerified:false,lod1MatchVerified:false,lod2MatchVerified:false,
   independentWs12Verified:false,ws10Approved:false,
  })));
  return copyObject({
   sourceId:t.sourceId,natureId:t.id,sceneId:t.sceneId,
   originalXmm:t.xMm,originalZmm:t.zMm,
   originalReferenceEnvelopeMm:Object.freeze([t.widthMm,t.depthMm,t.heightMm]),
   originalDesignSectionsMm:sections,
   sourceProfile:'DESIGN_TARGET_NOT_A_MEASURED_GLTF_OR_COLLIDER',
   protectedExistingRoadId:def.routeId,
   sourceCenterlineAabbCollisionReported:true,
   proposedVolumetricCollisionLayers:parts,
   expectedSourceLayoutBlob,
   approvedMasterWorldSha:null,observedRuntimeBuildSha:null,
   geometryInstantiated:false,treeOrRockMoved:false,
   physicalSafeTraversalVerified:false,approvalState:'HOLD_WS01_WS10_WS11_WS12',
  });
 });
 return copyObject({
  status:'SOURCE_ONLY_PHYSICAL_VOLUME_REVIEW_REQUEST',
  packets:Object.freeze(result),objectCount:result.length,
  requestedPhysicalParts:result.reduce((s,x)=>s+x.proposedVolumetricCollisionLayers.length,0),
  geometryAuthorized:false,noCollisionBypassGranted:true,
  appSceneModified:false,physicsAuthoringPerformed:false,
 });
}
