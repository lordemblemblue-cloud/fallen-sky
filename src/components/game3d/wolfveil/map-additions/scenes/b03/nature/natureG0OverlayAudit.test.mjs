import test from 'node:test';
import assert from 'node:assert/strict';
import {TARGETS} from './referenceTargets.mjs';
import {
  NATURE_G0_OVERLAY_SOURCE_BLOBS,auditNatureG0Overlay,
} from './natureG0OverlayAudit.mjs';

/* Synthetic but shape-exact 200+14 catalogs; real connected WS01/WS11
 * 214-control data is independently cross-checked in the handoff report.
 * Never pretend synthetic Y is a physical terrain mesh measurement.
 */
const fixture=()=>{
 const baseControls=Array.from({length:200},(_,i)=>({
  id:'WV-CTRL-'+String(i+1).padStart(4,'0'),local_mm:[900000+i*1000,800000],
 }));
 baseControls[132].local_mm=[-324000,140000]; // original S28 root arch
 const additionalControlPoints=Array.from({length:14},(_,i)=>({
  id:'WV-CTRL-'+String(201+i).padStart(4,'0'),
  local_mm:[300000+i*1000,500000],physicalYMm:null,
 }));
 additionalControlPoints[13].local_mm=[-88000,337000]; // S30 canopy overlay
 const prioritySource=[
  ...baseControls.slice(0,6),
  ...additionalControlPoints.slice(0,10),
  additionalControlPoints[13],
 ];
 const ws11Requests=prioritySource.map((row,i)=>({
  id:i===16?'G0-S30-LANTERN-GROVE':'G0-TEST-'+i,
  local_anchor_mm:[...row.local_mm],
 }));
 const priorityCrosswalk=prioritySource.map((row,i)=>({
  priorityId:ws11Requests[i].id,
  sourceLocalMm:[...row.local_mm],ws01ControlId:row.id,
  runtimeY:null,physicalQAStatus:'NOT_RUN',sourceIdentityOnly:true,
 }));
 return {
  baseControls,
  ws01Overlay:{
   sourceBlobs:{base:NATURE_G0_OVERLAY_SOURCE_BLOBS.base200,
    ws08:NATURE_G0_OVERLAY_SOURCE_BLOBS.ws08Targets},
   additionalControlPoints,baseControlManifestCount:200,addedControlCount:14,
   unionCount:214,managerG0ApprovalSha:null,
   physicalYMeasurementsAvailable:false,
  },
  ws11Requests,
  ws11Reconciliation:{
   sourceBlobs:{ws01Overlay:NATURE_G0_OVERLAY_SOURCE_BLOBS.ws01Overlay14,
    ws11Priority17:NATURE_G0_OVERLAY_SOURCE_BLOBS.ws11Requests17},
   priorityCrosswalk,additionalStations:[
    {ws01ControlId:additionalControlPoints[10].id},
    {ws01ControlId:additionalControlPoints[11].id},
    {ws01ControlId:additionalControlPoints[12].id},
   ],
   approvedWs01SpecSha:null,G0GeometryApproval:false,
   counts:{physicalMeasuredSiteCount:0,ws01ProposedUnion214:214,
    ws11PriorityMappedToProposedWs01:17},
  },
 };
};
test('all 214 current-style controls and 17 manager priorities reconcile by exact local mm',()=>{
 const r=auditNatureG0Overlay(fixture());
 assert.deepEqual([r.checkedBase200,r.checkedOverlay14,r.checkedUnion214,
  r.verifiedWs11PriorityJoins,r.checkedNature],[200,14,214,17,19]);
 assert.equal(r.status,'WS08_PROVISIONAL_214_SOURCE_JOIN_NO_RUNTIME_EVIDENCE');
});
test('S28 root arch is base-control source, S30 canopy is overlay+manager priority',()=>{
 const r=auditNatureG0Overlay(fixture());
 assert.equal(r.natureWithWs01Control,2);
 assert.equal(r.natureWithWs11Priority,1);
 const root=r.rows.find(x=>x.sourceId==='S28-ROOT_ARCH');
 assert.deepEqual([root.proposedWs01ControlId,root.proposedControlLayer],
  ['WV-CTRL-0133','ORIGINAL_200']);
 assert.equal(root.caveInteriorSurfaceVerified,false);
 const grove=r.rows.find(x=>x.sourceId==='S30-LANTERN_GROVE');
 assert.deepEqual([grove.proposedWs01ControlId,grove.proposedControlLayer],
  ['WV-CTRL-0214','PROPOSED_14']);
 assert.deepEqual(grove.ws11PriorityRequestIds,['G0-S30-LANTERN-GROVE']);
 assert.equal(grove.pendingOtherOwnerDecision,'WS07_LANTERN_STRUCTURE_SPLIT_PENDING');
});
test('S21 solid boulder and S24 pine are still unmatched without inventing survey IDs',()=>{
 const r=auditNatureG0Overlay(fixture());
 for(const ref of ['S21-MOSS_BOULDER','S24-BLACK_PINE']){
  const row=r.rows.find(x=>x.sourceId===ref);
  assert.equal(row.proposedWs01ControlId,null);
  assert.deepEqual(row.ws11PriorityRequestIds,[]);
  assert.equal(row.geometryActivationAuthorized,false);
 }
});
test('matched source XZ cannot become measured terrain or collision evidence',()=>{
 const r=auditNatureG0Overlay(fixture());
 assert.equal(r.authorizedPhysicalMeasurements,0);
 assert.equal(r.geometryActivated,false);
 assert.equal(r.worldViewerOffsetApplied,false);
 assert.equal(r.ws10PhysicalQAApproved,false);
 assert.equal(r.ws12IndependentQAApproved,false);
 assert.ok(r.rows.every(x=>x.measuredMeshSurfaceYmm===null&&
  x.measuredColliderYmm===null&&x.physicalReviewerCommit===null));
});
test('stale overlay blob or manager revision fails closed',()=>{
 const data=fixture();
 assert.throws(()=>auditNatureG0Overlay({...data,sourceBlobs:{
  ...NATURE_G0_OVERLAY_SOURCE_BLOBS,ws01Overlay14:'bad',
 }}),/Stale ws01Overlay14/);
 data.ws11Reconciliation.sourceBlobs.ws01Overlay='bad';
 assert.throws(()=>auditNatureG0Overlay(data),/Stale WS11 overlay/);
});
test('priority coordinate drift and fake manager physical success are rejected',()=>{
 const x=fixture();x.ws11Reconciliation.priorityCrosswalk[0].sourceLocalMm=[1,2];
 assert.throws(()=>auditNatureG0Overlay(x),/anchor differs/);
 const y=fixture();y.ws11Reconciliation.priorityCrosswalk[0].runtimeY=100;
 assert.throws(()=>auditNatureG0Overlay(y),/prematurely measured/);
 const z=fixture();z.ws11Reconciliation.G0GeometryApproval=true;
 assert.throws(()=>auditNatureG0Overlay(z),/premature G0/);
});
test('overlapping ID or XZ between original base and new overlay is rejected',()=>{
 const x=fixture();x.ws01Overlay.additionalControlPoints[0].id=x.baseControls[0].id;
 assert.throws(()=>auditNatureG0Overlay(x),/reassigns original WS01/);
 const y=fixture();y.ws01Overlay.additionalControlPoints[0].local_mm=[...y.baseControls[0].local_mm];
 assert.throws(()=>auditNatureG0Overlay(y),/reassigns original WS01/);
 const z=fixture();z.ws01Overlay.additionalControlPoints[1].local_mm=[
  ...z.ws01Overlay.additionalControlPoints[0].local_mm];
 assert.throws(()=>auditNatureG0Overlay(z),/Duplicate WS01 overlay/);
});
test('invalid target activation and source mutation are rejected or absent',()=>{
 const data=fixture(),before=JSON.stringify(data),original=JSON.stringify(TARGETS);
 const r=auditNatureG0Overlay(data);
 assert.equal(JSON.stringify(data),before);
 assert.equal(JSON.stringify(TARGETS),original);
 assert.equal(Object.isFrozen(r.rows),true);
 assert.throws(()=>auditNatureG0Overlay({...fixture(),
  natureTargets:TARGETS.map(t=>t.sourceId==='S30-LANTERN_GROVE'?
   {...t,runtimeVerified:true}:t)}),/newly activated/);
});
