// Five loaded areas for Classic Wolfveil: the town in the centre and one area
// on each side. Only the area the player stands in (plus the next one while a
// portal is close) is kept loaded; see WolfveilAreaLoader.mjs.
//
// All coordinates are Wolfveil LOCAL X/Z metres; Game 3D adds +70 m world Z.
// Pure data and math: no Three.js. Nothing here changes the physical terrain,
// water, colliders, quest authority, saved positions or the server world.
export const WOLFVEIL_AREA_Z_OFFSET=70;
export const WOLFVEIL_AREA_CORE_HALF_SPAN=550;
// West/east/north match the earlier four-region streaming borders. The south
// border sits just below the town core so the south residential road reaches
// the western area without clipping a corner of the southern one.
export const WOLFVEIL_AREA_BORDERS=Object.freeze({
  westX:-190,eastX:122,northZ:240,southZ:-265,
});
export const WOLFVEIL_AREAS=Object.freeze([
  Object.freeze({id:'town',side:'centre',label:'Wolfveil Town',
    description:'Market, spawn, training grounds and the sanctuary road'}),
  Object.freeze({id:'south',side:'front',label:'Southern Gate Fields',
    description:'Open fields and downs beyond the Southern Wolf Gate'}),
  Object.freeze({id:'west',side:'left',label:'Western Cedar Wilds',
    description:'Cedar forest, Moonlit Commons and the Cedar Spine camps'}),
  Object.freeze({id:'east',side:'right',label:'Eastern Riverlands',
    description:'River bridges, quarry, ravines and the Highfall camps'}),
  Object.freeze({id:'north',side:'back',label:'Northern Highlands',
    description:'Sanctuary pass, Howling Plateau and the Wolf-Ear Range'}),
]);
export const WOLFVEIL_AREA_IDS=Object.freeze(WOLFVEIL_AREAS.map(area=>area.id));
const AREA_BY_ID=new Map(WOLFVEIL_AREAS.map(area=>[area.id,area]));
export const WOLFVEIL_AREA_LOADING_OPTIONS=Object.freeze({
  preloadMeters:90,
  hysteresisMeters:12,
  batchesPerFrame:4,
});
const finite=Number.isFinite;
const B=WOLFVEIL_AREA_BORDERS;

export function wolfveilAreaInfo(id){return AREA_BY_ID.get(id)||null;}

