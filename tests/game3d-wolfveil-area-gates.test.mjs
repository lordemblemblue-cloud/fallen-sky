import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';
import * as THREE from 'three';
import {
  WOLFVEIL_AREA_VEIL_LINES,WOLFVEIL_AREA_COLORS,wolfveilAreaGates,wolfveilAreaGatePosts,
  wolfveilAreaVeilCrossing,resolveWolfveilAreaVeilMovement,wolfveilAreaGateDestination,
} from '../src/components/game3d/wolfveil/streaming/WolfveilAreaVeils.mjs';
import {WOLFVEIL_AREA_IDS,wolfveilAreaAtLocal} from '../src/components/game3d/wolfveil/streaming/WolfveilFiveAreaPlan.mjs';
import {WOLFVEIL_AREA_PORTALS,planWolfveilAreaPortalVisuals}
  from '../src/components/game3d/wolfveil/streaming/WolfveilAreaPortalPlan.mjs';
import {createWolfveilAreaGates} from '../src/components/game3d/wolfveil/WolfveilAreaGates.js';
import {createWolfveilAreaCrossingMist} from '../src/components/game3d/wolfveil/streaming/WolfveilAreaCrossingMist.js';
import {WOLFVEIL_BRIDGES,wolfveilHeight} from '../src/components/game3d/wolfveil/WolfveilLayout.js';

const gates=wolfveilAreaGates();
const source=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('veil lines follow the five-area borders and separate exactly their two areas',()=>{
  assert.equal(WOLFVEIL_AREA_VEIL_LINES.length,8);
  for(const line of WOLFVEIL_AREA_VEIL_LINES){
    const [[ax,az],[bx,bz]]=line.points,len=Math.hypot(bx-ax,bz-az);
    const nx=(bz-az)/len,nz=-(bx-ax)/len;
    for(const t of [.1,.5,.9]){
      const x=ax+(bx-ax)*t,z=az+(bz-az)*t;
      const sides=[wolfveilAreaAtLocal(x+nx*1.5,z+nz*1.5),wolfveilAreaAtLocal(x-nx*1.5,z-nz*1.5)];
      assert.deepEqual(sides.sort(),[...line.areas].sort(),line.id);
    }
  }
  for(const id of WOLFVEIL_AREA_IDS)assert.equal(WOLFVEIL_AREA_COLORS[id].length,3,id);
});

test('one torii gate on every area portal, with the old arch opening',()=>{
  assert.equal(gates.length,WOLFVEIL_AREA_PORTALS.length);
  assert.ok(gates.length>=11);
  const arches=new Map(planWolfveilAreaPortalVisuals().map(v=>[v.id,v]));
  for(const gate of gates){
    const portal=WOLFVEIL_AREA_PORTALS.find(p=>p.id===gate.id);
    assert.deepEqual([...gate.areas],[portal.a,portal.b]);
    assert.equal(gate.x,portal.x);assert.equal(gate.z,portal.z);
    assert.equal(gate.halfWidth,arches.get(gate.id).radius,'same opening as the light arch');
    assert.notEqual(gate.behind,gate.ahead);
    assert.deepEqual([gate.behind,gate.ahead].sort(),[portal.a,portal.b].sort(),gate.id);
    assert.equal(wolfveilAreaAtLocal(gate.x-gate.facing[0]*2,gate.z-gate.facing[1]*2),gate.behind);
    assert.equal(wolfveilAreaAtLocal(gate.x+gate.facing[0]*2,gate.z+gate.facing[1]*2),gate.ahead);
    assert.ok(Math.abs(Math.hypot(...gate.facing)-1)<1e-9);
    const [p,q]=wolfveilAreaGatePosts(gate);
    assert.ok(Math.abs(Math.hypot(p[0]-q[0],p[1]-q[1])-2*(gate.halfWidth+gate.postRadius))<1e-9);
    assert.ok(gate.height>=5.6&&Number.isFinite(gate.baseY),gate.id);
    assert.ok(gate.label.length>3,gate.id);
    assert.equal(wolfveilAreaGateDestination(gate,'ahead').id,gate.ahead);
  }
});

