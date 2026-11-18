// The first planted side: the western forest. Its shapes, where every piece
// stands, and the tree trunks the client and the server both block.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WOLFVEIL_SIDE_SCENERY,WOLFVEIL_OWNER_TREE_CLEAR,WOLFVEIL_FOREST_FLOOR_SQUARE,
  wolfveilFinishedGroundAt,planWolfveilFourSides}
  from '../src/components/game3d/wolfveil/WolfveilFourSidesPlan.mjs';
import {WOLFVEIL_PLANTED_SIDES,WOLFVEIL_PLANTED_TRUNK_RADIUS,wolfveilPlantedSide,
  wolfveilPlantedTrunkColliders,wolfveilTrunkColliders,createWolfveilCircleGrid}
  from '../src/components/game3d/wolfveil/WolfveilTrunkColliders.mjs';
import {WOLFVEIL_SIDE_SCENERY_KINDS,WOLFVEIL_SIDE_SCENERY_LABELS,wolfveilSideSceneryShape,
  wolfveilSideSceneryInstances} from '../src/components/game3d/wolfveil/WolfveilSideSceneryShapes.mjs';
import {wolfveilForestTrunkColliders} from '../src/components/game3d/wolfveil/WolfveilForestLayout.js';
import {wolfveilAreaAtLocal} from '../src/components/game3d/wolfveil/streaming/WolfveilFiveAreaPlan.mjs';
import {createWolfveilTerrainSurfaceSampler} from '../src/components/game3d/wolfveil/WolfveilTerrainSurfaceSampler.mjs';
import {isWolfveilCaveApproachReserved} from '../src/components/game3d/wolfveil/WolfveilCaveAccessPlan.mjs';
import {WOLFVEIL_SW_QUALITY} from '../src/components/game3d/wolfveil/WolfveilSWQuarterQuality.mjs';
import {createWolfveilMapCollision,WOLFVEIL_FOREST_TRUNK_COUNT,WOLFVEIL_PLANTED_TRUNK_COUNT,
  WOLFVEIL_RENDER_OFFSET_Z} from '../server/game3d/mapCollision.mjs';

/* global URL */
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ground=createWolfveilTerrainSurfaceSampler();
const forest=wolfveilPlantedSide('west');
const standing=wolfveilSideSceneryInstances(forest.placements,{heightAt:ground});
// The loader keeps a tall instanced batch on the horizon from every area
// while it is no heavier than this (WolfveilAreaLoader farSceneryMaxTriangles).
const HORIZON_TRIANGLES=60000;

test('the forest is the first planted side and holds what the plan says',()=>{
  assert.deepEqual(WOLFVEIL_PLANTED_SIDES,['west']);
  assert.equal(forest.theme,'forest');
  assert.deepEqual(forest.counts,{cedar:480,maple:60,bamboo:220,shrub:560,boulder:100,flowers:120});
  assert.equal(wolfveilPlantedSide('north'),null,'the mountain is not built yet');
  assert.equal(wolfveilPlantedSide('west'),forest,'planned once, then shared');
});

test('every shape is light, whole and stands on the ground',()=>{
  const budget={cedar:110,pine:80,maple:80,bamboo:70,shrub:24,flowers:36,boulder:80};
  assert.deepEqual([...WOLFVEIL_SIDE_SCENERY_KINDS].sort(),Object.keys(WOLFVEIL_SIDE_SCENERY).sort(),
    'one shape for every kind the plan can place');
  for(const kind of WOLFVEIL_SIDE_SCENERY_KINDS){
    const shape=wolfveilSideSceneryShape(kind);
    assert.ok(WOLFVEIL_SIDE_SCENERY_LABELS[kind],kind+' has a name in the scene');
    assert.equal(shape.position.length,shape.triangles*9);
    assert.equal(shape.color.length,shape.position.length);
    assert.ok(shape.triangles>0&&shape.triangles<=budget[kind],kind+' has '+shape.triangles+' triangles');
    assert.ok(shape.position.every(Number.isFinite),kind+' has no broken corner');
    assert.ok(shape.color.every(value=>value>=0&&value<=1),kind+' colours are in range');
    assert.ok(shape.foot<0,kind+' reaches below the ground so it cannot float');
    assert.ok(shape.top>.85&&shape.top<1.05,kind+' is one unit tall, so its planted height is its scale');
    for(let i=0;i<shape.position.length;i+=9){
      const p=shape.position;
      const ux=p[i+3]-p[i],uy=p[i+4]-p[i+1],uz=p[i+5]-p[i+2],vx=p[i+6]-p[i],vy=p[i+7]-p[i+1],vz=p[i+8]-p[i+2];
      assert.ok(Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)>1e-7,kind+' has no collapsed triangle');
    }
  }
  assert.equal(wolfveilSideSceneryShape('cedar'),wolfveilSideSceneryShape('cedar'),'built once');
  assert.throws(()=>wolfveilSideSceneryShape('palm'),RangeError);
});

