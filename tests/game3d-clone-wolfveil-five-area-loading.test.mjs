// Five-area Wolfveil loading: the plan, the portals and the loader that keeps
// only one area drawn. The loader is duck-typed, so these tests drive it with
// small stand-in scene objects and need neither Three.js nor a GPU.
/* global console, URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  WOLFVEIL_AREAS,WOLFVEIL_AREA_IDS,WOLFVEIL_AREA_BORDERS,WOLFVEIL_AREA_NEIGHBORS,
  wolfveilAreaAtLocal,wolfveilAreaAtWorld,wolfveilAreaOfRect,wolfveilAreaSquareMeters,
  distanceToWolfveilArea,stableWolfveilArea,nearWolfveilAreas,
  planWolfveilAreaPortals,crossedWolfveilAreaPortal,
} from '../src/components/game3d/wolfveil/streaming/WolfveilFiveAreaPlan.mjs';
import {
  WOLFVEIL_AREA_PORTALS,WOLFVEIL_AREA_PORTAL_STYLE,wolfveilAreaPortalHeights,
  planWolfveilAreaPortalVisuals,describeWolfveilAreaArrival,
} from '../src/components/game3d/wolfveil/streaming/WolfveilAreaPortalPlan.mjs';
import {createWolfveilAreaLoader,WOLFVEIL_AREA_LOADING_MODES}
  from '../src/components/game3d/wolfveil/streaming/WolfveilAreaLoader.mjs';
import {
  WOLFVEIL_SITES,WOLFVEIL_BRIDGES,wolfveilDistanceToRiver,WOLFVEIL_RIVER,
} from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import {WOLFVEIL_FIGHTING_GROUNDS,WOLFVEIL_MOB_AREAS}
  from '../src/components/game3d/wolfveil/WolfveilLandscapeDesign.mjs';

const world=(x,z)=>({x,z:z+70}); // Wolfveil local -> Game 3D world position

// ---------------------------------------------------------------- the plan
test('five areas: town in the centre and one area on each side',()=>{
  assert.deepEqual(WOLFVEIL_AREA_IDS,['town','south','west','east','north']);
  assert.deepEqual(WOLFVEIL_AREAS.map(area=>area.side),['centre','front','left','right','back']);
  assert.equal(wolfveilAreaAtLocal(0,-70),'town');      // market and spawn
  assert.equal(wolfveilAreaAtLocal(25,-390),'south');   // Southern Gate Fields
  assert.equal(wolfveilAreaAtLocal(-320,65),'west');    // cedar forest
  assert.equal(wolfveilAreaAtLocal(350,-40),'east');    // quarry
  assert.equal(wolfveilAreaAtLocal(-105,330),'north');  // hot springs
  assert.equal(wolfveilAreaAtWorld(world(0,-70)),'town');
  assert.equal(wolfveilAreaAtLocal(NaN,0),null);
});
test('real landmarks land in the area a player would expect',()=>{
  const at=site=>wolfveilAreaAtLocal(site.x,site.z);
  assert.equal(at(WOLFVEIL_SITES.southGate),'town');
  assert.equal(at(WOLFVEIL_SITES.market),'town');
  assert.equal(at(WOLFVEIL_SITES.sanctuary),'town');
  assert.equal(at(WOLFVEIL_SITES.training),'town');
  assert.equal(at(WOLFVEIL_SITES.quarry),'east');
  assert.equal(at(WOLFVEIL_SITES.wolfEars),'north');
  const ground=id=>WOLFVEIL_FIGHTING_GROUNDS.find(entry=>entry.name===id);
  assert.equal(at(ground('Southern Gate Fields')),'south');
  assert.equal(at(ground('Moonlit Commons')),'west');
  assert.equal(at(ground('Howling Plateau')),'north');
  // No monster camp sits inside the safe town or the open southern fields.
  assert.equal(WOLFVEIL_MOB_AREAS.length,14);
  for(const mob of WOLFVEIL_MOB_AREAS){
    const area=at(mob);
    assert.ok(['west','east','north'].includes(area),mob.name+' is in '+area);
  }
});
test('the five areas tile the 1,100 m core exactly, with no gap or overlap',()=>{
  const total=WOLFVEIL_AREA_IDS.reduce((sum,id)=>sum+wolfveilAreaSquareMeters(id),0);
  assert.equal(total,1100*1100);
  for(let x=-549;x<550;x+=61)for(let z=-549;z<550;z+=61)
    assert.ok(WOLFVEIL_AREA_IDS.includes(wolfveilAreaAtLocal(x,z)));
  // Every area stays under the 0.42 km2 ceiling of the browser budget.
  for(const id of WOLFVEIL_AREA_IDS)assert.ok(wolfveilAreaSquareMeters(id)<=420000,id);
});
test('a footprint belongs to an area only when all of it is inside',()=>{
  assert.equal(wolfveilAreaOfRect(-20,20,-90,-50),'town');
  assert.equal(wolfveilAreaOfRect(300,360,-60,-20),'east');
  assert.equal(wolfveilAreaOfRect(100,140,-60,-20),null,'straddles the east border');
  assert.equal(wolfveilAreaOfRect(-600,600,-600,600),null,'whole-map object');
  assert.equal(wolfveilAreaOfRect(5,1,0,0),null);
});
test('neighbours, hysteresis and prewarming near a border',()=>{
  assert.deepEqual(WOLFVEIL_AREA_NEIGHBORS.town,['south','west','east','north']);
  assert.deepEqual(WOLFVEIL_AREA_NEIGHBORS.south,['town','west','east']);
  assert.deepEqual(WOLFVEIL_AREA_NEIGHBORS.north,['town','west','east']);
  assert.equal(distanceToWolfveilArea(0,0,'town'),0);
  assert.equal(distanceToWolfveilArea(100,0,'east'),22);
  // Standing just past the bridge line keeps the area the player came from.
  assert.equal(stableWolfveilArea(world(125,-98),'town'),'town');
  assert.equal(stableWolfveilArea(world(141,-98),'town'),'east');
  assert.equal(stableWolfveilArea(world(117,-98),'east'),'east');
  assert.equal(stableWolfveilArea(world(8,-270),'town'),'town');
  assert.equal(stableWolfveilArea(world(8,-280),'town'),'south');
  assert.deepEqual(nearWolfveilAreas(world(0,-70)),['town']);
  assert.ok(nearWolfveilAreas(world(80,-98)).includes('east'));
  assert.ok(nearWolfveilAreas(world(8,-200)).includes('south'));
  assert.deepEqual(nearWolfveilAreas(world(8,-200),null,{preloadMeters:40}),['town']);
});

// -------------------------------------------------------------- the portals
test('portals stand where a real road, trail or bridge crosses a border',()=>{
  const ids=WOLFVEIL_AREA_PORTALS.map(portal=>portal.id).sort();
  assert.deepEqual(ids,[
    'east_north_hunters_loop_east',
    'town_east_market_bridge',
    'town_east_outer_trail_bridge',
    'town_east_residential_footbridge',
    'town_north_ridge_path',
    'town_south_south_fields_way',
    'town_west_south_residential',
    'town_west_training_forest',
    'town_west_west_residential',
    'town_west_west_woodland_fork',
    'west_north_hunters_loop_west',
  ]);
  // The town connects to all four sides.
  for(const side of ['south','west','east','north'])
    assert.ok(WOLFVEIL_AREA_PORTALS.some(portal=>portal.a==='town'&&portal.b===side),side);
  for(const portal of WOLFVEIL_AREA_PORTALS){
    // On the border line, joining two different neighbouring areas.
    const b=WOLFVEIL_AREA_BORDERS;
    const lines=portal.axis==='x'?[b.westX,b.eastX]:[b.northZ,b.southZ];
    assert.ok(lines.includes(portal.coordinate),portal.id);
    assert.equal(portal.axis==='x'?portal.x:portal.z,portal.coordinate);
    assert.ok(WOLFVEIL_AREA_NEIGHBORS[portal.a].includes(portal.b),portal.id);
    assert.ok(Math.abs(Math.hypot(portal.dirX,portal.dirZ)-1)<1e-9);
    // Only a bridge may stand over the water.
    if(portal.kind!=='bridge')
      assert.ok(wolfveilDistanceToRiver(portal.x,portal.z)>=WOLFVEIL_RIVER.width/2+2,portal.id);
  }
  // Each of the three bridges is a portal on its own deck line.
  for(const bridge of WOLFVEIL_BRIDGES){
    const portal=WOLFVEIL_AREA_PORTALS.find(entry=>entry.pathId===bridge.id);
    assert.equal(portal.kind,'bridge');
    assert.equal(portal.z,bridge.from[1]);
  }
});
test('portal heights are finite and bridges sit on their deck, not the riverbed',()=>{
  const heights=wolfveilAreaPortalHeights();
  assert.equal(heights.size,WOLFVEIL_AREA_PORTALS.length);
  for(const portal of WOLFVEIL_AREA_PORTALS)
    assert.ok(Number.isFinite(heights.get(portal.id)),portal.id);
  assert.equal(wolfveilAreaPortalHeights(),heights,'computed once');
});
test('each portal arch spans its own path and faces along the direction of travel',()=>{
  const arches=planWolfveilAreaPortalVisuals();
  const heights=wolfveilAreaPortalHeights();
  assert.equal(arches.length,WOLFVEIL_AREA_PORTALS.length);
  for(const arch of arches){
    const portal=WOLFVEIL_AREA_PORTALS.find(entry=>entry.id===arch.id);
    assert.ok(arch.radius>=portal.width/2+.9,arch.id+' is wide enough to walk through');
    assert.ok(arch.radius<=4,arch.id+' is not a wall across the valley');
    assert.equal(arch.y,heights.get(arch.id)-WOLFVEIL_AREA_PORTAL_STYLE.sinkMeters);
    // The opening's normal (sin yaw, cos yaw) is the travel direction.
    assert.ok(Math.abs(Math.sin(arch.yaw)-portal.dirX)<1e-9,arch.id);
    assert.ok(Math.abs(Math.cos(arch.yaw)-portal.dirZ)<1e-9,arch.id);
  }
  const bridge=arches.find(arch=>arch.id==='town_east_market_bridge');
  assert.ok(Math.abs(bridge.yaw-Math.PI/2)<1e-9,'the market bridge runs west to east');
  assert.equal(bridge.radius,3.9);
});
test('nearby crossings of the same border merge; a bridge wins over a road sketch',()=>{
  const portals=planWolfveilAreaPortals([
    {id:'sketch',kind:'trail',width:3,points:[[100,-110],[140,-110]]},
    {id:'deck',kind:'bridge',width:6,points:[[63,-98],[134,-98]]},
    {id:'far',kind:'trail',width:3,points:[[100,150],[140,150]]},
    {id:'inside',kind:'trail',width:3,points:[[-50,0],[50,0]]},
  ]);
  assert.deepEqual(portals.map(portal=>portal.pathId),['deck','far']);
  assert.equal(portals[0].id,'town_east_deck');
  assert.equal(portals[0].label,'Wolfveil Town ↔ Eastern Riverlands');
});
test('walking through a portal is recognised in both directions; teleports are not',()=>{
  const bridge=crossedWolfveilAreaPortal(world(119,-98),world(125,-98),WOLFVEIL_AREA_PORTALS);
  assert.equal(bridge.id,'town_east_market_bridge');
  assert.equal(bridge.into,'east');
  const back=crossedWolfveilAreaPortal(world(125,-98),world(119,-98),WOLFVEIL_AREA_PORTALS);
  assert.equal(back.into,'town');
  const gate=crossedWolfveilAreaPortal(world(8,-262),world(9,-268),WOLFVEIL_AREA_PORTALS);
  assert.equal(gate.id,'town_south_south_fields_way');
  assert.equal(gate.into,'south');
  assert.equal(crossedWolfveilAreaPortal(world(0,0),world(340,0),WOLFVEIL_AREA_PORTALS),null);
  assert.equal(crossedWolfveilAreaPortal(world(119,-300),world(125,-300),WOLFVEIL_AREA_PORTALS),null);
  assert.deepEqual(describeWolfveilAreaArrival('east'),{area:'east',side:'right',
    title:'Eastern Riverlands',
    detail:'River bridges, quarry, ravines and the Highfall camps',via:null});
  assert.equal(describeWolfveilAreaArrival('nowhere'),null);
});

// ------------------------------------------------- stand-in scene objects
class Vec{
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
}
class Attr{
  constructor(array,itemSize){this.array=array;this.itemSize=itemSize;this.version=0;}
  set needsUpdate(value){if(value)this.version++;}
}
class Node{
  constructor(name=''){
    this.name=name;this.children=[];this.parent=null;this.visible=true;this.userData={};
    this.position=new Vec();this.scale=new Vec(1,1,1);
    this.quaternion={copy(){return this;}};this.matrix={copy(){return this;}};
    this.layers={mask:1};this.renderOrder=0;this.matrixAutoUpdate=true;
    this.castShadow=false;this.receiveShadow=false;this.frustumCulled=true;
    this.matrixWorld={elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]};
  }
  add(child){
    child.parent?.remove(child);child.parent=this;this.children.push(child);return this;
  }
  remove(child){
    const index=this.children.indexOf(child);
    if(index>=0){this.children.splice(index,1);child.parent=null;}
    return this;
  }
  // What the renderer does every frame: world matrix = parent + own offset.
  updateMatrixWorld(){
    const walk=(node,x,y,z)=>{
      const nx=x+node.position.x,ny=y+node.position.y,nz=z+node.position.z;
      node.matrixWorld.elements=[1,0,0,0,0,1,0,0,0,0,1,0,nx,ny,nz,1];
      for(const child of node.children)walk(child,nx,ny,nz);
    };
    const e=this.parent?.matrixWorld.elements;
    walk(this,e?e[12]:0,e?e[13]:0,e?e[14]:0);
  }
  updateWorldMatrix(){
    let top=this;
    while(top.parent)top=top.parent;
    top.updateMatrixWorld();
  }
}
function geometry({half=1,height=2,triangles=12,extra={}}={}){
  return {
    attributes:{position:{count:triangles*3,array:new Float32Array(triangles*9)},...extra},
    index:null,disposed:0,
    boundingBox:{min:{x:-half,y:0,z:-half},max:{x:half,y:height,z:half}},
    dispose(){this.disposed++;},
  };
}
function texture(){
  return {isTexture:true,image:{width:256,height:256},disposed:0,dispose(){this.disposed++;}};
}
class Mesh extends Node{
  constructor(name,geo=geometry(),material={}){
    super(name);this.isMesh=true;this.geometry=geo;this.material=material;
  }
  at(x,y,z){this.position=new Vec(x,y,z);return this;}
}
class Instanced extends Mesh{
  constructor(geo,material,count){
    super('',geo,material);
    this.isInstancedMesh=true;this.count=count;this.instanceColor=null;this.disposed=false;
    this.instanceMatrix=new Attr(new Float32Array(count*16),16);
    for(let i=0;i<count;i++)this.instanceMatrix.array.set([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],i*16);
  }
  place(points){
    points.forEach(([x,z],i)=>{
      this.instanceMatrix.array[i*16+12]=x;this.instanceMatrix.array[i*16+14]=z;
    });
    return this;
  }
  dispose(){this.disposed=true;}
}
// One spot in every area, in Wolfveil local metres (children of the +70 root).
const SPOTS={town:[0,-70],south:[20,-380],west:[-320,60],east:[350,-40],north:[-100,330]};
function buildValley(){
  const scene=new Node('Scene');scene.isScene=true;
  const root=new Node('Game1_ShadowWolf_WolfveilValley');root.position.z=70;scene.add(root);
  const valley={group:root,meshes:[],walkableSurfaces:[]};
  const add=object=>{root.add(object);valley.meshes.push(object);return object;};
  const ground=add(new Mesh('SWV_RealWalkableContouredTerrain',geometry({half:550,height:300,triangles:192200})));
  ground.userData.isTerrain=true;
  const river=add(new Mesh('SWV_SilverRiver',geometry({half:500,height:1})));
  const trees=add(new Instanced(geometry({triangles:400}),{map:texture()},10));
  trees.name='SWV_CedarPineMaple_Trunks';
  trees.place([SPOTS.town,[30,-20],[-60,100],SPOTS.south,SPOTS.west,[-400,-100],SPOTS.east,
    [300,100],[420,-200],SPOTS.north]);
  const colours=new Float32Array(30).map((_,i)=>i);
  trees.instanceColor=new Attr(colours,3);
  trees.raycast=()=>'owner raycast';
  const townHall=add(new Mesh('TownHall',geometry({triangles:5000}),{map:texture()}).at(...[0,20,-70]));
  const quarry=add(new Mesh('QuarryCrane',geometry({triangles:3000}),{map:texture()}).at(350,30,-40));
  const spire=add(new Mesh('WolfEarSpire',geometry({half:30,height:64})).at(-60,220,470));
  const floor=add(new Mesh('BridgeFooting',geometry()).at(300,15,-98));
  valley.walkableSurfaces.push(floor);
  const cave=add(new Node('SWV_FourCave_Interconnected_TunnelSystem'));
  const vault=new Mesh('TreasureVault',geometry()).at(-61,-8,-95);cave.add(vault);
  const flames=add(new Instanced(geometry({extra:{aTravel:{isInstancedBufferAttribute:true,
    count:4,array:new Float32Array(4)}}}),{},4));
  flames.name='SouthGateBlueFire';
  flames.place([SPOTS.town,SPOTS.south,SPOTS.west,SPOTS.east]);
  return {scene,root,valley,ground,river,trees,townHall,quarry,spire,floor,cave,vault,flames};
}
function mount(overrides={}){
  const parts=buildValley();
  const clock={t:0};
  const events=[],loads=[];
  const loader=createWolfveilAreaLoader({
    world:parts.valley,position:world(...SPOTS.town),portals:WOLFVEIL_AREA_PORTALS,
    now:()=>clock.t,onTransition:event=>events.push(event),
    onAreasChanged:areas=>loads.push(areas),...overrides,
  });
  // One game frame: the loader runs, then the renderer refreshes matrices.
  const step=(position,seconds=0)=>{
    clock.t+=seconds*1000;
    const stats=loader.update(position);
    parts.scene.updateMatrixWorld();
    return stats;
  };
  // Two scans to accept single-area scenery, a third to split settled batches.
  const settle=(position=world(...SPOTS.town))=>{step(position,2.1);step(position,2.1);step(position,.1);};
  const clones=()=>parts.root.children.filter(node=>node.userData.wolfveilAreaClone);
  return {...parts,loader,clock,events,loads,step,settle,clones};
}

// --------------------------------------------------------------- the loader
test('standing in town: only town scenery is drawn; floors, ground and skyline stay',()=>{
  const v=mount();
  // Nothing is touched until scenery has proved it is complete and static.
  assert.equal(v.quarry.visible,true);
  assert.equal(v.trees.visible,true);
  v.settle();
  assert.equal(v.townHall.visible,true);
  assert.equal(v.quarry.visible,false,'east scenery is unloaded');
  assert.equal(v.ground.visible,true,'the one physical terrain is never unloaded');
  assert.equal(v.river.visible,true,'map-wide meshes stay');
  assert.equal(v.spire.visible,true,'tall landmarks stay on the skyline');
  assert.equal(v.floor.visible,true,'walkable floors are never managed');
  assert.equal(v.vault.visible,true,'the cave network is left alone');
  assert.equal(v.flames.visible,true,'batches with per-instance shader data stay whole');
  // The map-wide tree batch is replaced by a town-only copy.
  assert.equal(v.trees.visible,false);
  const copies=v.clones();
  assert.equal(copies.length,1);
  assert.equal(copies[0].name,'WV_Area_town_SWV_CedarPineMaple_Trunks');
  assert.equal(copies[0].count,3);
  assert.equal(copies[0].visible,true);
  assert.equal(copies[0].geometry,v.trees.geometry,'geometry is shared, not duplicated');
  assert.equal(copies[0].raycast(),undefined,'a drawn copy is never a raycast target');
  assert.deepEqual([...copies[0].instanceMatrix.array.slice(12,15)],[0,0,-70]);
  assert.deepEqual([...copies[0].instanceColor.array],[0,1,2,3,4,5,6,7,8]);
  assert.equal(v.trees.count,10,'the source batch keeps every instance for its owner');
  const stats=v.loader.getStats();
  assert.equal(stats.area,'town');
  assert.equal(stats.areaLabel,'Wolfveil Town');
  assert.deepEqual(stats.loadedAreas,['town']);
  assert.equal(stats.loadedInstances,3);
  assert.equal(stats.unloadedInstances,7);
  assert.equal(stats.triangles.loaded,5000+3*400);
  assert.equal(stats.triangles.unloaded,3000+7*400);
  assert.equal(stats.collisionStreaming,false);
});
test('the owner of an object keeps control of its visibility',()=>{
  const v=mount();v.settle();
  v.quarry.visible=false;                    // owner retires it while unloaded
  v.step(world(350,-40));                    // player arrives in the east
  assert.equal(v.loader.getArea(),'east');
  assert.equal(v.quarry.visible,false,'showing the area must not resurrect it');
  v.quarry.visible=true;
  assert.equal(v.quarry.visible,true);
  // Hiding a split batch hides its drawn copies at once, and brings them back.
  v.trees.visible=false;
  assert.ok(v.clones().every(copy=>copy.visible===false));
  v.trees.visible=true;
  assert.ok(v.clones().every(copy=>copy.visible===true));
  assert.equal(v.trees.visible,false,'the whole-map source itself stays undrawn');
});
test('crossing the market bridge: the far bank is ready first, then town unloads',()=>{
  const v=mount();v.settle();
  v.step(world(40,-98));                     // 82 m from the east border
  assert.deepEqual(v.loader.getStats().loadedAreas.sort(),['east','town']);
  assert.equal(v.quarry.visible,true,'east is drawn before the player gets there');
  assert.equal(v.clones().length,2);
  for(const x of [100,119,125])v.step(world(x,-98));
  assert.equal(v.loader.getArea(),'town','hysteresis: still town on the bridge end');
  v.step(world(141,-98));
  assert.equal(v.loader.getArea(),'east');
  assert.deepEqual(v.events,[{from:'town',to:'east',label:'Eastern Riverlands',side:'right',
    detail:'River bridges, quarry, ravines and the Highfall camps',
    gateway:'town_east_market_bridge',gatewayLabel:'Market Stone Bridge'}]);
  assert.equal(v.townHall.visible,true,'both banks stay drawn near the crossing');
  v.step(world(350,-40));
  assert.deepEqual(v.loader.getStats().loadedAreas,['east']);
  assert.equal(v.townHall.visible,false);
  const copies=v.clones();
  assert.equal(copies.length,1);
  assert.equal(copies[0].userData.wolfveilAreaClone,'east');
  assert.equal(copies[0].count,3);
  assert.ok(v.loads.some(areas=>areas.length===2),'shadow refresh hook saw the change');
});
test('a teleport loads the destination in the same frame and reports no portal',()=>{
  const v=mount();v.settle();
  v.step(world(-100,330));
  assert.equal(v.loader.getArea(),'north');
  assert.equal(v.events.at(-1).gateway,null);
  assert.ok(v.clones().some(copy=>copy.userData.wolfveilAreaClone==='north'&&copy.visible));
});
test('loading modes: single area, area plus neighbours, or the whole valley',()=>{
  assert.deepEqual(WOLFVEIL_AREA_LOADING_MODES,['single','neighbors','all']);
  const v=mount({mode:'neighbors'});v.settle(world(350,-40));
  assert.deepEqual(v.loader.getStats().loadedAreas.sort(),['east','north','south','town']);
  assert.equal(v.townHall.visible,true);
  assert.equal(v.loader.setMode('single'),true);
  v.step(world(350,-40));
  assert.deepEqual(v.loader.getStats().loadedAreas,['east']);
  assert.equal(v.loader.setMode('all'),true);
  v.step(world(350,-40));
  assert.equal(v.loader.getStats().loadedAreas.length,5);
  assert.equal(v.clones().length,5);
  assert.equal(v.loader.setMode('everything'),false);
  assert.equal(v.loader.setOptions({preloadMeters:40}).preloadMeters,40);
});
test('copies are built a few per frame and the stats say how many are still to come',()=>{
  const v=mount({batchesPerFrame:1});v.settle();
  assert.equal(v.loader.getStats().batches.building,0);
  assert.equal(v.clones().length,1);
  v.loader.setMode('all');
  const waiting=[];
  for(let i=0;i<6;i++){v.step(world(...SPOTS.town),.1);waiting.push(v.loader.getStats().batches.building);}
  assert.deepEqual(waiting,[3,2,1,0,0,0]);
  assert.equal(v.clones().length,5);
  const stats=v.loader.getStats();
  assert.equal(stats.loadedInstances,stats.sourceInstances);
});
// ------------------------------------------------------------ far scenery
const everyArea=[SPOTS.town,[30,-20],SPOTS.south,SPOTS.west,[-400,-100],SPOTS.east,SPOTS.north,[60,360]];
function plant(v,{name='SWV_Forest_CedarCrowns',height=9,triangles=300,points=everyArea,geo=null}={}){
  const forest=new Instanced(geo||geometry({height,triangles}),{map:texture()},points.length).place(points);
  forest.name=name;v.root.add(forest);v.valley.meshes.push(forest);
  return forest;
}
const copiesOf=(v,forest)=>v.clones().filter(node=>node.name.endsWith(forest.name));

test('tall, cheap instanced scenery stays on the horizon of every area',()=>{
  const v=mount();
  const forest=plant(v),shrubs=plant(v,{name:'SWV_Living_Shrubs',height:1.2});
  v.settle();v.settle();
  assert.equal(copiesOf(v,forest).length,0,'the forest is never split into per-area copies');
  assert.equal(copiesOf(v,shrubs).length,1,'low scenery is still split and unloaded');
  for(const spot of Object.values(SPOTS)){
    v.step(world(...spot),.2);v.step(world(...spot),.2);
    assert.equal(forest.visible,true,'the whole forest is drawn from '+spot);
    assert.equal(forest.count,8);
  }
  assert.deepEqual(v.loader.getStats().farScenery,{enabled:true,batches:1,instances:8,triangles:2400});
  const kept=v.loader.getReport().alwaysLoaded.largest.find(entry=>entry.name===forest.name);
  assert.match(kept.reason,/far scenery/);
});

test('far scenery must be tall and cheap; a grove inside one area counts too',()=>{
  const v=mount({farSceneryMaxTriangles:5000});
  const heavy=plant(v,{name:'SWV_Owner_Elms',height:17,triangles:900});       // 7,200 > 5,000
  const grove=plant(v,{name:'SWV_Bamboo_Grove',height:8,points:[SPOTS.west,[-400,-100],[-330,40]]});
  // Authored lying down (tall along z), stood upright by each instance matrix.
  const lying=geometry({height:1,triangles:200});
  lying.boundingBox={min:{x:-1,y:-.5,z:0},max:{x:1,y:.5,z:12}};
  const elms=plant(v,{name:'SWV_ZUp_Elms',geo:lying});
  for(let i=0;i<elms.count;i++)elms.instanceMatrix.array.set([1,0,0,0, 0,0,-1,0, 0,1,0,0],i*16);
  v.settle();v.settle();
  assert.equal(copiesOf(v,heavy).length,1,'too heavy to draw everywhere: split and unloaded');
  assert.equal(copiesOf(v,elms).length,0);
  v.step(world(...SPOTS.east),.2);v.step(world(...SPOTS.east),.2);
  assert.equal(grove.visible,true,'the western grove still shows from the east');
  assert.equal(heavy.visible,false);
  assert.equal(v.loader.getStats().farScenery.batches,2);
});

test('far scenery can be switched off and on again while playing',()=>{
  const v=mount();
  const forest=plant(v);
  v.settle();v.settle();
  assert.equal(copiesOf(v,forest).length,0);
  assert.equal(v.loader.setOptions({farScenery:false}).farScenery,false);
  v.settle();v.settle();
  assert.equal(copiesOf(v,forest).length,1,'with the rule off the forest is split like any batch');
  assert.equal(forest.visible,false);
  assert.equal(v.loader.getStats().farScenery.batches,0);
  v.loader.setOptions({farScenery:true});
  v.step(world(...SPOTS.town),.1);
  assert.equal(copiesOf(v,forest).length,0,'the copies are removed at once');
  assert.equal(forest.visible,true);
  v.settle();
  assert.equal(v.loader.getStats().farScenery.batches,1);
  const off=mount({farScenery:false});
  const second=plant(off);
  off.settle();off.settle();
  assert.equal(copiesOf(off,second).length,1);
});

// ------------------------------------------------------------ far outline
function outlineBuilder({fail=false}={}){
  const built=[],disposed=[];
  return {built,disposed,
    build(area,sources){
      if(fail)throw new Error('no WebGL');
      const object={name:'WV_Area_Far_'+area,visible:true};
      built.push({area,object,sources});
      return {object,triangles:sources.length*40,sourceTriangles:sources.length*900,cellMeters:.75};
    },
    dispose(object){disposed.push(object.name);object.gone=true;}};
}
function mountWithTallScenery(overrides={}){
  const farProxy=outlineBuilder(overrides.outline);
  const v=mount({farProxy,farSceneryMaxTriangles:5000,...(overrides.loader||{})});
  const tower=new Mesh('SWV_Watchtower',geometry({half:6,height:12,triangles:2000}),{}).at(20,30,-380);
  const bench=new Mesh('SWV_Bench',geometry({height:1}),{}).at(24,30,-384);
  const banner=new Mesh('SWV_GlassBanner',geometry({height:9}),{transparent:true,opacity:.4}).at(28,30,-380);
  const glow=new Mesh('SWV_Glow',geometry({height:9}),{depthWrite:false}).at(32,30,-380);
  // Leaves cut out of a texture: flagged transparent, drawn at full strength.
  const maple=new Mesh('SWV_CutoutMaple',geometry({height:8}),{transparent:true,alphaTest:.5}).at(36,30,-380);
  for(const object of [tower,bench,banner,glow,maple]){v.root.add(object);v.valley.meshes.push(object);}
  const elms=plant(v,{name:'SWV_Owner_Elms',height:17,triangles:900}); // too heavy to keep whole
  const bake=()=>{v.settle();v.settle();v.step(world(...SPOTS.town),2.1);
    for(let i=0;i<8;i++)v.step(world(...SPOTS.town),.1);};
  return {...v,farProxy,tower,bench,banner,elms,bake};
}
const shownOutlines=v=>v.farProxy.built.filter(entry=>entry.object.visible&&!entry.object.gone)
  .map(entry=>entry.area).sort();

test('tall scenery that unloads with its area is baked into one outline per area',()=>{
  const v=mountWithTallScenery();v.bake();
  const south=v.farProxy.built.find(entry=>entry.area==='south');
  // The tower, the cut-out maple and the elms standing in the south; never
  // the bench, the glass banner or the glow.
  assert.deepEqual(south.sources.map(source=>source.mesh.name).sort(),
    ['SWV_CutoutMaple','SWV_Owner_Elms','SWV_Watchtower']);
  const tower=south.sources.find(source=>source.mesh===v.tower);
  assert.deepEqual(tower.matrices.length,1);
  assert.deepEqual(tower.matrices[0].slice(12,15),[20,30,-310],'world placement, valley offset included');
  const elms=south.sources.find(source=>source.mesh===v.elms);
  assert.equal(elms.matrices.length,1,'only the elm that stands in the south');
  assert.ok(Array.isArray(elms.matrices[0])&&elms.matrices[0].length===16,'a full placement, not a number');
  assert.deepEqual([elms.matrices[0][12],elms.matrices[0][14]],[SPOTS.south[0],SPOTS.south[1]+70]);
  assert.deepEqual(v.farProxy.built.map(entry=>entry.area).sort(),['east','north','south','town','west']);
  // Standing in town: every other area shows its outline, the town does not.
  assert.deepEqual(shownOutlines(v),['east','north','south','west']);
  const stats=v.loader.getStats().farOutline;
  assert.equal(stats.enabled,true);
  assert.deepEqual(stats.shown.sort(),['east','north','south','west']);
  assert.deepEqual(stats.areas.south,{sources:3,triangles:120,sourceTriangles:2700,cellMeters:.75});
  // Nothing is baked twice while the scenery stays the same.
  for(let i=0;i<60;i++)v.step(world(...SPOTS.town),.1);
  assert.equal(v.farProxy.built.length,5);
});

test('an outline gives way to the real scenery when its area loads',()=>{
  const v=mountWithTallScenery();v.bake();
  v.step(world(...SPOTS.south),.2);
  for(let i=0;i<6;i++)v.step(world(...SPOTS.south),.1);
  assert.deepEqual(shownOutlines(v),['east','north','town','west']);
  assert.equal(v.tower.visible,true);
  // Loader off, or a map export: the valley is drawn as built, no outlines.
  v.loader.setEnabled(false);
  assert.deepEqual(shownOutlines(v),[]);
  v.loader.setEnabled(true);v.step(world(...SPOTS.south),.1);
  assert.deepEqual(shownOutlines(v),['east','north','town','west']);
  let during=null;
  return v.loader.withFullMapExport(async()=>{during=shownOutlines(v);}).then(()=>{
    assert.deepEqual(during,[]);
    assert.deepEqual(shownOutlines(v),['east','north','town','west']);
    v.loader.setMode('all');
    for(let i=0;i<6;i++)v.step(world(...SPOTS.south),.1);
    assert.deepEqual(shownOutlines(v),[],'with every area loaded nothing needs an outline');
  });
});

test('outlines are rebaked when scenery changes and removed when switched off',()=>{
  const v=mountWithTallScenery();v.bake();
  const pagoda=new Mesh('SWV_Pagoda',geometry({half:5,height:20}),{}).at(30,30,-390);
  v.root.add(pagoda);v.valley.meshes.push(pagoda);
  v.bake();
  const south=v.farProxy.built.filter(entry=>entry.area==='south');
  assert.equal(south.length,2,'the south was baked again with the new pagoda');
  assert.equal(south[1].sources.length,4);
  assert.equal(v.farProxy.disposed.filter(name=>name==='WV_Area_Far_south').length,1);
  assert.equal(v.farProxy.built.length,6,'the other areas were left alone');
  v.tower.visible=false;                       // hidden by its owner
  v.loader.rescan?.();v.bake();
  assert.equal(v.farProxy.built.filter(entry=>entry.area==='south').pop().sources
    .some(source=>source.mesh===v.tower),false);
  v.loader.setOptions({farScenery:false});
  assert.equal(v.loader.getStats().farOutline.enabled,false);
  assert.deepEqual(Object.keys(v.loader.getStats().farOutline.areas),[]);
  v.loader.setOptions({farScenery:true});v.bake();
  assert.deepEqual(shownOutlines(v).length,4);
  const before=v.farProxy.disposed.length;
  v.loader.dispose();
  assert.equal(v.farProxy.disposed.length,before+5,'dispose removes every outline');
});

test('a failing outline builder switches only the outlines off',()=>{
  const v=mountWithTallScenery({outline:{fail:true}});v.bake();
  const stats=v.loader.getStats();
  assert.equal(stats.failed,null,'the loader itself keeps working');
  assert.equal(stats.farOutline.enabled,false);
  assert.match(stats.farOutline.failed,/no WebGL/);
  v.step(world(...SPOTS.south),.2);
  assert.equal(v.loader.getArea(),'south');
  const plain=mount();plain.settle();
  assert.equal(plain.loader.getStats().farOutline.enabled,false,'no builder, no outlines');
});

test('the A/B switch restores the valley exactly as it was built',()=>{
  const v=mount();v.settle();
  assert.equal(v.loader.setEnabled(false),true);
  assert.equal(v.quarry.visible,true);
  assert.equal(v.trees.visible,true);
  assert.equal(v.clones().length,0);
  assert.equal(v.loader.getStats().enabled,false);
  v.step(world(350,-40));
  assert.equal(v.townHall.visible,true,'nothing unloads while switched off');
  assert.equal(v.loader.setEnabled(true),true);
  assert.equal(v.trees.visible,false);
  assert.equal(v.townHall.visible,false);
  assert.equal(v.clones().length,1);
});
test('full-map export sees every original object, and recovers after a failure',async()=>{
  const v=mount();v.settle();
  const sample=()=>({quarry:v.quarry.visible,source:v.trees.visible,
    copies:v.clones().map(copy=>copy.visible)});
  const during=await v.loader.withFullMapExport(async()=>sample());
  assert.deepEqual(during,{quarry:true,source:true,copies:[false]});
  assert.deepEqual(sample(),{quarry:false,source:false,copies:[true]});
  await assert.rejects(v.loader.withFullMapExport(async()=>{throw Error('export failed');}),/export failed/);
  assert.deepEqual(sample(),{quarry:false,source:false,copies:[true]});
});
test('a batch its owner keeps changing is handed back untouched',()=>{
  const v=mount();v.settle();
  assert.equal(v.trees.visible,false);
  v.trees.instanceMatrix.needsUpdate=true;   // the owner moved an instance
  v.step(world(...SPOTS.town),1.1);
  assert.equal(v.trees.visible,true);
  assert.equal(v.clones().length,0);
  assert.equal(Object.getOwnPropertyDescriptor(v.trees,'visible').writable,true);
  assert.deepEqual(v.loader.getReport().leftToOwner,['SWV_CedarPineMaple_Trunks']);
  v.step(world(...SPOTS.town),10);
  assert.equal(v.clones().length,0,'never split again');
});
test('a batch that never settles is not split at all',()=>{
  const v=mount();
  for(let i=0;i<6;i++){v.trees.instanceMatrix.needsUpdate=true;v.step(world(...SPOTS.town),2.1);}
  assert.equal(v.trees.visible,true);
  assert.equal(v.clones().length,0);
  assert.ok(v.loader.getReport().leftToOwner.includes('SWV_CedarPineMaple_Trunks'));
});
test('scenery with lights is hidden mesh by mesh so the light count never changes',()=>{
  const v=mount();
  const camp=new Node('CampFire');camp.position=new Vec(350,10,-200);
  const lamp=new Node('CampLight');lamp.isLight=true;
  const logs=new Mesh('CampLogs'),tent=new Mesh('CampTent');
  camp.add(lamp);camp.add(logs);camp.add(tent);v.root.add(camp);
  v.settle();
  assert.equal(camp.visible,true,'the group, and so its light, stays in the scene');
  assert.equal(lamp.visible,true);
  assert.equal(logs.visible,false);
  assert.equal(tent.visible,false);
  v.step(world(350,-200));
  assert.equal(logs.visible,true);
});
test('models that arrive late are measured only once they stop growing',()=>{
  const v=mount();
  const palace=new Node('LunaPalace');palace.position=new Vec(-320,40,60);v.root.add(palace);
  v.settle();
  assert.equal(v.loader.getStats().units.total,2,'an empty shell is not scenery yet');
  palace.add(new Mesh('PalaceWalls'));
  v.step(world(...SPOTS.town),2.1);
  palace.add(new Mesh('PalaceRoof'));       // still loading: measure again
  v.step(world(...SPOTS.town),2.1);
  assert.equal(palace.visible,true);
  v.step(world(...SPOTS.town),2.1);
  assert.equal(palace.visible,false,'two matching scans: now a west unit');
  assert.equal(v.loader.getStats().units.total,3);
  // Removed objects are forgotten; nothing is kept alive.
  v.root.remove(palace);
  v.step(world(...SPOTS.town),2.1);
  assert.equal(v.loader.getStats().units.total,2);
  assert.equal(Object.getOwnPropertyDescriptor(palace,'visible').writable,true);
});
test('a wide model on sloping ground is scenery; a slender tall one is skyline',()=>{
  const v=mount();
  const terraces=v.root.add(new Mesh('HillTerraces',geometry({half:120,height:70})).at(-380,0,60))
    .children.at(-1);
  v.settle();
  assert.equal(terraces.visible,false,'70 m of relief over 240 m is not a landmark');
  assert.equal(v.spire.visible,true);
  const report=v.loader.getReport();
  assert.ok(report.alwaysLoaded.largest.some(entry=>
    entry.name==='WolfEarSpire'&&entry.reason==='skyline landmark'));
  assert.ok(report.alwaysLoaded.largest.some(entry=>
    entry.name==='SouthGateBlueFire'&&entry.reason==='per-instance shader data'));
  assert.equal(report.areas.east.triangles,3000+3*400);
  assert.equal(report.areas.town.units,1);
});
test('scene-level roots such as the imported town are managed when registered',()=>{
  const v=mount();
  const town=new Node('Wolfveil_Imported_Player_Spawn_Town');
  town.add(new Mesh('Plaza',geometry({half:40})).at(0,22,0));   // world z 0 = local -70
  v.scene.add(town);
  v.loader.addUnits([town]);
  v.settle(world(350,-40));
  assert.equal(town.visible,false,'the town model unloads while the player is in the east');
  v.step(world(...SPOTS.town));
  assert.equal(town.visible,true);
});
test('a town full of citizens: buildings unload, characters are never touched',()=>{
  const v=mount();
  const town=new Node('Wolfveil_Imported_Player_Spawn_Town');
  const tiles=new Mesh('Blender_Assembled_Town_80_Separate_Tiles',geometry({half:60})).at(0,22,0);
  const quarter=new Node('LivingQuarter');
  const house=new Mesh('House_01').at(20,22,10);
  const citizen=new Node('Citizen_Mira');citizen.position=new Vec(5,22,5);
  const armature=new Node('Armature');
  const hips=new Node('Hips');hips.isBone=true;
  const body=new Mesh('Body');body.isSkinnedMesh=true;
  armature.add(hips);armature.add(body);citizen.add(armature);
  quarter.add(house);quarter.add(citizen);town.add(tiles);town.add(quarter);
  v.scene.add(town);v.loader.addUnits([town]);
  v.settle(world(350,-40));
  assert.equal(tiles.visible,false);
  assert.equal(house.visible,false);
  for(const part of [town,quarter,citizen,armature,body])
    assert.equal(Object.getOwnPropertyDescriptor(part,'visible').writable,true,part.name);
  assert.equal(body.visible,true);
});
test('anything that starts to move stops being scenery',()=>{
  const v=mount();
  const cart=v.root.add(new Mesh('MerchantCart').at(300,20,-60)).children.at(-1);
  v.settle();
  assert.equal(cart.visible,false,'parked in the east while the player is in town');
  cart.position=new Vec(40,20,-60);          // it rolls into town
  v.step(world(...SPOTS.town));              // a frame is drawn with it there
  v.step(world(...SPOTS.town),2.1);
  assert.equal(cart.visible,true);
  assert.ok(v.loader.getReport().leftToOwner.includes('MerchantCart'));
  v.step(world(...SPOTS.town),10);
  assert.equal(Object.getOwnPropertyDescriptor(cart,'visible').writable,true,'never managed again');
});
test('GPU release: only an unloaded area\'s own meshes and textures, after a delay',()=>{
  const v=mount({releaseGpuMemory:true,releaseDelaySeconds:20});
  const shared=geometry();
  const townLamp=v.root.add(new Mesh('TownLamp',shared).at(10,20,-60)).children.at(-1);
  const eastLamp=v.root.add(new Mesh('EastLamp',shared).at(340,30,-50)).children.at(-1);
  const hull=v.root.add(new Mesh('TownCollisionHull',geometry()).at(-10,20,-80)).children.at(-1);
  hull.geometry.boundsTree={}; // collision data: never released
  v.settle();
  v.step(world(350,-40));                    // leave town
  v.step(world(350,-40),10);
  assert.equal(v.townHall.geometry.disposed,0,'not before the delay');
  v.step(world(350,-40),11);
  assert.equal(v.townHall.geometry.disposed,1);
  assert.equal(v.townHall.material.map.disposed,1);
  assert.equal(shared.disposed,0,'still drawn by the east lamp');
  assert.equal(hull.geometry.disposed,0);
  assert.equal(v.trees.geometry.disposed,0,'split batches share their geometry');
  assert.equal(v.quarry.geometry.disposed,0,'the loaded area is untouched');
  assert.equal(v.ground.geometry.disposed,0);
  let stats=v.loader.getStats();
  assert.ok(stats.gpuRelease.areas.includes('town'));
  assert.equal(stats.gpuRelease.geometries,1);
  assert.equal(stats.gpuRelease.textures,1);
  v.step(world(350,-40),30);
  assert.equal(v.townHall.geometry.disposed,1,'released once, not every frame');
  v.step(world(...SPOTS.town));              // come back: Three.js re-uploads on draw
  stats=v.loader.getStats();
  assert.ok(!stats.gpuRelease.areas.includes('town'));
  assert.equal(townLamp.visible,true);
  assert.equal(eastLamp.visible,false);
});
test('fail open: an unexpected scene object switches the loader off, never the game',()=>{
  const v=mount();v.settle();
  assert.equal(v.quarry.visible,false);
  const warnings=[];
  const realWarn=console.warn;console.warn=(...args)=>warnings.push(args);
  try{
    const broken=new Mesh('BrokenImport');
    broken.geometry={attributes:{},boundingBox:null,
      computeBoundingBox(){throw Error('corrupt geometry');}};
    v.root.add(broken);
    assert.doesNotThrow(()=>v.step(world(...SPOTS.town),2.1));
  }finally{console.warn=realWarn;}
  assert.equal(warnings.length,1);
  const stats=v.loader.getStats();
  assert.equal(stats.enabled,false);
  assert.equal(stats.failed,'corrupt geometry');
  assert.equal(v.quarry.visible,true,'the whole valley is drawn again');
  assert.equal(v.trees.visible,true);
  assert.equal(v.clones().length,0);
  assert.doesNotThrow(()=>v.step(world(350,-40),5));
  assert.equal(v.townHall.visible,true,'and it stays that way');
  assert.equal(v.loader.setEnabled(true),false);
});
test('dispose hands every object back as an ordinary visible flag',()=>{
  const v=mount();v.settle();
  v.loader.dispose();
  for(const object of [v.trees,v.quarry,v.townHall]){
    assert.equal(object.visible,true);
    assert.equal(Object.getOwnPropertyDescriptor(object,'visible').writable,true);
  }
  assert.equal(v.clones().length,0);
  assert.equal(v.loader.setEnabled(true),false);
  assert.throws(()=>createWolfveilAreaLoader({world:{}}),/authoritative WolfveilBuilder/);
});

// ------------------------------------------------------------------ wiring
const source=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('the live game world mounts the five-area loader, portals and platform settings',()=>{
  const world=source('src/components/game3d/GameWorld3D.jsx');
  assert.match(world,/createWolfveilAreaLoader\(\{\s*world:wolfveilVillage\.world/);
  assert.match(world,/portals:WOLFVEIL_AREA_PORTALS/);
  assert.match(world,/mode:areaPlatform\.profile\.areaLoading/);
  assert.doesNotMatch(world,/createWolfveilFourRegionRuntime/);
  // Platform settings are copied in before the renderer reads any of them.
  assert.ok(world.indexOf('bootGame3DPlatformGraphics(window)')<world.indexOf('const bootProfile = readCloneGPUProfile(window)'));
  assert.match(world,/regionStream\?\.addUnits\(\[importedSpawnTown\.root\]\)/);
  assert.equal(world.match(/areaPortals\?\.update\(delta,/g).length,2,'title screen and live play');
  assert.match(world,/onAreasChanged\(\)\{\s*renderer\.shadowMap\.needsUpdate=true;[\s\S]{0,260}otsCameraRevision=\(valley\.userData\.otsCameraRevision\|\|0\)\+1;\s*\}/);
  assert.match(world,/regionStream\.withFullMapExport\(performExport\)/);
  // The loader hands objects back before the town and the valley are torn down.
  assert.ok(world.indexOf('regionStream?.dispose();')<world.indexOf('importedSpawnTown?.dispose();'));
  assert.ok(world.indexOf('regionStream?.dispose();')<world.indexOf('wolfveilVillage?.dispose();'));
  assert.match(world,/window\.__gw3dAreaLoader=regionStream/);
});
test('the loader and both plans stay free of Three.js so they can be tested anywhere',()=>{
  for(const file of ['WolfveilAreaLoader.mjs','WolfveilFiveAreaPlan.mjs','WolfveilAreaPortalPlan.mjs'])
    assert.doesNotMatch(source('src/components/game3d/wolfveil/streaming/'+file),/from 'three/,file);
  const portals=source('src/components/game3d/wolfveil/WolfveilAreaPortals.js');
  assert.match(portals,/raycast=noRaycast/);
  assert.match(portals,/wolfveilAreaShared:true/);
  assert.doesNotMatch(portals,/walkableSurfaces|boundsTree|collider\s*=/i,'portals add no collision');
});
test('menu, notice and diagnostics are connected',()=>{
  const menu=source('src/components/game3d/PauseMenu.jsx');
  assert.match(menu,/<Game3DPlatformGraphicsPanel open=\{open\} onProfileApplied=\{showPlatformProfile\}\/>/);
  assert.match(menu,/rememberGame3DPlatformSetting\(\{graphics:sanitized\}\)/);
  assert.match(menu,/rememberGame3DPlatformSetting\(\{display:saved\}\)/);
  assert.match(menu,/rememberGame3DPlatformSetting\(\{gpuProfile:profile\}\)/);
  const view=source('src/pages/GameView.jsx');
  assert.match(view,/\{phase==='world' && <Game3DAreaNotice \/>\}/);
  assert.match(source('src/components/game3d/Game3DAreaNotice.jsx'),/game3dWorldRegionChange/);
  const overlay=source('src/components/game3d/debug/RenderStatsOverlay.jsx');
  assert.match(overlay,/describeGame3DAreaBudget\(evaluateGame3DAreaBudget\(/);
  assert.match(overlay,/window\.__gw3dAreaLoader\?\.getStats/);
});
