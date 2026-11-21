// Game 3D terrain surface (2026-11-16 landscaping, round 2).
//
// Low-poly terrain + textures baked from high-resolution detail
// (tools/landscape-bake/bake_textures.py): grass sod, packed dirt, layered
// cliff rock and snow, each with an albedo and a baked normal/height map.
// Per-vertex `aSplat` weights (grass, dirt, rock, snow) come from the
// landscape design; the vertex colour becomes a macro TINT so the large-scale
// palette (dry patches, scorched camps, fighting-ground turf) is preserved.
//
// Shader: height-blended layers, two-scale anti-tiling, triplanar rock on
// steep faces (no stretching on cliffs), whiteout normal blending. It is a
// guarded MeshStandardMaterial patch: until the textures arrive (or in Node)
// 1x1 placeholders keep the terrain fully visible with its palette colour,
// and GameWorld3D can swap back to a plain material if the program fails.
//
// Macro maps (WolfveilTerrainMacro.mjs, scripts/bake-wolfveil-terrain-macro.mjs):
// the same height function evaluated at 0.54 m plus a mountain erosion pass,
// baked to a world-space normal + cavity map and an AO / water-flow / scree
// map. They give the 3.55 m mesh sculpted gullies and ridges, per-pixel
// rock/snow/scree boundaries and valley occlusion. Off until both load.
import * as THREE from 'three';
import {WOLFVEIL_TERRAIN_MACRO} from './WolfveilTerrainMacro.mjs';
import {createWolfveilSplatNodes} from './WolfveilTerrainSplatNodes.mjs';
import {attachNodes} from '../../../lib/webgpuNodeKit.js';

const ROOT='/game3d/landscape/';
// sRGB means printed by the baker; used to turn palette colours into tints.
export const WOLFVEIL_SPLAT_LAYERS=Object.freeze([
  Object.freeze({id:'grass',meters:3.2,roughness:.96,mean:[.174,.228,.077]}),
  Object.freeze({id:'dirt',meters:3.4,roughness:.92,mean:[.411,.324,.228]}),
  // 20 m: fractured blocks read as 1.6-4.4 m rock, not a dry-stone wall.
  Object.freeze({id:'rock',meters:20,roughness:.84,mean:[.394,.378,.352]}),
  Object.freeze({id:'snow',meters:6.0,roughness:.52,mean:[.849,.877,.920]}),
]);
const srgbToLinear=c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
const LINEAR_MEANS=WOLFVEIL_SPLAT_LAYERS.map(l=>l.mean.map(srgbToLinear));

/** Splat weights (grass, dirt, rock, snow) from a landscape surface sample. */
export function wolfveilSplatWeights(surface){
  const rock=Math.max(0,Math.min(1,surface?.rock??0));
  const snow=Math.max(0,Math.min(1-rock,surface?.snow??0));
  const dirt=Math.max(0,Math.min(1-rock-snow,(surface?.dirt??0)*.9));
  const grass=Math.max(0,1-rock-snow-dirt);
  const sum=grass+dirt+rock+snow||1;
  return [grass/sum,dirt/sum,rock/sum,snow/sum];
}

/**
 * Converts absolute (linear) palette colours into tints relative to the
 * blended layer albedo, so textures add detail without changing the palette.
 */
export function wolfveilSplatTint(color,weights,out=[0,0,0]){
  for(let k=0;k<3;k++){
    let base=0;
    for(let i=0;i<4;i++)base+=weights[i]*LINEAR_MEANS[i][k];
    // Capped so a palette far from a layer's mean (grey ash over a green
    // grass texture) cannot blow one channel out into a bluish-white cast.
    out[k]=Math.max(0,Math.min(3.2,color[k]/Math.max(.004,base)));
  }
  return out;
}