test('the whole forest costs under 100,000 triangles and six draw calls',()=>{
  let triangles=0;
  for(const [kind,list] of Object.entries(standing)){
    const cost=wolfveilSideSceneryShape(kind).triangles*list.length;
    triangles+=cost;
    if(WOLFVEIL_SIDE_SCENERY[kind].height[0]>=4)
      assert.ok(cost<=HORIZON_TRIANGLES,kind+' stays on the horizon from every area ('+cost+' triangles)');
  }
  assert.equal(Object.keys(standing).length,6);
  assert.ok(triangles<100000,'forest triangles: '+triangles);
});

test('every piece stands on the drawn ground: nothing floats, nothing is buried',()=>{
  let pieces=0;
  for(const [kind,list] of Object.entries(standing)){
    const shape=wolfveilSideSceneryShape(kind),rule=WOLFVEIL_SIDE_SCENERY[kind];
    assert.equal(list.length,forest.counts[kind]);
    for(const item of list){
      pieces++;
      const floor=ground(item.x,item.z);
      assert.ok(item.y+shape.foot*item.sy<=floor-.01,kind+' base is in the ground at '+item.x+','+item.z);
      assert.ok(item.y+shape.top*item.sy>=floor+(kind==='boulder'?.3:rule.height[0]*.6),
        kind+' shows above the ground at '+item.x+','+item.z);
      assert.ok(item.sy>=rule.height[0]&&item.sy<=rule.height[1],kind+' height is the planned height');
      assert.ok(item.tint.every(value=>value>.6&&value<1.35),kind+' tint is a gentle variation');
      assert.ok(Math.abs(item.tiltX)<.2&&Math.abs(item.tiltZ)<.2,kind+' stands upright');
    }
  }
  assert.equal(pieces,forest.placements.length);
  // A boulder on a slope is bedded deep enough that its downhill edge is in.
  for(const item of standing.boulder){
    const slope=Math.hypot(ground(item.x+1,item.z)-ground(item.x-1,item.z),
      ground(item.x,item.z+1)-ground(item.x,item.z-1))/2;
    const hang=Math.max(item.sx,item.sz)*slope;
    assert.ok(ground(item.x,item.z)-item.y+.3*item.sy>=Math.min(hang,.75*item.sy)-.01,
      'boulder bedded at '+item.x+','+item.z);
  }
});

test('planting leaves alone the owner\'s trees, paths to caves and ground finished by hand',()=>{
  const owner=wolfveilForestTrunkColliders();
  const floor=WOLFVEIL_SW_QUALITY.protectedTiles.find(tile=>tile.id===WOLFVEIL_FOREST_FLOOR_SQUARE);
  assert.ok(floor,'the forest-floor square exists');
  let treesOnForestFloor=0;
  for(const plan of Object.values(planWolfveilFourSides().sides))for(const item of plan.placements){
    const big=item.trunk||Boolean(WOLFVEIL_SIDE_SCENERY[item.kind].bulky);
    const nearest=Math.min(...owner.map(trunk=>Math.hypot(item.x-trunk.x,item.z-trunk.z)));
    assert.ok(nearest>=(big?WOLFVEIL_OWNER_TREE_CLEAR.big:WOLFVEIL_OWNER_TREE_CLEAR.small)-.02,
      item.kind+' crowds an owner tree at '+item.x+','+item.z);
    assert.equal(isWolfveilCaveApproachReserved(item.x,item.z,(big?3:1.5)-.02),false,
      item.kind+' stands on a path to a cave at '+item.x+','+item.z);
    assert.equal(wolfveilFinishedGroundAt(item.x,item.z,(big?3:1.5)-.02,{trunk:item.trunk}),false,
      item.kind+' stands on finished ground at '+item.x+','+item.z);
    const onFloor=item.x>=floor.minX&&item.x<floor.maxX&&item.z>=floor.minZ&&item.z<floor.maxZ;
    if(onFloor){assert.ok(item.trunk,'only trees go on the forest-floor square, not '+item.kind);treesOnForestFloor++;}
  }
  assert.ok(treesOnForestFloor>=10,'the forest-floor square gets its trees: '+treesOnForestFloor);
});

