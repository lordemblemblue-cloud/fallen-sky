// Turns the town's flat blue canal blocks into running water: the slabs are
// lowered onto the lawn and given a current that streams along each canal
// and pours down the falls at their ends.
import * as THREE from 'three';
import {WOLFVEIL_IMPORTED_TOWN_WATER_SOURCE_Y} from './WolfveilImportedTownLayout.mjs';

const BOX_VERTICES=24; // the canals are plain boxes in the source model
const NOISE=`
uniform float uTownTime;
varying vec3 vTownFlow;
varying vec3 vTownWorld;
float townHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float townNoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(townHash(i),townHash(i+vec2(1.,0.)),f.x),
    mix(townHash(i+vec2(0.,1.)),townHash(i+vec2(1.,1.)),f.x),f.y);
}`;
const CURRENT=`
#include <color_fragment>
vec2 townDir=vTownFlow.xz;
float townFall=step(.5,-vTownFlow.y),townMoving=step(.5,length(townDir));
vec2 townAcross=vec2(-townDir.y,townDir.x);
// Still ponds ripple gently; canals stretch their ripples along the current.
vec2 townQ=mix(vTownWorld.xz*.45+uTownTime*.08,
  vec2(dot(vTownWorld.xz,townAcross)*.9,dot(vTownWorld.xz,townDir)*.22-uTownTime*.75),townMoving);
townQ=mix(townQ,vec2((vTownWorld.x+vTownWorld.z)*.9,vTownWorld.y*.3+uTownTime*2.4),townFall);
float townA=townNoise(townQ),townB=townNoise(townQ*2.7+vec2(3.1,uTownTime*.2));
float townStreak=smoothstep(.62,.95,townA*.65+townB*.45);
diffuseColor.rgb=mix(diffuseColor.rgb*(.72+.5*townA),vec3(.88,.96,1.),townStreak*(.45+.4*townFall));
diffuseColor.a=mix(diffuseColor.a,.96,townStreak*.5+townFall*.25);`;

export function createWolfveilTownWater(){
  const time={value:0};
  const material=(foam)=>{
    const m=new THREE.MeshStandardMaterial({
      color:foam?0xdcf1f7:0x3f9fd4,transparent:true,opacity:foam?.9:.8,
      roughness:.1,metalness:.05,flatShading:true,depthWrite:false,
      polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
    });
    m.onBeforeCompile=shader=>{
      shader.uniforms.uTownTime=time;
      shader.vertexShader='attribute vec3 townFlow;\nvarying vec3 vTownFlow;\nvarying vec3 vTownWorld;\n'+
        shader.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\nvTownFlow=townFlow;\nvTownWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
      shader.fragmentShader=NOISE+shader.fragmentShader.replace('#include <color_fragment>',CURRENT);
    };
    return m;
  };
  const water=material(false),foam=material(true);
  return {
    /** Reshape one canal/foam mesh of the model and give it the current. */
    apply(mesh){
      const isFoam=/foam/i.test(mesh.name);
      const position=mesh.geometry.attributes.position,count=position.count;
      const flow=new Float32Array(count*3);
      const group=count%BOX_VERTICES===0?BOX_VERTICES:count;
      const surface=WOLFVEIL_IMPORTED_TOWN_WATER_SOURCE_Y+(isFoam?.002:0);
      for(let start=0;start<count;start+=group){
        let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
        for(let i=start;i<start+group;i++){
          const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
          minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);
          maxY=Math.max(maxY,y);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);
        }
        const dx=maxX-minX,dz=maxZ-minZ;
        let fx=0,fy=0,fz=0;
        if(maxY-minY>.2)fy=-1;              // waterfall curtain
        else if(dx>dz*1.3)fx=-1;            // east-west canals drain to the west falls
        else if(dz>dx*1.3)fz=dz<2&&minZ+maxZ<0?-1:1; // outer canal runs out to both ends
        for(let i=start;i<start+group;i++){
          flow[i*3]=fx;flow[i*3+1]=fy;flow[i*3+2]=fz;
          if(position.getY(i)>.699)position.setY(i,surface);
        }
      }
      position.needsUpdate=true;
      mesh.geometry.setAttribute('townFlow',new THREE.BufferAttribute(flow,3));
      mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
      mesh.material=isFoam?foam:water;
      mesh.castShadow=false;mesh.renderOrder=2;
    },
    update(dt){time.value+=dt;},
    dispose(){water.dispose();foam.dispose();},
  };
}