/** Adds aSplat + converts the geometry's vertex colours to tints. */
export function applyWolfveilSplatAttributes(geometry,weightsArray){
  const colors=geometry.getAttribute('color');
  if(!colors||weightsArray.length!==colors.count*4)
    throw Error('Wolfveil splat needs one weight vec4 per coloured vertex');
  const w=[0,0,0,0],c=[0,0,0],t=[0,0,0];
  for(let i=0;i<colors.count;i++){
    for(let k=0;k<4;k++)w[k]=weightsArray[i*4+k];
    c[0]=colors.getX(i);c[1]=colors.getY(i);c[2]=colors.getZ(i);
    wolfveilSplatTint(c,w,t);
    colors.setXYZ(i,t[0],t[1],t[2]);
  }
  colors.needsUpdate=true;
  geometry.setAttribute('aSplat',new THREE.Float32BufferAttribute(weightsArray,4));
  return geometry;
}

function placeholder(r,g,b,a,srgb){
  const t=new THREE.DataTexture(new Uint8Array([r,g,b,a]),1,1,THREE.RGBAFormat);
  if(srgb)t.colorSpace=THREE.SRGBColorSpace;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  // Filterable like the textures that replace it: WebGPURenderer builds the shader against the placeholder
  // (a nearest-filtered texture gets no sampler there). Same pixels for a 1x1 texture.
  t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;
  t.needsUpdate=true;
  return t;
}

