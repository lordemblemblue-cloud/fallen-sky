/**
 * WS08 nature-target audit of the PROPOSED WS01 200+14 G0 control overlays.
 * Source coordinate membership is NOT a runtime mesh Y, physics, cave-floor,
 * WS07/10/11 approval, or authorization to place any nature geometry.
 * All owner catalogs must be injected; no direct cross-owner repo imports.
 */
import {TARGETS} from './referenceTargets.mjs';

export const NATURE_G0_OVERLAY_SOURCE_BLOBS=Object.freeze({
 base200:'7d6efa23e8f91ecf51ac9918f4742344708a3046',
 ws01Overlay14:'5a352c7ad754ee3d54de4783eb946133858f5d5e',
 ws11Requests17:'f1ccbe439337be95a1e40cab38f188d085a82b02',
 ws11ReconciliationV2:'e9e21dcc2f344b9fadfe94ec4ea2703e832c523e',
 ws08Targets:'9c6810e75d20f13c6d5534a51ed1a39de1e921f7',
});
const mm=n=>Number.isSafeInteger(n)&&Math.abs(n)<=100000000;
const pair=p=>Array.isArray(p)&&p.length===2&&p.every(mm);
const id=s=>typeof s==='string'&&s.trim().length>0;
const key=p=>p[0]+'|'+p[1];
function catalogIndex(records, xyField, label) {
 const byId=new Map(),byPoint=new Map();
 for(const row of records){
  if(!id(row?.id)||!pair(row[xyField])||byId.has(row.id))
    throw new TypeError('Invalid/duplicate '+label+' control or ID');
  byId.set(row.id,row);
  const coord=key(row[xyField]);
  if(byPoint.has(coord))throw new TypeError('Duplicate '+label+' source-local XZ');
  byPoint.set(coord,row);
 }
 return {byId,byPoint};
}
function exactShaValue(actual,expected,name){
 if(actual!==expected)throw new Error('Stale '+name+' source blob; re-audit catalog revision');
}

/**
 * Strict source joins for all 19 WS08 original reference centers, separately
 * checking all 17 manager priority linkages. The two concepts are NOT the same
 * as measured terrain/collision at those coordinates.
 */