// North has priority, then west and east; the middle column is split into
// town and south. Every area is one axis-aligned rectangle that runs on
// outward past the 1,100 m core, so the streamed outer meadow is covered too.
export function wolfveilAreaAtLocal(x,z){
  if(!finite(x)||!finite(z))return null;
  if(z>=B.northZ)return 'north';
  if(x<=B.westX)return 'west';
  if(x>=B.eastX)return 'east';
  return z<B.southZ?'south':'town';
}
export function wolfveilAreaAtWorld(position,{zOffset=WOLFVEIL_AREA_Z_OFFSET}={}){
  return position?wolfveilAreaAtLocal(Number(position.x),Number(position.z)-zOffset):null;
}
// The rectangle an area occupies. Unbounded sides are +/-Infinity unless
// `clamp` asks for the 1,100 m core only (used for sizes and reports).
export function wolfveilAreaRect(id,{clamp=false}={}){
  const far=clamp?WOLFVEIL_AREA_CORE_HALF_SPAN:Infinity;
  switch(id){
    case 'north':return {minX:-far,maxX:far,minZ:B.northZ,maxZ:far};
    case 'west':return {minX:-far,maxX:B.westX,minZ:-far,maxZ:B.northZ};
    case 'east':return {minX:B.eastX,maxX:far,minZ:-far,maxZ:B.northZ};
    case 'south':return {minX:B.westX,maxX:B.eastX,minZ:-far,maxZ:B.southZ};
    case 'town':return {minX:B.westX,maxX:B.eastX,minZ:B.southZ,maxZ:B.northZ};
    default:return null;
  }
}
export function wolfveilAreaSquareMeters(id){
  const rect=wolfveilAreaRect(id,{clamp:true});
  return rect?(rect.maxX-rect.minX)*(rect.maxZ-rect.minZ):0;
}
// A footprint belongs to an area only when all of it lies inside. Areas are
// rectangles, so testing the four corners is exact. Anything that straddles a
// border returns null and stays loaded for every area.
export function wolfveilAreaOfRect(minX,maxX,minZ,maxZ){
  if(![minX,maxX,minZ,maxZ].every(finite)||minX>maxX||minZ>maxZ)return null;
  const area=wolfveilAreaAtLocal(minX,minZ);
  return area&&area===wolfveilAreaAtLocal(maxX,minZ)&&
    area===wolfveilAreaAtLocal(minX,maxZ)&&area===wolfveilAreaAtLocal(maxX,maxZ)
    ?area:null;
}
export function distanceToWolfveilArea(x,z,id){
  const rect=wolfveilAreaRect(id);
  if(!rect||!finite(x)||!finite(z))return Infinity;
  const dx=Math.max(rect.minX-x,0,x-rect.maxX);
  const dz=Math.max(rect.minZ-z,0,z-rect.maxZ);
  return Math.hypot(dx,dz);
}
// Hysteresis: once inside an area the player keeps it until they are a few
// metres past its border, so standing on a bridge end cannot flicker.
export function stableWolfveilArea(position,previous=null,options={}){
  const x=Number(position?.x);
  const z=Number(position?.z)-Number(options.zOffset??WOLFVEIL_AREA_Z_OFFSET);
  const raw=wolfveilAreaAtLocal(x,z);
  if(!raw||!AREA_BY_ID.has(previous))return raw;
  const h=Math.max(0,Number(options.hysteresisMeters??WOLFVEIL_AREA_LOADING_OPTIONS.hysteresisMeters));
  return distanceToWolfveilArea(x,z,previous)<=h?previous:raw;
}
// Areas to have ready: the active one and any other within `preloadMeters`,
// so the far side of a portal is drawn before the player steps through.
export function nearWolfveilAreas(position,active=null,options={}){
  const x=Number(position?.x);
  const z=Number(position?.z)-Number(options.zOffset??WOLFVEIL_AREA_Z_OFFSET);
  const current=AREA_BY_ID.has(active)?active:wolfveilAreaAtLocal(x,z);
  if(!current)return [];
  const reach=Math.max(0,Number(options.preloadMeters??WOLFVEIL_AREA_LOADING_OPTIONS.preloadMeters));
  const result=[current];
  for(const id of WOLFVEIL_AREA_IDS)
    if(id!==current&&distanceToWolfveilArea(x,z,id)<=reach)result.push(id);
  return result;
}
// Which areas share a border inside the 1,100 m core.
export const WOLFVEIL_AREA_NEIGHBORS=Object.freeze(Object.fromEntries(
  WOLFVEIL_AREA_IDS.map(id=>[id,Object.freeze(WOLFVEIL_AREA_IDS.filter(other=>{
    if(other===id)return false;
    const a=wolfveilAreaRect(id,{clamp:true}),b=wolfveilAreaRect(other,{clamp:true});
    const overlapX=Math.min(a.maxX,b.maxX)-Math.max(a.minX,b.minX);
    const overlapZ=Math.min(a.maxZ,b.maxZ)-Math.max(a.minZ,b.minZ);
    return (overlapX===0&&overlapZ>0)||(overlapZ===0&&overlapX>0);
  }))])));

const BORDER_LINES=Object.freeze([
  Object.freeze({axis:'x',coordinate:B.westX}),
  Object.freeze({axis:'x',coordinate:B.eastX}),
  Object.freeze({axis:'z',coordinate:B.northZ}),
  Object.freeze({axis:'z',coordinate:B.southZ}),
]);
const pairKey=(a,b)=>[a,b].sort().join('|');
const kindRank=kind=>kind==='bridge'?3:kind==='gate'?2:1;

