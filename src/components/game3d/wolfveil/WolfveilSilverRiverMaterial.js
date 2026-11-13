// Game 3D opt-in: Immersive Sumi-e River Water Shader.
// Replaces the old neon triangle wireframe grid with authentic multi-layered
// current waves, bank eddies, depth absorption (pebble shallows -> jade -> deep
// sumi-indigo), riverbed caustics, ink-brush foam ribbons, raindrop rings, and
// Fresnel sky / sun specular reflections. Preserves all uniform & contact contracts.
import * as THREE from 'three';
import {resolveWolfveilRiverWeather} from './WolfveilSilverRiverFlow.mjs';
import {WOLFVEIL_GLASS_RIPPLES} from './WolfveilGlassRippleProfile.mjs';

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

const float WAVE_SPACING=${WOLFVEIL_GLASS_RIPPLES.spacing.toFixed(2)};
const float WAVE_SPEED=${WOLFVEIL_GLASS_RIPPLES.downstreamSpeed.toFixed(2)};
const float WAVE_WIDTH=${WOLFVEIL_GLASS_RIPPLES.lateralWidth.toFixed(2)};
const float WAVE_BEND=${WOLFVEIL_GLASS_RIPPLES.bendAmplitude.toFixed(2)};
const float WAVE_BEND_FREQ=${WOLFVEIL_GLASS_RIPPLES.bendFrequency.toFixed(2)};
const float WAVE_BEND2=${WOLFVEIL_GLASS_RIPPLES.secondBendAmplitude.toFixed(2)};
const float WAVE_BEND_FREQ2=${WOLFVEIL_GLASS_RIPPLES.secondBendFrequency.toFixed(2)};
const float WAVE_POWER=${WOLFVEIL_GLASS_RIPPLES.crestPower.toFixed(2)};
const float WAVE_TRAIL_POWER=${WOLFVEIL_GLASS_RIPPLES.trailingPower.toFixed(2)};
const float WAVE_TRAIL_OFFSET=${WOLFVEIL_GLASS_RIPPLES.trailingOffset.toFixed(2)};
const float WAVE_TRAIL_WEIGHT=${WOLFVEIL_GLASS_RIPPLES.trailingWeight.toFixed(2)};
const float WAVE_NORMAL=${WOLFVEIL_GLASS_RIPPLES.normalStrength.toFixed(3)};

float riverHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
float riverNoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(riverHash(i),riverHash(i+vec2(1.,0.)),f.x),
             mix(riverHash(i+vec2(0.,1.)),riverHash(i+vec2(1.,1.)),f.x),f.y);
}
float riverFbm(vec2 p){
  return riverNoise(p)*.52+riverNoise(p*2.17+vec2(3.7,-1.9))*.31+riverNoise(p*4.63)*.17;
}

vec3 wigglyCurrentWave(float travel,float bank){
  float cross=(bank-.5)*WAVE_WIDTH;
  float forward=travel-uFlowTime*WAVE_SPEED;
  float phaseA=cross*WAVE_BEND_FREQ+forward*.018+uFlowTime*.10;
  float phaseB=cross*WAVE_BEND_FREQ2-forward*.012+uFlowTime*.13;
  float bend=WAVE_BEND*sin(phaseA)+WAVE_BEND2*sin(phaseB);
  float phase=6.2831853*(forward+bend)/WAVE_SPACING;
  float base=.5+.5*cos(phase);
  float secondBase=.5+.5*cos(phase-WAVE_TRAIL_OFFSET);
  float primary=pow(base,WAVE_POWER);
  float trailing=pow(secondBase,WAVE_TRAIL_POWER)*WAVE_TRAIL_WEIGHT;
  float variation=.72+.28*(.5+.5*sin(travel*.047+cross*.16));
  float dPrimary=-.5*WAVE_POWER*pow(base,WAVE_POWER-1.)*sin(phase);
  float dTrailing=-.5*WAVE_TRAIL_POWER*WAVE_TRAIL_WEIGHT*
    pow(secondBase,WAVE_TRAIL_POWER-1.)*sin(phase-WAVE_TRAIL_OFFSET);
  float phaseAlong=6.2831853/WAVE_SPACING*
    (1.+WAVE_BEND*cos(phaseA)*.018-WAVE_BEND2*cos(phaseB)*.012);
  float phaseAcross=6.2831853/WAVE_SPACING*
    (WAVE_BEND*WAVE_BEND_FREQ*cos(phaseA)+
      WAVE_BEND2*WAVE_BEND_FREQ2*cos(phaseB));
  float crest=clamp((primary+trailing)*variation,0.,1.);
  float slope=(dPrimary+dTrailing)*variation;
  return vec3(crest,clamp(slope*phaseAlong,-1.,1.),
    clamp(slope*phaseAcross,-1.,1.));
}

