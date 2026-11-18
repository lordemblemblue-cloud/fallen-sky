// Wolfveil's four sides: one look and one purpose for each side of the town.
//
//   back  (north)  MOUNTAIN   bare rock, scree, wind-bent pines   levels 30-35
//   left  (west)   FOREST     tall cedars, ferns, bamboo, maples  levels 40-50
//   front (south)  GRASSLAND  open fields, flower drifts          training ground
//   right (east)   WILDS      ravines, quarry, ruins, groves      levels 2-25
//
// The sides were not picked at random. The north is the highest and steepest
// ground (143 m on average, 62% steeper than 20 degrees); the south is flat
// (2 m, 6 degrees); the west already holds the hillside grove and the camps
// named for cedar and bluewood; the east already holds eight of the fourteen
// monster camps and the easiest levels.
//
// Together the camps make one loop to hunt along: out over the river into
// the eastern wilds, north along the ravines, across the mountain, and home
// through the western forest. Every stop is harder than the last.
//
// This module is the PLAN: what each side is, and where every tree, boulder,
// shrub and flower drift goes. It draws nothing and changes nothing. Pure
// numbers, shared by the scene, the tests and (for trunks) the server.
import {wolfveilHeight,wolfveilDistanceToRiver,wolfveilRouteClearance} from './WolfveilLayout.js';
import {WOLFVEIL_MOB_AREAS,WOLFVEIL_FIGHTING_GROUNDS,wolfveilFightingGroundAt,wolfveilMobAreaAt,
  wolfveilFrontierTrailClearance,wolfveilNoise2} from './WolfveilLandscapeDesign.mjs';
import {wolfveilAreaAtLocal,wolfveilAreaRect} from './streaming/WolfveilFiveAreaPlan.mjs';
import {WOLFVEIL_AREA_PORTALS} from './streaming/WolfveilAreaPortalPlan.mjs';
import {WOLFVEIL_CAVE_ENTRANCE_FRAMES} from './WolfveilCaveEntrancePlan.mjs';
import {clearOf} from './WolfveilForestLayout.js';

export const WOLFVEIL_FOUR_SIDES_REVISION='wolfveil-four-sides-v1-20261117';

// What one piece of scenery needs around it. `trunk` scenery (a tree) blocks
// the way and gets a collider on the client and the server. `bulky` scenery
// (a boulder) is kept out of camps, arenas and gateways like a tree, but is
// walked through like every stone already in the valley.
export const WOLFVEIL_SIDE_SCENERY=Object.freeze({
  cedar:  {trunk:true, spacing:6.5,maxSlope:.62,pathClear:5,  height:[13,19]},
  pine:   {trunk:true, spacing:7,  maxSlope:.70,pathClear:5,  height:[8,13]},
  maple:  {trunk:true, spacing:9,  maxSlope:.50,pathClear:5,  height:[7,10]},
  bamboo: {trunk:false,spacing:2.2,maxSlope:.45,pathClear:3.5,height:[5,8]},
  boulder:{trunk:false,bulky:true,spacing:5,maxSlope:1.6,pathClear:4.5,height:[1.2,3.4]},
  shrub:  {trunk:false,spacing:2.4,maxSlope:.75,pathClear:2.5,height:[.5,1.3]},
  flowers:{trunk:false,spacing:1.6,maxSlope:.42,pathClear:1.5,height:[.3,.6]},
});

// Scenery per hectare, and the most each side may hold. The caps keep one
// loaded side inside the browser budget with a light tree of about 300
// triangles (see docs/game3d/WOLFVEIL_FOUR_SIDES_LANDSCAPE.md).
export const WOLFVEIL_SIDE_THEMES=Object.freeze({
  north:Object.freeze({side:'back',theme:'mountain',title:'Howling Heights',levels:[30,35],
    look:'Bare rock and scree. Wind-bent pines only below the tree line. Boulder fields on the steep ground.',
    treeLineMeters:215,
    perHectare:{pine:5,boulder:26,shrub:6,flowers:1},
    caps:{pine:140,boulder:700,shrub:180,flowers:40}}),
  west:Object.freeze({side:'left',theme:'forest',title:'Bluewood',levels:[40,50],
    look:'Tall cedars in groves with glades between them. Ferns under the trees, bamboo by the low ground, a few red maples.',
    perHectare:{cedar:24,maple:3,bamboo:9,shrub:26,boulder:4,flowers:5},
    caps:{cedar:480,maple:60,bamboo:220,shrub:560,boulder:100,flowers:120}}),
  south:Object.freeze({side:'front',theme:'grassland',title:'Southern Gate Fields',levels:null,
    look:'Open rolling fields. Wide drifts of flowers, a lone tree here and there, nothing to block the view of the gate.',
    perHectare:{maple:.9,flowers:70,shrub:4,boulder:1.2},
    caps:{maple:10,flowers:560,shrub:40,boulder:12}}),
  east:Object.freeze({side:'right',theme:'wilds',title:'Shadow Ravines',levels:[2,25],
    look:'Broken country: boulders along the ravines, pine groves ringing each monster camp, open ground on the trail between them.',
    perHectare:{pine:7,maple:2,boulder:15,shrub:11,flowers:7},
    caps:{pine:230,maple:60,boulder:460,shrub:340,flowers:220}}),
});
export const WOLFVEIL_SIDE_IDS=Object.freeze(Object.keys(WOLFVEIL_SIDE_THEMES));
export const wolfveilSideThemeAt=(x,z)=>WOLFVEIL_SIDE_THEMES[wolfveilAreaAtLocal(x,z)]||null;