const VERTEX_HEAD=`
attribute vec4 aSplat;
varying vec4 vSplat;
varying vec3 vSplatWorld;
varying vec3 vSplatNormalW;
`;
const VERTEX_BODY=`
vSplat=aSplat;
vSplatWorld=(modelMatrix*vec4(transformed,1.0)).xyz;
vSplatNormalW=normalize(mat3(modelMatrix)*objectNormal);
`;
const FRAGMENT_HEAD=`
uniform sampler2D tSplatA0,tSplatN0,tSplatA1,tSplatN1,tSplatA2,tSplatN2,tSplatA3,tSplatN3;
uniform vec4 uSplatScale;
uniform vec4 uSplatRough;
uniform sampler2D tMacroN,tMacroM;
uniform vec4 uMacroRect;
uniform float uMacroOn,uMacroFade;
uniform vec3 uRockMean;
varying vec4 vSplat;
varying vec3 vSplatWorld;
varying vec3 vSplatNormalW;
vec3 wvSplatNormalWorld;
float wvMacroAO=1.;
float wvSplatHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float wvSplatNoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(wvSplatHash(i),wvSplatHash(i+vec2(1.,0.)),f.x),
    mix(wvSplatHash(i+vec2(0.,1.)),wvSplatHash(i+vec2(1.,1.)),f.x),f.y);
}
// Planar (XZ) layer: two scales, cross-faded by a macro noise (anti-tiling).
void wvPlanar(sampler2D ta,sampler2D tn,float scale,vec3 nW,float macro,
  out vec3 albedo,out vec3 normalW,out float height){
  vec2 uvA=vSplatWorld.xz*scale;
  vec2 uvB=vSplatWorld.xz*scale*.37+vec2(.31,.67);
  vec4 nA=texture2D(tn,uvA),nB=texture2D(tn,uvB);
  float k=clamp(.25+.5*macro,0.,1.);
  albedo=mix(texture2D(ta,uvA).rgb,texture2D(ta,uvB).rgb,k);
  vec4 n=mix(nA,nB,k);
  vec3 tn3=n.xyz*2.-1.;
  // Whiteout blend onto the surface normal (Y projection: u=x, v=z).
  vec3 b=vec3(tn3.xy+nW.xz,abs(tn3.z)*nW.y);
  normalW=normalize(b.xzy);
  height=n.a;
}
// Triplanar layer for cliff rock: never stretched on steep faces.
void wvTriplanarAt(sampler2D ta,sampler2D tn,float scale,vec3 nW,float macro,
  out vec3 albedo,out vec3 normalW,out float height){
  vec3 w=pow(abs(nW),vec3(4.));w/=(w.x+w.y+w.z);
  vec3 p=vSplatWorld*scale;
  // Let the bedding wander by a few metres (world units, so the far scale is
  // not warped into swirls) instead of repeating in rows.
  p.y+=((macro-.5)*2.5+(wvSplatNoise(vSplatWorld.xz*.011)-.5)*5.)*scale;
  vec3 s=sign(nW+vec3(1e-4));
  vec2 uvX=vec2(p.z*s.x,p.y),uvY=vec2(p.x,p.z*s.y),uvZ=vec2(-p.x*s.z,p.y);
  vec4 nX=texture2D(tn,uvX),nY=texture2D(tn,uvY),nZ=texture2D(tn,uvZ);
  albedo=texture2D(ta,uvX).rgb*w.x+texture2D(ta,uvY).rgb*w.y+texture2D(ta,uvZ).rgb*w.z;
  vec3 tX=nX.xyz*2.-1.,tY=nY.xyz*2.-1.,tZ=nZ.xyz*2.-1.;
  tX.x*=s.x;tZ.x*=-s.z;
  vec3 bX=vec3(tX.xy+nW.zy,abs(tX.z)*nW.x);
  vec3 bY=vec3(tY.xy+nW.xz,abs(tY.z)*nW.y);
  vec3 bZ=vec3(tZ.xy+nW.xy,abs(tZ.z)*nW.z);
  normalW=normalize(bX.zyx*w.x+bY.xzy*w.y+bZ.xyz*w.z);
  height=nX.a*w.x+nY.a*w.y+nZ.a*w.z;
}
// Near: fine strata. Far: 3.4x larger layers so cliffs read as big rock bands
// instead of aliasing into thin stripes.
void wvTriplanar(sampler2D ta,sampler2D tn,float scale,vec3 nW,float macro,
  out vec3 albedo,out vec3 normalW,out float height){
  float far=smoothstep(80.,200.,length(cameraPosition-vSplatWorld));
  vec3 aN=vec3(0.),nN=nW,aF=vec3(0.),nF=nW;float hN=0.,hF=0.;
  if(far<.999)wvTriplanarAt(ta,tn,scale,nW,macro,aN,nN,hN);
  if(far>.001)wvTriplanarAt(ta,tn,scale*.29,nW,macro,aF,nF,hF);
  albedo=mix(aN,aF,far);
  // Distant cliffs: the baked relief (macro normal, cavity, AO) carries the
  // form, so the texture relaxes toward its mean instead of aliasing.
  float veil=smoothstep(140.,420.,length(cameraPosition-vSplatWorld));
  albedo=mix(albedo,uRockMean*(.86+.28*macro),veil*.55);
  normalW=normalize(mix(mix(nN,nF,far),nW,veil*.6));
  height=mix(hN,hF,far);
}
`;
const FRAGMENT_MAP=`
{
  vec3 nV=normalize(vSplatNormalW);
  vec3 nW=nV;
  // Macro maps baked from the 0.54 m surface (+ erosion) of this terrain.
  float mIn=0.,mAO=1.,mFlow=0.,mDepo=0.,mCav=0.;
  if(uMacroOn>.5){
    vec2 muv=(vSplatWorld.xz-uMacroRect.xy)*uMacroRect.zw;
    vec2 edge=min(muv,1.-muv)/uMacroRect.zw;
    mIn=smoothstep(0.,uMacroFade,min(edge.x,edge.y));
    if(mIn>0.){
      vec4 mn=texture2D(tMacroN,muv);
      vec2 nxz=mn.rg*2.-1.;
      vec3 mN=vec3(nxz.x,sqrt(max(.0001,1.-dot(nxz,nxz))),nxz.y);
      nW=normalize(mix(nV,mN,mIn));
      vec4 mm=texture2D(tMacroM,muv);
      mAO=mix(1.,mm.r,mIn);mFlow=mm.g*mIn;mDepo=mm.b*mIn;mCav=(mn.b-.5)*2.*mIn;
    }
  }
  float macro=wvSplatNoise(vSplatWorld.xz*.045)*.65+wvSplatNoise(vSplatWorld.xz*.17)*.35;
  vec4 w=max(vSplat,vec4(0.));
  w/=max(.0001,w.x+w.y+w.z+w.w);
  if(mIn>0.){
    // Per-pixel rock / snow / scree following the baked relief instead of the
    // 3.55 m vertex interpolation. Residual form: the design weights still
    // decide WHERE the ranges are; the bake only sharpens their boundaries.
    float mt=smoothstep(.04,.30,w.z+w.w);
    float rV=smoothstep(.10,.30,1.-nV.y),rP=smoothstep(.10,.30,1.-nW.y);
    float dR=(rP-rV)*mt+max(mCav,0.)*.3*mt;
    w.z=clamp(w.z+dR,0.,1.);
    w.x=max(0.,w.x-max(dR,0.));
    // Snow holds in gullies and on benches, blows off ridges and cliffs.
    w.w=clamp(w.w*(1.-smoothstep(.20,.42,1.-nW.y)*.8)*(1.+mFlow*.7)*(1.-max(mCav,0.)*.6),0.,1.);
    // Scree in gully floors and fans below the cliffs.
    w.y+=(mFlow*.5+mDepo*.8)*mt;
    w/=max(.0001,w.x+w.y+w.z+w.w);
  }
  vec3 a0=vec3(0.),a1=vec3(0.),a2=vec3(0.),a3=vec3(0.);
  vec3 n0=nW,n1=nW,n2=nW,n3=nW;
  float h0=0.,h1=0.,h2=0.,h3=0.;
  if(w.x>.004)wvPlanar(tSplatA0,tSplatN0,uSplatScale.x,nW,macro,a0,n0,h0);
  if(w.y>.004)wvPlanar(tSplatA1,tSplatN1,uSplatScale.y,nW,macro,a1,n1,h1);
  if(w.z>.004)wvTriplanar(tSplatA2,tSplatN2,uSplatScale.z,nW,macro,a2,n2,h2);
  if(w.w>.004)wvPlanar(tSplatA3,tSplatN3,uSplatScale.w,nW,macro,a3,n3,h3);
  // Height-based blending: rock and stones poke through grass naturally.
  vec4 hw=w+vec4(h0,h1,h2,h3)*.55;
  float top=max(max(hw.x,hw.y),max(hw.z,hw.w))-.22;
  vec4 b=max(hw-top,vec4(0.))*step(vec4(.004),w);
  b/=max(.0001,b.x+b.y+b.z+b.w);
  vec3 albedo=a0*b.x+a1*b.y+a2*b.z+a3*b.w;
  // Meadow life at a distance: broad lush, sun-dried and deep-green patches
  // so a field never reads as one flat green from afar.
  float mv=wvSplatNoise(vSplatWorld.xz*.021+7.3)*.6+wvSplatNoise(vSplatWorld.xz*.067-2.1)*.4;
  vec3 meadowTone=mix(vec3(.76,.92,.72),vec3(1.28,1.13,.7),smoothstep(.3,.75,mv));
  albedo*=mix(vec3(1.),meadowTone,b.x*.9);
  // Ridges catch light, creases and damp gullies darken, valleys get sky AO.
  albedo*=clamp(1.+mCav*.35,.6,1.3)*(1.-mFlow*.18*(b.y+b.z))*mix(1.,mAO,.35);
  wvSplatNormalWorld=normalize(n0*b.x+n1*b.y+n2*b.z+n3*b.w);
  diffuseColor.rgb*=albedo;
  wvSplatRoughness=dot(b,uSplatRough)-mFlow*.12*b.z;
  wvMacroAO=mAO;
}
`;

