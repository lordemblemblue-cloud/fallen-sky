/**
 * X46-Z116 Play-only visual mount. No separate world/collision writer.
 * WolfveilScene's parent group applies +70m Z exactly once. Never offset
 * these authored-local meshes here or use worldZ audit fields.
 */
import {prepareX46Z116VisualBatches} from './WolfveilSquareX46Z116Visual.mjs';
import {Fn,If,vec3,vec4,max,min,length} from 'three/tsl';
import {attachNodes,copyNodes,instanceMatrix} from '../../../../lib/webgpuNodeKit.js';

// WebGPURenderer: the same seam clamp in TSL, after the source grass positionNode (wind + contacts). Scaling the
// instance-local xz by k scales the instanced offset from the root by k (yaw + scale instance matrices).
const x46Clamp=new WeakMap();
function seamSafePosition(base){
  if(!x46Clamp.has(base))x46Clamp.set(base,Fn(()=>{
    const p=vec3(base).toVar();
    const root=instanceMatrix().mul(vec4(0,0,0,1)).xyz.toVar();
    const offset=p.xz.sub(root.xz).toVar();
    const limit=max(0,min(min(root.x.add(320),root.x.negate().sub(315)),min(root.z.sub(30),root.z.negate().add(35))).sub(.005));
    const span=length(offset);
    If(span.greaterThan(limit).and(span.greaterThan(.00001)),()=>{
      const k=limit.div(span);
      p.assign(vec3(root.x.add(offset.x.mul(k)),p.y,root.z.add(offset.y.mul(k))));
    });
    return p;
  })());
  return x46Clamp.get(base);
}

// Limit X46 vertices AFTER the shared wind/contact deformation but BEFORE
// projection. This standalone grass material clone never alters other squares.
export function createX46Z116SeamSafeGrassMaterial(grassMaterial){
  if(!grassMaterial||typeof grassMaterial.clone!=='function')
    throw new TypeError('X46-Z116 requires existing cloneable wind material');
  const sourceHook=grassMaterial.onBeforeCompile;
  const sourceKey=grassMaterial.customProgramCacheKey;
  const tileMaterial=grassMaterial.clone();
  tileMaterial.name='Wolfveil_X46Z116_LivingSumiE_GrassSeamSafe';
  tileMaterial.onBeforeCompile=function(shader,renderer){
    if(typeof sourceHook==='function')sourceHook.call(this,shader,renderer);
    if(!shader?.vertexShader?.includes('#include <project_vertex>'))
      throw new TypeError('X46-Z116 requires project_vertex after grass wind');
    shader.vertexShader=shader.vertexShader.replace(
      '#include <project_vertex>',`
#ifdef USE_INSTANCING
// All six contact traces are already applied to transformed by the original
// grass shader. Clamp the INSTANCE-SPACE radius before scene +70m Z,
// preserving owner tile X [-320,-315] and authored Z [30,35].
vec3 x46Root=(instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
vec2 x46Offset=(instanceMatrix*vec4(transformed,1.)).xz-x46Root.xz;
float x46Limit=max(0.,min(
  min(x46Root.x+320.,-315.-x46Root.x),
  min(x46Root.z-30.,35.-x46Root.z))-.005);
float x46Span=length(x46Offset);
if(x46Span>x46Limit && x46Span>.00001)
  transformed.xz*=x46Limit/x46Span;
#endif
#include <project_vertex>`);
  };
  tileMaterial.customProgramCacheKey=function(){
    const prior=typeof sourceKey==='function'?sourceKey.call(grassMaterial):'';
    return String(prior)+'|wolfveil-x46-seam-safe-6-contact-v1';
  };
  // WebGPURenderer: the source grass nodes (clone() does not copy them) + the clamp
  copyNodes(grassMaterial,tileMaterial);
  if(tileMaterial.positionNode)attachNodes(tileMaterial,{positionNode:seamSafePosition(tileMaterial.positionNode)},
    {nodesStatic:tileMaterial.nodesStatic!==false});
  tileMaterial.needsUpdate=true;
  return tileMaterial;
}