/**
 * The hunting loop: every monster camp, easiest first. Out through the east,
 * over the mountain, home through the forest.
 */
export function planWolfveilHuntingLoop(){
  const stops=WOLFVEIL_MOB_AREAS.map(camp=>({id:camp.id,name:camp.name||camp.id,kind:camp.kind,
    x:camp.x,z:camp.z,radius:camp.radius,levels:[...camp.levels],side:wolfveilAreaAtLocal(camp.x,camp.z)}))
    .sort((a,b)=>a.levels[0]-b.levels[0]||a.levels[1]-b.levels[1]||a.z-b.z);
  let meters=0;
  for(let i=1;i<stops.length;i++)meters+=Math.hypot(stops[i].x-stops[i-1].x,stops[i].z-stops[i-1].z);
  return {stops,meters:Math.round(meters),sides:[...new Set(stops.map(stop=>stop.side))]};
}

function mulberry32(seed){
  let a=seed>>>0;
  return ()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);
    t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};
}
const slopeAt=(x,z)=>Math.hypot(wolfveilHeight(x+2,z)-wolfveilHeight(x-2,z),
  wolfveilHeight(x,z+2)-wolfveilHeight(x,z-2))/4;
const nearAny=(x,z,points,reach)=>points.some(point=>Math.hypot(x-point[0],z-point[1])<reach);
const PORTALS=WOLFVEIL_AREA_PORTALS.map(portal=>[portal.x,portal.z]);
const CAVE_MOUTHS=WOLFVEIL_CAVE_ENTRANCE_FRAMES.map(frame=>[frame.mouth[0],frame.mouth[2]]);

// How welcome a kind of scenery is at a spot, 0..1, by the side's theme.
function welcome(side,kind,x,z,slope){
  const grove=.5+.5*wolfveilNoise2(x*.021+11.3,z*.021-4.7);   // broad groves and glades
  const drift=.5+.5*wolfveilNoise2(x*.047-2.1,z*.047+8.9);    // smaller drifts
  if(side==='west'){
    if(kind==='cedar')return grove>.36?1:.12;                 // groves, with glades between
    if(kind==='bamboo')return wolfveilHeight(x,z)<40&&drift>.55?1:0;
    if(kind==='shrub')return grove>.3?1:.35;                  // ferns keep to the shade
    if(kind==='flowers')return grove<.36?1:.1;                // flowers keep to the glades
  }
  if(side==='north'){
    if(kind==='boulder')return Math.min(1,.25+slope*1.3);     // scree on the steep ground
    if(kind==='pine')return drift>.45?1:.25;
  }
  if(side==='south'){
    if(kind==='flowers')return drift>.5?1:.08;                // wide drifts, open grass between
  }
  if(side==='east'){
    const camp=wolfveilMobAreaAt(x,z,34);
    if(kind==='pine')return camp?1:(grove>.62?.7:.06);        // a grove rings every camp
    if(kind==='boulder')return Math.min(1,.2+slope*1.5);      // boulders line the ravines
  }
  return 1;
}

/**
 * Where everything goes on one side. Deterministic: the same list every time,
 * on the client and on the server.
 * @returns {{side,theme,placements:Array<{kind,x,y,z,height,yaw,trunk}>,counts,turnedAway}}
 */