test('planted trunks are one list for the client and the server',()=>{
  const planted=wolfveilPlantedTrunkColliders(),owner=wolfveilForestTrunkColliders();
  assert.equal(planted.length,540,'480 cedars and 60 maples');
  assert.equal(wolfveilPlantedTrunkColliders(),planted,'computed once');
  for(const trunk of planted){
    assert.equal(wolfveilAreaAtLocal(trunk.x,trunk.z),'west');
    assert.ok(/^planted_(cedar|maple)$/.test(trunk.kind));
    assert.equal(trunk.radius,WOLFVEIL_PLANTED_TRUNK_RADIUS[trunk.kind.slice(8)]);
  }
  const all=wolfveilTrunkColliders();
  assert.equal(all.length,owner.length+planted.length);
  assert.deepEqual(all.slice(0,owner.length),owner,'the owner\'s trees come first, unchanged');
  assert.equal(WOLFVEIL_PLANTED_TRUNK_COUNT,planted.length);
  assert.equal(WOLFVEIL_FOREST_TRUNK_COUNT,owner.length,'the owner trunk count keeps its meaning');
});

test('the trunk grid answers exactly as testing every trunk would',()=>{
  const circles=wolfveilTrunkColliders(),grid=createWolfveilCircleGrid(circles);
  assert.equal(grid.size,circles.length);
  const body=.55,hit=(x,z)=>circle=>Math.hypot(x-circle.x,z-circle.z)<circle.radius+body;
  let seed=12345,blocked=0;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const check=(x,z)=>{
    const slow=circles.some(hit(x,z));
    assert.equal(grid.some(x,z,hit(x,z)),slow,'grid and full scan disagree at '+x+','+z);
    if(slow)blocked++;
  };
  for(let i=0;i<20000;i++)check(-550+random()*1100,-550+random()*1100);
  // Around every trunk, including across cell edges.
  for(const circle of circles)for(let k=0;k<8;k++){
    const angle=k*Math.PI/4,reach=(k%2?.6:1.2)*(circle.radius+body);
    check(circle.x+Math.cos(angle)*reach,circle.z+Math.sin(angle)*reach);
  }
  assert.ok(blocked>circles.length,'the check really met trunks: '+blocked);
  assert.equal(createWolfveilCircleGrid([]).some(0,0,()=>true),false);
});

test('the server stops a body and a strike at a planted cedar',()=>{
  const map=createWolfveilMapCollision(),origin={x:0,z:0};
  const cedar=wolfveilPlantedTrunkColliders().find(trunk=>trunk.kind==='planted_cedar');
  const at=(dx,dz=0)=>({x:cedar.x+dx,z:cedar.z+WOLFVEIL_RENDER_OFFSET_Z+dz});
  assert.equal(map.valid(at(0),origin),false,'the trunk is solid');
  assert.equal(map.valid(at(cedar.radius+.55+.2),origin),true,'beside the trunk is open');
  assert.equal(map.canStrike(at(-2.5),at(2.5),origin),false,'the trunk blocks a strike');
  const walked=map.move(at(-2.5),at(2.5),origin);
  assert.ok(Math.hypot(walked.x-cedar.x,walked.z-(cedar.z+WOLFVEIL_RENDER_OFFSET_Z))>=cedar.radius+.55-1e-6,
    'walking at the trunk never ends inside it');
});

test('the scene draws the plan and blocks with the shared trunk list',()=>{
  const scene=source('src/components/game3d/wolfveil/WolfveilScene.js');
  assert.match(scene,/buildWolfveilFourSidesScenery\(world,/);
  assert.match(scene,/fourSides\?wolfveilTrunkColliders\(\):wolfveilForestTrunkColliders\(\)/,
    'planted trunks only block when the planted scenery is really drawn');
  const drawn=source('src/components/game3d/wolfveil/WolfveilFourSidesScenery.js');
  assert.match(drawn,/new THREE\.InstancedMesh\(/);
  assert.match(drawn,/mesh\.raycast=\(\)=>\{\}/,'scenery is never a click target');
  assert.match(drawn,/mesh\.castShadow=false/);
  assert.match(drawn,/'SWV_'\+title\+'_'\+WOLFVEIL_SIDE_SCENERY_LABELS\[kind\]/);
  assert.match(drawn,/flatShading:true/);
  const server=source('server/game3d/mapCollision.mjs');
  assert.match(server,/wolfveilPlantedTrunkColliders\(\)\.map/);
  assert.match(server,/circleGrid\.some\(x,z,/,'the server looks up trunks near the step, not all of them');
  assert.doesNotMatch(server,/circles\.some\(/);
});
