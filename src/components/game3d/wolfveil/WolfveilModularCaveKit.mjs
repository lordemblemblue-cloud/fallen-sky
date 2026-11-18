// Modular Wolfveil underground extension inspired by the owner's attached
// "Ancient Sumi-e Corridor & Cavern 3D Viewer" HTML. Data only: the SAME
// footprint drives the mesh, floor sampling and wall collision.
// This expands the existing sealed-roof, E-entered cave network; no second
// entrance, no loot grants, no boss spawning and no server authority change.
import {instantiateWolfveilRoomModule} from './WolfveilRoomModulePlan.mjs';

export const WOLFVEIL_MODULAR_TREASURE_ROOM=instantiateWolfveilRoomModule(
  'treasure_vault',{
    id:'modular_sumi_treasure_vault',name:'Sumi-e Treasure Vault',
    x:-61,y:-8,z:-95,theme:'treasure_module',
    type:'decorative_treasure', // game loot ownership remains elsewhere
  });
export const WOLFVEIL_MODULAR_JUNCTION=Object.freeze({
  id:'modular_t_junction',name:'Sumi-e Three-Way Junction',
  x:-6,y:-8,z:-95,kind:'junction',
});
export const WOLFVEIL_MODULAR_L_CORNER=instantiateWolfveilRoomModule(
  'small_round',{
    id:'modular_l_turn',name:'Sumi-e L-Turn',x:230,y:-8,z:-162,
    theme:'l_turn',kind:'corner',
  });
export const WOLFVEIL_MODULAR_WAYFINDER_HUB=instantiateWolfveilRoomModule(
  'crossroads',{
    id:'modular_fourway_hub',name:'Wayfinder Crossroads',x:280,y:-8,z:-162,
    theme:'wayfinder_hub',kind:'junction',
  });
export const WOLFVEIL_MODULAR_SANCTUARY=instantiateWolfveilRoomModule(
  'sanctuary',{
    id:'modular_sunken_sanctuary',name:'Sunken Sumi-e Sanctuary',
    x:280,y:-8,z:-245,theme:'sunken_sanctuary',
  });
export const WOLFVEIL_MODULAR_ECHO_GALLERY=instantiateWolfveilRoomModule(
  'echo_gallery',{
    id:'modular_echo_gallery',name:'Echo Gallery',x:280,y:-8,z:-68,
    theme:'echo_gallery',
  });
export const WOLFVEIL_MODULAR_SECRET_CACHE=instantiateWolfveilRoomModule(
  'reliquary',{
    id:'modular_secret_cache',name:'Sealed Reliquary',x:354,y:-8,z:-162,
    theme:'sealed_reliquary',type:'decorative_cache',
  });
