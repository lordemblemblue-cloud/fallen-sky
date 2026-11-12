// LAND-WS06 (#1295): independent, opt-in renderer adapter for X100-Z189 ONLY.
// Caller supplies the existing Wolfveil geometry, materials, and real builder.
// This module never installs itself into shared scenes or creates colliders.
import {WOLFVEIL_SQUARE_X100_Z189 as TILE,
  auditWolfveilSquareX100Z189} from './WolfveilSquareX100Z189.mjs';

const LIMITS=Object.freeze({'upright-grass':225,'weathered-stone':2,'moss-fern':2});
const GROUPS=Object.freeze([
  {kind:'upright-grass',label:'grass',material:'grass',geometry:'grass'},
  {kind:'weathered-stone',label:'stone',material:'stone',geometry:'stone'},
  {kind:'moss-fern',label:'moss',material:'grass',geometry:'grass'},
]);
const finite=Number.isFinite;

/**
 * Stage at most three instanced draw batches, with no new shaders, meshes per
 * blade, global scene edits, or world-offset duplication. This is deliberately
 * NOT an automatic Play mount; WS15 owns calling it after scene review.
 *
 * The parent's WolfveilBuilder.group.position.z is +70 ONLY in Game 3D Play.
 * Geometry is the existing 7-blade physical taper or weathered icosahedron.
 */
export function mountWolfveilSquareX100Z189Visuals({
  plan,THREE,world,grassGeometry,stoneGeometry,grassMaterial,stoneMaterial,
}={}){
  const validPlan=plan?.id===TILE.id&&plan?.square?.id===TILE.id&&
    plan.changesTerrain===false&&plan.changesServerCollision===false&&
    plan.newTreeTrunks===0&&plan.rendererMounted===false&&
    plan.realPlayEvidence===false&&Array.isArray(plan.placements);
  if(!validPlan||!auditWolfveilSquareX100Z189(plan).passed)
    throw new TypeError('X100-Z189 requires a valid visual-only audited plan');
  if(world?.group?.position?.z!==TILE.zOffset||typeof world?.mesh!=='function'||
      !Array.isArray(world?.ownedMaterials)||
      !THREE?.Object3D||!THREE?.InstancedMesh||!THREE?.Color||
      typeof grassGeometry?.clone!=='function'||typeof stoneGeometry?.clone!=='function'||
      !grassMaterial||!stoneMaterial)
    throw new TypeError('X100-Z189 requires live Play +70m builder and shared PBR dependencies');

  const grouped=new Map(GROUPS.map(x=>[x.kind,[]]));
  for(const p of plan.placements){
    const target=grouped.get(p.kind);
    if(!target||!finite(p.yaw)||!finite(p.radius)||p.radius<=0||
      !finite(p.height)||p.height<=0||!finite(p.x)||!finite(p.z)||
      !finite(p.y)||!finite(p.worldZ)||!finite(p.worldX))
      throw new RangeError('X100-Z189 invalid visual placement');
    target.push(p);
    if(target.length>LIMITS[p.kind])throw new RangeError('X100-Z189 draw budget exceeded');
  }

  const dummy=new THREE.Object3D();
  const meshes=[],counts={grass:0,stones:0,moss:0};
  // Build all batches first, then publish them; incomplete validation cannot
  // leave half the tile installed in the shared scene.
  for(const group of GROUPS){
    const items=grouped.get(group.kind);
    if(items.length===0)continue;
    const geometry=(group.geometry==='grass'?grassGeometry:stoneGeometry).clone();
    const material=group.material==='grass'?grassMaterial:stoneMaterial;
    const mesh=new THREE.InstancedMesh(geometry,material,items.length);
    for(let i=0;i<items.length;i++){
      const p=items[i];
      const stone=group.kind==='weathered-stone';
      // Stone centers sit slightly underground: weathered mineral contact
      // instead of floating or making a second walkable terrain surface.
      dummy.position.set(p.x,stone?p.y+p.height*.28:p.y-.018,p.z);
      dummy.rotation.set(0,p.yaw,0);
      const footprint=stone?p.radius*.80:p.radius/.22;
      dummy.scale.set(footprint,stone?p.height*.70:p.height/.80,
        stone?p.radius*.67:footprint);
      dummy.updateMatrix();
      mesh.setMatrixAt(i,dummy.matrix);
      mesh.setColorAt(i,new THREE.Color(p.color));
    }
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingSphere?.();
    mesh.name='SWV_WS06_X100_Z189_'+group.label;
    mesh.castShadow=false;
    mesh.receiveShadow=true;
    mesh.raycast=()=>{};
    mesh.userData={tileId:TILE.id,kind:group.label,decorativeOnly:true,
      nonCollider:true,localCoordinates:true,worldZOffsetHandledByParent:true,
      existingPBRMaterial:true};
    meshes.push(mesh);
    counts[group.label==='stone'?'stones':group.label]=items.length;
  }
  for(const mesh of meshes)world.mesh(mesh);
  return Object.freeze({tileId:TILE.id,meshes,counts,
    decorativeOnly:true,newTreeTrunks:0,collidersAdded:0,
    terrainEdited:false,worldOffsetZAppliedOnce:true,
    liveVisualQA:false});
}
