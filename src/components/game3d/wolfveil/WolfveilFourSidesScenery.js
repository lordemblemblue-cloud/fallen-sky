// Draws the planted sides of Wolfveil (WolfveilFourSidesPlan.mjs): one
// instanced batch per kind and side, so a whole forest is a handful of draw
// calls. Scenery only: it is never a floor or a click target. Tree trunks
// block the way through the shared trunk list (WolfveilTrunkColliders.mjs),
// not through these meshes.
import * as THREE from 'three';
import {createWolfveilTerrainSurfaceSampler} from './WolfveilTerrainSurfaceSampler.mjs';
import {WOLFVEIL_PLANTED_SIDES,wolfveilPlantedSide} from './WolfveilTrunkColliders.mjs';
import {WOLFVEIL_SIDE_SCENERY_LABELS,wolfveilSideSceneryShape,
  wolfveilSideSceneryInstances} from './WolfveilSideSceneryShapes.mjs';

export const WOLFVEIL_FOUR_SIDES_SCENERY_SOURCE='wolfveil_four_sides';

function geometryOf(kind){
  const shape=wolfveilSideSceneryShape(kind);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(shape.position,3));
  geometry.setAttribute('color',new THREE.BufferAttribute(shape.color,3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}

/**
 * @param world the Wolfveil world (positions are Wolfveil-local metres)
 * @param heightAt the visible ground; made here when the caller has none
 * @returns {{meshes,stats:{sides,pieces,triangles,drawCalls,byKind}}}
 */
export function buildWolfveilFourSidesScenery(world,{heightAt,terrainSpan=1100,terrainSegments=310,
  sides=WOLFVEIL_PLANTED_SIDES}={}){
  const ground=heightAt||createWolfveilTerrainSurfaceSampler({span:terrainSpan,segments:terrainSegments});
  // Leaves and fronds are single sheets seen from both faces; a boulder is
  // closed, so its far faces are skipped.
  const leafy=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.94,metalness:0,
    vertexColors:true,flatShading:true,side:THREE.DoubleSide});
  const solid=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.97,metalness:0,
    vertexColors:true,flatShading:true});
  const geometries=new Map(),meshes=[];
  const dummy=new THREE.Object3D(),tint=new THREE.Color();
  const stats={sides:[],pieces:0,triangles:0,drawCalls:0,byKind:{}};
  for(const side of sides){
    const plan=wolfveilPlantedSide(side);
    if(!plan)continue;
    const title=String(plan.title).replace(/[^A-Za-z0-9]/g,'');
    const byKind=wolfveilSideSceneryInstances(plan.placements,{heightAt:ground});
    for(const [kind,items] of Object.entries(byKind)){
      if(!items.length)continue;
      if(!geometries.has(kind))geometries.set(kind,geometryOf(kind));
      const shape=wolfveilSideSceneryShape(kind);
      const mesh=new THREE.InstancedMesh(geometries.get(kind),shape.doubleSided?leafy:solid,items.length);
      items.forEach((item,i)=>{
        dummy.position.set(item.x,item.y,item.z);
        dummy.rotation.set(item.tiltX,item.yaw,item.tiltZ);
        dummy.scale.set(item.sx,item.sy,item.sz);
        dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
        mesh.setColorAt(i,tint.setRGB(item.tint[0],item.tint[1],item.tint[2]));
      });
      mesh.instanceMatrix.needsUpdate=true;
      if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
      mesh.computeBoundingBox();mesh.computeBoundingSphere();
      mesh.name='SWV_'+title+'_'+WOLFVEIL_SIDE_SCENERY_LABELS[kind];
      mesh.castShadow=false;mesh.receiveShadow=true;
      mesh.raycast=()=>{};
      mesh.userData={decorativeOnly:true,source:WOLFVEIL_FOUR_SIDES_SCENERY_SOURCE,side,kind};
      world.mesh(mesh);meshes.push(mesh);
      const triangles=shape.triangles*items.length;
      stats.pieces+=items.length;stats.triangles+=triangles;stats.drawCalls++;
      stats.byKind[side+':'+kind]={pieces:items.length,triangles};
    }
    stats.sides.push(side);
  }
  return {meshes,stats};
}
