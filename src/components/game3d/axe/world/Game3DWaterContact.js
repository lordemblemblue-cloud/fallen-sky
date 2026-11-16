// Game 3D-only visual layer for the existing Wolfveil river. The shared river
// geometry and Game 1 material are left untouched.
import * as THREE from 'three';
import {WOLFVEIL_RIVER} from '../../wolfveil/WolfveilLayout.js';

const RIPPLE_SLOTS=4;
const WIND_DEGREES={N:0,NE:45,E:90,SE:135,S:180,SW:225,W:270,NW:315};

export function sampleGame3DRiverContact(position,originZ=0){
  if(!position||![position.x,position.y,position.z].every(Number.isFinite))return null;
  const localZ=position.z-originZ;
  let nearest=null;
  for(let i=0;i<WOLFVEIL_RIVER.points.length-1;i++){
    const a=WOLFVEIL_RIVER.points[i],b=WOLFVEIL_RIVER.points[i+1];
    const dx=b[0]-a[0],dz=b[1]-a[1],lengthSquared=dx*dx+dz*dz;
    const t=Math.max(0,Math.min(1,((position.x-a[0])*dx+(localZ-a[1])*dz)/lengthSquared));
    const distance=Math.hypot(position.x-a[0]-t*dx,localZ-a[1]-t*dz);
    if(!nearest||distance<nearest.distance){
      nearest={distance,height:a[2]+t*(b[2]-a[2]),
        grade:Math.abs(b[2]-a[2])/Math.sqrt(lengthSquared)};
    }
  }
  // Stay inside the actual 19 m water strip, below bridge decks and away from
  // the steep waterfall where a horizontal foot ring would read incorrectly.
  if(!nearest||nearest.distance>WOLFVEIL_RIVER.width/2-.7||nearest.grade>.28||
    position.y>nearest.height+.25||position.y<nearest.height-3.5)return null;
  return {x:position.x,z:position.z,height:nearest.height};
}

const vertexShader=`
varying vec3 vWorld;
varying vec2 vRiverUv;
void main(){
  vRiverUv=uv;
  vec4 world=modelMatrix*vec4(position,1.0);
  world.y+=0.035;
  vWorld=world.xyz;
  gl_Position=projectionMatrix*viewMatrix*world;
}`;

const fragmentShader=`
precision highp float;
uniform float uTime,uRain,uNight;
uniform vec2 uWind,uFogNearFar;
uniform vec4 uRipples[${RIPPLE_SLOTS}];
varying vec3 vWorld;
varying vec2 vRiverUv;
float contactHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float contactNoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(contactHash(i),contactHash(i+vec2(1.0,0.0)),f.x),
    mix(contactHash(i+vec2(0.0,1.0)),contactHash(i+vec2(1.0,1.0)),f.x),f.y);
}
void main(){
  // Faint, broken shoreline lace (noise, not parallel sine stripes).
  float bank=smoothstep(.86,.99,abs(vRiverUv.x*2.0-1.0));
  float lace=contactNoise(vWorld.xz*.9+vec2(uTime*.35,-uTime*.22)+uWind*uTime*.2)*.65+
    contactNoise(vWorld.xz*2.3-vec2(uTime*.5,0.0))*.35;
  float foam=bank*smoothstep(.58,.86,lace)*(.45+uRain*.55);
  float rings=0.0;
  for(int i=0;i<${RIPPLE_SLOTS};i++){
    float age=uTime-uRipples[i].z;
    if(age>=0.0&&age<1.6){
      float d=length(vWorld.xz-uRipples[i].xy);
      float radius=.16+age*2.45;
      float width=.065+age*.065;
      float outer=exp(-pow((d-radius)/width,2.0));
      float inner=exp(-pow((d-radius*.57)/(width*1.6),2.0))*.32;
      rings+=uRipples[i].w*(outer+inner)*exp(-age*1.25);
    }
  }
  float alpha=clamp(foam*.20+rings*.48,0.0,.63);
  float fog=1.0-smoothstep(uFogNearFar.x,uFogNearFar.y,
    length(cameraPosition-vWorld));
  alpha*=fog;
  if(alpha<.005)discard;
  // Pearl-grey foam over the clear silver river; avoid yellow/teal tint.
  // Contact wakes remain a restrained translucent highlight, not a flat sheet.
  vec3 shore=vec3(.73,.76,.77);
  vec3 wake=vec3(.86,.89,.91);
  vec3 color=mix(shore,wake,clamp(rings*1.8,0.0,1.0));
  color*=mix(1.0,.55,uNight);
  gl_FragColor=vec4(color,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createGame3DWaterContact(riverMesh,{originZ=0,fog=null}={}){
  if(!riverMesh?.geometry||!riverMesh.parent)throw Error('Game 3D river mesh must be attached');
  const ripples=Array.from({length:RIPPLE_SLOTS},()=>new THREE.Vector4(0,0,-10,0));
  const uniforms={
    uTime:{value:0},uRain:{value:0},uNight:{value:0},
    uWind:{value:new THREE.Vector2(0,0)},
    uFogNearFar:{value:new THREE.Vector2(fog?.near??350,fog?.far??2200)},
    uRipples:{value:ripples},
  };
  const material=new THREE.ShaderMaterial({
    name:'Game 3D Wolfveil contact wakes and bank foam',
    uniforms,vertexShader,fragmentShader,side:THREE.DoubleSide,
    transparent:true,depthWrite:false,
  });
  const mesh=new THREE.Mesh(riverMesh.geometry,material);
  mesh.name='Game3D_WolfveilWaterContact';
  mesh.renderOrder=riverMesh.renderOrder+1;
  riverMesh.parent.add(mesh);
  let time=0,lastPosition=null,lastImpact=-10,nextSlot=0,impactCount=0,disposed=false;
  return {
    mesh,uniforms,
    get impactCount(){return impactCount;},
    update(dt,position,weather={}){
      if(disposed)return;
      time+=Math.max(0,Math.min(Number(dt)||0,.1));
      uniforms.uTime.value=time;
      uniforms.uRain.value=weather.weather==='storm' ? 1 :
        ((weather.weather==='rain'||weather.weather==='hail') ? 0.65 : 0);
      uniforms.uNight.value=weather.isNight?1:0;
      uniforms.uFogNearFar.value.set(fog?.near??350,fog?.far??2200);
      const degrees=WIND_DEGREES[weather.windDir]??225;
      const radians=degrees*Math.PI/180;
      const speed=Math.max(0,Math.min(1,(Number(weather.windMph)||0)/35));
      uniforms.uWind.value.set(-Math.sin(radians)*speed,-Math.cos(radians)*speed);
      const contact=sampleGame3DRiverContact(position,originZ);
      const moved=lastPosition&&position&&Math.hypot(
        position.x-lastPosition.x,position.z-lastPosition.z);
      if(contact&&moved>.075&&moved<3&&time-lastImpact>.23){
        ripples[nextSlot].set(contact.x,contact.z,time,Math.min(1,moved*3+.45));
        nextSlot=(nextSlot+1)%RIPPLE_SLOTS;
        lastImpact=time;
        impactCount++;
      }
      lastPosition=position&&Number.isFinite(position.x)&&Number.isFinite(position.z)
        ?{x:position.x,z:position.z}:null;
    },
    dispose(){
      if(disposed)return;
      disposed=true;
      mesh.parent?.remove(mesh);
      material.dispose();
      // The Wolfveil scene owns the shared river geometry.
    },
  };
}
