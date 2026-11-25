import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createConduitArena, CONDUIT_CONFIG, ConduitCollisionWorld } from '../src/components/duelist/client/maps/conduitArena.mjs';

// The canvas shim only supplies procedural texture drawing; actual scene geometry,
// transforms, materials, and collision registry use the installed Three.js package.
function withCanvas(fn) {
  const previous = globalThis.document;
  const ctx = new Proxy({}, { get: (target, key) => key === 'createRadialGradient'
    ? () => ({addColorStop(){}}) : target[key] ?? (()=>{}) });
  globalThis.document = {createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,getContext:()=>ctx};}};
  try { return fn(); } finally { if(previous===undefined)delete globalThis.document;else globalThis.document=previous; }
}

test('Conduit locked dimensions and native map module do not require a renderer',()=>{
  assert.equal(CONDUIT_CONFIG.foundationR,44.8);
  assert.equal(CONDUIT_CONFIG.yT0,-5);
  assert.equal(CONDUIT_CONFIG.yT2,5);
  assert.equal(CONDUIT_CONFIG.crownRadius,9);
  assert.equal(CONDUIT_CONFIG.buildings.length,4);
  assert.throws(()=>createConduitArena(null),TypeError);
});

test('combined geometry retains restored Phase 4 solids, pads, spawn and pickup definitions',()=>withCanvas(()=>{
  const scene=new THREE.Scene();
  const arena=createConduitArena(scene,{quality:'low',enableLights:false});
  try {
    assert.equal(scene.children.length,1);
    assert.equal(arena.world.jumpPads.length,4);
    assert.ok(arena.world.jumpPads.every(p=>p.y===5&&p.targetY===5));
    assert.equal(arena.pickups.length,6);
    assert.equal(arena.spawnCandidates.blue.length+arena.spawnCandidates.red.length,32);
    assert.equal(arena.buildingRoofs.length,4);
    assert.equal(arena.world.obbs.filter(o=>o.label.startsWith('Chamber Column ')).length,8);
    assert.equal(arena.world.obbs.filter(o=>o.label.startsWith('Chamber Cover ')).length,4);
    for (const label of ['Armory Racks','Reactor Power Cabinet','Med Cabinets','Barracks Lockers','T0 Cargo 0']) {
      assert.ok(arena.world.obbs.some(o=>o.label===label),label);
    }
    assert.ok(arena.world.ramps.some(o=>o.label.includes('Bsmt Stair')));
    assert.ok(arena.navGraph.findPath('t0_center','crown_center'));
    arena.updateVisuals(1);
    arena.setPickupAvailable('crown',false);
  } finally {arena.dispose();}
  assert.equal(scene.children.length,0);
  arena.dispose();
  const again=createConduitArena(scene,{quality:'low',enableLights:false});
  again.dispose();
  assert.equal(scene.children.length,0);
}));

test('collision fixture supports negative elevations, explicit cutouts and swept landing',()=>{
  const world=new ConduitCollisionWorld();
  world.addDisc(0,0,10,-5.5,-5,true,'T0');
  world.addDisc(0,0,10,-.6,0,true,'T1',[{cx:2,cz:0,hx:1,hz:1,cos:1,sin:0}]);
  assert.equal(world.getSweptSupportHeight(0,1,-6,0,.4),0);
  assert.equal(world.getSweptSupportHeight(2,1,-6,0,.4),-5);
});
