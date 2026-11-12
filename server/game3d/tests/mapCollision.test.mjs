import test from 'node:test';
import assert from 'node:assert/strict';
import {createWolfveilMapCollision,WOLFVEIL_MAP_ID,WOLFVEIL_RENDER_OFFSET_Z,
  WOLFVEIL_STATIC_OBSTACLE_COUNT,WOLFVEIL_FOREST_TRUNK_COUNT,
  configuredGame3DMapCollision} from '../mapCollision.mjs';
import {wolfveilForestTrunkColliders,wolfveilTreePlacements}
  from '../../../src/components/game3d/wolfveil/WolfveilForestLayout.js';
import {createGame3DDuelMatch} from '../authority.mjs';
import {WOLFVEIL_BRIDGES,wolfveilHeight}
  from '../../../src/components/game3d/wolfveil/WolfveilLayout.js';
import {createWolfveilTerrainSurfaceSampler}
  from '../../../src/components/game3d/wolfveil/WolfveilTerrainSurfaceSampler.mjs';
import {planWolfveilBridgeDeck}
  from '../../../src/components/game3d/wolfveil/WolfveilBridgeProfile.mjs';
import {initialDedicatedCheckpoint,validateDedicatedReport} from
  '../../../base44/shared/duelDedicatedHandoff.mjs';

const map=createWolfveilMapCollision();
const origin={x:0,z:0};
const free={x:0,z:-80};
const site={x:35,z:-96+70}; // blacksmith footprint in renderer-space

test('map only loads from the explicit private map version',()=>{
  assert.equal(map.id,WOLFVEIL_MAP_ID);
  assert.equal(configuredGame3DMapCollision(null),null);
  assert.throws(()=>configuredGame3DMapCollision('untrusted'));
  assert.ok(WOLFVEIL_STATIC_OBSTACLE_COUNT>=30);
  assert.ok(WOLFVEIL_FOREST_TRUNK_COUNT>=24);
});

test('server blocks the actual Luna mansion and fountain, not removed housing ghosts',()=>{
  assert.equal(map.valid(free,origin),true);
  assert.equal(map.valid({x:0,z:1},origin),false,
    'the real 4.47m fountain rim remains solid');
  assert.equal(map.valid({x:26.5,z:185},origin),false,
    'the Luna dashboard mansion exterior remains solid');
  assert.equal(map.canStrike({x:32,z:185},{x:18,z:185},origin),false,
    'the original mansion wall blocks a horizontal strike');
  assert.equal(map.valid({x:26,z:-54+70},origin),true,
    'removed vendor table leaves no invisible barrier');
  assert.equal(map.valid(site,origin),true,
    'obsolete blacksmith shell no longer leaves a ghost obstacle');
  const from={x:32,z:185};
  const result=map.move(from,{x:15,z:185},origin);
  assert.ok(result.x>=26.5+.45,
    'worker movement must not tunnel through the mansion west wall');
});

test('deterministic renderer forest trunks block server movement and line of sight',()=>{
  const trees=wolfveilTreePlacements();
  const trunks=wolfveilForestTrunkColliders();
  assert.ok(trunks.length>trees.length,'the imported elm GLBs are now blocked too');
  assert.equal(trunks.length,WOLFVEIL_FOREST_TRUNK_COUNT);
  const t=trunks[0];
  const center={x:t.x,z:t.z+70};
  assert.equal(map.valid(center,origin),false,'tree trunk blocks player center');
  const clear={x:t.x+t.radius+1,z:t.z+70};
  assert.equal(map.valid(clear,origin),true,'a nearby clear footprint remains open');
  assert.equal(map.canStrike({x:t.x-3,z:t.z+70},
    {x:t.x+3,z:t.z+70},origin),false,'tree trunk blocks strikes');
});

test('terrain is sampled from the same versioned height function as the world',()=>{
  const at=free,h=map.height(at,origin);
  assert.ok(Number.isFinite(h));
  assert.equal(map.height({x:600,z:0},origin),null);
  assert.equal(map.height(site,origin),null);
});

test('map mode rejects mismatched checkpoints, bad spawn, and retains map ID in snapshots',()=>{
  let now=1000;
  const make=(checkpoint)=>createGame3DDuelMatch({
    id:'map-test',challengerId:'c',opponentId:'o',
    challengerStats:{maxHP:100},opponentStats:{maxHP:100},
    checkpoint,mapWorld:map,now:()=>now,resolveStrike:()=>({damage:0}),
  });
  assert.throws(()=>make({worldOrigin:origin,mapId:'fake'}));
  assert.throws(()=>make({worldOrigin:origin,mapId:WOLFVEIL_MAP_ID,
    state:{status:'active',sequence:0,actors:[
      {id:'c',x:site.x,z:site.z},{id:'o',x:3,z:0},
    ]}}));
  const duel=make({worldOrigin:origin,mapId:WOLFVEIL_MAP_ID,
    state:{status:'active',sequence:0,actors:[
      {id:'c',x:-3,z:-80},{id:'o',x:3,z:-80},
    ]}});
  assert.equal(duel.snapshot().mapId,WOLFVEIL_MAP_ID);
  assert.ok(Number.isFinite(duel.snapshot().players[0].y));
  assert.equal(duel.mapId,WOLFVEIL_MAP_ID);
});

