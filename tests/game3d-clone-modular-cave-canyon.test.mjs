import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  WOLFVEIL_MODULAR_TREASURE_ROOM as vault,
  WOLFVEIL_MODULAR_JUNCTION as t,
  WOLFVEIL_MODULAR_CANYON as canyon,
  WOLFVEIL_MODULAR_CORRIDOR_SPECS as corridors,
  WOLFVEIL_MODULAR_ARENA_ROUTE,
  isWolfveilModularCanyonWalkable,
  getWolfveilModularCanyonTileRects,
  sampleWolfveilModularCanyon,
} from '../src/components/game3d/wolfveil/WolfveilModularCaveKit.mjs';
import {
  WOLFVEIL_CAVE_HUB,WOLFVEIL_CAVE_CORRIDORS,
  sampleWolfveilCaveSpace,resolveWolfveilCaveWallCollision,
  buildWolfveilCaveTravelGraph,
} from '../src/components/game3d/wolfveil/WolfveilCaveLayout.mjs';
const near=(a,b)=>Math.abs(a-b)<1e-5;
test('connected owner modular pieces have one T and attach to the existing hub',()=>{
  assert.equal(corridors.length,3);
  const [stem,treasure,open]=corridors;
  assert.ok(near(stem.waypoints[0][0],WOLFVEIL_CAVE_HUB.x));
  assert.ok(near(stem.waypoints[0][2],WOLFVEIL_CAVE_HUB.z));
  for(const piece of [stem,treasure,open])
    assert.ok(piece.waypoints.some(p=>near(p[0],t.x)&&near(p[2],t.z)));
  assert.ok(near(treasure.waypoints.at(-1)[0],vault.x));
  assert.ok(near(treasure.waypoints.at(-1)[2],vault.z));
  assert.ok(near(open.waypoints.at(-1)[0],canyon.entrance.x));
  assert.ok(near(open.waypoints.at(-1)[2],canyon.entrance.z));
  for(const piece of corridors){
    assert.ok(WOLFVEIL_CAVE_CORRIDORS.some(p=>p.id===piece.id));
    assert.ok(piece.waypoints.every(p=>p.every(Number.isFinite)));
    for(let i=1;i<piece.waypoints.length;i++){
      const a=piece.waypoints[i-1],b=piece.waypoints[i];
      assert.ok(Math.hypot(a[0]-b[0],a[2]-b[2])>0);
      assert.ok(Math.abs(a[1]-b[1])<0.001,'no hidden staircase/snap');
    }
  }
});
test('180x140m open area renders exactly the playable stone zones',()=>{
  assert.equal(canyon.width,180);assert.equal(canyon.depth,140);
  const tiles=getWolfveilModularCanyonTileRects(4);
  assert.ok(tiles.length>1000 && tiles.length<1575);
  for(const tile of tiles){
    const x=(tile.minX+tile.maxX)/2,z=(tile.minZ+tile.maxZ)/2;
    assert.ok(isWolfveilModularCanyonWalkable(x,z,0.1));
    const floor=sampleWolfveilCaveSpace(x,z,.1);
    assert.ok(floor,'no floor at rendered tile '+x+','+z);
    assert.ok(Math.abs(floor.floorY-canyon.y)<.3);
  }
  // Water is a real void, and each bridge is a real walkable strip.
  assert.equal(isWolfveilModularCanyonWalkable(128,-180,.62),false);
  for(const z of canyon.bridges)
    assert.ok(isWolfveilModularCanyonWalkable(128,z,.62));
  assert.equal(isWolfveilModularCanyonWalkable(221,-160),false);
  assert.equal(isWolfveilModularCanyonWalkable(128,-180),false);
});
test('continuous floor route leads through the middle bridge to arena',()=>{
  for(const point of WOLFVEIL_MODULAR_ARENA_ROUTE){
    const ground=sampleWolfveilCaveSpace(point[0],point[2],.62);
    assert.ok(ground,'floor missing along boss staging route');
    assert.equal(ground.floorY,point[1]);
  }
  assert.ok(Math.hypot(
    WOLFVEIL_MODULAR_ARENA_ROUTE.at(-1)[0]-canyon.arena.x,
    WOLFVEIL_MODULAR_ARENA_ROUTE.at(-1)[2]-canyon.arena.z)<1e-5);
});
test('cave collision blocks a body walking sideways from a bridge into water',()=>{
  const prev={x:128,y:canyon.y,z:-162};
  const current={x:128,y:canyon.y,z:-176};
  const result=resolveWolfveilCaveWallCollision(current,prev,.62);
  assert.equal(result,true);
  assert.ok(near(current.z,prev.z)||near(current.x,prev.x));
});
test('new graph paths are physical, not teleports or server loot grants',()=>{
  const g=buildWolfveilCaveTravelGraph();
  const names=new Set(g.edges.map(e=>e.id));
  for(const p of corridors)assert.ok(names.has(p.id),p.id);
  assert.ok(names.has('modular_canyon_open_floor_to_arena'));
  assert.ok(g.nodes.some(n=>n.id===canyon.arena.id));
  const read=(p)=>readFileSync(new URL(p,import.meta.url),'utf8');
  const layout=read('../src/components/game3d/wolfveil/WolfveilCaveLayout.mjs');
  const renderer=read('../src/components/game3d/wolfveil/WolfveilCaveSystem.js');
  assert.match(layout,/sampleWolfveilModularCanyon\(x,z,margin\)/);
  assert.match(renderer,/appendWolfveilModularCaveVisuals\(/);
  assert.match(renderer,/modularVisual\.waterGeometry\.dispose/);
  assert.doesNotMatch(renderer,/grantModularTreasure|spawnModularBoss|awardModularXP/);
});
