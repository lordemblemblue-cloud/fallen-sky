// Game 3D opt-in: Immersive Sumi-e River Water Shader (natural flow-map surface).
// Replaces the old neon triangle wireframe grid with authentic multi-layered
// current waves, bank eddies, depth absorption (pebble shallows -> jade -> deep
// sumi-indigo), riverbed caustics, ink-brush foam ribbons, raindrop rings, and
// Fresnel sky / sun specular reflections. Preserves all uniform & contact contracts.
import * as THREE from 'three';
import {resolveWolfveilRiverWeather} from './WolfveilSilverRiverFlow.mjs';
// Natural river surface (2026-11-16): flow-mapped ripples replace the former
// evenly spaced "glass ripple" crest train (WolfveilGlassRippleProfile.mjs
// stays available for reference).
export const WOLFVEIL_RIVER_SHADER=Object.freeze({width:19,flowPeriod:2.6,style:'flow-map-natural-v1'});

const vertexShader=`
attribute vec3 riverFlow; // downstream unit X/Z and local cascade roughness
attribute float riverTravel; // cumulative metres from upstream: no seam resets
varying vec3 vWaterWorld;
varying vec2 vBankUv;
varying vec3 vRiverFlow;
varying float vRiverTravel;
void main(){
  vBankUv=uv;
  vRiverFlow=riverFlow;
  vRiverTravel=riverTravel;
  vec4 world=modelMatrix*vec4(position,1.);
  vWaterWorld=world.xyz;
  gl_Position=projectionMatrix*viewMatrix*world;
}`;