test('signed report policy prevents map changes or origin changes',()=>{
  const duel={id:'duel-report',status:'active',
    dedicated_mode:'dedicated',dedicated_epoch:'epoch',dedicated_sequence:0,
    challenger_id:'c',opponent_id:'o',
    dedicated_checkpoint:{worldOrigin:origin,mapId:WOLFVEIL_MAP_ID}};
  const snapshot={matchId:duel.id,seq:0,mapId:WOLFVEIL_MAP_ID,status:'active',
    players:[{id:'c',hp:100,maxHp:100,x:0,z:0,stamina:100,will:100},
      {id:'o',hp:100,maxHp:100,x:3,z:0,stamina:100,will:100}]};
  const args={duel,epoch:'epoch',sequence:1,snapshot,
    checkpoint:{worldOrigin:origin,mapId:WOLFVEIL_MAP_ID,
      state:{status:'active',sequence:0,actors:snapshot.players.map(
        p=>({id:p.id,x:p.x,z:p.z,hp:p.hp,will:p.will,stamina:p.stamina}))}}};
  assert.equal(validateDedicatedReport(args).ok,true);
  assert.equal(validateDedicatedReport({...args,checkpoint:{worldOrigin:origin,mapId:null}}).reason,'map_binding_changed');
  assert.equal(validateDedicatedReport({...args,checkpoint:{worldOrigin:{x:1,z:0},mapId:WOLFVEIL_MAP_ID}}).reason,'map_binding_changed');
});

test('initial handoff binds the configured map ID without trusting browser map selection',()=>{
  const duel={id:'duel',challenger_id:'c',opponent_id:'o',
    challenger_hp:100,opponent_hp:100,challenger_max_hp:100,opponent_max_hp:100,
    challenger_position:{x:0,z:0},opponent_position:{x:3,z:0}};
  const checkpoint=initialDedicatedCheckpoint(duel,1000,WOLFVEIL_MAP_ID);
  assert.equal(checkpoint.mapId,WOLFVEIL_MAP_ID);
  assert.deepEqual(checkpoint.worldOrigin,{x:0,z:0});
});


test('authoritative map follows the SAME bank-seated bridge deck as live Wolfveil Play',()=>{
  const sample=createWolfveilTerrainSurfaceSampler({span:1100,segments:310});
  for(const bridge of WOLFVEIL_BRIDGES){
    const deck=planWolfveilBridgeDeck(bridge,sample);
    const x=(bridge.from[0]+bridge.to[0])/2,
      localZ=(bridge.from[1]+bridge.to[1])/2;
    const actor={x,z:localZ+WOLFVEIL_RENDER_OFFSET_Z};
    const floor=map.height(actor,origin);
    assert.ok(Number.isFinite(floor),bridge.id+' must have a server floor');
    assert.ok(Math.abs(floor-deck.heightAt(.5,0))<.015,
      bridge.id+' server floor must agree with the original visible deck profile');
    assert.ok(floor>wolfveilHeight(x,localZ)+.3,
      'bridge must not snap an actor into the water/riverbed below');
    const start={x:bridge.from[0]+(bridge.to[0]-bridge.from[0])*.28,
      z:bridge.from[1]+(bridge.to[1]-bridge.from[1])*.28+WOLFVEIL_RENDER_OFFSET_Z};
    const end={x:bridge.from[0]+(bridge.to[0]-bridge.from[0])*.72,
      z:bridge.from[1]+(bridge.to[1]-bridge.from[1])*.72+WOLFVEIL_RENDER_OFFSET_Z};
    assert.equal(map.valid(start,origin),true,
      bridge.id+' must permit movement near its first interior segment');
    assert.equal(map.valid(end,origin),true,
      bridge.id+' must permit movement near its far interior segment');
    const forward=map.move(start,end,origin);
    assert.ok(Math.hypot(forward.x-end.x,forward.z-end.z)<.35,
      bridge.id+' must allow walking toward the far bank');
    const backward=map.move(end,start,origin);
    assert.ok(Math.hypot(backward.x-start.x,backward.z-start.z)<.35,
      bridge.id+' must allow return traversal');
  }
});

test('server guard rails prevent lateral fall-through but do not close shore entrances',()=>{
  const bridge=WOLFVEIL_BRIDGES.find(b=>b.id==='residential_footbridge');
  const centerX=(bridge.from[0]+bridge.to[0])*.5;
  const centerZ=bridge.from[1]+WOLFVEIL_RENDER_OFFSET_Z;
  assert.equal(map.valid({x:centerX,z:centerZ},origin),true);
  assert.equal(map.valid({x:centerX,z:centerZ+bridge.width/2-.25},origin),false,
    'body footprint must not pass through visible timber rail');
  assert.equal(map.valid({x:centerX,z:centerZ-bridge.width/2+.25},origin),false);
  const bank={x:bridge.from[0],z:bridge.from[1]+WOLFVEIL_RENDER_OFFSET_Z};
  assert.equal(map.valid(bank,origin),true,'shore entry remains passable');
});

test('all eight removed shelter sites are walkable while protected landmarks remain blocked',()=>{
 const retired=[[-26,-54],[26,-54],[-25,-73],[25,-73],[-24,-95],
   [23,-94],[-17,-112],[16,-113]];
 for(const [x,z] of retired)
   assert.equal(map.valid({x,z:z+70},origin),true,
     `deleted shelter at ${x},${z} must not retain a hidden obstacle`);
 assert.equal(map.valid({x:0,z:1},origin),false,
   'do not remove the still-visible fountain rim');
 assert.equal(map.valid(site,origin),false,
   'do not disable unrelated building collision');
});
