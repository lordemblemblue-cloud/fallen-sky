// Live wind for Game 3D vegetation (2026-11-16 landscaping, round 2).
//
// One smoothed wind state from the live weather (the NWS forecast gives
// windDir as a 16-point compass string and windMph as a number or text such
// as "5 to 10 mph"). Every grass and tree system reads the same direction,
// strength and gust, plus a travelling "sheet" phase: gust fronts that sweep
// across the meadow downwind -- the visible waves of wind running through
// grass. Pure (no THREE); the GLSL helper is shared by the grass shaders.

export const LIVE_WIND_COMPASS=Object.freeze({N:0,NNE:22.5,NE:45,ENE:67.5,E:90,ESE:112.5,SE:135,
  SSE:157.5,S:180,SSW:202.5,SW:225,WSW:247.5,W:270,WNW:292.5,NW:315,NNW:337.5});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/** {fromDeg, mph} (meteorological: the direction the wind blows FROM). */
export function parseLiveWind(weather={}){
  let fromDeg=null,mph=null;
  const d=weather?.windDir??weather?.windDirectionDeg;
  if(typeof d==='string'){
    const k=d.trim().toUpperCase();
    if(k in LIVE_WIND_COMPASS)fromDeg=LIVE_WIND_COMPASS[k];
    else if(k!==''&&Number.isFinite(Number(k)))fromDeg=Number(k);
  }else if(Number.isFinite(d))fromDeg=d;
  const s=weather?.windMph??weather?.windSpeedMph;
  if(Number.isFinite(s))mph=s;
  else if(typeof s==='string'){
    const nums=s.match(/\d+(\.\d+)?/g);
    if(nums)mph=Math.max(...nums.map(Number));
  }
  return {fromDeg:fromDeg==null?null:((fromDeg%360)+360)%360,mph:mph==null?null:clamp(mph,0,80)};
}

/** Unit vector (world x, z) the wind blows TOWARD; north is +z. */
export function liveWindVector(fromDeg,out=[0,0]){
  const rad=fromDeg*Math.PI/180;
  out[0]=-Math.sin(rad);out[1]=-Math.cos(rad);
  return out;
}

/**
 * Smoothed live wind. update(dt, weather) eases direction (shortest arc,
 * <= 12 deg/s) and speed (~3 s), adds irregular gusts that grow with the
 * wind, and advances the sheet phase (metres the gust fronts travelled).
 */
export function createLiveWind({fromDeg=225,mph=7}={}){
  const state={fromDeg,mph,dir:liveWindVector(fromDeg),strength:0,gust:0,sheet:0,time:0};
  let targetFrom=fromDeg,targetMph=mph;
  function update(dt,weather={}){
    const step=clamp(Number(dt)||0,0,.1);
    state.time+=step;
    const live=parseLiveWind(weather);
    if(live.fromDeg!=null)targetFrom=live.fromDeg;
    if(live.mph!=null)targetMph=live.mph;
    else if(weather?.weather==='storm')targetMph=24;
    else if(weather?.weather==='rain')targetMph=Math.max(13,targetMph);
    const delta=((targetFrom-state.fromDeg+540)%360)-180;
    state.fromDeg=(state.fromDeg+clamp(delta,-12*step,12*step)+360)%360;
    state.mph+=(targetMph-state.mph)*Math.min(1,step/3);
    // Incommensurate sines: irregular bursts, stronger and more frequent in a high wind.
    const t=state.time;
    const raw=.5+.5*(Math.sin(t*.37+1.3)*.5+Math.sin(t*.91+.4)*.3+Math.sin(t*2.13)*.2);
    state.gust=clamp(Math.pow(raw,1.6)*clamp(.25+state.mph/30,0,1)*1.3,0,1);
    // Gust fronts run downwind a little slower than the wind itself.
    state.sheet+=step*(1.2+state.mph*.447*.6)*(.7+.6*state.gust);
    liveWindVector(state.fromDeg,state.dir);
    state.strength=clamp(.3+state.mph/14,.3,1.65);
    return state;
  }
  return {update,state};
}

/** GLSL: gust-sheet intensity (0..1) at world xz for direction + phase. */
export const LIVE_WIND_SHEET_GLSL=`
float liveWindSheet(vec2 p,vec2 dir,float phase){
  float along=dot(p,dir);
  float warp=sin(p.x*.031+p.y*.027)*2.4+sin(p.x*.071-p.y*.053)*1.2;
  float broad=smoothstep(.3,1.,.5+.5*sin((along-phase)*.34+warp));
  float fine=smoothstep(.45,1.,.5+.5*sin((along-phase*1.25)*.95+warp*1.7));
  return clamp(broad*.75+fine*.35,0.,1.);
}
`;

// The same gust sheet as a TSL function, for the grass node materials on WebGPURenderer (three/tsl is loaded
// lazily by the caller's module graph; this file stays importable without a renderer).
export {liveWindSheetNode} from './liveWindNodes.mjs';
