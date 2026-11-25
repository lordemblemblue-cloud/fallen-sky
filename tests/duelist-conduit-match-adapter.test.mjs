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
    // Both modes use exactly the same geometry but separate spawn policies.
    const tdm=createConduitMatchAdapter(m,{mode:'tdm'});
    const entrants=[];
    for(const team of ['blue','red'])for(let i=0;i<4;i++){
      const p=tdm.reserveSpawn(team+i,team);
      assert.ok(p,team+' '+i+' lacks safe spawn');
      assert.equal(p.team,team);assert.ok(team==='blue'?p.z<0:p.z>0);
      assert.ok(Number.isFinite(p.yaw));entrants.push(p);
    }
    assert.equal(new Set(entrants.map(p=>p.id)).size,8);
    assert.equal(tdm.reserveSpawn('blue0','red'),null);
    assert.equal(tdm.reserveSpawn('unknown',null),null);
    assert.equal(tdm.reserveSpawn('blocked','blue',{occupants:tdm.modeSpawnCandidates.blue}),null);
    const samples=[0,.99,.21,.75,.42,.63];
    let counter=0;
    const ffa=createConduitMatchAdapter(m,{mode:'ffa',random:()=>samples[counter++%samples.length]});
    assert.deepEqual(ffa.world,tdm.world);
    assert.equal(ffa.reserveSpawn('team','red'),null);
    const solo=[];
    for(let i=0;i<6;i++){
      const p=ffa.reserveSpawn('solo'+i,null,{occupants:solo,enemies:solo});
      assert.ok(p,'FFA player '+i+' lacks safe spawn');
      assert.equal(p.team,null);
      assert.ok(solo.every(q=>Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z)>=4));
      solo.push(p);
    }
    assert.equal(new Set(solo.map(p=>p.id)).size,6);
    assert.ok(solo.some(p=>p.z<0)&&solo.some(p=>p.z>0));
    assert.equal(ffa.reserveSpawn('blocked',null,{occupants:ffa.modeSpawnCandidates}),null);
    assert.equal(ffa.releaseSpawn('solo0'),true);
    const lowRandom=createConduitMatchAdapter(m,{mode:'ffa',random:()=>0});
    const highRandom=createConduitMatchAdapter(m,{mode:'ffa',random:()=>.999});
    assert.notEqual(lowRandom.reserveSpawn('p').id,highRandom.reserveSpawn('p').id);
    const previous=lowRandom.reserveSpawn('p');lowRandom.releaseSpawn('p');
    assert.notEqual(lowRandom.reserveSpawn('p',null,{recentIds:[previous.id]}).id,previous.id);
    assert.throws(()=>createConduitMatchAdapter(m,{mode:'ffa'}),TypeError);
    assert.throws(()=>createConduitMatchAdapter(m,{mode:'duel'}),TypeError);
    assert.equal(host.pickups.length,6);
    assert.ok(host.pickups.every(p=>host.pickupPositionClear(p.id)));
    assert.throws(()=>createConduitMatchAdapter({...m,version:2}),TypeError);
  }finally{a?.dispose();b?.dispose();if(prev===undefined)delete globalThis.document;else globalThis.document=prev;}
});
