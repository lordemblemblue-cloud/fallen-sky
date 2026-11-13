// Immersive Sumi-e Canal & Pond Water for the assembled Wolfveil town.
// Smooth normal-perturbed reflections, subsurface jade-cerulean depth gradient,
// animated riverbed caustics, current ribbons, and waterfall plunge foam.
import * as THREE from 'three';
import {WOLFVEIL_IMPORTED_TOWN,WOLFVEIL_IMPORTED_TOWN_WATER_SOURCE_Y}
  from './WolfveilImportedTownLayout.mjs';

const BOX_VERTICES=24;
// The canal boxes were authored ~5cm ABOVE the town paving, so every surface
// they pass under read as a pale slab lying on the stone and fought the kerbs
// for the same pixels. Settle the water strictly below the pavers instead.
const WATER_DROP_BELOW_FLOOR=.014;
const PAVED_SURFACE_Y=WOLFVEIL_IMPORTED_TOWN.floorSourceY;
const WATER_SURFACE_Y=PAVED_SURFACE_Y-WATER_DROP_BELOW_FLOOR;

const CANAL_VERTEX=`
attribute vec3 townFlow;
varying vec3 vTownFlow;
varying vec3 vTownWorld;
varying vec3 vTownViewPos;
void main(){
  vTownFlow=townFlow;
  vec4 wp=modelMatrix*vec4(position,1.0);
  vTownWorld=wp.xyz;
  vec4 mv=viewMatrix*wp;
  vTownViewPos=-mv.xyz;
  gl_Position=projectionMatrix*mv;
}`;

const CANAL_FRAGMENT=`
precision highp float;
uniform float uTownTime;
uniform float uIsFoam;
varying vec3 vTownFlow;
varying vec3 vTownWorld;
varying vec3 vTownViewPos;

float townHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
float townNoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(townHash(i),townHash(i+vec2(1.0,0.0)),f.x),
             mix(townHash(i+vec2(0.0,1.0)),townHash(i+vec2(1.0,1.0)),f.x),f.y);
}
float townFbm(vec2 p){
  return townNoise(p)*0.55+townNoise(p*2.13+vec2(4.1,-2.7))*0.30+townNoise(p*4.41)*0.15;
}

void main(){
  vec2 dir=vTownFlow.xz;
  float isFall=step(0.5,-vTownFlow.y);
  float isMoving=step(0.5,length(dir));
  vec2 flowDir=isMoving>0.5?normalize(dir):vec2(0.7,0.7);
  vec2 across=vec2(-flowDir.y,flowDir.x);

  vec2 uvStill=vTownWorld.xz*0.42+vec2(uTownTime*0.09,-uTownTime*0.07);
  vec2 uvCanal=vec2(dot(vTownWorld.xz,across)*0.85,dot(vTownWorld.xz,flowDir)*0.30-uTownTime*0.95);
  vec2 uvFall=vec2((vTownWorld.x+vTownWorld.z)*1.15,vTownWorld.y*0.55+uTownTime*3.1);
  vec2 q=mix(uvStill,uvCanal,isMoving);
  q=mix(q,uvFall,isFall);

  float hA=townFbm(q);
  float hB=townFbm(q*2.35+vec2(2.7,uTownTime*0.32));
  float eps=0.09;
  float hx=townFbm(q+vec2(eps,0.0))-hA;
  float hz=townFbm(q+vec2(0.0,eps))-hA;
  vec3 normal=normalize(vec3(-hx*2.4,1.0,-hz*2.4));

  vec3 viewDir=normalize(cameraPosition-vTownWorld);
  float fresnel=0.06+0.94*pow(1.0-clamp(dot(normal,viewDir),0.0,1.0),4.0);

  // Sumi-e mineral jade-indigo depth + sunlit caustic web
  vec3 deepTint=vec3(0.055,0.20,0.31);
  vec3 jadeTint=vec3(0.16,0.48,0.56);
  vec3 skyReflect=vec3(0.58,0.79,0.90);
  vec3 col=mix(deepTint,jadeTint,0.35+0.48*hA);
  col=mix(col,skyReflect,clamp(fresnel*0.62,0.0,0.68));

  float caustic=smoothstep(0.58,0.90,hA*0.52+hB*0.58);
  col+=vec3(0.24,0.52,0.58)*caustic*(1.0-isFall)*0.36;

  // Sumi-e brush-ink current ribbons & cascade spray
  float ribbon=smoothstep(0.68,0.95,hA*0.60+hB*0.48);
  vec3 foamColor=vec3(0.90,0.96,0.99);
  col=mix(col,foamColor,clamp(ribbon*(0.34+0.50*isFall)+uIsFoam*0.65,0.0,0.92));

  // Specular sun glint
  vec3 sunDir=normalize(vec3(0.42,0.84,0.34));
  float spec=pow(max(dot(reflect(-sunDir,normal),viewDir),0.0),72.0);
  col+=vec3(1.0,0.96,0.86)*spec*0.42;

  float alpha=clamp(0.76+0.16*fresnel+ribbon*0.12+isFall*0.14+uIsFoam*0.18,0.72,0.96);
  gl_FragColor=vec4(col,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createWolfveilTownWater(){
  const time={value:0};
  const makeMat=(isFoam)=>new THREE.ShaderMaterial({
    name:isFoam?'Wolfveil_Town_CanalFoam':'Wolfveil_Town_ImmersiveCanalWater',
    uniforms:{uTownTime:time,uIsFoam:{value:isFoam?1:0}},
    vertexShader:CANAL_VERTEX,
    fragmentShader:CANAL_FRAGMENT,
    transparent:true,
    depthWrite:false,
    side:THREE.DoubleSide,
    polygonOffset:true,
    polygonOffsetFactor:-2,
    polygonOffsetUnits:-2,
  });
  const water=makeMat(false),foam=makeMat(true);
  return {
    apply(mesh){
      const isFoam=/foam/i.test(mesh.name);
      const position=mesh.geometry.attributes.position,count=position.count;
      const flow=new Float32Array(count*3);
      const group=count%BOX_VERTICES===0?BOX_VERTICES:count;
      const surface=WATER_SURFACE_Y+(isFoam?.002:0);
      for(let start=0;start<count;start+=group){
        let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
        for(let i=start;i<start+group;i++){
          const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
          minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);
          maxY=Math.max(maxY,y);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);
        }
        const dx=maxX-minX,dz=maxZ-minZ;
        let fx=0,fy=0,fz=0;
        if(maxY-minY>.2)fy=-1;
        else if(dx>dz*1.3)fx=-1;
        else if(dz>dx*1.3)fz=dz<2&&minZ+maxZ<0?-1:1;
        for(let i=start;i<start+group;i++){
          flow[i*3]=fx;flow[i*3+1]=fy;flow[i*3+2]=fz;
          if(position.getY(i)>WOLFVEIL_IMPORTED_TOWN_WATER_SOURCE_Y-.01)position.setY(i,surface);
          // Trim deep underside water box faces so they never poke below town embankments
          else if(position.getY(i)<WATER_SURFACE_Y-.03 &&
            maxY-minY<=.2)position.setY(i,Math.min(position.getY(i),WATER_SURFACE_Y-.03));
        }
      }
      position.needsUpdate=true;
      mesh.geometry.setAttribute('townFlow',new THREE.BufferAttribute(flow,3));
      mesh.geometry.computeVertexNormals();
      mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
      mesh.material=isFoam?foam:water;
      mesh.castShadow=false;mesh.renderOrder=2;
    },
    update(dt){time.value+=Math.max(0,Math.min(dt||0,.1));},
    dispose(){water.dispose();foam.dispose();},
  };
}