// Wolfveil map model for the HUD minimap, the world map and the design image.
// Built from the SAME data as the terrain (WolfveilLayout + the landscape
// design + the authoritative encounter data), converted to Play world
// coordinates (local Z + 70). Pure module: no THREE, no React.
import {
  WOLFVEIL_ROUTES,WOLFVEIL_RIVER,WOLFVEIL_BRIDGES,WOLFVEIL_SITES,WOLFVEIL_CAVES,
} from './WolfveilLayout.js';
import {
  WOLFVEIL_MOUNTAIN_RANGES,WOLFVEIL_FIGHTING_GROUNDS,WOLFVEIL_MOB_AREAS,
  WOLFVEIL_FRONTIER_TRAILS,WOLFVEIL_SUMMITS,WOLFVEIL_LANDSCAPE_REVISION,
  WOLFVEIL_LANDSCAPE_PLAY_OFFSET_Z as OFFSET_Z,wolfveilLandscapeZoneAt,
} from './WolfveilLandscapeDesign.mjs';

export const WOLFVEIL_MAP_REVISION=WOLFVEIL_LANDSCAPE_REVISION;
// The full 1,100 m playable square in Play world coordinates.
export const WOLFVEIL_MAP_WORLD_BOUNDS=Object.freeze({
  minX:-550,maxX:550,minZ:-550+OFFSET_Z,maxZ:550+OFFSET_Z,
});
// Terrain underlay rendered from the real height + surface functions by
// scripts/render-wolfveil-map.mjs (north up; covers WOLFVEIL_MAP_WORLD_BOUNDS).
export const WOLFVEIL_MAP_UNDERLAY=Object.freeze({
  url:'/game3d/maps/wolfveil-landscape-v1.png',
  pixels:640,
});
const world=([x,z])=>Object.freeze([x,z+OFFSET_Z]);

