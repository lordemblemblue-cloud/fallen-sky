// Game 1/Game 3D weather bridge. Reuses the authoritative UI/world weather
// (live forecast + in-game time) instead of adding an unrelated Game 2 climate.
// Weather effects are client visuals only; no server combat mutation.
import {clamp01} from './forestBiomeData.js';

const DIRS={N:0,NNE:22.5,NE:45,ENE:67.5,E:90,ESE:112.5,SE:135,
  SSE:157.5,S:180,SSW:202.5,SW:225,WSW:247.5,W:270,
  WNW:292.5,NW:315,NNW:337.5};
export function windVector(direction='SW'){
  const code=String(direction||'SW').trim().toUpperCase();
  const degrees=Object.hasOwn(DIRS,code)?DIRS[code]:Number.isFinite(Number(code))?Number(code):225;
  // NWS reports wind coming FROM this direction, so sway points opposite.
  const rad=degrees*Math.PI/180;
  return [-Math.sin(rad),-Math.cos(rad)];
}
export function forestRainTarget(env={}) {
  if(!env||!['rain','storm','hail'].includes(env.weather))return 0;
  if(env.weather==='storm')return 1;
  if(env.weather==='hail')return .7;
  return env.precipProb!=null? .4+.6*clamp01(Number(env.precipProb)/100):.62;
}
export class Game1ForestWeather {
  constructor(){this.time=0;this.rain=0;this.wetness=0;this.puddles=0;
    this.wind=[.5,.4];this.gust=.24;this.targetRain=0;}
  update(dt,environment={}) {
    const delta=Math.max(0,Math.min(.20,Number.isFinite(dt)?dt:0));
    this.time+=delta;this.targetRain=forestRainTarget(environment);
    this.rain+=(this.targetRain-this.rain)*(1-Math.exp(-2.6*delta));
    this.wetness=clamp01(this.wetness+this.rain*.065*delta-
      (1-this.rain)*.018*delta);
    const fill=clamp01((this.wetness-.14)*1.55);
    this.puddles+=(fill-this.puddles)*(1-Math.exp(-.85*delta));
    this.puddles=clamp01(this.puddles);
    this.wind=windVector(environment.windDir||'SW');
    const fallbackWind=environment.weather==='storm'?24:environment.weather==='rain'?12:7;
    const actualWind=Number(environment.windMph);
    const hasWind=environment.windMph!=null&&Number.isFinite(actualWind)&&actualWind>=0;
    this.gust=clamp01(.16+(hasWind?actualWind:fallbackWind)/28);
    return this.snapshot();
  }
  snapshot(){return {time:this.time,rain:this.rain,wetness:this.wetness,
    puddles:this.puddles,wind:[...this.wind],gust:this.gust,targetRain:this.targetRain};}
}