const fragmentShader=`
precision highp float;
uniform float uFlowTime,uRain,uWet,uWindStrength,uNight,uSunStrength,uContactTime;
uniform vec2 uWind,uFogNearFar;
uniform vec3 uSunDirection,uSunColor,uSkyTint,uFogTint;
uniform vec4 uContactRipples[4];
varying vec3 vWaterWorld;
varying vec2 vBankUv;
varying vec3 vRiverFlow;
varying float vRiverTravel;

const float RIVER_WIDTH=${WOLFVEIL_RIVER_SHADER.width.toFixed(1)};
const float FLOW_PERIOD=${WOLFVEIL_RIVER_SHADER.flowPeriod.toFixed(2)};

float riverHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
float riverNoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(riverHash(i),riverHash(i+vec2(1.,0.)),f.x),
             mix(riverHash(i+vec2(0.,1.)),riverHash(i+vec2(1.,1.)),f.x),f.y);
}
// Small capillary/wind wave heights: four octaves, no periodic train.
float riverWaves(vec2 p){
  return riverNoise(p)*.50+riverNoise(p*2.13+vec2(1.7,9.2))*.28+
    riverNoise(p*4.37+vec2(8.3,2.8))*.14+riverNoise(p*8.91+vec2(3.1,7.7))*.08;
}
vec2 riverSlope(vec2 p){
  float e=.07,h=riverWaves(p);
  return vec2(riverWaves(p+vec2(e,0.))-h,riverWaves(p+vec2(0.,e))-h)/e;
}

void main(){
  vec2 downstream=normalize(vRiverFlow.xy+vec2(.00001));
  vec2 across=vec2(-downstream.y,downstream.x);
  float bankDist=abs(vBankUv.x*2.-1.); // 0 at center channel, 1 at shoreline
  float depthFactor=1.-smoothstep(.22,.97,bankDist);
  float cascade=clamp(vRiverFlow.z,0.,1.);

  // Flow-map advection in channel metres: two layers half a cycle apart are
  // cross-faded, so ripples travel downstream without stretching, seams or
  // the old evenly spaced crest stripes. Fastest mid-channel, slow at banks.
  float speed=(.45+1.35*depthFactor)*(1.+1.6*cascade);
  vec2 channel=vec2((vBankUv.x-.5)*RIVER_WIDTH,vRiverTravel)*.34;
  float phaseA=fract(uFlowTime/FLOW_PERIOD),phaseB=fract(uFlowTime/FLOW_PERIOD+.5);
  float weightA=1.-abs(phaseA*2.-1.);
  vec2 slopeA=riverSlope(channel-vec2(0.,phaseA*FLOW_PERIOD*speed*.34));
  vec2 slopeB=riverSlope(channel-vec2(0.,phaseB*FLOW_PERIOD*speed*.34)+vec2(.43,.71));
  vec2 slope=mix(slopeB,slopeA,weightA);
  // Wind ruffle in world space, stronger in gusts.
  vec2 windSlope=riverSlope(vWaterWorld.xz*.85+uWind*uFlowTime*.55+vec2(5.3,1.9));
  float roughness=.11+.10*(1.-depthFactor)+.16*cascade;
  vec2 tilt=(across*slope.x+downstream*slope.y)*roughness+
    windSlope*(.035+.09*uWindStrength);

  // Raindrop micro-rings during rain/storm
  if(uRain>.02){
    vec2 rainCell=floor(vWaterWorld.xz*1.6);
    float seed=riverHash(rainCell);
    float rAge=fract(uFlowTime*1.35+seed);
    vec2 local=fract(vWaterWorld.xz*1.6)-.5;
    float ring=exp(-pow((length(local)-rAge*.46)/.055,2.))*(1.-rAge)*uRain;
    tilt+=normalize(local+vec2(.001))*ring*.08;
  }

  // Player & companion footstep wake rings
  float wake=0.;
  for(int i=0;i<4;i++){
    float age=uContactTime-uContactRipples[i].z;
    if(age>=0.&&age<1.6){
      vec2 fromContact=vWaterWorld.xz-uContactRipples[i].xy;
      float radius=.16+age*2.45;
      float angle=atan(fromContact.y,fromContact.x);
      float irregular=.075*sin(angle*3.+age*2.);
      float width=.08+age*.08;
      float ring=exp(-pow((length(fromContact)-radius-irregular)/width,2.));
      float force=uContactRipples[i].w*ring*exp(-age*.95);
      tilt+=normalize(fromContact+vec2(.0001))*force*.13;
      wake+=force;
    }
  }

  vec3 normal=normalize(vec3(-tilt.x,1.,-tilt.y));
  vec3 viewDir=normalize(cameraPosition-vWaterWorld);
  float ndv=clamp(dot(normal,viewDir),0.,1.);
  float fresnel=.02+.98*pow(1.-ndv,5.);

  // Water body: clear green-brown shallows over a pebbly bed, deepening to
  // dark teal mid-channel (no glassy jade, no flat plastic colour).
  vec3 shallowTint=vec3(.105,.170,.120);
  vec3 midTint=vec3(.040,.120,.120);
  vec3 deepTint=vec3(.016,.060,.075);
  vec3 body=mix(shallowTint,midTint,smoothstep(0.,.5,depthFactor));
  body=mix(body,deepTint,smoothstep(.45,1.,depthFactor));
  float bed=riverNoise(vWaterWorld.xz*.65)*.6+riverNoise(vWaterWorld.xz*2.4+slope*.15)*.4;
  body=mix(body,vec3(.17,.15,.10)*(.65+.55*bed),(1.-depthFactor)*.42);
  // Soft dappled light on the bed in the shallows (follows the moving ripples).
  float dapple=smoothstep(.55,.95,riverWaves(channel*1.9-vec2(0.,uFlowTime*.6*speed)));
  body+=vec3(.05,.07,.05)*dapple*(1.-depthFactor)*clamp(uSunStrength,0.,1.);

  // Sky reflection with a real horizon-to-zenith gradient.
  vec3 reflected=reflect(-viewDir,normal);
  vec3 zenith=mix(vec3(.16,.30,.48),uSkyTint,.45);
  vec3 horizon=mix(vec3(.58,.68,.76),uFogTint,.35);
  vec3 sky=mix(horizon,zenith,smoothstep(0.,.55,reflected.y));
  vec3 color=mix(body,sky,clamp(fresnel*.92,0.,1.));

  // Broken lace foam only along the banks and over cascades / footsteps.
  float lace=riverWaves(channel*1.6+vec2(2.1,-uFlowTime*.5*speed));
  float bankFoam=smoothstep(.88,.99,bankDist)*smoothstep(.48,.78,lace)*(.55+.3*uRain);
  float cascadeFoam=cascade*cascade*smoothstep(.52,.84,lace);
  float totalFoam=clamp(bankFoam*.5+cascadeFoam*.6+wake*.35,0.,.8);
  color=mix(color,vec3(.84,.89,.91),totalFoam);

  // Sun glints: tight sparkle plus a soft sheen.
  vec3 halfVector=normalize(normalize(uSunDirection)+viewDir);
  float specTight=pow(max(dot(normal,halfVector),0.),240.)*1.4;
  float specBroad=pow(max(dot(normal,halfVector),0.),38.)*.10;
  color+=uSunColor*(specTight+specBroad)*clamp(uSunStrength,0.,1.5);
  color=mix(color,vec3(.46,.34,.24)*.5+color*.5,uWet*.06);
  color=mix(color,color*vec3(.45,.61,.80),uNight*.72);

  // Feathered waterline: the shore graded into the bank shows through.
  float alpha=mix(.50,.90,depthFactor)+fresnel*.30+totalFoam*.30+.04*wake;
  alpha*=smoothstep(1.,.92,bankDist);
  alpha=clamp(alpha,0.,.95);
  float underwater=1.-step(0.,viewDir.y);
  color=mix(color,vec3(.04,.16,.20)+uSunColor*min(uSunStrength,.8)*.03,underwater*.74);
  alpha=mix(alpha,.10,underwater);

  float fog=smoothstep(uFogNearFar.x,uFogNearFar.y,length(cameraPosition-vWaterWorld));
  color=mix(color,uFogTint,fog*.35);
  alpha=mix(alpha,.42,fog*.18);

  gl_FragColor=vec4(color,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createWolfveilSilverRiverMaterial(){
  const uniforms={
    uFlowTime:{value:0},uRain:{value:0},uWet:{value:0},
    uWind:{value:new THREE.Vector2(.707,.707)},
    uWindStrength:{value:.20},uNight:{value:0},
    uSunDirection:{value:new THREE.Vector3(.35,.88,.18).normalize()},
    uSunColor:{value:new THREE.Color(0xffedcf)},
    uSunStrength:{value:.65},
    uSkyTint:{value:new THREE.Color(0x88b9cd)},
    uFogNearFar:{value:new THREE.Vector2(350,2200)},
    uFogTint:{value:new THREE.Color(0x8595a2)},
    uContactTime:{value:0},
    uContactRipples:{value:Array.from({length:4},
      ()=>new THREE.Vector4(0,0,-100,0))},
  };
  const material=new THREE.ShaderMaterial({
    name:'Game3D_Wolfveil_SumiE_ImmersiveRiverWater',
    uniforms,vertexShader,fragmentShader,
    side:THREE.DoubleSide,transparent:true,depthWrite:false,depthTest:true,
    blending:THREE.NormalBlending,
  });
  return {
    material,uniforms,
    updateAppearance(weather={},sunLight=null,fog=null){
      const frame=resolveWolfveilRiverWeather(weather);
      uniforms.uWind.value.set(frame.wind[0],frame.wind[1]);
      uniforms.uWindStrength.value=frame.strength;
      uniforms.uRain.value=frame.rain;
      uniforms.uWet.value=frame.rain;
      uniforms.uNight.value=frame.night;
      if(sunLight?.isDirectionalLight){
        if(sunLight.position.lengthSq()>1e-8)
          uniforms.uSunDirection.value.copy(sunLight.position).normalize();
        uniforms.uSunColor.value.copy(sunLight.color);
        uniforms.uSunStrength.value=Math.max(0,Math.min(1.6,sunLight.intensity/2.2));
      }else{
        uniforms.uSunStrength.value=frame.night?0:.55;
      }
      uniforms.uSkyTint.value.setHex(frame.night?0x3b5269:
        frame.rain>.5?0x688da6:0x91c2d5);
      if(fog?.color)uniforms.uFogTint.value.copy(fog.color);
      if(Number.isFinite(fog?.near)&&Number.isFinite(fog?.far)&&
         fog.far>fog.near)
        uniforms.uFogNearFar.value.set(fog.near,fog.far);
    },
    bindContact(contact){
      if(!Array.isArray(contact?.uniforms?.uRipples?.value)||
         contact.uniforms.uRipples.value.length!==4||
         !contact.uniforms.uTime)return false;
      uniforms.uContactRipples=contact.uniforms.uRipples;
      uniforms.uContactTime=contact.uniforms.uTime;
      return true;
    },
  };
}