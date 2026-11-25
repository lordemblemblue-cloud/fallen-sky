import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createConduitArena} from '../src/components/duelist/client/maps/conduitArena.mjs';
import {auditConduitPlacement} from '../src/components/duelist/sim/conduitPlacement.mjs';
test('assembled map audits all 32 spawn candidates and six pickup positions',()=>{
  const prev=globalThis.document;
  const ctx=new Proxy({}, {get:(target,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):target[key]??(()=>{})});
  globalThis.document={createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,getContext:()=>ctx};}};
  let arena;
  try{
    arena=createConduitArena(new THREE.Scene(),{quality:'low',enableLights:false});
    assert.equal(arena.spawnPlacement.length,32);
    assert.equal(arena.pickupPlacement.length,6);
    console.log('CONDUIT_PLACEMENT_REPORT '+JSON.stringify({spawns:arena.spawnPlacement,pickups:arena.pickupPlacement}));
    assert.ok(arena.pickupPlacement.every(p=>p.ok),JSON.stringify(arena.pickupPlacement.filter(p=>!p.ok)));
    for(const p of arena.pickupPlacement){
      const [x,y,z]=p.position;
      assert.equal(y,p.original[1]);
      assert.ok(Math.hypot(x-p.original[0],z-p.original[2])<=3.01);
      assert.ok(auditConduitPlacement(arena.world,{x,y,z},{radius:.55,height:1.8}).ok,p.id);
      assert.deepEqual(arena.pickups.find(v=>v.id===p.id).position,p.position);
    }
    assert.deepEqual(arena.pickups.map(p=>p.respawn),[35,45,30,45,90,90]);
    assert.notDeepEqual(arena.pickups.find(p=>p.id==='t0_core').position,[0,-5,0]);
    for(const team of ['blue','red']){
      const reserved=[];
      for(let i=0;i<4;i++){
        const next=arena.selectTDMSpawn(team,[],[],{reserved});
        assert.ok(next,team+' has no safe candidate for '+i);
        assert.ok(auditConduitPlacement(arena.world,next).ok);
        assert.ok(!reserved.some(r=>r.id===next.id));
        reserved.push(next);
      }
    }
    assert.equal(arena.selectTDMSpawn('invalid'),null);
  }finally{arena?.dispose();if(prev===undefined)delete globalThis.document;else globalThis.document=prev;}
});
