import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createConduitArena} from '../src/components/duelist/client/maps/conduitArena.mjs';
import {buildConduitMinimap} from '../src/components/duelist/client/maps/conduitMinimap.mjs';
test('assembled Conduit minimap derives all six pickups, four pads and stair flights without mutating arena',()=>{
  const prev=globalThis.document;
  const ctx=new Proxy({}, {get:(target,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):target[key]??(()=>{})});
  globalThis.document={createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,getContext:()=>ctx};}};
  let arena;
  try{
    arena=createConduitArena(new THREE.Scene(),{quality:'low',enableLights:false});
    const before=JSON.stringify(arena.world),m=buildConduitMinimap(arena);
    assert.equal(m.radius,44.8);
    assert.equal(m.levels.T0.pickups.length,1);
    assert.equal(m.levels.T1.pickups.length,4);
    assert.equal(m.levels.T2.pickups.length,1);
    assert.equal(m.levels.T2.pads.length,4);
    assert.equal(m.levels.T0.pads.length+m.levels.T1.pads.length,0);
    for(const layer of Object.values(m.levels)){
      assert.equal(layer.buildings.length,4);
      assert.ok(layer.floors.length>0);
      assert.ok(layer.floors.every(f=>!f.path.includes('NaN')&&!f.path.includes('undefined')));
      assert.equal(layer.vents.length,0);
    }
    assert.equal(m.levels.T0.stairs.filter(s=>s.kind==='stair').length,12);
    assert.equal(m.levels.T1.stairs.filter(s=>s.kind==='stair').length,20);
    assert.equal(m.levels.T2.stairs.filter(s=>s.kind==='stair').length,8);
    assert.equal(JSON.stringify(arena.world),before);
  }finally{arena?.dispose();if(prev===undefined)delete globalThis.document;else globalThis.document=prev;}
});