export function planWolfveilSidePlanting(side,{seed=0x51de5}={}){
  const theme=WOLFVEIL_SIDE_THEMES[side];
  if(!theme)throw new RangeError('Unknown Wolfveil side: '+side);
  const rect=wolfveilAreaRect(side,{clamp:true});
  const hectares=(rect.maxX-rect.minX)*(rect.maxZ-rect.minZ)/10000;
  const rand=mulberry32(seed^(WOLFVEIL_SIDE_IDS.indexOf(side)*0x9E3779B1));
  const placements=[],counts={},turnedAway={};
  const no=reason=>{turnedAway[reason]=(turnedAway[reason]||0)+1;return false;};
  // Trunks of every kind keep their distance from each other.
  const cells=new Map(),CELL=10;
  const crowded=(x,z,reach,trunk)=>{
    const cx=Math.floor(x/CELL),cz=Math.floor(z/CELL);
    for(let i=cx-1;i<=cx+1;i++)for(let j=cz-1;j<=cz+1;j++)
      for(const other of cells.get(i+':'+j)||[])
        if((trunk&&other.trunk||other.kind===reach.kind)&&
           Math.hypot(x-other.x,z-other.z)<Math.max(reach.spacing,other.spacing)*(trunk&&other.trunk?1:.8))return true;
    return false;
  };
  for(const [kind,density] of Object.entries(theme.perHectare)){
    const rule=WOLFVEIL_SIDE_SCENERY[kind];
    const want=Math.min(theme.caps[kind]??Infinity,Math.round(density*hectares));
    counts[kind]=0;
    for(let tries=0;tries<want*14&&counts[kind]<want;tries++){
      const x=rect.minX+rand()*(rect.maxX-rect.minX),z=rect.minZ+rand()*(rect.maxZ-rect.minZ);
      const chance=rand(),size=rand(),yaw=rand()*Math.PI*2; // drawn every try: one seed, one plan
      if(wolfveilAreaAtLocal(x,z)!==side){no('outside the side');continue;}
      if(!clearOf({x,z},rule.pathClear)){no('town, road, river or lake');continue;}
      if(wolfveilRouteClearance(x,z)<rule.pathClear||wolfveilFrontierTrailClearance(x,z)<rule.pathClear){no('on a trail');continue;}
      const big=rule.trunk||rule.bulky;
      if(wolfveilFightingGroundAt(x,z,big?4:-2)){no('fighting ground');continue;}
      if(big&&wolfveilMobAreaAt(x,z,-4)){no('inside a monster camp');continue;}
      if(nearAny(x,z,PORTALS,big?16:8)||nearAny(x,z,CAVE_MOUTHS,big?18:9)){no('portal or cave mouth');continue;}
      if(wolfveilDistanceToRiver(x,z)<22+rule.pathClear){no('river bank');continue;}
      const slope=slopeAt(x,z);
      if(slope>rule.maxSlope){no('too steep');continue;}
      const y=wolfveilHeight(x,z);
      if(theme.treeLineMeters&&rule.trunk&&y>theme.treeLineMeters){no('above the tree line');continue;}
      if(chance>welcome(side,kind,x,z,slope)){no('not its kind of ground');continue;}
      if(crowded(x,z,{kind,spacing:rule.spacing},big)){no('too close to another');continue;}
      const item={kind,x:Math.round(x*100)/100,y:Math.round(y*100)/100,z:Math.round(z*100)/100,
        height:Math.round((rule.height[0]+size*(rule.height[1]-rule.height[0]))*100)/100,
        yaw:Math.round(yaw*1000)/1000,trunk:rule.trunk};
      placements.push(item);counts[kind]++;
      const key=Math.floor(x/CELL)+':'+Math.floor(z/CELL);
      if(!cells.has(key))cells.set(key,[]);
      cells.get(key).push({x,z,kind,trunk:big,spacing:rule.spacing});
    }
  }
  return {side,theme:theme.theme,title:theme.title,hectares:Math.round(hectares*10)/10,
    placements,counts,turnedAway};
}

/** All four sides at once, with the totals a budget needs. */
export function planWolfveilFourSides(options={}){
  const sides=Object.fromEntries(WOLFVEIL_SIDE_IDS.map(side=>[side,planWolfveilSidePlanting(side,options)]));
  const totals={pieces:0,trunks:0};
  for(const plan of Object.values(sides)){
    totals.pieces+=plan.placements.length;
    totals.trunks+=plan.placements.filter(item=>item.trunk).length;
  }
  return {revision:WOLFVEIL_FOUR_SIDES_REVISION,sides,totals,
    grounds:WOLFVEIL_FIGHTING_GROUNDS.map(ground=>({id:ground.id,x:ground.x,z:ground.z,radius:ground.radius,
      side:wolfveilAreaAtLocal(ground.x,ground.z)})),
    loop:planWolfveilHuntingLoop()};
}
