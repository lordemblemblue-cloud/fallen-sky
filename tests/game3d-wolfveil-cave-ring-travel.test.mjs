// Cave rings (story mode, 2026-11-23): every ring used to land the player in
// the Wolf Rotunda (sourceEntrance was never read) and the Rotunda's ring was
// the only way out, to one place in the valley. Now a ring at a cave's mouth
// lands in that cave's entry hall, 16 m in, and a ring inside the same arch
// takes the player back out to the bench outside that mouth.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WOLFVEIL_EXPLORABLE_CAVES,sampleWolfveilCaveSpace}
  from '../src/components/game3d/wolfveil/WolfveilCaveLayout.mjs';
import {WOLFVEIL_CAVE_RING,wolfveilCaveRingArrival,wolfveilCaveRingExits,wolfveilCaveRingReturn}
  from '../src/components/game3d/wolfveil/WolfveilCaveRingTravel.mjs';
import {createWolfveilDungeonPortals,WOLFVEIL_CAVES_REGION}
  from '../src/components/game3d/wolfveil/WolfveilDungeonPortals.js';
import {wolfveilAreaAtWorld} from '../src/components/game3d/wolfveil/streaming/WolfveilFiveAreaPlan.mjs';
import {wolfveilHeight} from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import {game3dGame2MovementBasis} from '../src/components/game3d/player/Game3DGame2Camera.mjs';

const W=70; // local -> world z
const facing=yaw=>game3dGame2MovementBasis(yaw).forward;
// The story's entry halls (band3-land-faults.md), local x/z.
const STORY_HALLS={
  jade_lantern_grotto:[-368.8,-413.4],
  whispering_root_hollow:[-511.2,311.4],
  // Moved with the Cistern's mouth (-40,548 -> -40,500) on 2026-11-23; it was (-45.4, 563.0).
  sunken_inkstone_cistern:[-42.29,515.84],
};

test('a ring lands the player in the entry hall of the cave walked into, facing in',()=>{
  for(const cave of WOLFVEIL_EXPLORABLE_CAVES){
    const at=wolfveilCaveRingArrival(cave.id);
    assert.ok(at,cave.id);
    const local={x:at.x,z:at.z-W};
    const along=(local.x-cave.mouth[0])*cave.dir[0]+(local.z-cave.mouth[1])*cave.dir[1];
    assert.ok(Math.abs(along-WOLFVEIL_CAVE_RING.hallAlong)<1e-6,cave.id+' 16 m in');
    const space=sampleWolfveilCaveSpace(local.x,local.z,.75);
    assert.ok(space,cave.id+' inside the cave');
    assert.ok(Math.abs(at.y-.1-space.floorY)<1e-6,cave.id+' on its floor');
    const f=facing(at.yaw);
    assert.ok(f.x*cave.dir[0]+f.z*cave.dir[1]>.999,cave.id+' looks into the cave');
    const story=STORY_HALLS[cave.id];
    if(story)assert.ok(Math.hypot(local.x-story[0],local.z-story[1])<.1,cave.id+' where the story expects');
  }
  assert.equal(wolfveilCaveRingArrival('no_such_cave'),null);
  assert.equal(wolfveilCaveRingArrival(undefined),null);
});

test('each cave has a way out inside its own arch, clear of where the player lands',()=>{
  const exits=wolfveilCaveRingExits();
  assert.equal(exits.length,WOLFVEIL_EXPLORABLE_CAVES.length);
  for(const exit of exits){
    const hall=wolfveilCaveRingArrival(exit.id);
    assert.ok(Math.hypot(exit.x-hall.x,exit.z-hall.z)>WOLFVEIL_CAVE_RING.triggerRadius+6,exit.id+' not touched on arrival');
    assert.ok(sampleWolfveilCaveSpace(exit.x,exit.z-W,.62),exit.id+' in the passage');
  }
});

test('out of a cave: the bench outside its mouth, clear of the mouth ring, facing away, in the mouth\'s area',()=>{
  for(const cave of WOLFVEIL_EXPLORABLE_CAVES){
    const out=wolfveilCaveRingReturn(cave.id);
    const local={x:out.x,z:out.z-W};
    assert.ok(Math.hypot(local.x-cave.mouth[0],local.z-cave.mouth[1])>WOLFVEIL_CAVE_RING.triggerRadius+5,cave.id+' clear of the ring');
    assert.equal(out.area,wolfveilAreaAtWorld({x:cave.mouth[0],z:cave.mouth[1]+W}),cave.id+' area');
    assert.ok(Math.abs(out.y-wolfveilHeight(local.x,local.z))<1e-6,cave.id+' on the ground');
    const f=facing(out.yaw);
    assert.ok(f.x*cave.dir[0]+f.z*cave.dir[1]<-.999,cave.id+' looks away from the cave');
  }
});

test('the rings: in by a mouth to that cave, out by its arch or the Rotunda to the cave walked into',()=>{
  const ring=(options,position)=>{
    const portals=createWolfveilDungeonPortals(new THREE.Scene(),options);
    try{
      portals.update(.1,{...position,x:position.x+40}); // walking up to it
      return portals.update(2.5,position);
    }finally{portals.dispose();}
  };
  for(const cave of WOLFVEIL_EXPLORABLE_CAVES){
    const area=wolfveilAreaAtWorld({x:cave.mouth[0],z:cave.mouth[1]+W});
    assert.deepEqual(ring({mode:'surface',area},{x:cave.mouth[0],y:cave.mouthY,z:cave.mouth[1]+W}),
      {target:WOLFVEIL_CAVES_REGION,sourceEntrance:cave.id});
    const hall=wolfveilCaveRingArrival(cave.id);
    assert.equal(ring({mode:'destination',entrance:cave.id},hall),null,cave.id+' arriving touches no ring');
    const exit=wolfveilCaveRingExits().find(e=>e.id===cave.id);
    const out=wolfveilCaveRingReturn(cave.id);
    assert.deepEqual(ring({mode:'destination',entrance:'whispering_root_hollow'},{x:exit.x,y:exit.floorY,z:exit.z}),
      {target:'wolfveil',returnToCave:cave.id,area:out.area},cave.id+' exit');
    // A tunnel passing well above or below the arch does not touch it.
    assert.equal(ring({mode:'destination'},{x:exit.x,y:exit.floorY+8,z:exit.z}),null);
  }
  // A player who arrives standing in a ring (a checkpoint saved on it) is not
  // sent through; stepping out and back in is.
  const root=WOLFVEIL_EXPLORABLE_CAVES.find(c=>c.id==='whispering_root_hollow');
  const portals=createWolfveilDungeonPortals(new THREE.Scene(),{mode:'surface',area:'north'});
  const onRing={x:root.mouth[0]+1,y:root.mouthY,z:root.mouth[1]+W},off={...onRing,x:onRing.x+8};
  assert.equal(portals.update(.1,onRing),null,'loaded inside the ring');
  assert.equal(portals.update(.1,onRing),null,'still standing in it');
  assert.equal(portals.update(.1,off),null);
  assert.equal(portals.update(.1,onRing)?.sourceEntrance,'whispering_root_hollow','walked back in');
  portals.dispose();
  const rotunda={x:-6,y:-8,z:132};
  assert.equal(ring({mode:'destination',entrance:'sunken_inkstone_cistern'},rotunda).returnToCave,'sunken_inkstone_cistern');
  assert.equal(ring({mode:'destination'},rotunda).returnToCave,'jade_lantern_grotto','no entrance: the old valley exit');
});
