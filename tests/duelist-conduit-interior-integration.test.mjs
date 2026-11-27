import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createConduitArena} from '../src/components/duelist/client/maps/conduitArena.mjs';
import {createConduitInteriorPlan} from '../src/components/duelist/client/maps/conduitInteriorDetails.mjs';

test('assembled interior details use actual solid backing and preserve all existing collision and navigation records',()=>{
  const prev=globalThis.document;
  const ctx=new Proxy({}, {get:(target,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):target[key]??(()=>{})});
  globalThis.document={createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,getContext:()=>ctx};}};
  let before,after;
  try{
    before=createConduitArena(new THREE.Scene(),{quality:'low',enableLights:false,enableInteriorDetails:false});
    after=createConduitArena(new THREE.Scene(),{quality:'low',enableLights:false});
    assert.equal(before.interiorDetails.length,0);
    assert.equal(after.interiorDetails.length,4);
    assert.equal(after.interiorDetails.reduce((sum,p)=>sum+p.instances,0),262);
    for(const key of ['obbs','ramps','discs','annuli','cylinders','shaftOpenings','jumpPads'])assert.deepEqual(after.world[key],before.world[key],key);
    assert.deepEqual(after.spawnCandidates,before.spawnCandidates);
    assert.deepEqual(after.pickups,before.pickups);
    assert.deepEqual([...after.navGraph.nodes],[...before.navGraph.nodes]);
    const count=arena=>{let n=0;arena.root.traverse(o=>{if(o.isInstancedMesh&&o.name==='CON_ReferenceDetailBatch')n+=o.count;});return n;};
    assert.equal(count(after)-count(before),262);
    for(const b of after.config.buildings){
      const plan=createConduitInteriorPlan(b.id),sin=Math.sin(b.angle),cos=Math.cos(b.angle);
      for(const a of plan.anchors){
        // Probe all four corners just inside the declared original face.
        // Building-local transforms match the actual map constructor.
        for(const du of [-a.w/2,a.w/2])for(const dv of [-a.h/2,a.h/2]){
          const normal=a.plane-a.sign*.015;
          const lx=a.axis==='z'?a.u+du:normal,lz=a.axis==='z'?normal:a.u+du;
          const x=sin*38+lx*cos+lz*sin,z=cos*38-lx*sin+lz*cos;
          const y=(a.level==='T0'?-5:.65)+a.v+dv;
          const backed=after.world.obbs.some(o=>{
            if(!o.label?.includes(a.backing))return false;
            const dx=x-o.cx,dz=z-o.cz,u=dx*o.cos-dz*o.sin,v=dx*o.sin+dz*o.cos;
            return Math.abs(u)<=o.hx+1e-6&&Math.abs(v)<=o.hz+1e-6&&Math.abs(y-o.cy)<=o.hy+1e-6;
          });
          assert.ok(backed,b.id+' '+a.key+' has no existing backing at '+du+','+dv);
        }
      }
    }
  }finally{
    before?.dispose();after?.dispose();
    if(prev===undefined)delete globalThis.document;else globalThis.document=prev;
  }
});
