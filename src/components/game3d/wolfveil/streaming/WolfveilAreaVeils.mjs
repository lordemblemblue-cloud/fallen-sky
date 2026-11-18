// Gate-only travel between the five Wolfveil areas (WolfveilFiveAreaPlan.mjs).
//
// The owner's brief: "you have to go through the portal to load that other
// part of the land". Spirit-veil walls stand on every area border and stop a
// mover crossing anywhere except through a gate opening. The gates stand at
// the existing portals (WolfveilAreaPortalPlan.mjs: where a road, trail or
// bridge crosses a border), with the same openings as the old light arches.
// Travel is a walk-through, never a teleport: positions stay continuous, so
// server movement, saved coordinates and collision are unchanged.
//
// Pure data + math, no three.js. LOCAL Wolfveil X/Z metres (world Z - 70).
import {
  WOLFVEIL_AREA_BORDERS,WOLFVEIL_AREA_CORE_HALF_SPAN,WOLFVEIL_AREA_IDS,
  wolfveilAreaAtLocal,wolfveilAreaInfo,
} from './WolfveilFiveAreaPlan.mjs';
import {WOLFVEIL_AREA_PORTALS,planWolfveilAreaPortalVisuals,WOLFVEIL_AREA_PORTAL_STYLE}
  from './WolfveilAreaPortalPlan.mjs';

const freezeAll=list=>Object.freeze(list.map(entry=>Object.freeze(entry)));

// One mist tint per area; a veil shows the colour of the area beyond it.
export const WOLFVEIL_AREA_COLORS=Object.freeze({
  town:Object.freeze([1,.8,.52]),west:Object.freeze([.5,.95,.66]),
  east:Object.freeze([.46,.78,1]),north:Object.freeze([.8,.86,1]),south:Object.freeze([1,.88,.46]),
});
export const wolfveilAreaColor=id=>WOLFVEIL_AREA_COLORS[id]||[1,1,1];

const B=WOLFVEIL_AREA_BORDERS,H=WOLFVEIL_AREA_CORE_HALF_SPAN;
// The border segments inside the playable core, each between two areas.
export const WOLFVEIL_AREA_VEIL_LINES=freezeAll([
  {id:'west_north',areas:['west','north'],points:[[-H,B.northZ],[B.westX,B.northZ]]},
  {id:'town_north',areas:['town','north'],points:[[B.westX,B.northZ],[B.eastX,B.northZ]]},
  {id:'east_north',areas:['east','north'],points:[[B.eastX,B.northZ],[H,B.northZ]]},
  {id:'town_west',areas:['town','west'],points:[[B.westX,B.southZ],[B.westX,B.northZ]]},
  {id:'south_west',areas:['south','west'],points:[[B.westX,-H],[B.westX,B.southZ]]},
  {id:'town_east',areas:['town','east'],points:[[B.eastX,B.southZ],[B.eastX,B.northZ]]},
  {id:'south_east',areas:['south','east'],points:[[B.eastX,-H],[B.eastX,B.southZ]]},
  {id:'town_south',areas:['town','south'],points:[[B.westX,B.southZ],[B.eastX,B.southZ]]},
].map(line=>({...line,points:Object.freeze(line.points.map(p=>Object.freeze(p)))})));

const titleCase=id=>String(id||'path').split(/[_\s]+/).filter(Boolean)
  .map(word=>word[0].toUpperCase()+word.slice(1)).join(' ');
const MAX_SKEW=Math.PI/6;
function buildGate(portal,visual){
  // Travel direction through the gate: along the path, but no more than 30
  // degrees off the border's normal so the gate stays in line with its veil.
  const along=[portal.dirX,portal.dirZ];
  let normal=portal.axis==='x'?[1,0]:[0,1];
  if(normal[0]*along[0]+normal[1]*along[1]<0)normal=[-normal[0],-normal[1]];
  const skew=Math.atan2(normal[0]*along[1]-normal[1]*along[0],normal[0]*along[0]+normal[1]*along[1]);
  const turn=Math.max(-MAX_SKEW,Math.min(MAX_SKEW,skew));
  const facing=[normal[0]*Math.cos(turn)-normal[1]*Math.sin(turn),normal[0]*Math.sin(turn)+normal[1]*Math.cos(turn)];
  const ahead=wolfveilAreaAtLocal(portal.x+facing[0]*3,portal.z+facing[1]*3);
  const behind=wolfveilAreaAtLocal(portal.x-facing[0]*3,portal.z-facing[1]*3);
  const halfWidth=visual.radius;
  return {
    id:portal.id,kind:portal.kind,areas:Object.freeze([portal.a,portal.b]),
    label:(portal.pathLabel||titleCase(portal.pathId))+(portal.kind==='bridge'?'':' Gate'),
    x:portal.x,z:portal.z,baseY:visual.y+WOLFVEIL_AREA_PORTAL_STYLE.sinkMeters,
    facing:Object.freeze(facing),yaw:Math.atan2(facing[0],facing[1]),
    behind,ahead,halfWidth,height:Math.max(5.6,halfWidth*1.55),postRadius:.42,
  };
}
let gates=null;
/** One gate per area portal (built lazily: it samples the terrain once). */
export function wolfveilAreaGates(){
  if(gates)return gates;
  const visuals=new Map(planWolfveilAreaPortalVisuals().map(v=>[v.id,v]));
  gates=freezeAll(WOLFVEIL_AREA_PORTALS.map(p=>buildGate(p,visuals.get(p.id))));
  return gates;
}
/** Gate post centres (local x, z): +lateral first, then -lateral. */
export function wolfveilAreaGatePosts(gate){
  const t=[gate.facing[1],-gate.facing[0]],d=gate.halfWidth+gate.postRadius;
  return [[gate.x+t[0]*d,gate.z+t[1]*d],[gate.x-t[0]*d,gate.z-t[1]*d]];
}
export function wolfveilAreaGateDestination(gate,side){
  const id=side==='ahead'?gate.ahead:gate.behind;
  return {id,label:wolfveilAreaInfo(id)?.label||id,color:wolfveilAreaColor(id)};
}

