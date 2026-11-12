import {
  WOLFVEIL_SITES, WOLFVEIL_ROUTES, WOLFVEIL_BRIDGES,
  WOLFVEIL_ACTIVE_TOWN_BUILDINGS, WOLFVEIL_HOUSING_PLOTS, WOLFVEIL_CAVES,
} from '../game3d/wolfveil/WolfveilLayout.js';
import { WOLFVEIL_PALACE } from '../game3d/wolfveil/WolfveilPalaceLayout.mjs';

// The game mounts the village's master plan at +70m Z so the market sits at spawn.
const GAME_OFFSET_Z = 70;
function overlaps(tile, x, z, width = 0, depth = 0) {
  return x + width/2 >= tile.minX && x - width/2 <= tile.maxX &&
    z + depth/2 >= tile.minZ && z - depth/2 <= tile.maxZ;
}
function segmentDistance(x, z, a, b) {
  const dx=b[0]-a[0],dz=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
}
export function describeWolfveilTile(tile) {
  const result=[];
  const features=Object.values(WOLFVEIL_SITES);
  for(const site of features){
    const z=site.z+GAME_OFFSET_Z;
    if(overlaps(tile,site.x,z,10,10))
      result.push({name:site.label,kind:site.kind,id:site.id,
        x:site.x,z,source:'wolfveil-master-landmark'});
  }
  if(overlaps(tile,WOLFVEIL_PALACE.x,WOLFVEIL_PALACE.z+GAME_OFFSET_Z,
    WOLFVEIL_PALACE.width,WOLFVEIL_PALACE.depth))
    result.push({name:WOLFVEIL_PALACE.label,id:WOLFVEIL_PALACE.id,
      kind:'palace',x:WOLFVEIL_PALACE.x,z:WOLFVEIL_PALACE.z+GAME_OFFSET_Z,
      width:WOLFVEIL_PALACE.width,depth:WOLFVEIL_PALACE.depth,source:'Luna manor'});
  for(const building of WOLFVEIL_ACTIVE_TOWN_BUILDINGS){
    const z=building.z+GAME_OFFSET_Z;
    if(overlaps(tile,building.x,z,building.w,building.d))
      result.push({name:building.label,kind:building.kind,id:building.id,
        x:building.x,z,width:building.w,depth:building.d,
        stories:building.stories,hasInterior:building.hasInterior});
  }
  for(const plot of []){ // old plot foundations were physically removed
    const z=plot.z+GAME_OFFSET_Z;
    if(overlaps(tile,plot.x,z,plot.w,plot.d))
      result.push({name:plot.id,kind:'reserved-housing-plot',
        x:plot.x,z,width:plot.w,depth:plot.d,state:plot.state});
  }
  for(const route of WOLFVEIL_ROUTES){
    const points=route.points.map(p=>[p[0],p[1]+GAME_OFFSET_Z]);
    if(points.slice(1).some((point,i)=>segmentDistance(tile.centerX,tile.centerZ,
      points[i],point)<=route.width/2+Math.hypot(tile.width,tile.depth)/2))
      result.push({name:route.id,kind:route.kind||'path',width:route.width});
  }
  for(const bridge of WOLFVEIL_BRIDGES){
    const start=[bridge.from[0],bridge.from[1]+GAME_OFFSET_Z];
    const end=[bridge.to[0],bridge.to[1]+GAME_OFFSET_Z];
    if(segmentDistance(tile.centerX,tile.centerZ,start,end)
      <=bridge.width/2+Math.hypot(tile.width,tile.depth)/2)
      result.push({name:bridge.label,kind:'bridge',id:bridge.id,
        width:bridge.width,from:start,to:end});
  }
  for(const cave of WOLFVEIL_CAVES){
    const x=cave.entry[0],z=cave.entry[1]+GAME_OFFSET_Z;
    if(overlaps(tile,x,z,8,8))
      result.push({name:cave.name,kind:'cave',id:cave.id,x,z,access:cave.accessible});
  }
  return result;
}