export const WOLFVEIL_MODULAR_CHAMBERS=Object.freeze([
  WOLFVEIL_MODULAR_TREASURE_ROOM,WOLFVEIL_MODULAR_L_CORNER,
  WOLFVEIL_MODULAR_WAYFINDER_HUB,WOLFVEIL_MODULAR_SANCTUARY,
  WOLFVEIL_MODULAR_ECHO_GALLERY,WOLFVEIL_MODULAR_SECRET_CACHE,
]);
export const WOLFVEIL_MODULAR_CANYON=Object.freeze({
  id:'modular_canyon',name:'Sunken Stonewater Canyon',
  minX:40,maxX:220,minZ:-230,maxZ:-90,
  x:130,y:-8,z:-160,width:180,depth:140,ceiling:28,
  gorge:Object.freeze({minX:108,maxX:148,minZ:-214,maxZ:-106,waterY:-12}),
  bridges:Object.freeze([-198,-162,-126]),
  bridgeHalfDepth:6,
  entrance:Object.freeze({id:'modular_canyon_entrance',x:57,y:-8,z:-160}),
  arena:Object.freeze({id:'modular_canyon_boss_arena',x:181,y:-8,z:-162,
    radius:18,kind:'boss_staging',gameplayImplemented:false}),
});
// All three branch paths meet at the SAME T center. Their widths and heights
// match existing cave collision rules; the long south leg originates inside
// the central Wolf-Spirit Rotunda and does not alter the overworld.
export const WOLFVEIL_MODULAR_CORRIDOR_SPECS=Object.freeze([
  Object.freeze({
    id:'modular_hub_to_t_junction',kind:'tunnel',halfWidth:2.42,ceiling:5.4,
    waypoints:Object.freeze([
      Object.freeze([-6,-8,24]),Object.freeze([-6,-8,-22]),
      Object.freeze([-6,-8,-55]),Object.freeze([-6,-8,-95]),
    ]),
  }),
  Object.freeze({
    id:'modular_t_to_treasure',kind:'tunnel',halfWidth:2.42,ceiling:5.2,
    waypoints:Object.freeze([
      Object.freeze([-6,-8,-95]),Object.freeze([-28,-8,-95]),
      Object.freeze([-61,-8,-95]),
    ]),
  }),
  Object.freeze({
    id:'modular_t_to_canyon',kind:'tunnel',halfWidth:2.42,ceiling:6.1,
    waypoints:Object.freeze([
      Object.freeze([-6,-8,-95]),Object.freeze([18,-8,-95]),
      Object.freeze([32,-8,-116]),Object.freeze([41,-8,-150]),
      Object.freeze([57,-8,-160]),
    ]),
  }),
  Object.freeze({
    id:'modular_arena_to_l_turn',kind:'tunnel',halfWidth:2.55,ceiling:6.4,
    waypoints:Object.freeze([
      Object.freeze([181,-8,-162]),Object.freeze([205,-8,-162]),
      Object.freeze([230,-8,-162]),
    ]),
  }),
  Object.freeze({
    id:'modular_l_turn_to_wayfinder',kind:'tunnel',halfWidth:2.55,ceiling:6.4,
    waypoints:Object.freeze([
      Object.freeze([230,-8,-162]),Object.freeze([230,-8,-202]),
      Object.freeze([280,-8,-202]),Object.freeze([280,-8,-162]),
    ]),
  }),
  Object.freeze({
    id:'modular_wayfinder_to_sanctuary',kind:'tunnel',halfWidth:2.7,ceiling:7.1,
    waypoints:Object.freeze([
      Object.freeze([280,-8,-162]),Object.freeze([280,-8,-192]),
      Object.freeze([280,-8,-220]),Object.freeze([280,-8,-245]),
    ]),
  }),
  Object.freeze({
    id:'modular_wayfinder_to_echo_gallery',kind:'tunnel',halfWidth:2.42,ceiling:5.8,
    waypoints:Object.freeze([
      Object.freeze([280,-8,-162]),Object.freeze([280,-8,-116]),
      Object.freeze([280,-8,-68]),
    ]),
  }),
  Object.freeze({
    id:'modular_echo_gallery_return_to_t',kind:'tunnel',halfWidth:2.42,ceiling:5.6,
    waypoints:Object.freeze([
      Object.freeze([280,-8,-68]),Object.freeze([220,-8,-68]),
      Object.freeze([140,-8,-68]),Object.freeze([60,-8,-68]),
      Object.freeze([20,-8,-76]),Object.freeze([-6,-8,-95]),
    ]),
  }),
  Object.freeze({
    id:'modular_wayfinder_to_reliquary',kind:'tunnel',halfWidth:2.42,ceiling:5.8,
    waypoints:Object.freeze([
      Object.freeze([280,-8,-162]),Object.freeze([316,-8,-162]),
      Object.freeze([354,-8,-162]),
    ]),
  }),
]);
export const WOLFVEIL_MODULAR_TRAVEL_NODES=Object.freeze([
  Object.freeze({id:WOLFVEIL_MODULAR_JUNCTION.id,
    name:WOLFVEIL_MODULAR_JUNCTION.name,
    x:WOLFVEIL_MODULAR_JUNCTION.x,y:-8,z:WOLFVEIL_MODULAR_JUNCTION.z,
    kind:'junction'}),
  Object.freeze({id:WOLFVEIL_MODULAR_TREASURE_ROOM.id,
    name:WOLFVEIL_MODULAR_TREASURE_ROOM.name,
    x:WOLFVEIL_MODULAR_TREASURE_ROOM.x,y:-8,
    z:WOLFVEIL_MODULAR_TREASURE_ROOM.z,kind:'treasure'}),
  Object.freeze({id:WOLFVEIL_MODULAR_CANYON.entrance.id,name:'Canyon Entrance',
    x:WOLFVEIL_MODULAR_CANYON.entrance.x,y:-8,
    z:WOLFVEIL_MODULAR_CANYON.entrance.z,kind:'canyon'}),
  Object.freeze({id:WOLFVEIL_MODULAR_CANYON.arena.id,name:'Canyon Arena',
    x:WOLFVEIL_MODULAR_CANYON.arena.x,y:-8,
    z:WOLFVEIL_MODULAR_CANYON.arena.z,kind:'boss_staging'}),
  ...WOLFVEIL_MODULAR_CHAMBERS.filter(ch=>ch.id!==WOLFVEIL_MODULAR_TREASURE_ROOM.id)
    .map(ch=>Object.freeze({id:ch.id,name:ch.name,x:ch.x,y:ch.y,z:ch.z,
      kind:ch.kind||ch.type||'chamber'})),
]);
// This is a physically walkable open-floor route, NOT a teleport edge.
// It crosses the central stone bridge at the fixed z=-162 band.
export const WOLFVEIL_MODULAR_ARENA_ROUTE=Object.freeze([
  Object.freeze([57,-8,-160]),Object.freeze([100,-8,-162]),
  Object.freeze([128,-8,-162]),Object.freeze([158,-8,-162]),
  Object.freeze([181,-8,-162]),
]);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function isWolfveilModularCanyonBridge(z,margin=0){
  const c=WOLFVEIL_MODULAR_CANYON;
  return c.bridges.some(bridge=>Math.abs(z-bridge)<=
    Math.max(0,c.bridgeHalfDepth-margin)+1e-8);
}
export function isWolfveilModularGorge(x,z,margin=0){
  const g=WOLFVEIL_MODULAR_CANYON.gorge;
  return x>g.minX-margin && x<g.maxX+margin &&
    z>g.minZ-margin && z<g.maxZ+margin;
}
// The riverbed is *not* a walkable floor; only the three physically rendered
// bridge bands cross the gorge. Used by client collision and geometry alike.
export function isWolfveilModularCanyonWalkable(x,z,margin=0){
  if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(margin))return false;
  const c=WOLFVEIL_MODULAR_CANYON,m=clamp(margin,0,2);
  if(x<c.minX+m||x>c.maxX-m||z<c.minZ+m||z>c.maxZ-m)return false;
  return !isWolfveilModularGorge(x,z,m) || isWolfveilModularCanyonBridge(z,m);
}
export function sampleWolfveilModularCanyon(x,z,margin=0){
  if(!isWolfveilModularCanyonWalkable(x,z,margin))return null;
  const c=WOLFVEIL_MODULAR_CANYON,m=clamp(margin,0,2);
  const boundary=Math.min(x-(c.minX+m),(c.maxX-m)-x,
    z-(c.minZ+m),(c.maxZ-m)-z);
  const g=c.gorge;
  let gorgeBoundary=Infinity;
  if(z>g.minZ-m&&z<g.maxZ+m){
    if(x<=g.minX-m)gorgeBoundary=g.minX-m-x;
    else if(x>=g.maxX+m)gorgeBoundary=x-(g.maxX+m);
  }
  const clearance=Math.max(0,Math.min(boundary,gorgeBoundary));
  return {inside:true,floorY:c.y,ceilingY:c.y+c.ceiling,
    clearance,kind:'modular_canyon',id:c.id};
}
export function getWolfveilModularCanyonTileRects(step=4){
  const c=WOLFVEIL_MODULAR_CANYON;
  if(!Number.isFinite(step)||step<=0||step>16)throw new RangeError('tile step');
  const tiles=[];
  for(let x=c.minX;x<c.maxX-1e-6;x+=step)
    for(let z=c.minZ;z<c.maxZ-1e-6;z+=step){
      const maxX=Math.min(x+step,c.maxX),maxZ=Math.min(z+step,c.maxZ);
      const cx=(x+maxX)/2,cz=(z+maxZ)/2;
      if(isWolfveilModularCanyonWalkable(cx,cz,0.1))
        tiles.push({minX:x,maxX,minZ:z,maxZ,walkable:true});
    }
  return tiles;
}
