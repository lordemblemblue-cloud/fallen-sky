// The first planted side: the western forest. Its shapes, where every piece
// stands, and the tree trunks the client and the server both block.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WOLFVEIL_SIDE_SCENERY,WOLFVEIL_OWNER_TREE_CLEAR,WOLFVEIL_FOREST_FLOOR_SQUARE,
  wolfveilFinishedGroundAt,planWolfveilFourSides}
  from '../src/components/game3d/wolfveil/WolfveilFourSidesPlan.mjs';
import {WOLFVEIL_PLANTED_SIDES,wolfveilPlantedTrunkRadius,wolfveilPlantedSide,
  wolfveilPlantedTrunkColliders,wolfveilTrunkColliders,createWolfveilCircleGrid}
  from '../src/components/game3d/wolfveil/WolfveilTrunkColliders.mjs';
import {WOLFVEIL_SIDE_SCENERY_KINDS,WOLFVEIL_SIDE_SCENERY_LABELS,wolfveilSideSceneryShape,
  wolfveilSideSceneryInstances,wolfveilSideSceneryBatches} from '../src/components/game3d/wolfveil/WolfveilSideSceneryShapes.mjs';
import {wolfveilForestTrunkColliders} from '../src/components/game3d/wolfveil/WolfveilForestLayout.js';
import {wolfveilRouteClearance} from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import {wolfveilFrontierTrailClearance,wolfveilMountainness} from '../src/components/game3d/wolfveil/WolfveilLandscapeDesign.mjs';
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
  assert.deepEqual(forest.counts,{maple:60,cedar:1000,bamboo:220,shrub:700,boulder:100,flowers:160});
  assert.equal(wolfveilPlantedSide('north'),null,'the mountain is not built yet');
  assert.equal(wolfveilPlantedSide('west'),forest,'planned once, then shared');
});

test('every shape is light, whole and stands on the ground',()=>{
  const budget={cedar:96,pine:80,maple:80,bamboo:72,shrub:24,flowers:70,boulder:80};
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

test('the whole forest costs under 150,000 triangles and seven draw calls',()=>{
  let triangles=0,drawCalls=0;
  for(const [kind,list] of Object.entries(standing)){
    const each=wolfveilSideSceneryShape(kind).triangles,batches=wolfveilSideSceneryBatches(list,each);
    triangles+=each*list.length;drawCalls+=batches.length;
    assert.equal(batches.reduce((sum,batch)=>sum+batch.length,0),list.length,kind+': every piece is in one batch');
    assert.equal(new Set(batches.flat()).size,list.length,kind+': no piece is drawn twice');
    // Each batch of trees is light enough to stay on the horizon from every area.
    if(WOLFVEIL_SIDE_SCENERY[kind].height[0]>=4)for(const batch of batches)
      assert.ok(batch.length*each<=HORIZON_TRIANGLES,kind+' batch of '+batch.length*each+' triangles');
  }
  assert.equal(Object.keys(standing).length,6);
  assert.equal(drawCalls,7,'the cedars are two batches, every other kind is one');
  assert.ok(triangles<150000,'forest triangles: '+triangles);
  // Batches run south to north, so one behind the camera can be skipped.
  const [south,north]=wolfveilSideSceneryBatches(standing.cedar,wolfveilSideSceneryShape('cedar').triangles);
  assert.ok(Math.max(...south.map(item=>item.z))<=Math.min(...north.map(item=>item.z)));
  assert.deepEqual(wolfveilSideSceneryBatches([1,2,3],10,1000),[[1,2,3]],'a small kind stays one batch');
});

test('it reads as a forest: thick stands, clear glades, red maples by the trails, rock left bare',()=>{
  const cedars=forest.placements.filter(item=>item.kind==='cedar');
  // Most cedars have a close neighbour: stands, not a scatter.
  const close=cedars.filter(tree=>cedars.some(other=>other!==tree&&Math.hypot(tree.x-other.x,tree.z-other.z)<12)).length;
  assert.ok(close/cedars.length>=.85,'cedars standing in a stand: '+close+' of '+cedars.length);
  const maples=forest.placements.filter(item=>item.kind==='maple');
  const byTrail=maples.filter(item=>Math.min(wolfveilRouteClearance(item.x,item.z),
    wolfveilFrontierTrailClearance(item.x,item.z))<18).length;
  assert.ok(byTrail/maples.length>=.7,'maples that mark a road or trail: '+byTrail+' of '+maples.length);
  for(const item of forest.placements)if(item.kind!=='boulder')
    assert.ok(wolfveilMountainness(item.x,item.z)<=.3,item.kind+' on the mountain\'s rock at '+item.x+','+item.z);
  const shape=wolfveilSideSceneryShape('maple');
  let red=0,green=0;
  for(let i=0;i<shape.color.length;i+=3){red+=shape.color[i];green+=shape.color[i+1];}
  assert.ok(red>green*2,'the maple is red');
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
  assert.equal(planted.length,1060,'1,000 cedars and 60 maples');
  assert.equal(wolfveilPlantedTrunkColliders(),planted,'computed once');
  for(const trunk of planted){
    assert.equal(wolfveilAreaAtLocal(trunk.x,trunk.z),'west');
    assert.ok(/^planted_(cedar|maple)$/.test(trunk.kind));
    assert.ok(trunk.radius>=.25&&trunk.radius<=.8,'trunk radius '+trunk.radius);
  }
  // A trunk is as thick as its tree is tall: the tallest cedar is the stoutest.
  const cedars=forest.placements.filter(item=>item.kind==='cedar');
  const tallest=cedars.reduce((a,b)=>b.height>a.height?b:a),shortest=cedars.reduce((a,b)=>b.height<a.height?b:a);
  const radiusAt=tree=>planted.find(trunk=>trunk.x===tree.x&&trunk.z===tree.z).radius;
  assert.equal(radiusAt(tallest),wolfveilPlantedTrunkRadius('cedar',tallest.height));
  assert.ok(radiusAt(tallest)>radiusAt(shortest));
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
  assert.match(drawn,/wolfveilSideSceneryBatches\(all,shape\.triangles\)/);
  assert.match(drawn,/flatShading:true/);
  const server=source('server/game3d/mapCollision.mjs');
  assert.match(server,/wolfveilPlantedTrunkColliders\(\)\.map/);
  assert.match(server,/circleGrid\.some\(x,z,/,'the server looks up trunks near the step, not all of them');
  assert.doesNotMatch(server,/circles\.some\(/);
});
