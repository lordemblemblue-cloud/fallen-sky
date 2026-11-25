import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createConduitArena} from '../src/components/duelist/client/maps/conduitArena.mjs';
import {snapshotConduitCollision,conduitSupport,conduitBlockers,moveConduitBody} from '../src/components/duelist/sim/conduitTraversal.mjs';
import {conduitBroadphaseStats} from '../src/components/duelist/sim/conduitBroadphase.mjs';
test('assembled arena indexed queries match full registry across all navigation anchors and nearby points',()=>{
  const prev=globalThis.document;
  const ctx=new Proxy({}, {get:(target,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):target[key]??(()=>{})});
  globalThis.document={createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,getContext:()=>ctx};}};
  let arena;
  try{
    arena=createConduitArena(new THREE.Scene(),{quality:'low',enableLights:false});
    const raw=arena.world,index=snapshotConduitCollision(raw);
    let total=0,candidates=0,queries=0;
    for(const n of arena.navGraph.nodes.values()){
      for(const [dx,dz] of [[0,0],[.4,0],[-.4,0],[0,.4],[0,-.4],[1,1],[-1,-1]]){
        const p={x:n.pos.x+dx,y:n.pos.y,z:n.pos.z+dz};
        assert.equal(conduitSupport(index,p.x,p.z,p.y+.41,p.y-.41,.4),conduitSupport(raw,p.x,p.z,p.y+.41,p.y-.41,.4),n.id);
        assert.deepEqual(conduitBlockers(index,p),conduitBlockers(raw,p),n.id);
        const s=conduitBroadphaseStats(index,p.x,p.z);total+=s.total;candidates+=s.candidates;queries++;
      }
    }
    for(const spawn of [...arena.spawnCandidates.red,...arena.spawnCandidates.blue]){
      const a={x:spawn.x,y:spawn.y,z:spawn.z},b={...a};
      for(let i=0;i<24;i++){
        const dx=Math.sin(i)*.12,dz=Math.cos(i)*.12,dy=i<6?.1:-.06;
        assert.deepEqual(moveConduitBody(index,b,dx,dz,dy),moveConduitBody(raw,a,dx,dz,dy));
        assert.deepEqual(a,b);
      }
    }
    console.log('CONDUIT_BROADPHASE_REPORT '+JSON.stringify({queries,total,candidates,reduction:1-candidates/total}));
    assert.ok(candidates<total*.25,'expected at least 75% fewer indexed candidate visits');
  }finally{arena?.dispose();if(prev===undefined)delete globalThis.document;else globalThis.document=prev;}
});