test('walking along each portal path through its gate is allowed, both ways',()=>{
  for(const portal of WOLFVEIL_AREA_PORTALS){
    const a={x:portal.x-portal.dirX*2.5,z:portal.z-portal.dirZ*2.5};
    const b={x:portal.x+portal.dirX*2.5,z:portal.z+portal.dirZ*2.5};
    const there=wolfveilAreaVeilCrossing(a,b),back=wolfveilAreaVeilCrossing(b,a);
    assert.equal(there.allowed,true,portal.id);assert.equal(there.gate.id,portal.id);
    assert.equal(back.allowed,true,portal.id);
  }
});

test('the three bridge gates span their whole decks',()=>{
  for(const bridge of WOLFVEIL_BRIDGES){
    const gate=gates.find(g=>g.kind==='bridge'&&g.id.endsWith(bridge.id));
    assert.ok(gate,bridge.id);
    for(const lateral of [-bridge.width/2+.3,0,bridge.width/2-.3]){
      const z=bridge.from[1]+lateral;
      assert.equal(wolfveilAreaVeilCrossing({x:gate.x-1,z},{x:gate.x+1,z}).allowed,true,bridge.id+' '+lateral);
    }
  }
});

test('veils block every other crossing and let the mover slide along them',()=>{
  assert.equal(wolfveilAreaVeilCrossing({x:-189.5,z:0},{x:-190.5,z:0}).allowed,false);
  assert.equal(wolfveilAreaVeilCrossing({x:121.5,z:147},{x:122.5,z:147}).allowed,false,'no ford by the waterfall');
  assert.equal(wolfveilAreaVeilCrossing({x:-60,z:239.5},{x:-60,z:240.5}).allowed,false);
  const p={x:-190.5,z:1.2};
  assert.equal(resolveWolfveilAreaVeilMovement(p,{x:-189.6,z:0}).blocked,true);
  assert.deepEqual(p,{x:-189.6,z:1.2},'slides along the veil');
  const corner={x:-190.4,z:240.4};
  assert.equal(resolveWolfveilAreaVeilMovement(corner,{x:-189.6,z:239.6}).blocked,true);
  assert.equal(wolfveilAreaAtLocal(corner.x,corner.z),'town');
  const free={x:10,z:10};
  assert.deepEqual(resolveWolfveilAreaVeilMovement(free,{x:9,z:9}),{blocked:false,gate:null});
});

test('every area can still be reached from every other through the gates',()=>{
  const seen=new Set(['town']),queue=['town'];
  while(queue.length){
    const id=queue.shift();
    for(const gate of gates)if(gate.areas.includes(id))for(const next of gate.areas)
      if(!seen.has(next)){seen.add(next);queue.push(next);}
  }
  assert.deepEqual([...seen].sort(),[...WOLFVEIL_AREA_IDS].sort());
});

function makeWorld(){
  const scene=new THREE.Scene(),group=new THREE.Group();
  group.position.z=70;scene.add(group);scene.updateMatrixWorld(true);
  return {scene,group,meshes:[]};
}

