// An opaque, CPU-authored moss/soil ground for the actual Wolfveil terrain.
// The older onBeforeCompile fragment injection could leave the only physical
// terrain invisible when the material shader failed on the hosted renderer.
// Keep the source positions, indices, BVH and walkability strictly unchanged.
// Subtle painted pigment + fine directional Sumi-e brush fibers work alongside
// independently animated 3D blades; no borrowed Zelda textures or models.
import * as THREE from 'three';
import { WOLFVEIL_SPAWN_TILE } from './WolfveilSpawnTile.js';
import { wolfveilRouteClearance } from './WolfveilLayout.js';
import { clearOf } from './WolfveilForestLayout.js';

const clamp01 = n => Math.max(0,Math.min(1,n));
const smoothstep = (a,b,n) => {
  const t=clamp01((n-a)/(b-a));
  return t*t*(3-2*t);
};
const TAU=Math.PI*2;
const SIZE=96;

export function makeWolfveilInkGrassTexture() {
  const pixels=new Uint8Array(SIZE*SIZE*4);
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    // All harmonics have integer periods: the tile repeats without seams.
    const u=x/SIZE,v=y/SIZE,at=(y*SIZE+x)*4;
    const wash=.5+.22*Math.sin(TAU*(3*u+2*v))+
      .16*Math.sin(TAU*(7*u-5*v));
    const fibers=Math.pow(Math.max(0,Math.sin(TAU*29*u+
      .38*Math.sin(TAU*4*v))),18);
    const stipple=Math.pow(Math.max(0,Math.sin(TAU*(17*u+19*v))),22);
    // Neutral ink-fiber relief is tinted by the real grass/soil vertex color;
    // applying a green texture to the entire terrain had discolored dirt.
    const shade=18*(wash-.5)-17*fibers-7*stipple;
    const pigment=Math.round(Math.max(188,Math.min(250,238+shade)));
    pixels[at]=pigment;
    pixels[at+1]=Math.min(255,pigment+1);
    pixels[at+2]=Math.max(0,pigment-2);
    pixels[at+3]=255; // never alpha-cut the walkable terrain
  }
  const texture=new THREE.DataTexture(pixels,SIZE,SIZE,THREE.RGBAFormat);
  texture.name='Wolfveil_SumiE_SeamlessGrassPigment';
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=4;
  texture.needsUpdate=true;
  return texture;
}

export function applyWolfveilSpawnGroundDetail(material, geometry) {
  if(!material?.isMeshStandardMaterial)throw Error('Spawn ground requires the current standard terrain material');
  const position=geometry?.getAttribute?.('position'),colors=geometry?.getAttribute?.('color');
  if(!position||!colors||position.count!==colors.count)
    throw Error('Spawn ground requires the actual contoured vertex-color terrain');
  const {centerX,centerZ,halfExtent,edgeBlendMeters}=WOLFVEIL_SPAWN_TILE;
  const normals=geometry.getAttribute?.('normal');
  // Sample the same muted vegetation palette as the real 3D grass clumps.
  // All colors here are linear-space THREE.Color channels, not raw hex RGB.
  const freshGrass=new THREE.Color(0x658646);
  const deepGrass=new THREE.Color(0x496739);
  const earth=new THREE.Color(0x78664e);
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),z=position.getZ(i),relX=x-centerX,relZ=z-centerZ;
    const border=Math.max(Math.abs(relX),Math.abs(relZ));
    const edgeMask=1-smoothstep(halfExtent-edgeBlendMeters,halfExtent,border);
    if(edgeMask<0.001)continue; // retain original biome beyond the blend edge
    const plazaMask=smoothstep(18,27,Math.hypot(relX,relZ));
    // Follow ALL actual authored routes, not a hardcoded strip through X=0.
    // Soil shoulders naturally turn to grass 1–7m outside the path edge.
    const routeFade=smoothstep(1,7,wolfveilRouteClearance(x,z));
    const steepness=normals?1-smoothstep(.68,.95,Math.abs(normals.getY(i))):0;
    const coverage=clearOf({x,z},.12)?1:.55;
    const grassMask=plazaMask*routeFade*(1-.72*steepness)*coverage;
    const wash=.5+.25*Math.sin(x*.21+Math.sin(z*.19))+
      .2*Math.sin(z*.18-x*.09);
    const fine=.5+.5*Math.sin(z*.92+x*.16);
    const mix=clamp01(.24+.60*wash+.12*fine);
    const turf=[
      deepGrass.r*(1-mix)+freshGrass.r*mix,
      deepGrass.g*(1-mix)+freshGrass.g*mix,
      deepGrass.b*(1-mix)+freshGrass.b*mix,
    ];
    const base=[colors.getX(i),colors.getY(i),colors.getZ(i)];
    const soilWeight=edgeMask*(1-grassMask)*.55;
    const turfWeight=edgeMask*grassMask*.94;
    colors.setXYZ(i,
      (base[0]*(1-soilWeight)+earth.r*soilWeight)*(1-turfWeight)+turf[0]*turfWeight,
      (base[1]*(1-soilWeight)+earth.g*soilWeight)*(1-turfWeight)+turf[1]*turfWeight,
      (base[2]*(1-soilWeight)+earth.b*soilWeight)*(1-turfWeight)+turf[2]*turfWeight);
  }
  colors.needsUpdate=true;
  // Existing UVs are metre-anchored (x/7,z/7) and repeat the ink/pigment.
  // Importantly, NO custom terrain shader is used, so the physical ground
  // remains visible if a decorative shader cannot compile on the device.
  material.map=makeWolfveilInkGrassTexture();
  material.vertexColors=true;
  material.transparent=false;
  material.opacity=1;
  material.depthTest=true;
  material.depthWrite=true;
  material.side=THREE.DoubleSide;
  material.name='Wolfveil_Opaque_SumiE_Grass_And_Soil';
  material.userData.spawnTile=WOLFVEIL_SPAWN_TILE.id;
  material.needsUpdate=true;
  return material;
}
