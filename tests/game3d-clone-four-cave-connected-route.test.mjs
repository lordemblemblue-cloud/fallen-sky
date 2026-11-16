import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {wolfveilHeight} from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import {
  WOLFVEIL_CAVE_HUB,WOLFVEIL_EXPLORABLE_CAVES,WOLFVEIL_CAVE_CORRIDORS,
  sampleWolfveilCaveSpace,planWolfveilCaveInteraction,
  buildWolfveilCaveTravelGraph,
} from '../src/components/game3d/wolfveil/WolfveilCaveLayout.mjs';
const read=path=>readFileSync('src/components/game3d/'+path,'utf8');

test('all four cave entrances work on BOTH approach and arch; no cliff teleport',()=>{
  assert.equal(WOLFVEIL_EXPLORABLE_CAVES.length,4);
  for(const cave of WOLFVEIL_EXPLORABLE_CAVES){
    const outside={x:cave.threshold[0],y:cave.threshold[1],z:cave.threshold[2]};
    const mouth={x:cave.mouth[0],y:cave.mouthY,z:cave.mouth[1]};
    for(const point of [outside,mouth]){
      const entry=planWolfveilCaveInteraction(point);
      assert.equal(entry?.action,'enter',cave.name);
      assert.equal(entry?.caveId,cave.id);
      assert(sampleWolfveilCaveSpace(entry.x,entry.z,.62),
        'entry landing must be on real underground walkable stone');
    }
    assert.equal(planWolfveilCaveInteraction({...outside,y:outside.y+14}),null,
      'surface portal cannot be activated from above the cave roof');
    const insideArch={x:cave.mouth[0]+cave.dir[0]*3,
      y:cave.chamber.y+2,z:cave.mouth[1]+cave.dir[1]*3};
    const exit=planWolfveilCaveInteraction(insideArch,{insideCave:true});
    assert.equal(exit?.action,'exit',cave.name);
    assert.equal(exit?.caveId,cave.id);
    assert(Math.abs(exit.y-wolfveilHeight(exit.x,exit.z))<1,
      'exit lands on actual exterior grade');
  }
});

test('all four cave chambers are truly connected by the five rendered tunnels and central hub',()=>{
  const graph=buildWolfveilCaveTravelGraph();
  assert.equal(graph.nodes.length,5);
  assert.equal(graph.edges.length,5);
  assert.equal(graph.hubId,WOLFVEIL_CAVE_HUB.id);
  const ids=new Set(graph.nodes.map(n=>n.id));
  const connected=new Map([...ids].map(id=>[id,[]]));
  for(const edge of graph.edges){
    assert(ids.has(edge.from)&&ids.has(edge.to));
    assert(edge.length>10);
    connected.get(edge.from).push(edge.to);
    connected.get(edge.to).push(edge.from);
  }
  const visited=new Set([graph.hubId]),queue=[graph.hubId];
  while(queue.length){
    const n=queue.shift();
    for(const next of connected.get(n)){
      if(!visited.has(next)){visited.add(next);queue.push(next);}
    }
  }
  assert.equal(visited.size,graph.nodes.length,
    'every cave must reach all other caves through the actual tunnel network');
  for(const cave of WOLFVEIL_EXPLORABLE_CAVES){
    assert(visited.has(cave.chamber.id),cave.name);
  }
});

test('ramps and connected tunnels have contiguous walkable floors without multi-metre handoff drops',()=>{
  assert.equal(WOLFVEIL_CAVE_CORRIDORS.length,9); // four entries + five connections
  for(const corridor of WOLFVEIL_CAVE_CORRIDORS){
    let previous=null,steps=0;
    for(const seg of corridor.segments){
      const count=Math.max(2,Math.ceil(seg.lenXZ/0.6));
      for(let i=0;i<=count;i++){
        const t=i/count;
        const x=seg.ax+seg.dx*t,z=seg.az+seg.dz*t;
        const floor=sampleWolfveilCaveSpace(x,z,.62);
        assert(floor,corridor.id+' missing floor contact at '+x+','+z);
        if(previous!==null){
          assert(Math.abs(floor.floorY-previous)<1.1,
            corridor.id+' dangerous seam '+Math.abs(floor.floorY-previous)+'m');
        }
        previous=floor.floorY;steps++;
      }
    }
    assert(steps>15,corridor.id+' is unreasonably short');
  }
});

test('all mapped arch labels and four central hub direction signs match the real connected geometry',()=>{
  const scene=read('wolfveil/WolfveilCaveSystem.js');
  const world=read('GameWorld3D.jsx');
  assert.match(scene,/const navigationGraph=buildWolfveilCaveTravelGraph\(\)/);
  assert.match(scene,/for\(const cave of WOLFVEIL_EXPLORABLE_CAVES\)/);
  assert.match(scene,/E · Return Outside/);
  assert.match(scene,/for\(const edge of navigationGraph\.edges\)/);
  assert.match(scene,/sprite\.raycast=\(\)=>\{\}/);
  assert.match(scene,/navigationGraph,/);
  assert.match(world,/wolfveilVillage\?\.interactCave\(model\.position\)/);
  assert.match(read('wolfveil/WolfveilGeometry.js'),/void caveCutouts;/);
  assert.doesNotMatch(scene,/grantReward|grantLoot|grantExperience|awardSilver/);
});
