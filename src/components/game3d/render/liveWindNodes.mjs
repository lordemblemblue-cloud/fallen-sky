// TSL version of LIVE_WIND_SHEET_GLSL (liveWind.mjs): gust-sheet intensity (0..1) at world xz.
import {Fn,dot,sin,smoothstep,clamp} from 'three/tsl';

export const liveWindSheetNode=Fn(([p,dir,phase])=>{
  const along=dot(p,dir);
  const warp=sin(p.x.mul(.031).add(p.y.mul(.027))).mul(2.4).add(sin(p.x.mul(.071).sub(p.y.mul(.053))).mul(1.2));
  const broad=smoothstep(.3,1,sin(along.sub(phase).mul(.34).add(warp)).mul(.5).add(.5));
  const fine=smoothstep(.45,1,sin(along.sub(phase.mul(1.25)).mul(.95).add(warp.mul(1.7))).mul(.5).add(.5));
  return clamp(broad.mul(.75).add(fine.mul(.35)),0,1);
});