// A portal is every place where a road, trail or bridge crosses from one area
// into another. `paths` are polylines of local [x,z] points. Crossings of the
// same pair of areas closer than `mergeMeters` collapse into one portal, with
// bridges preferred over the road sketch that runs beside them.
export function planWolfveilAreaPortals(paths=[],{mergeMeters=30}={}){
  const found=[];
  for(const path of paths){
    const points=Array.isArray(path?.points)?path.points:[];
    for(let i=1;i<points.length;i++){
      const [ax,az]=points[i-1],[bx,bz]=points[i];
      if(![ax,az,bx,bz].every(finite))continue;
      const length=Math.hypot(bx-ax,bz-az);
      if(!(length>1e-6))continue;
      for(const line of BORDER_LINES){
        const from=line.axis==='x'?ax:az,to=line.axis==='x'?bx:bz;
        if((from-line.coordinate)*(to-line.coordinate)>=0)continue;
        const t=(line.coordinate-from)/(to-from);
        const step=Math.min(.5,.25*length)/length;
        const before=wolfveilAreaAtLocal(ax+(bx-ax)*(t-step),az+(bz-az)*(t-step));
        const after=wolfveilAreaAtLocal(ax+(bx-ax)*(t+step),az+(bz-az)*(t+step));
        if(!before||!after||before===after)continue;
        const width=finite(path.width)&&path.width>0?path.width:3;
        found.push({
          pathId:String(path.id||'path'),pathLabel:path.label||path.name||null,
          kind:path.kind==='bridge'?'bridge':path.kind==='gate'?'gate':'trail',
          axis:line.axis,coordinate:line.coordinate,
          x:ax+(bx-ax)*t,z:az+(bz-az)*t,
          // Unit travel direction across the border (from `a` towards `b`).
          dirX:(bx-ax)/length,dirZ:(bz-az)/length,
          width,halfWidth:Math.max(10,width*2.5),
          a:before,b:after,
        });
      }
    }
  }
  found.sort((p,q)=>kindRank(q.kind)-kindRank(p.kind)||q.width-p.width||
    p.pathId.localeCompare(q.pathId)||p.x-q.x||p.z-q.z);
  const kept=[];
  for(const candidate of found){
    const key=pairKey(candidate.a,candidate.b);
    if(kept.some(portal=>pairKey(portal.a,portal.b)===key&&
      Math.hypot(portal.x-candidate.x,portal.z-candidate.z)<mergeMeters))continue;
    kept.push(candidate);
  }
  const used=new Map();
  return Object.freeze(kept.map(portal=>{
    const [first,second]=[portal.a,portal.b].sort(
      (m,n)=>WOLFVEIL_AREA_IDS.indexOf(m)-WOLFVEIL_AREA_IDS.indexOf(n));
    const base=first+'_'+second+'_'+portal.pathId;
    const count=(used.get(base)||0)+1;used.set(base,count);
    return Object.freeze({
      ...portal,a:first,b:second,
      id:count>1?base+'_'+count:base,
      label:AREA_BY_ID.get(first).label+' ↔ '+AREA_BY_ID.get(second).label,
    });
  }));
}
// Did this step walk through a portal? Teleports and respawns (more than 20 m
// in one step) are not doorway crossings; the area still follows position.
export function crossedWolfveilAreaPortal(before,after,portals=[],{zOffset=WOLFVEIL_AREA_Z_OFFSET}={}){
  if(!before||!after)return null;
  const a={x:Number(before.x),z:Number(before.z)-zOffset};
  const b={x:Number(after.x),z:Number(after.z)-zOffset};
  if(![a.x,a.z,b.x,b.z].every(finite))return null;
  const moved=Math.hypot(b.x-a.x,b.z-a.z);
  if(moved>20||moved<1e-5)return null;
  for(const portal of portals){
    const from=portal.axis==='x'?a.x:a.z,to=portal.axis==='x'?b.x:b.z;
    if((from-portal.coordinate)*(to-portal.coordinate)>0||Math.abs(to-from)<1e-7)continue;
    const t=(portal.coordinate-from)/(to-from);
    if(t<0||t>1)continue;
    const along=portal.axis==='x'?a.z+(b.z-a.z)*t:a.x+(b.x-a.x)*t;
    const centre=portal.axis==='x'?portal.z:portal.x;
    if(Math.abs(along-centre)>portal.halfWidth)continue;
    const into=wolfveilAreaAtLocal(b.x,b.z)===portal.a?portal.a:portal.b;
    return {id:portal.id,label:portal.label,into,portal};
  }
  return null;
}