export function auditNatureG0Overlay({
  natureTargets=TARGETS,baseControls,ws01Overlay,ws11Requests,
  ws11Reconciliation,sourceBlobs=NATURE_G0_OVERLAY_SOURCE_BLOBS,
}={}){
 if(!Array.isArray(natureTargets)||natureTargets.length!==19||
    !Array.isArray(baseControls)||baseControls.length!==200||
    !Array.isArray(ws01Overlay?.additionalControlPoints)||
    ws01Overlay.additionalControlPoints.length!==14||
    !Array.isArray(ws11Requests)||ws11Requests.length!==17||
    !Array.isArray(ws11Reconciliation?.priorityCrosswalk)||
    ws11Reconciliation.priorityCrosswalk.length!==17||
    !Array.isArray(ws11Reconciliation.additionalStations)||
    ws11Reconciliation.additionalStations.length!==3)
  throw new TypeError('Require full current original 200+14 WS01 / 17 WS11 source catalogs');
 for(const name of Object.keys(NATURE_G0_OVERLAY_SOURCE_BLOBS))
  exactShaValue(sourceBlobs?.[name],NATURE_G0_OVERLAY_SOURCE_BLOBS[name],name);
 exactShaValue(ws01Overlay.sourceBlobs?.base,
   NATURE_G0_OVERLAY_SOURCE_BLOBS.base200,'WS01 overlay original base');
 exactShaValue(ws01Overlay.sourceBlobs?.ws08,
   NATURE_G0_OVERLAY_SOURCE_BLOBS.ws08Targets,'WS01 overlay nature references');
 exactShaValue(ws11Reconciliation.sourceBlobs?.ws01Overlay,
   NATURE_G0_OVERLAY_SOURCE_BLOBS.ws01Overlay14,'WS11 overlay reconciliation');
 exactShaValue(ws11Reconciliation.sourceBlobs?.ws11Priority17,
   NATURE_G0_OVERLAY_SOURCE_BLOBS.ws11Requests17,'WS11 priority reconciliation');
 if(ws01Overlay.baseControlManifestCount!==200||ws01Overlay.addedControlCount!==14||
    ws01Overlay.unionCount!==214||ws01Overlay.managerG0ApprovalSha!==null||
    ws01Overlay.physicalYMeasurementsAvailable!==false||
    ws11Reconciliation.approvedWs01SpecSha!==null||
    ws11Reconciliation.G0GeometryApproval!==false||
    ws11Reconciliation.counts?.physicalMeasuredSiteCount!==0||
    ws11Reconciliation.counts?.ws01ProposedUnion214!==214||
    ws11Reconciliation.counts?.ws11PriorityMappedToProposedWs01!==17)
  throw new Error('Unexpected source overlay counts or premature G0/physical status');
 const base=catalogIndex(baseControls,'local_mm','WS01 base');
 const extra=catalogIndex(ws01Overlay.additionalControlPoints,'local_mm','WS01 overlay');
 for(const row of extra.byId.values()){
  if(base.byId.has(row.id)||base.byPoint.has(key(row.local_mm)))
   throw new Error('Overlay reassigns original WS01 ID or XZ source position');
  if(row.physicalYMm!==null)throw new Error('Source-only overlay contains alleged measured Y');
 }
 const controls=new Map([...base.byPoint,...extra.byPoint]);
 if(controls.size!==214)throw new Error('WS01 union XZ conflict');
 const requests=catalogIndex(ws11Requests,'local_anchor_mm','WS11 priority');
 const priorityIds=new Set();
 for(const row of ws11Reconciliation.priorityCrosswalk){
  if(!id(row?.priorityId)||priorityIds.has(row.priorityId)||!pair(row.sourceLocalMm)||
     !id(row.ws01ControlId)||row.runtimeY!==null||row.physicalQAStatus!=='NOT_RUN'||
     row.sourceIdentityOnly!==true)
   throw new Error('Invalid or prematurely measured manager priority crosswalk');
  priorityIds.add(row.priorityId);
  const req=requests.byId.get(row.priorityId);
  if(!req||key(req.local_anchor_mm)!==key(row.sourceLocalMm))
   throw new Error('WS11 priority anchor differs from original manager request');
  const match=controls.get(key(row.sourceLocalMm));
  if(!match||match.id!==row.ws01ControlId)
   throw new Error('WS11 priority ID does not match WS01 source-local control');
 }
 if(priorityIds.size!==17)throw new Error('Incomplete WS11 priority reconciliation');
 const natureIds=new Set(),natureKeys=new Set();
 const rows=natureTargets.map(t=>{
  if(!id(t?.id)||!id(t.sourceId)||natureIds.has(t.id)||natureKeys.has(t.sourceId)||
    !mm(t.xMm)||!mm(t.zMm)||t.evidence!=='REFERENCE_PROPOSED'||
    t.runtimeVerified!==false)
   throw new TypeError('Invalid or newly activated WS08 reference target');
  natureIds.add(t.id);natureKeys.add(t.sourceId);
  const anchor=[t.xMm,t.zMm],k=key(anchor);
  const found=controls.get(k)||null;
  const manager=ws11Reconciliation.priorityCrosswalk.filter(x=>key(x.sourceLocalMm)===k);
  const request=ws11Requests.filter(x=>key(x.local_anchor_mm)===k);
  if(manager.length!==request.length||manager.some(x=>!request.some(r=>r.id===x.priorityId)))
   throw new Error('WS11 manager priority source join mismatch');
  return Object.freeze({
   natureId:t.id,sourceId:t.sourceId,sceneId:t.sceneId,
   sourceLocalMm:Object.freeze(anchor),
   proposedWs01ControlId:found?.id||null,
   proposedControlLayer:found?(base.byId.has(found.id)?'ORIGINAL_200':'PROPOSED_14'):null,
   ws11PriorityRequestIds:Object.freeze(request.map(x=>x.id)),
   pendingOtherOwnerDecision:t.ownershipGate||null,
   // The existing original S28 root anchor does NOT validate cave interior Y.
   caveInteriorSurfaceVerified:false,
   measuredMeshSurfaceYmm:null,measuredColliderYmm:null,
   physicalReviewerCommit:null,
   sourceEvidence:'PROPOSED_SOURCE_LOCAL_XZ_ONLY',
   geometryActivationAuthorized:false,
  });
 });
 return Object.freeze({
  status:'WS08_PROVISIONAL_214_SOURCE_JOIN_NO_RUNTIME_EVIDENCE',
  checkedBase200:base.byId.size,checkedOverlay14:extra.byId.size,
  checkedUnion214:controls.size,verifiedWs11PriorityJoins:priorityIds.size,
  checkedNature:rows.length,
  natureWithWs01Control:rows.filter(x=>x.proposedWs01ControlId!==null).length,
  natureWithWs11Priority:rows.filter(x=>x.ws11PriorityRequestIds.length).length,
  rows:Object.freeze(rows),
  ws01ApprovedSha:null,authorizedPhysicalMeasurements:0,
  geometryActivated:false,worldViewerOffsetApplied:false,
  ws10PhysicalQAApproved:false,ws12IndependentQAApproved:false,
 });
}
