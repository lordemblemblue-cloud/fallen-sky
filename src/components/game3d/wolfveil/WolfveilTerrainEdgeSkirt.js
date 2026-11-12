import * as THREE from 'three';
import { wolfveilHeight } from './WolfveilLayout.js';

/**
 * Non-colliding visual material below the outer edges of the EXISTING Wolfveil
 * terrain. Prevents seeing sky through the open side of the terrain mesh while
 * retaining exactly the same span, height, terrain mesh, BVH and world size.
 */
export function addWolfveilTerrainEdgeSkirt(world,{span=1100,depth=150}={}){
  if(!world?.mesh||!Array.isArray(world.ownedMaterials))
    throw Error('Wolfveil visual edge requires the existing world builder');
  if(!Number.isFinite(span)||span<=0||!Number.isFinite(depth)||depth<=0)
    throw RangeError('Invalid edge skirt bounds');
  const half=span/2,positions=[],colors=[];
  const colorTop=new THREE.Color(0x69736a),colorBottom=new THREE.Color(0x3b4249);
  function vertex(x,y,z,color){
    positions.push(x,y,z);colors.push(color.r,color.g,color.b);
  }
  function edge(x0,z0,x1,z1,steps){
    for(let i=0;i<steps;i++){
      const a=i/steps,b=(i+1)/steps;
      const ax=x0+(x1-x0)*a,az=z0+(z1-z0)*a;
      const bx=x0+(x1-x0)*b,bz=z0+(z1-z0)*b;
      const ay=wolfveilHeight(ax,az),by=wolfveilHeight(bx,bz);
      vertex(ax,ay,az,colorTop);
      vertex(bx,by,bz,colorTop);
      vertex(ax,ay-depth,az,colorBottom);
      vertex(bx,by,bz,colorTop);
      vertex(bx,by-depth,bz,colorBottom);
      vertex(ax,ay-depth,az,colorBottom);
    }
  }
  const steps=Math.max(24,Math.min(256,Math.ceil(span/8)));
  edge(-half,-half,half,-half,steps);
  edge(half,-half,half,half,steps);
  edge(half,half,-half,half,steps);
  edge(-half,half,-half,-half,steps);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({
    vertexColors:true,roughness:.98,side:THREE.DoubleSide,
  });
  world.ownedMaterials.push(material);
  const skirt=new THREE.Mesh(geometry,material);
  skirt.name='SWV_Outer_Terrain_Edge_Cliff_VisualOnly';
  skirt.userData={visualOnly:true,nonCollider:true,notWalkable:true};
  skirt.raycast=()=>{};
  skirt.receiveShadow=true;skirt.castShadow=false;
  return world.mesh(skirt);
}
