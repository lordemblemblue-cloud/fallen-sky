import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createConduitArena} from '../src/components/duelist/client/maps/conduitArena.mjs';
import {crownSegmentClear,crownPadArcClear,crownCoverOverlap} from '../src/components/duelist/client/maps/conduitCrown.mjs';
test('assembled Crown changes only four intended collision records and adds matching batched markers',()=>{
  const prev=globalThis.document;
  const ctx=new Proxy({}, {get:(target,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):target[key]??(()=>{})});
  globalThis.document={createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,getContext:()=>ctx};}};
  let before,after;
  try{
    before=createConduitArena(new THREE.Scene(),{quality:'low',enableLights:false,enableCrownTactics:false});
    after=createConduitArena(new THREE.Scene(),{quality:'low',enableLights:false});
    const plan=after.crownTactics,isCover=o=>o.label?.startsWith('Crown Cover ');
    assert.equal(before.crownTactics,null);
    assert.equal(after.world.obbs.filter(isCover).length,4);
    assert.deepEqual(after.world.obbs.filter(o=>!isCover(o)),before.world.obbs.filter(o=>!isCover(o)));
    for(const key of ['ramps','discs','annuli','cylinders','shaftOpenings','jumpPads'])assert.deepEqual(after.world[key],before.world[key],key);
    assert.deepEqual(after.spawnCandidates,before.spawnCandidates);
    assert.deepEqual(after.pickups,before.pickups);
    assert.deepEqual([...after.navGraph.nodes],[...before.navGraph.nodes]);
    for(const b of plan.cover){
      const o=after.world.obbs.find(o=>o.label===b.label);
      for(const [actual,want] of [[o.cx,b.x],[o.cy,b.y],[o.cz,b.z],[o.hx,b.sx/2],[o.hy,b.sy/2],[o.hz,b.sz/2],[o.cos,Math.cos(b.rotY)],[o.sin,Math.sin(b.rotY)]])assert.ok(Math.abs(actual-want)<1e-7);
    }
    const count=arena=>{let n=0;arena.root.traverse(o=>{if(o.isInstancedMesh&&o.name==='CON_ReferenceDetailBatch')n+=o.count;});return n;};
    assert.equal(count(after)-count(before),88);
    const center=after.navGraph.nodes.get('crown_center').pos;
    for(const pad of after.world.jumpPads){
      const target={x:pad.targetX,y:pad.targetY,z:pad.targetZ};
      assert.ok(plan.cover.every(b=>!crownCoverOverlap(b,target,1.6)));
      assert.ok(crownSegmentClear(plan,target,center));
      for(const [dx,dz] of [[0,0],[.2,.2],[-.2,-.2]])assert.ok(crownPadArcClear(plan,{x:pad.x+dx,y:pad.y,z:pad.z+dz},target,after.config.gravity,after.config.jumpPadFlightTime));
    }
    const disc=after.world.discs.find(o=>o.label==='Central Crown Platform');
    assert.equal(disc.radius,9);assert.equal(disc.yMax,5);
  }finally{
    before?.dispose();after?.dispose();
    if(prev===undefined)delete globalThis.document;else globalThis.document=prev;
  }
});