// Where a straight move first leaves its area: the border point and the
// first point beyond it (already inside the next area).
function crossingPoint(ax,az,bx,bz,from){
  let lo=0,hi=1;
  for(let i=0;i<24;i++){
    const mid=(lo+hi)/2;
    if(wolfveilAreaAtLocal(ax+(bx-ax)*mid,az+(bz-az)*mid)===from)lo=mid;else hi=mid;
  }
  const t=(lo+hi)/2;
  return {x:ax+(bx-ax)*t,z:az+(bz-az)*t,next:{x:ax+(bx-ax)*hi,z:az+(bz-az)*hi}};
}
/** The gate whose opening contains a border point between areas a and b. */
export function wolfveilAreaGateAt(point,a,b,{slack=.15,list=wolfveilAreaGates()}={}){
  for(const gate of list){
    if(!gate.areas.includes(a)||!gate.areas.includes(b))continue;
    const dx=point.x-gate.x,dz=point.z-gate.z;
    const lateral=Math.abs(dx*gate.facing[1]-dz*gate.facing[0]);
    const depth=Math.abs(dx*gate.facing[0]+dz*gate.facing[1]);
    if(lateral<=gate.halfWidth+slack&&depth<=6)return gate;
  }
  return null;
}
/**
 * Classifies a straight LOCAL move: `crossed` is false inside one area;
 * otherwise `allowed` says whether it passes through a gate (`gate`).
 */
export function wolfveilAreaVeilCrossing(from,to,depth=0){
  const ax=Number(from?.x),az=Number(from?.z),bx=Number(to?.x),bz=Number(to?.z);
  if(![ax,az,bx,bz].every(Number.isFinite))return {crossed:false,allowed:true,gate:null};
  const ra=wolfveilAreaAtLocal(ax,az),rb=wolfveilAreaAtLocal(bx,bz);
  if(ra===rb)return {crossed:false,allowed:true,gate:null,from:ra,to:rb};
  const at=crossingPoint(ax,az,bx,bz,ra);
  const next=wolfveilAreaAtLocal(at.next.x,at.next.z);
  const gate=wolfveilAreaGateAt(at,ra,next);
  if(!gate)return {crossed:true,allowed:false,gate:null,from:ra,to:rb,at:{x:at.x,z:at.z}};
  // A move clipping a third area at a T-junction must pass every border
  // it meets through a gate.
  if(next!==rb&&depth<3){
    const rest=wolfveilAreaVeilCrossing(at.next,to,depth+1);
    if(!rest.allowed)return {...rest,from:ra};
  }
  return {crossed:true,allowed:true,gate,from:ra,to:rb,at:{x:at.x,z:at.z}};
}
/**
 * Client movement through the veils (LOCAL coordinates). Mutates `position`
 * so the mover slides along a veil instead of passing it.
 */
export function resolveWolfveilAreaVeilMovement(position,previous){
  if(!position||!previous)return {blocked:false,gate:null};
  const full=wolfveilAreaVeilCrossing(previous,position);
  if(full.allowed)return {blocked:false,gate:full.gate};
  const xOnly={x:position.x,z:previous.z};
  let at=wolfveilAreaVeilCrossing(previous,xOnly).allowed?xOnly:{x:previous.x,z:previous.z};
  const zOnly={x:at.x,z:position.z};
  if(wolfveilAreaVeilCrossing(at,zOnly).allowed)at=zOnly;
  position.x=at.x;position.z=at.z;
  return {blocked:true,gate:null};
}
export {WOLFVEIL_AREA_IDS};
