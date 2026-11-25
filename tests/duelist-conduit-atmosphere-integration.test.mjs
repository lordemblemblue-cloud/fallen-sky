import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createConduitArena,CONDUIT_CONFIG} from '../src/components/duelist/client/maps/conduitArena.mjs';
import {createConduitAtmosphere} from '../src/components/duelist/client/maps/conduitAtmosphere.mjs';

test('quality budgets, throttling, visibility and resource ownership with real Three.js',()=>{
  for(const [quality,pulses,steam,hz] of [['low',8,0,12],['medium',12,16,20],['high',16,32,30]]){
    const root=new THREE.Group(),up=new THREE.Group(),down=new THREE.Group();root.add(up,down);
    const material=new THREE.MeshStandardMaterial();
    let borrowedDisposals=0;material.addEventListener('dispose',()=>borrowedDisposals++);
    const fx=createConduitAtmosphere(root,up,down,THREE,{brushedSteel:material,gunmetal:material,cyanGlow:material},CONDUIT_CONFIG,{quality});
    try{
      assert.equal(fx.meshes.length,steam?6:5);
      assert.equal(fx.meshes.find(m=>m.name.includes('Indicators')).count,pulses);
      assert.equal(fx.meshes.find(m=>m.name.includes('Steam'))?.count??0,steam);
      assert.ok(fx.meshes.every(m=>m.isInstancedMesh&&!m.castShadow));
      const blade=fx.meshes.find(m=>m.name.includes('Blades'));
      const matrix=()=>{const m=new THREE.Matrix4();blade.getMatrixAt(0,m);return m.toArray();};
      const original=matrix();
      assert.equal(fx.update(0),true);assert.equal(fx.update(.5/hz),false);
      assert.equal(fx.update(1),true);assert.notDeepEqual(matrix(),original);
      assert.equal(fx.update(1),false);assert.equal(fx.update(NaN),false);
      fx.setEnabled(false);assert.ok(fx.groups.every(g=>!g.visible));assert.equal(fx.update(2),false);
      fx.setEnabled(true);assert.ok(fx.groups.every(g=>g.visible));assert.equal(fx.update(2),true);
    }finally{
      fx.dispose();fx.dispose();
      assert.ok(fx.groups.every(g=>g.parent===null));
      assert.equal(fx.update(3),false);assert.equal(borrowedDisposals,0);material.dispose();
    }
  }
});
test('assembled atmosphere preserves all collision, navigation and gameplay records',()=>{
  const prev=globalThis.document;
  const ctx=new Proxy({}, {get:(target,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):target[key]??(()=>{})});
  globalThis.document={createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,getContext:()=>ctx};}};
  let before,after;
  try{
    before=createConduitArena(new THREE.Scene(),{quality:'low',enableLights:false,enableAtmosphere:false});
    after=createConduitArena(new THREE.Scene(),{quality:'low',enableLights:false});
    assert.equal(before.atmosphere,null);assert.equal(after.atmosphere.budget.steam,0);
    for(const key of ['obbs','ramps','discs','annuli','cylinders','shaftOpenings','jumpPads'])assert.deepEqual(after.world[key],before.world[key],key);
    assert.deepEqual(after.spawnCandidates,before.spawnCandidates);
    assert.deepEqual(after.pickups,before.pickups);
    assert.deepEqual([...after.navGraph.nodes],[...before.navGraph.nodes]);
    after.updateVisuals(1);after.updateVisuals(1.01);after.updateVisuals(2);
    assert.equal(after.atmosphere.groups[0].parent,after.upperGroup);
    assert.equal(after.atmosphere.groups[1].parent,after.t0Group);
    after.dispose();assert.equal(after.atmosphere.enabled,false);
  }finally{before?.dispose();after?.dispose();if(prev===undefined)delete globalThis.document;else globalThis.document=prev;}
});