test('gate visuals: one veil mesh, merged torii, membranes; world-coordinate collision',()=>{
  const world=makeWorld();
  const area=createWolfveilAreaGates(world,{labels:false,heightAt:wolfveilHeight});
  assert.equal(area.count,gates.length);
  assert.equal(area.root.userData.wolfveilAreaShared,true,'the area loader never manages it');
  const names=area.root.children.map(o=>o.name).sort();
  assert.deepEqual(names,['WV_SpiritVeil_AreaBorders','WV_ToriiGate_Membranes','WV_ToriiGates_glow',
    'WV_ToriiGates_ink','WV_ToriiGates_lacquer','WV_ToriiGates_stone']);
  for(const mesh of area.root.children)assert.equal(mesh.raycast.length,0,'decoration never raycasts');
  // Veil (world z = local z + 70).
  const blocked={x:-190.6,z:70};
  assert.equal(area.resolveCollision(blocked,{x:-189.5,z:70}),true);
  assert.ok(blocked.x>-190);
  const training=gates.find(g=>g.id.endsWith('training_forest'));
  const through={x:-190.6,z:training.z+70};
  assert.equal(area.resolveCollision(through,{x:-189.5,z:training.z+70}),false);
  // Posts are solid.
  const [post]=wolfveilAreaGatePosts(training);
  const bump={x:post[0]+.1,z:post[1]+70};
  assert.equal(area.resolveCollision(bump,{x:post[0]+.1,z:post[1]+70}),true);
  assert.ok(Math.hypot(bump.x-post[0],bump.z-70-post[1])>=training.postRadius+.62-1e-6);
  // Crossing mist rises in a gate; nothing elsewhere.
  assert.equal(area.update(1/60,{x:0,z:70},'town'),0);
  assert.ok(area.update(1/60,{x:training.x,z:training.z+70},'town')>.8);
  assert.ok(area.visibleIds().includes(training.id));
  // Disabled: open borders, nothing drawn.
  area.setEnabled(false);
  const open={x:-190.6,z:70};
  assert.equal(area.resolveCollision(open,{x:-189.5,z:70}),false);
  assert.equal(area.root.visible,false);
  assert.deepEqual(area.visibleIds(),[]);
  area.dispose();
  assert.equal(area.root.parent,null);
});

test('crossing mist: approach and flash drive one overlay, then clear',()=>{
  const made=[];
  const el=()=>{const e={style:{},dataset:{},setAttribute(){},remove(){e.removed=true;}};made.push(e);return e;};
  const container={style:{},append(...items){this.items=items;}};
  const mist=createWolfveilAreaCrossingMist(container,{doc:{createElement:el}});
  mist.setMist(.5);assert.equal(mist.element.style.opacity,'0.500');
  mist.setMist(0);mist.flash();assert.equal(mist.element.style.opacity,'0.900');
  for(let i=0;i<60;i++)mist.update(1/60);
  assert.equal(mist.element.style.opacity,'0.000');
  mist.dispose();assert.equal(made[0].removed,true);
});

test('the live world mounts the gates, veil collision for player and AI, and the mist',()=>{
  const world=source('src/components/game3d/GameWorld3D.jsx');
  // Each portal scene builds only its own area's gates and veils (63c3e582);
  // the veil walls are not drawn (the far side is cut away instead), and the
  // whole-world switch builds every gate.
  assert.match(world,/areaPortals=wolfveilVillage\?createWolfveilAreaGates\(wolfveilVillage\.world,\{area:areaScenes\?worldArea:null,veil:false\}\):null/);
  assert.doesNotMatch(world,/createWolfveilAreaPortals\(/);
  assert.match(world,/const resolveAreaVeils=\(position,from,radius\)=>/);
  assert.equal(world.match(/resolveAreaVeils\(/g).length,3,'player + two AI paths');
  assert.match(world,/dedicatedMode\|\|region!=='wolfveil'\|\|\s*wolfveilVillage\?\.caveSystem\?\.isActive\?\.\(\)/);
  assert.equal(world.match(/areaMist\?\.setMist\(areaPortals\?\.mist\?\?0\)/g).length,2);
  assert.match(world,/areaMist\?\.dispose\(\);\s*window\.removeEventListener\('game3dWorldRegionChange',onAreaMist\)/);
  // The light arches stay available as the one-line rollback.
  assert.ok(fs.existsSync(new URL('../src/components/game3d/wolfveil/WolfveilAreaPortals.js',import.meta.url)));
});