export const WOLFVEIL_MAP_ROADS=Object.freeze([
  ...WOLFVEIL_ROUTES.map(r=>Object.freeze({id:r.id,kind:r.kind,width:r.width,
    name:r.labels?.length?r.labels.join(' · '):roadName(r),points:Object.freeze(r.points.map(world))})),
  ...WOLFVEIL_FRONTIER_TRAILS.map(r=>Object.freeze({id:r.id,kind:'frontier',width:r.width,
    name:r.name,points:Object.freeze(r.points.map(world))})),
]);
function roadName(route){
  return ({west_residential:'West Lane',south_residential:'South Lane',riverside_loop:'Riverside Walk',
    river_housing_loop:'River Terrace Loop',west_woodland_fork:'Woodland Fork',
    training_forest:'Training Trail',quarry_approach:'Quarry Road',ridge_path:'Ridge Path',
    waterfall_cave:'Waterfall Trail'})[route.id]||route.id.replaceAll('_',' ');
}
export const WOLFVEIL_MAP_RIVER=Object.freeze({
  name:'Silverrun River',width:WOLFVEIL_RIVER.width,
  points:Object.freeze(WOLFVEIL_RIVER.points.map(p=>world([p[0],p[1]]))),
});
export const WOLFVEIL_MAP_BRIDGES=Object.freeze(WOLFVEIL_BRIDGES.map(b=>Object.freeze({
  id:b.id,name:b.label,width:b.width,from:world(b.from),to:world(b.to),
})));
export const WOLFVEIL_MAP_RANGES=Object.freeze(WOLFVEIL_MOUNTAIN_RANGES.map(r=>Object.freeze({
  id:r.id,name:r.name,side:r.side,outer:Boolean(r.outer),
  spine:Object.freeze(r.spine.map(p=>world([p[0],p[1]]))),
})));
export const WOLFVEIL_MAP_SUMMITS=Object.freeze(WOLFVEIL_SUMMITS.map(s=>Object.freeze({
  ...s,z:s.z+OFFSET_Z,
})));
export const WOLFVEIL_MAP_FIGHTING_GROUNDS=Object.freeze(WOLFVEIL_FIGHTING_GROUNDS.map(f=>Object.freeze({
  id:f.id,name:f.name,x:f.x,z:f.z+OFFSET_Z,radius:f.radius,purpose:f.purpose,
})));
export const WOLFVEIL_MAP_MOB_AREAS=Object.freeze(WOLFVEIL_MOB_AREAS.map(m=>Object.freeze({
  id:m.id,name:m.name,kind:m.kind,x:m.x,z:m.z+OFFSET_Z,
  radius:m.radius*(m.shape==='ravine'?1.4:1),levels:m.levels,tier:m.tier||null,
  label:m.levels[0]===m.levels[1]?'Lv '+m.levels[0]:'Lv '+m.levels[0]+'–'+m.levels[1],
})));
export const WOLFVEIL_MAP_SAFE_ZONES=Object.freeze([
  {id:'town',name:'Wolfveil Town',x:0,z:-70+OFFSET_Z,radius:150},
  {id:'training',name:'Training Grounds',x:-165,z:88+OFFSET_Z,radius:65},
  {id:'sanctuary',name:'Wolf Sanctuary',x:4,z:220+OFFSET_Z,radius:50},
].map(Object.freeze));
export const WOLFVEIL_MAP_LANDMARKS=Object.freeze([
  {id:'south_gate',name:WOLFVEIL_SITES.southGate.label,type:'gate',...pt(WOLFVEIL_SITES.southGate)},
  {id:'sanctuary',name:WOLFVEIL_SITES.sanctuary.label,type:'shrine',...pt(WOLFVEIL_SITES.sanctuary)},
  {id:'waterfall',name:WOLFVEIL_SITES.waterfall.label,type:'water',...pt(WOLFVEIL_SITES.waterfall)},
  {id:'vortex_lake',name:WOLFVEIL_SITES.vortexLake.label,type:'water',...pt(WOLFVEIL_SITES.vortexLake)},
  {id:'hot_spring',name:WOLFVEIL_SITES.hotSpring.label,type:'water',...pt(WOLFVEIL_SITES.hotSpring)},
  {id:'wolf_stones',name:WOLFVEIL_SITES.wolfStone.label,type:'stones',...pt(WOLFVEIL_SITES.wolfStone)},
  {id:'cedar_forest',name:WOLFVEIL_SITES.cedarForest.label,type:'forest',...pt(WOLFVEIL_SITES.cedarForest)},
  {id:'lunar_gate',name:'Lunar Mountain Gate',type:'portal',x:171,z:222},
  {id:'astral_gate',name:'Astral Gate',type:'portal',x:197,z:224},
  ...WOLFVEIL_CAVES.map(c=>({id:'cave:'+c.id,name:c.name,type:'cave',x:c.entry[0],z:c.entry[1]+OFFSET_Z})),
].map(Object.freeze));
function pt(site){return {x:site.x,z:site.z+OFFSET_Z};}

/** Zone shown under the minimap. World (Play) coordinates. */
export function wolfveilMapZoneAt(x,z){
  const zone=wolfveilLandscapeZoneAt(Number(x),Number(z)-OFFSET_Z);
  if(zone)return zone;
  return {id:'valley',name:'Wolfveil Valley',kind:'open'};
}

/** Projects world X/Z into a 0..size square (north up). */
export function projectWolfveilMap(x,z,size=1000,b=WOLFVEIL_MAP_WORLD_BOUNDS){
  return {x:(x-b.minX)/(b.maxX-b.minX)*size,y:(b.maxZ-z)/(b.maxZ-b.minZ)*size};
}
export const WOLFVEIL_MAP_LEGEND=Object.freeze([
  {id:'safe',label:'Safe town & training',color:'#7fd18a'},
  {id:'fighting',label:'Open fighting grounds (level, no mobs)',color:'#f2c46b'},
  {id:'mob',label:'Mob areas & camps (levels shown)',color:'#e5675f'},
  {id:'frontier',label:"Hunter's Loop trail (camps in level order)",color:'#e9c9a0'},
  {id:'road',label:'Roads & paths',color:'#d8c3a0'},
  {id:'river',label:'Silverrun River & bridges',color:'#6fb7d8'},
  {id:'mountain',label:'Mountain ranges (map edge)',color:'#9aa3a9'},
]);