void main(){
  vec2 downstream=normalize(vRiverFlow.xy+vec2(.00001));
  vec2 across=vec2(-downstream.y,downstream.x);
  float bankDist=abs(vBankUv.x*2.-1.); // 0 at center channel, 1 at shoreline
  float depthFactor=1.-smoothstep(.35,.98,bankDist);

  vec3 wave=wigglyCurrentWave(vRiverTravel,vBankUv.x);
  float cascade=vRiverFlow.z;

  // Multi-scale advected flow ripples + swirling shoreline eddies
  vec2 flowCoord=vec2((vBankUv.x-.5)*9.5,vRiverTravel*.24-uFlowTime*1.35);
  vec2 flowCoordFine=vec2((vBankUv.x-.5)*21.0+sin(vRiverTravel*.15)*.6,vRiverTravel*.58-uFlowTime*2.15);
  float ripA=riverFbm(flowCoord);
  float ripB=riverFbm(flowCoordFine);
  float eps=.08;
  float dRx=riverFbm(flowCoord+vec2(eps,0.))-ripA;
  float dRz=riverFbm(flowCoord+vec2(0.,eps))-ripA;

  float windPhase=dot(vWaterWorld.xz,uWind)*.24-uFlowTime*(.32+.55*uWindStrength);
  vec2 tilt=downstream*(wave.y*WAVE_NORMAL+dRz*.14)+
            across*(wave.z*WAVE_NORMAL+dRx*.14)+
            uWind*sin(windPhase)*(.005+.012*uWindStrength);

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

  vec3 normal=normalize(vec3(tilt.x,1.,tilt.y));
  vec3 viewDir=normalize(cameraPosition-vWaterWorld);
  float ndv=clamp(dot(normal,viewDir),0.,1.);
  float fresnel=.035+.965*pow(1.-ndv,4.6);

  // Depth-based Sumi-e absorption: clear mineral shallows -> luminous jade -> deep sumi indigo
  vec3 shallowTint=vec3(.14,.44,.47);
  vec3 midJade=vec3(.055,.26,.34);
  vec3 deepIndigo=vec3(.020,.095,.185);
  vec3 body=mix(shallowTint,midJade,smoothstep(.0,.55,depthFactor));
  body=mix(body,deepIndigo,smoothstep(.45,1.0,depthFactor));

  // Subsurface sunlit riverbed caustics in shallow & mid-depth water
  float causticFade=(1.-smoothstep(45.,190.,length(cameraPosition-vWaterWorld)))*(1.-depthFactor*.55);
  float caustic=smoothstep(.56,.89,ripA*.48+ripB*.58);
  body+=vec3(.19,.46,.49)*caustic*causticFade*(.42+.35*clamp(uSunStrength,0.,1.));

  vec3 sky=mix(vec3(.12,.30,.44),uSkyTint,.32);
  vec3 color=mix(body,sky,clamp(.06+.64*fresnel,0.,1.));
  color+=vec3(.025,.058,.072)*wave.x;

  // Hand-brushed Sumi-e whitewater foam ribbons, shoreline meniscus & cascade spray
  float bankFoam=smoothstep(.80,.992,bankDist)*(.32+.45*ripB+.28*uRain);
  float currentRibbon=smoothstep(.74,.96,ripA*.55+ripB*.52)*(.18+.55*cascade);
  float crestFoam=cascade*smoothstep(.48,.88,wave.x)*.45;
  float totalFoam=clamp(bankFoam*.52+currentRibbon*.38+crestFoam+wake*.35,0.,.88);
  vec3 foamPigment=mix(vec3(.76,.88,.91),vec3(.93,.97,.99),clamp(ripB+.25,0.,1.));
  color=mix(color,foamPigment,totalFoam);

  // Crisp solar & lunar specular glints
  vec3 reflected=reflect(-normalize(uSunDirection),normal);
  float specTight=pow(max(dot(reflected,viewDir),0.),130.)*clamp(uSunStrength,0.,1.6);
  float specBroad=pow(max(dot(reflected,viewDir),0.),24.)*clamp(uSunStrength,0.,1.4);
  color+=uSunColor*(specTight*.52+specBroad*.09);
  color=mix(color,color*vec3(.45,.61,.80),uNight*.72);

  float alpha=clamp(.34+.38*depthFactor+.26*fresnel+totalFoam*.32+.04*wake,.28,.88);
  float underwater=1.-step(0.,viewDir.y);
  color=mix(color,vec3(.04,.18,.28)+uSunColor*min(uSunStrength,.8)*.03,underwater*.74);
  alpha=mix(alpha,.10,underwater);

  float fog=smoothstep(uFogNearFar.x,uFogNearFar.y,length(cameraPosition-vWaterWorld));
  color=mix(color,uFogTint,fog*.22);
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