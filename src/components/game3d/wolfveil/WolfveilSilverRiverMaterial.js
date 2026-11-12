// Game 3D opt-in: clear/silver Wolfveil water. The original Game 1 river
// shader remains untouched. This is lightweight analytic reflection and
// transparency, NOT an environment-map or screen-space reflection claim.
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

// Continuous (no cell modulo/quantization) water waves advect DOWNSTREAM.
// Slow bending across the river makes the surface gently WIGGLE as
// successive wavefronts push forward, without circles or straight stripes.
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
  // Explicit derivatives give smooth glass normals without moving vertices.
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
// The reference's cyan triangular water lattice is a visual overlay, not a
// rectangular collision plane. World-space cells stay seamless at every bend.
float cyanWaterTriangleGrid(vec2 p){
  vec2 cell=fract(p*(256./100.));
  float sides=min(min(cell.x,1.-cell.x),min(cell.y,1.-cell.y));
  float diagonal=abs(cell.x-cell.y)*.7071068;
  return 1.-smoothstep(.013,.058,min(sides,diagonal));
}
void main(){
  vec2 downstream=normalize(vRiverFlow.xy+vec2(.00001));
  vec2 across=vec2(-downstream.y,downstream.x);
  vec3 wave=wigglyCurrentWave(vRiverTravel,vBankUv.x);
  float cascade=vRiverFlow.z;
  // Small wind shimmer does NOT create a second set of visible striping.
  float windPhase=dot(vWaterWorld.xz,uWind)*.22-
    uFlowTime*(.27+.50*uWindStrength);
  vec2 tilt=downstream*wave.y*WAVE_NORMAL+
    across*wave.z*WAVE_NORMAL+
    uWind*sin(windPhase)*(.003+.008*uWindStrength);

  // Keep 4 existing player-contact ripples for actual footsteps. Only this
  // optional interaction is localized around a person, not whole-river rings.
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
      tilt+=normalize(fromContact+vec2(.0001))*force*.11;
      wake+=force;
    }
  }
  vec3 normal=normalize(vec3(tilt.x,1.,tilt.y));
  vec3 viewDir=normalize(cameraPosition-vWaterWorld);
  float ndv=clamp(dot(normal,viewDir),0.,1.);
  float fresnel=.027+.973*pow(1.-ndv,5.);

  // Deep blue LIQUID GLASS with actual riverbed visible from overhead.
  // Reflection becomes stronger toward the horizon, not as a bright
  // pale opaque sheet across every viewing angle.
  vec3 body=vec3(.022,.105,.205);
  vec3 sky=mix(vec3(.095,.24,.38),uSkyTint,.15);
  vec3 color=mix(body,sky,clamp(.04+.59*fresnel,0.,1.));
  color+=vec3(.009,.028,.042)*wave.x;
  // Bright triangulated crest highlights from the 256-cells / 100m
  // reference. Fade tiny edges in the distance to avoid shimmering/moire.
  float gridFade=1.-smoothstep(32.,150.,
    length(cameraPosition-vWaterWorld));
  float wire=cyanWaterTriangleGrid(vWaterWorld.xz)*gridFade;
  color=mix(color,vec3(.29,.79,.95),wire*.46);

  float bank=smoothstep(.86,.995,abs(vBankUv.x*2.-1.));
  float foam=bank*(.013+.045*uRain)+cascade*.018*max(0.,wave.x-.46);
  color=mix(color,vec3(.35,.59,.67),clamp(foam,0.,.09));

  vec3 reflected=reflect(-normalize(uSunDirection),normal);
  float solar=pow(max(dot(reflected,viewDir),0.),115.)*
    clamp(uSunStrength,0.,1.6);
  color+=uSunColor*solar*.24;
  color=mix(color,color*vec3(.43,.59,.77),uNight*.75);

  float alpha=clamp(.23+.32*fresnel+.012*bank+.026*wake+
    .015*solar,.20,.58);
  float underwater=1.-step(0.,viewDir.y);
  color=mix(color,vec3(.035,.16,.265)+uSunColor*
    min(uSunStrength,.8)*.02,underwater*.74);
  alpha=mix(alpha,.075,underwater);
  float fog=smoothstep(uFogNearFar.x,uFogNearFar.y,
    length(cameraPosition-vWaterWorld));
  color=mix(color,uFogTint,fog*.18);
  alpha=mix(alpha,.36,fog*.15);
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
    name:'Game3D_Wolfveil_DarkBlueLiquidGlassWaves',
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
      uniforms.uWet.value=frame.rain; // compatibility with original scene
      uniforms.uNight.value=frame.night;
      if(sunLight?.isDirectionalLight){
        if(sunLight.position.lengthSq()>1e-8)
          uniforms.uSunDirection.value.copy(sunLight.position).normalize();
        uniforms.uSunColor.value.copy(sunLight.color);
        uniforms.uSunStrength.value=Math.max(0,Math.min(1.6,sunLight.intensity/2.2));
      }else{
        uniforms.uSunStrength.value=frame.night?0:.55;
      }
      // Silver by day, moonlit slate by night; rain mutes bright sky.
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
      // Same uniform objects as the existing Game3DWaterContact system:
      // one source of truth for the time and position of each player wake.
      uniforms.uContactRipples=contact.uniforms.uRipples;
      uniforms.uContactTime=contact.uniforms.uTime;
      return true;
    },
  };
}
