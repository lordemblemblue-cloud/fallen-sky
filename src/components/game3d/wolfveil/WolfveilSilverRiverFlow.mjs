// Pure, deterministic water-surface data for the existing Wolfveil river.
// Each authored quad is two triangles (six unindexed vertices). No geometry,
// river grade, collision, multiplayer position or water-body physics is changed.
const WIND_BEARINGS=Object.freeze({N:0,NE:45,E:90,SE:135,S:180,SW:225,W:270,NW:315});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

export function buildWolfveilRiverSurfaceAttributes(points){
  if(!Array.isArray(points)||points.length<2)
    throw new RangeError('Wolfveil river needs two or more points');
  const segments=[];
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1];
    if(!Array.isArray(a)||!Array.isArray(b)||a.length<3||b.length<3||
       ![a[0],a[1],a[2],b[0],b[1],b[2]].every(Number.isFinite))
      throw new RangeError('Wolfveil river contains an invalid point');
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    if(length<.001)throw new RangeError('Wolfveil river segment has zero length');
    const slope=Math.max(0,(a[2]-b[2])/length);
    segments.push({ux:dx/length,uz:dz/length,length,turbulence:clamp(slope*3,0,1)});
  }
  // Smooth the river tangent at the SHARED section vertices, not one harsh
  // constant vector per quad. The previous discontinuity produced visible
  // triangular/striped reflection direction changes at segment joins.
  const pointVectors=Array.from({length:points.length},(_,i)=>{
    const before=segments[Math.max(0,i-1)];
    const after=segments[Math.min(segments.length-1,i)];
    const x=before.ux+after.ux,z=before.uz+after.uz;
    const scale=Math.hypot(x,z);
    const smoothX=scale>.0001?x/scale:after.ux;
    const smoothZ=scale>.0001?z/scale:after.uz;
    return [smoothX,smoothZ,(before.turbulence+after.turbulence)*.5];
  });
  const flow=[],distance=[];
  let cumulative=0;
  for(let i=0;i<segments.length;i++){
    const length=segments[i].length;
    // Quad vertex order matches WolfveilTriangles.quad: 0,0,1,0,1,1.
    const step=[0,0,1,0,1,1];
    for(const end of step){
      const vector=pointVectors[i+end];
      flow.push(...vector);
      distance.push(cumulative+end*length);
    }
    cumulative+=length;
  }
  return {flow,distance,totalLength:cumulative,segmentCount:segments.length};
}

export function resolveWolfveilRiverWeather(weather={}){
  const bearing=WIND_BEARINGS[weather?.windDir]??225;
  const radians=bearing*Math.PI/180;
  const mph=Number(weather?.windMph);
  const windStrength=Number.isFinite(mph)?clamp(mph/35,0,1):.2;
  const wet=weather?.weather==='storm'?1:
    ['rain','hail'].includes(weather?.weather)?.65:0;
  return {
    // windDir is meteorological direction *from*; motion heads away.
    wind:[-Math.sin(radians),-Math.cos(radians)],
    strength:windStrength,rain:wet,night:weather?.isNight?1:0,
  };
}
