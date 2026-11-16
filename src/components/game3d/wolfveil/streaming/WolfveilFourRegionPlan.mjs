// Client-owned render streaming boundaries for the existing Classic Wolfveil
// map. All coordinates are Wolfveil LOCAL X/Z; Game 3D adds +70m world Z.
// Do not change the physical terrain, water, collider, authored LAND tiles,
// quest authority, existing dungeon transitions, or saved player coordinates.
export const WOLFVEIL_REGION_Z_OFFSET=70;
export const WOLFVEIL_STREAM_REGIONS=Object.freeze([
  Object.freeze({id:'town',label:'Wolfveil Town & Training',levelHint:'1–20',
    description:'Arrival, market, lower training trails and home hub'}),
  Object.freeze({id:'west',label:'Western Cedar Wilds',levelHint:'exploration',
    description:'Woodland paths, ancient cedar and Wolf Stones'}),
  Object.freeze({id:'east',label:'Eastern Riverlands',levelHint:'exploration',
    description:'Bridges, quarry, ravine and ruined watch'}),
  Object.freeze({id:'north',label:'Northern Highlands',levelHint:'exploration',
    description:'Sanctuary, highland caves, waterfall and upper mountain'}),
]);
export const WOLFVEIL_STREAM_BORDERS=Object.freeze({
  westX:-190,eastX:122,northZ:240,
});
export const WOLFVEIL_STREAM_GATEWAYS=Object.freeze([
  Object.freeze({id:'market_bridge',label:'Market Bridge',
    axis:'x',coordinate:122,along:-98,halfWidth:22,into:'east'}),
  Object.freeze({id:'residential_footbridge',label:'Residential Bridge',
    axis:'x',coordinate:122,along:35,halfWidth:17,into:'east'}),
  Object.freeze({id:'outer_trail_bridge',label:'Outrider Rope Bridge',
    axis:'x',coordinate:122,along:205,halfWidth:17,into:'east'}),
  Object.freeze({id:'cedar_forest_trail',label:'Western Cedar Trail',
    axis:'x',coordinate:-190,along:65,halfWidth:38,into:'west'}),
  Object.freeze({id:'sanctuary_north_pass',label:'Northern Sanctuary Pass',
    axis:'z',coordinate:240,along:4,halfWidth:50,into:'north'}),
]);
export const WOLFVEIL_REGION_STREAM_OPTIONS=Object.freeze({
  preloadMeters:90,
  hysteresisMeters:12,
  batchesPerFrame:4,
});
// The north coordinate has priority; x-borders partition the lower valley.
// The underlying SAME continuous floor/water never disappears at transitions.
export function regionAtWolfveilLocal(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z))return null;
  if(z>=WOLFVEIL_STREAM_BORDERS.northZ)return 'north';
  if(x<=WOLFVEIL_STREAM_BORDERS.westX)return 'west';
  if(x>=WOLFVEIL_STREAM_BORDERS.eastX)return 'east';
  return 'town';
}
export function regionAtWolfveilWorld(position,{zOffset=WOLFVEIL_REGION_Z_OFFSET}={}){
  return position&&regionAtWolfveilLocal(Number(position.x),Number(position.z)-zOffset);
}
export function stableWolfveilStreamRegion(position,previous=null,options={}){
  const x=Number(position?.x),z=Number(position?.z)-Number(options.zOffset??WOLFVEIL_REGION_Z_OFFSET);
  const raw=regionAtWolfveilLocal(x,z);
  if(!raw||!previous||!WOLFVEIL_STREAM_REGIONS.some(region=>region.id===previous))return raw;
  const h=Math.max(0,Number(options.hysteresisMeters??WOLFVEIL_REGION_STREAM_OPTIONS.hysteresisMeters));
  const borders=WOLFVEIL_STREAM_BORDERS;
  if(previous==='north'&&z>borders.northZ-h)return 'north';
  if(previous==='west'&&z<borders.northZ+h&&x<borders.westX+h)return 'west';
  if(previous==='east'&&z<borders.northZ+h&&x<borders.eastX+h)return 'east';
  if(previous==='town'&&z<borders.northZ+h&&x>borders.westX-h&&x<borders.eastX+h)return 'town';
  return raw;
}
// Near-edge prewarming loads the DESTINATION before the player reaches a
// bridge/pass, and can temporarily retain both river banks to prevent pops.
export function nearWolfveilStreamRegions(position,region=null,{zOffset=WOLFVEIL_REGION_Z_OFFSET,preloadMeters=WOLFVEIL_REGION_STREAM_OPTIONS.preloadMeters}={}){
  const x=Number(position?.x),z=Number(position?.z)-zOffset;
  const active=region||regionAtWolfveilLocal(x,z);
  if(!active)return [];
  const result=new Set([active]);
  if(z>=WOLFVEIL_STREAM_BORDERS.northZ-preloadMeters)result.add('north');
  if(z<=WOLFVEIL_STREAM_BORDERS.northZ+preloadMeters) {
    if(x<=WOLFVEIL_STREAM_BORDERS.westX+preloadMeters)result.add('west');
    if(x>=WOLFVEIL_STREAM_BORDERS.eastX-preloadMeters)result.add('east');
    if(x>=WOLFVEIL_STREAM_BORDERS.westX-preloadMeters &&
      x<=WOLFVEIL_STREAM_BORDERS.eastX+preloadMeters)result.add('town');
  }
  // Once beyond the north mountain threshold, retain any adjacent region
  // near the boundary rather than dropping the ground under the player's eye.
  if(z<=WOLFVEIL_STREAM_BORDERS.northZ+preloadMeters&&active==='north')
    result.add(regionAtWolfveilLocal(x,WOLFVEIL_STREAM_BORDERS.northZ-.01));
  return [...result];
}
export function crossedWolfveilGateway(before,after,{zOffset=WOLFVEIL_REGION_Z_OFFSET}={}){
  if(!before||!after)return null;
  const a={x:Number(before.x),z:Number(before.z)-zOffset};
  const b={x:Number(after.x),z:Number(after.z)-zOffset};
  if(![a.x,a.z,b.x,b.z].every(Number.isFinite))return null;
  const d=Math.hypot(b.x-a.x,b.z-a.z);
  // Teleport/respawn is not a doorway traversal; the destination region will
  // still be resolved by position without a fake portal animation.
  if(d>20||d<.00001)return null;
  for(const gate of WOLFVEIL_STREAM_GATEWAYS){
    const source=gate.axis==='x'?a.x:a.z;
    const destination=gate.axis==='x'?b.x:b.z;
    if((source-gate.coordinate)*(destination-gate.coordinate)>0 ||
      Math.abs(destination-source)<1e-7)continue;
    const t=(gate.coordinate-source)/(destination-source);
    if(t<0||t>1)continue;
    const along=gate.axis==='x'?a.z+(b.z-a.z)*t:a.x+(b.x-a.x)*t;
    if(Math.abs(along-gate.along)>gate.halfWidth)return null;
    return {id:gate.id,label:gate.label,into:gate.into};
  }
  return null;
}
