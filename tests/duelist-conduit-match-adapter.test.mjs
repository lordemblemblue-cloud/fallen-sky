import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createConduitArena} from '../src/components/duelist/client/maps/conduitArena.mjs';
import {buildConduitMatchManifest,createConduitMatchAdapter} from '../src/components/duelist/sim/conduitMatchAdapter.mjs';

test('independent host and prediction adapters share exact serialized map and negative elevation movement',()=>{
  const prev=globalThis.document;
  const ctx=new Proxy({}, {get:(target,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):target[key]??(()=>{})});
  globalThis.document={createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,getContext:()=>ctx};}};
  let a,b;
  try{
    a=createConduitArena(new THREE.Scene(),{quality:'low',enableLights:false});
    b=createConduitArena(new THREE.Scene(),{quality:'high',enableLights:true});
    const m=buildConduitMatchManifest(a),serialized=JSON.stringify(m);
    assert.equal(serialized,JSON.stringify(buildConduitMatchManifest(b)));
    const host=createConduitMatchAdapter(JSON.parse(serialized)),client=createConduitMatchAdapter(JSON.parse(serialized));
    assert.deepEqual(host.world,client.world);
    assert.ok(Object.isFrozen(host.world.obbs));
    const spawn=host.reserveSpawn('one','blue');assert.ok(spawn);
    const next=host.reserveSpawn('two','blue');assert.ok(next);assert.notEqual(next.id,spawn.id);
    assert.equal(host.reserveSpawn('one','blue'),spawn);assert.equal(host.releaseSpawn('one'),true);
    assert.equal(host.reserveSpawn('invalid','unknown'),null);
    const under=a.navGraph.nodes.get('t0_center').pos;
    const first={x:under.x,y:under.y,z:under.z},second={...first};
    for(let i=0;i<10;i++){
      assert.deepEqual(host.move(first,0,.04,-.06),client.move(second,0,.04,-.06));
      assert.deepEqual(first,second);
    }
    assert.equal(first.y,-5);assert.equal(host.grounded(first),true);
    for(const p of host.world.jumpPads){
      assert.equal(host.launch(p,false),null);
      assert.deepEqual(host.launch(p,true),client.launch(p,true));
      assert.equal(host.launch(p,true).id,p.id);
    }
    assert.equal(host.pickups.length,6);
    assert.ok(host.pickups.every(p=>host.pickupPositionClear(p.id)));
    assert.throws(()=>createConduitMatchAdapter({...m,version:2}),TypeError);
  }finally{a?.dispose();b?.dispose();if(prev===undefined)delete globalThis.document;else globalThis.document=prev;}
});
