// Read-only diagnostics for GAME 3D's generic Wolfveil southwest decorations.
// Uses exact instance matrices after all thinning/batching; no scene mutation,
// client/server collider or terrain edits. All X/Z are LOCAL to Wolfveil and
// the parent group applies +70m world-Z once, outside these calculations.
import {
  WOLFVEIL_SW_QUALITY,wolfveilIsSWQualityQuarter,
  wolfveilIsEligibleSWDecoration,
} from './WolfveilSWQuarterQuality.mjs';

/** Exact shared hit-test bypass for generic Play decoration. A stable function
 * reference makes the auditor verify behavior, not just decorativeOnly flags.
 * Do not use this for actual terrain, interactive platforms or tree colliders.
 */
export function wolfveilNoDecorRaycast(){}

export function wolfveilDecorAuditKind(name=''){
  if(/^SWV_Natural_3D_Grass_-?[0-9]+:-?[0-9]+$/.test(name)||
     name==='SWV_SWQuarter_Consolidated_Grass_Batch'||
     name==='SWV_Natural_3D_Grass_WestRock_ScatteredGrassIslands'||
     name==='SWV_RiverFlow_RouteGrass')return 'grass';
  if(name==='SWV_RiverFlow_BlueCyan_Understory')return 'shrub';
  if(name==='SWV_Natural_Path_Edge_Weathered_Stones')return 'stone';
  // Exclude all specific 5m/100m owner-tile grass, moss and stones.
  return null;
}

const nonnegativeInt=n=>Number.isInteger(n)&&n>=0?n:0;
const triangleCount=geometry=>{
  const count=geometry?.index?.count??geometry?.attributes?.position?.count;
  return Number.isFinite(count)&&count>=0?Math.floor(count/3):0;
};
const scaleOf=(m,axis)=>{
  const a=m.elements;
  // Column-major local transforms: 3x3 transform decomposed without heap
  // allocations; yaw and tilt do not change footprint width.
  const j=axis===0?0:8;
  return Math.hypot(a[j],a[j+1],a[j+2]);
};

export function auditWolfveilSWDecorMeshes({
  grassMeshes=[],flowShrubs=null,stones=null,
}={},THREE={}){
  if(!THREE?.Matrix4)throw new TypeError('Audit requires THREE.Matrix4');
  const batches=[...new Set([
    ...(Array.isArray(grassMeshes)?grassMeshes:[]),flowShrubs,stones,
  ].filter(Boolean))];
  const report={
    id:WOLFVEIL_SW_QUALITY.id,
    measurement:'real CPU instance matrices; NOT GPU draw-call timing or FPS',
    sceneOffsetAppliedByParentOnly:true,
    decoratedMeshesRead:0,instancedBatches:0,
    recordedInstances:0,invalidMatrices:0,
    southwestRootInstances:0,southwestEligibleFootprints:0,
    southwestProtectedOrSeamInstances:0,outsideSouthwestInstances:0,
    visualMeshesStillRaycastable:0,
    mismatchedNonColliderMetadata:0,
    estimatedInstanceTriangles:0,estimatedSouthwestTriangles:0,
    byKind:{grass:0,shrub:0,stone:0},
  };
  const m=new THREE.Matrix4();
  for(const mesh of batches){
    const kind=wolfveilDecorAuditKind(mesh?.name);
    if(!kind||!mesh?.isInstancedMesh||typeof mesh.getMatrixAt!=='function')
      continue;
    const count=nonnegativeInt(mesh.count);
    report.decoratedMeshesRead++;
    if(count>0)report.instancedBatches++;
    // A userData flag does NOT override InstancedMesh.raycast. Earlier QA
    // falsely certified any mesh with nonCollider:true as safe even when
    // Three.js would still intersect its triangles.
    if(count>0&&mesh.raycast!==wolfveilNoDecorRaycast)
      report.visualMeshesStillRaycastable++;
    if(count>0&&(!mesh.userData?.nonCollider||
       mesh.userData?.decorativeOnly!==true))
      report.mismatchedNonColliderMetadata++;
    const triangles=triangleCount(mesh.geometry);
    report.byKind[kind]+=count;
    report.recordedInstances+=count;
    report.estimatedInstanceTriangles+=triangles*count;
    for(let i=0;i<count;i++){
      mesh.getMatrixAt(i,m);
      const x=m.elements[12],z=m.elements[14];
      if(!Number.isFinite(x)||!Number.isFinite(z)){
        report.invalidMatrices++;continue;
      }
      if(!wolfveilIsSWQualityQuarter(x,z)){
        report.outsideSouthwestInstances++;continue;
      }
      report.southwestRootInstances++;
      report.estimatedSouthwestTriangles+=triangles;
      const width=scaleOf(m,0),depth=scaleOf(m,2);
      const p={x,z,width:Math.max(width,depth),
        scale:width/1.15,size:width/1.18};
      // Any owner-square overlap, outer map seam or large decorative footprint
      // must be counted as PROTECTED, never categorized as removable.
      // Matrix scales are the FINAL placed visual dimensions; do not
      // mistake safe retained grass near a tile edge for owner-overlap
      // by reserving its planned +10% width a second time.
      if(wolfveilIsEligibleSWDecoration(p,kind,true))
        report.southwestEligibleFootprints++;
      else report.southwestProtectedOrSeamInstances++;
    }
  }
  return report;
}
