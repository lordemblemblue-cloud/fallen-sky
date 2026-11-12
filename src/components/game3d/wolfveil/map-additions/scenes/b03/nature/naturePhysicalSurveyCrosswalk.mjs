/**
 * WS08 — exact local-mm survey catalog crosswalk for original S21/S24 nature.
 * This only asks whether catalog XZ control positions exist; a shared XZ is
 * NOT a shared collider layer, runtime mesh Y or owner approval.
 * The WS01/WS11 catalogs must be supplied read-only by the caller.
 */
import {NATURE_SITE_ALTERNATIVES} from './natureRouteAlternatives.mjs';

export const PINNED_WS08_SURVEY_CATALOG_BLOBS=Object.freeze({
 ws01:'7d6efa23e8f91ecf51ac9918f4742344708a3046',
 ws11:'f1ccbe439337be95a1e40cab38f188d085a82b02',
 crosswalk:'b586e49547125cb4393a9ca7c95970bd43b0dfea',
});
const finiteId=o=>typeof o?.id==='string'&&o.id.trim().length>0;
const mm=n=>Number.isSafeInteger(n)&&Math.abs(n)<=100000000;
const xy=a=>Array.isArray(a)&&a.length===2&&a.every(mm);
const hash=h=>typeof h==='string'&&/^[a-f0-9]{40}$/.test(h);
const key=a=>a[0]+'|'+a[1];
function indexing(records,getXY,getId,label){
 const seen=new Set(),locs=new Map();
 for(const r of records){
  const id=getId(r),coords=getXY(r);
  if(typeof id!=='string'||!id||seen.has(id)||!xy(coords))
   throw new Error('Invalid or duplicate '+label+' catalog identity/local mm');
  seen.add(id);
  const k=key(coords);
  if(!locs.has(k))locs.set(k,[]);
  locs.get(k).push(id);
 }
 return locs;
}
export function reconcileNaturePhysicalSurveyQuestions({
 sites=NATURE_SITE_ALTERNATIVES,reviewPackets,ws01Points,ws11Requests,
 managerCrosswalk,sourceBlobs=PINNED_WS08_SURVEY_CATALOG_BLOBS,
}={}){
 if(!Array.isArray(sites)||sites.length===0
    ||!Array.isArray(reviewPackets?.packets)||reviewPackets.geometryAuthorized!==false
    ||!Array.isArray(ws01Points)||!Array.isArray(ws11Requests)
    ||!managerCrosswalk||!Array.isArray(managerCrosswalk.priority_crosswalk)
    ||!Array.isArray(managerCrosswalk.scene21_new_issue))
  throw new TypeError('Complete static WS08 physical + WS01/WS11 survey inventories required');
 if(ws01Points.length!==200||ws11Requests.length!==17
    ||managerCrosswalk.priority_crosswalk.length!==17
    ||managerCrosswalk.gate0_ready!==false||managerCrosswalk.approved_ws01_sha!==null
    ||reviewPackets.objectCount!==2||reviewPackets.requestedPhysicalParts!==7)
  throw new Error('Unexpected survey inventory counts or premature geometry approval');
 for(const [name,expected] of Object.entries(PINNED_WS08_SURVEY_CATALOG_BLOBS))
  if(!hash(sourceBlobs?.[name])||sourceBlobs[name]!==expected)
   throw new Error('Stale '+name+' G0 catalog blob; re-audit before source joins');
 const ws01=indexing(ws01Points,p=>p.local_mm,p=>p.id,'WS01');
 const ws11=indexing(ws11Requests,p=>p.local_anchor_mm,p=>p.id,'WS11');
 const byCross=indexing(managerCrosswalk.priority_crosswalk,p=>p.source_local_mm,
  p=>p.ws11_id,'manager crosswalk');
 const issues=indexing(managerCrosswalk.scene21_new_issue,p=>p.center_local_mm,
  p=>p.id,'manager issue');
 const seen=new Set();
 const rows=sites.map(s=>{
  if(typeof s?.key!=='string'||seen.has(s.key)||!xy([s.xMm,s.zMm]))
   throw new Error('Malformed or duplicate nature study site');
  seen.add(s.key);
  const loc=[s.xMm,s.zMm],anchorKey=key(loc);
  const packets=reviewPackets.packets.filter(p=>
    p.sourceId===s.sourceId&&p.originalXmm===s.xMm&&p.originalZmm===s.zMm);
  if(s.role==='ORIGINAL_UNCHANGED'&&packets.length!==1)
   throw new Error('Missing original-anchor physical review packet');
  if(s.role==='ALTERNATIVE_STUDY'&&packets.length)
   throw new Error('An unapproved alternative cannot inherit original physical measurements');
  if(!['ORIGINAL_UNCHANGED','ALTERNATIVE_STUDY'].includes(s.role))
   throw new Error('Unknown site role');
  return Object.freeze({
   key:s.key,sourceId:s.sourceId,role:s.role,localMm:Object.freeze(loc),
   ws01TerrainControlIds:Object.freeze([...(ws01.get(anchorKey)||[])]),
   ws11PriorityRequestIds:Object.freeze([...(ws11.get(anchorKey)||[])]),
   managerCrosswalkIds:Object.freeze([...(byCross.get(anchorKey)||[])]),
   managerIssueAcknowledgments:Object.freeze([...(issues.get(anchorKey)||[])]),
   ws08PhysicalQuestionIds:Object.freeze(packets.flatMap(p=>
    p.proposedVolumetricCollisionLayers.map(q=>q.reviewId))),
   // Actor/collider/mesh-layer observations do not exist in source catalogs.
   measuredRuntimeSurfaceYmm:null,measuredCollisionLayerYmm:null,
   observedTrunkRootOrStoneVolume:null,
   managerIssuedMeasurementRequestId:null,
   physicalGeometryApproved:false,
   status:'SOURCE_CATALOG_MATCH_ONLY_NO_PHYSICAL_EVIDENCE',
  });
 });
 return Object.freeze({
  status:'SOURCE_ONLY_WS08_G0_SURVEY_CROSSWALK',
  checkedWs01Controls:ws01Points.length,
  checkedWs11Priorities:ws11Requests.length,
  physicalLayerQuestions:reviewPackets.requestedPhysicalParts,
  sourceStudySites:rows.length,
  rows:Object.freeze(rows),
  authorizedPhysicalMeasurements:0,
  geometryActivated:false,ws11ApprovalGiven:false,
  canMergePhysicalMeasurements:false,
 });
}
