import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CONDUIT_LIGHT_BUDGETS, conduitLightPlan, selectConduitLights } from '../src/components/duelist/client/maps/conduitLighting.mjs';
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

test('lighting plan covers every building tier, cross tunnel and ring quadrant',()=>{
  const plan=conduitLightPlan(CONDUIT_CONFIG);
  assert.equal(new Set(plan.map(p=>p.id)).size,plan.length);
  for(const b of CONDUIT_CONFIG.buildings)for(const suffix of ['ground','upper','basement','basement-link']){
    assert.ok(plan.some(p=>p.id===b.id+'-'+suffix));
  }
  for(let i=0;i<4;i++)for(const prefix of ['tunnel-','inner-tunnel-','stair-','ring-','perimeter-']){
    assert.ok(plan.some(p=>p.id===prefix+i));
  }
  for(const p of plan)assert.ok(p.position.every(Number.isFinite)&&p.range>0&&p.intensity>0);
  for(const budget of Object.values(CONDUIT_LIGHT_BUDGETS)){
    const overview=selectConduitLights(plan,budget);
    assert.equal(overview.length,budget);
    assert.equal(new Set(overview.map(p=>p.id)).size,budget);
    for(const tier of ['t0','t1','t2'])assert.ok(overview.some(p=>p.tier===tier));
  }
  for(const p of plan){
    const [x,y,z]=p.position;
    assert.ok(selectConduitLights(plan,8,p.tier,{x,y,z}).some(v=>v.id===p.id),p.id);
  }
});

test('lighting quality bounds, focus, profiles, disabled state and disposal',()=>withCanvas(()=>{
  const scene=new THREE.Scene();
  const arena=createConduitArena(scene,{quality:'low',enableLights:false});
  try{
    const group=arena.root.getObjectByName('Conduit Lighting');
    assert.ok(group);
    const points=group.children.filter(o=>o.isPointLight);
    const spots=group.children.filter(o=>o.isSpotLight);
    assert.equal(points.length,8);
    assert.equal(spots.length,1);
    assert.ok(points.every(l=>!l.castShadow));
    assert.equal(spots[0].castShadow,false);
    assert.ok(spots[0].position.y<14);
    assert.equal(group.visible,false);
    arena.lighting.setProfile('t0');
    assert.equal(group.visible,false);
    arena.lighting.setEnabled(true);
    assert.equal(group.visible,true);
    assert.equal(spots[0].intensity,0);
    assert.ok(arena.lighting.activeIds.every(id=>arena.lighting.plan.find(p=>p.id===id).tier==='t0'));
    arena.lighting.setFocus({x:0,y:-2,z:0});
    assert.ok(arena.lighting.activeIds.includes('undercroft-core'));
    assert.equal(arena.lighting.setProfile('invalid'),false);
    arena.lighting.setProfile('crown');
    assert.equal(points.filter(l=>l.intensity>0).length,1);
    assert.ok(spots[0].intensity>0);
    arena.lighting.setFocus(null);
    arena.lighting.setProfile('all');
    assert.equal(points.filter(l=>l.intensity>0).length,8);
    assert.equal(group.children.filter(o=>o.isPointLight).length,8);
  }finally{arena.dispose();}
  assert.equal(scene.children.length,0);
}));
