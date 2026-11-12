// Owner-supplied dirt plus a verified bundled stone texture on the WESTERN
// Wolfveil hillside. This is a soft, decorative material layer, not a second
// physical floor: original terrain vertices/BVH and server height stay primary.
import * as THREE from 'three';
import {WOLFVEIL_WEST_HILLSIDE} from './WolfveilWestHillside.mjs';
import {wolfveilRockSideBlend} from './WolfveilWestRockGrassPockets.mjs';

export const WOLFVEIL_WEST_LANDSCAPE_TEXTURES=Object.freeze({
  // User's actual uploaded image from their Base44 asset library.
  dirt:'https://media.base44.com/images/public/6876751a602125f45f1861b9/07252ce5b_Realistic_Fantasy_Dirt_Terrain_Tile-1.png',
  // No separate uploaded rock map was found. Reuse the app's EXISTING
  // original training-stone photo instead of guessing an external URL.
  rock:'/game2/materials/training-stone.jpg',
});
function flatTexture(r,g,b){
  const t=new THREE.DataTexture(new Uint8Array([r,g,b,255]),1,1,THREE.RGBAFormat);
  t.colorSpace=THREE.SRGBColorSpace;
  t.needsUpdate=true;
  return t;
}
export function addWolfveilWestHillsideLandscaping(world,baseGeometry,{span=1100,segments=310}={}){
  if(!world?.mesh||!baseGeometry?.getAttribute||!Number.isInteger(segments)||segments<8)
    throw new TypeError('Western landscaping requires the existing Wolfveil ground geometry');
  const original=baseGeometry.getAttribute('position');
  const normals=baseGeometry.getAttribute('normal');
  if(!original||original.count!==(segments+1)*(segments+1))
    throw new TypeError('Western landscaping needs vertex-identical terrain grid');
  const west=WOLFVEIL_WEST_HILLSIDE;
  const positions=[],uvs=[],masks=[],slopes=[],indices=[];
  const grid=new Map();
  const lookup=(xi,zi)=>zi*(segments+1)+xi;
  const extent=segments+1;
  for(let zi=0;zi<extent;zi++){
    const z=(zi/segments-.5)*span;
    if(z < -span*.5-4 || z > span*.5+4)continue;
    for(let xi=0;xi<extent;xi++){
      const x=(xi/segments-.5)*span;
      if(x<west.minX-4||x>-34)continue;
      const index=lookup(xi,zi);
      // Exact original ground vertex + only 0.042m, not a heightfield copy
      // sampled from a competing equation or an invisible walkable plane.
      positions.push(x,original.getY(index)+.042,z);
      uvs.push(x*.16,z*.16);
      // The owner dirt/stone treatment now spans the ENTIRE west side
      // (including north and south), rather than the limited hill-grade zone.
      // It uses the same sourced material family as the streamed far west.
      masks.push(wolfveilRockSideBlend(x,z));
      slopes.push(normals?Math.max(0,Math.min(1,Math.abs(normals.getY(index)))):1);
      grid.set(index,positions.length/3-1);
    }
  }
  for(let zi=0;zi<segments;zi++)for(let xi=0;xi<segments;xi++){
    const p=lookup(xi,zi),q=p+extent;
    if(!grid.has(p)||!grid.has(q)||!grid.has(p+1)||!grid.has(q+1))continue;
    indices.push(grid.get(p),grid.get(q),grid.get(p+1),
      grid.get(q),grid.get(q+1),grid.get(p+1));
  }
  const geom=new THREE.BufferGeometry();
  geom.setIndex(indices);
  geom.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geom.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geom.setAttribute('aWestMask',new THREE.Float32BufferAttribute(masks,1));
  geom.setAttribute('aWestUpright',new THREE.Float32BufferAttribute(slopes,1));
  geom.computeVertexNormals();

  const dirt={value:flatTexture(116,92,70)};
  const stone={value:flatTexture(124,127,127)};
  const textures=new Set([dirt.value,stone.value]);
  let disposed=false;
  const load=(url,holder)=>{
    new THREE.TextureLoader().load(url,tex=>{
      if(disposed){tex.dispose();return;}
      tex.colorSpace=THREE.SRGBColorSpace;
      tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
      tex.minFilter=THREE.LinearMipmapLinearFilter;
      tex.magFilter=THREE.LinearFilter;
      tex.anisotropy=4;tex.needsUpdate=true;
      textures.add(tex);
      holder.value=tex;
    },undefined,()=>{/* Retain safe color fallback and original ground. */});
  };
  // Use the game's real physically based lights and normal response.
  // A failed decorative shader never affects the underlying BVH terrain.
  // A white 1-pixel standard map forces Three.js's UV pipeline on.
  // The owner's two actual textures are sampled separately below.
  const neutral=flatTexture(255,255,255);
  textures.add(neutral);
  const mat=new THREE.MeshStandardMaterial({
    map:neutral,color:0xffffff,roughness:.94,metalness:0,side:THREE.DoubleSide,
    transparent:true,depthTest:true,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
  });
  mat.customProgramCacheKey=()=> 'wolfveil-west-owner-dirt-stone-lit-v1';
  mat.onBeforeCompile=shader=>{
    shader.uniforms.uDirt=dirt;
    shader.uniforms.uStone=stone;
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>',`#include <common>
attribute float aWestMask;
attribute float aWestUpright;
varying vec2 vSoilUV;
varying float vLandMask;
varying float vUpright;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
vSoilUV=uv;
vLandMask=aWestMask;
vUpright=aWestUpright;`);
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>',`#include <common>
uniform sampler2D uDirt;
uniform sampler2D uStone;
varying vec2 vSoilUV;
varying float vLandMask;
varying float vUpright;`)
      .replace('#include <map_fragment>',`#include <map_fragment>
vec2 soilUV=vSoilUV;
float tone=sin(soilUV.x*2.37+cos(soilUV.y*1.8))*
  sin(soilUV.y*2.81-soilUV.x*.63);
float grit=smoothstep(.1,.82,.48+.39*tone+.35*(1.0-vUpright));
vec3 ownerSoil=texture2D(uDirt,soilUV).rgb;
vec3 ownerRock=texture2D(uStone,soilUV*1.13).rgb;
vec3 ownerColor=mix(ownerSoil,ownerRock,grit*.80);
diffuseColor.rgb*=mix(ownerColor,ownerColor*vec3(.82,.92,.94),.13);
diffuseColor.a*=clamp(vLandMask*.98,0.,.98);`);
  };
  mat.name='WV_West_Owner_Dirt_WeatheredStone_Blend_NoCollision';
  world.ownedMaterials.push(mat);
  const mesh=new THREE.Mesh(geom,mat);
  mesh.name='WV_West_Hillside_RealisticDirtStone_SoftLandscape';
  mesh.userData={decorativeOnly:true,notWalkable:true,nonCollider:true,ownerDirt:true};
  mesh.raycast=()=>{};
  mesh.castShadow=false;mesh.receiveShadow=false;
  world.mesh(mesh);
  // Server and Node geometry tests have no DOM image loader; retain the
  // safe fallback texels there. The live browser loads both authored maps.
  if(typeof document!=='undefined'){
    load(WOLFVEIL_WEST_LANDSCAPE_TEXTURES.dirt,dirt);
    load(WOLFVEIL_WEST_LANDSCAPE_TEXTURES.rock,stone);
  }
  return {mesh,vertexCount:positions.length/3,triangleCount:indices.length/3,
    dispose(){
      if(disposed)return;disposed=true;
      for(const tex of textures)tex.dispose();
      textures.clear();
    }};
}