/**
 * Creates the textured terrain material. `textures:false` (Node tests) keeps
 * the 1x1 placeholders, which render exactly like the untextured palette.
 */
export function createWolfveilTerrainSplatMaterial({textures=typeof document!=='undefined',
  loader=null,onStatus=null,macro=null}={}){
  const uniforms={uSplatScale:{value:new THREE.Vector4(...WOLFVEIL_SPLAT_LAYERS.map(l=>1/l.meters))},
    uSplatRough:{value:new THREE.Vector4(...WOLFVEIL_SPLAT_LAYERS.map(l=>l.roughness))},
    // `macro` = world rect {x0,z0,width,depth} of the baked square (or null).
    uMacroRect:{value:macro
      ?new THREE.Vector4(macro.x0,macro.z0,1/macro.width,1/macro.depth)
      :new THREE.Vector4(0,0,0,0)},
    uMacroOn:{value:0},uMacroFade:{value:WOLFVEIL_TERRAIN_MACRO.edgeFade},
    uRockMean:{value:new THREE.Vector3(...LINEAR_MEANS[2])}};
  const owned=[];
  const macroN=placeholder(128,128,128,255,false),macroM=placeholder(255,0,0,255,false);
  owned.push(macroN,macroM);
  uniforms.tMacroN={value:macroN};
  uniforms.tMacroM={value:macroM};
  WOLFVEIL_SPLAT_LAYERS.forEach((layer,i)=>{
    const m=layer.mean.map(v=>Math.round(v*255));
    const a=placeholder(m[0],m[1],m[2],255,true),n=placeholder(128,128,255,128,false);
    owned.push(a,n);
    uniforms['tSplatA'+i]={value:a};
    uniforms['tSplatN'+i]={value:n};
  });
  const material=new THREE.MeshStandardMaterial({
    color:0xffffff,vertexColors:true,roughness:.95,metalness:0,side:THREE.DoubleSide,
  });
  material.name='Wolfveil_Baked_Splat_Terrain';
  material.userData.wolfveilSplat=true;
  material.customProgramCacheKey=()=> 'wolfveil-baked-splat-terrain-v3-macro';
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>'+VERTEX_HEAD)
      .replace('#include <begin_vertex>','#include <begin_vertex>'+VERTEX_BODY);
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>','#include <common>'+FRAGMENT_HEAD+'float wvSplatRoughness=.95;\n')
      .replace('#include <map_fragment>','#include <map_fragment>'+FRAGMENT_MAP)
      .replace('#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor=wvSplatRoughness;')
      .replace('#include <aomap_fragment>',
        '#include <aomap_fragment>\nreflectedLight.indirectDiffuse*=mix(1.,wvMacroAO*wvMacroAO,.9);')
      .replace('#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\nnormal=normalize((viewMatrix*vec4(wvSplatNormalWorld,0.)).xyz)*faceDirection;');
  };
  // WebGPURenderer: the same surface in TSL (WolfveilTerrainSplatNodes.mjs); the classic renderer keeps the patch.
  attachNodes(material,createWolfveilSplatNodes(uniforms));
  let loaded=0;
  if(textures){
    const tl=loader||new THREE.TextureLoader();
    WOLFVEIL_SPLAT_LAYERS.forEach((layer,i)=>{
      for(const [kind,srgb] of [['A',true],['N',false]]){
        const url=ROOT+'wv_'+layer.id+(kind==='A'?'_albedo':'_normal')+'.webp';
        tl.load(url,t=>{
          t.wrapS=t.wrapT=THREE.RepeatWrapping;
          t.anisotropy=8;
          if(srgb)t.colorSpace=THREE.SRGBColorSpace;
          t.needsUpdate=true;
          owned.push(t);
          uniforms['tSplat'+kind+i].value=t;
          material.nodeVersion=(material.nodeVersion||0)+1; // WebGPURenderer: rebind on every tile
          loaded++;
          onStatus?.({loaded,total:WOLFVEIL_SPLAT_LAYERS.length*2});
        },undefined,()=>onStatus?.({failed:url}));
      }
    });
    if(macro){
      // Data maps: no colour transform, row 0 = local z min (flipY false).
      let macroLoaded=0;
      for(const [key,url] of [['tMacroN',WOLFVEIL_TERRAIN_MACRO.normalUrl],['tMacroM',WOLFVEIL_TERRAIN_MACRO.maskUrl]]){
        tl.load(url,t=>{
          t.flipY=false;
          t.colorSpace=THREE.NoColorSpace;
          t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;
          t.anisotropy=8;
          t.needsUpdate=true;
          owned.push(t);
          uniforms[key].value=t;
          material.nodeVersion=(material.nodeVersion||0)+1;
          if(++macroLoaded===2){uniforms.uMacroOn.value=1;onStatus?.({macro:'loaded'});}
        },undefined,()=>onStatus?.({failed:url}));
      }
    }
  }
  const dispose=material.dispose.bind(material);
  material.dispose=()=>{for(const t of owned)t.dispose();dispose();};
  return {material,uniforms,get loaded(){return loaded;},get macroLoaded(){return uniforms.uMacroOn.value>0;}};
}