export function mountWolfveilSquareX46Z116Visuals({
  plan,THREE,world,grassMaterial,stoneMaterial,stoneGeometry,
}={}){
  // Fail closed BEFORE any mesh is created/registered.
  const batch=prepareX46Z116VisualBatches(plan);
  if(!THREE?.BufferGeometry||!THREE?.Float32BufferAttribute||
    !THREE?.Uint16BufferAttribute||
    !THREE?.Object3D||!THREE?.InstancedMesh||!THREE?.Color||
    typeof world?.mesh!=='function'||!Array.isArray(world?.ownedMaterials)||
    !Array.isArray(world?.meshes)||typeof world?.group?.remove!=='function'||
    typeof grassMaterial?.clone!=='function'||!stoneMaterial||
    !stoneGeometry||typeof stoneGeometry.clone!=='function')
    throw new TypeError('X46-Z116 requires existing World/THREE grass and stone dependencies');

  const staged=[],ownedMaterials=[],dummy=new THREE.Object3D();
  if(batch.grass.length){
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(batch.grassGeometry.positions,3));
    // Three.js setIndex accepts a JS Array or BufferAttribute, NOT a raw
    // typed array. Without this wrapper computeVertexNormals()/GPU fail.
    g.setIndex(new THREE.Uint16BufferAttribute(batch.grassGeometry.indices,1));
    g.computeVertexNormals();
    const tileMaterial=createX46Z116SeamSafeGrassMaterial(grassMaterial);
    ownedMaterials.push(tileMaterial);
    const mesh=new THREE.InstancedMesh(g,tileMaterial,batch.grass.length);
    for(let i=0;i<batch.grass.length;i++){
      const p=batch.grass[i];
      dummy.position.set(p.x,p.y,p.z);
      dummy.rotation.set(0,p.yaw,0);
      dummy.scale.set(p.scaleX,p.scaleY,p.scaleZ);
      dummy.updateMatrix();
      mesh.setMatrixAt(i,dummy.matrix);
      mesh.setColorAt(i,new THREE.Color(p.color));
    }
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingSphere?.();
    mesh.name='SWV_X46_Z116_LivingSumiE_3DBlades';
    mesh.castShadow=false;mesh.receiveShadow=true;
    mesh.raycast=()=>{};
    mesh.userData={tileId:'X46-Z116',kind:'grass',decorativeOnly:true,
      nonCollider:true,rootOffsetApplied:false,sharedMaterialHooks:true,
      tileOnlySeamClip:true};
    staged.push(mesh);
  }
  if(batch.stones.length){
    const mesh=new THREE.InstancedMesh(
      stoneGeometry.clone(),stoneMaterial,batch.stones.length);
    for(let i=0;i<batch.stones.length;i++){
      const p=batch.stones[i];
      dummy.position.set(p.x,p.y,p.z);
      dummy.rotation.set(0,p.yaw,0);
      dummy.scale.set(p.size*1.18,p.size*.42,p.size*.91);
      dummy.updateMatrix();
      mesh.setMatrixAt(i,dummy.matrix);
      mesh.setColorAt(i,new THREE.Color(p.color));
    }
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingSphere?.();
    mesh.name='SWV_X46_Z116_LivingSumiE_MossStones';
    mesh.castShadow=false;mesh.receiveShadow=true;
    mesh.raycast=()=>{};
    mesh.userData={tileId:'X46-Z116',kind:'stones',decorativeOnly:true,
      nonCollider:true,rootOffsetApplied:false,sharedMaterials:true};
    staged.push(mesh);
  }
  // The real WolfveilBuilder tracks both group children and world.meshes.
  // On a partial registration error, undo this tile's meshes and resources:
  // otherwise an interrupted second batch leaves duplicate vegetation on retry.
  try{
    for(const mesh of staged)world.mesh(mesh);
    world.ownedMaterials.push(...ownedMaterials);
  }catch(err){
    for(const mesh of staged){
      world.group.remove(mesh);
      const index=world.meshes.indexOf(mesh);
      if(index>=0)world.meshes.splice(index,1);
      mesh.geometry?.dispose?.();
    }
    for(const mat of ownedMaterials)mat.dispose?.();
    throw err;
  }
  return {tileId:'X46-Z116',meshes:staged,counts:{
      grass:batch.grass.length,stones:batch.stones.length,
      blades:batch.grass.length*batch.grassGeometry.bladeCount,
    },decorativeOnly:true,collidersAdded:0,terrainChanged:false,
    worldZOffsetHandledByParent:true};
}
