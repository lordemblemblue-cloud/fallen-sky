import {test} from 'node:test';
import assert from 'node:assert/strict';
import {snapshotConduitCollision,conduitSupport,conduitBlockers,moveConduitBody} from '../src/components/duelist/sim/conduitTraversal.mjs';
import {conduitCandidates,conduitBroadphaseStats} from '../src/components/duelist/sim/conduitBroadphase.mjs';
const registry=()=>({obbs:[],ramps:[],cylinders:[],discs:[],annuli:[],shaftOpenings:[],jumpPads:[]});
const box=(x,z,i)=>({cx:x,cy:-4,cz:z,hx:.5,hy:1,hz:1.7,cos:Math.cos(i),sin:Math.sin(i),walkable:true,label:'box'+i});
function compare(raw,indexed,p,r){
  assert.equal(conduitSupport(indexed,p.x,p.z,p.y+.41,p.y-.41,r),conduitSupport(raw,p.x,p.z,p.y+.41,p.y-.41,r));
  assert.deepEqual(conduitBlockers(indexed,p,r),conduitBlockers(raw,p,r));
}
test('indexed results equal full scan at cell seams, rotations, varied height and radii',()=>{
  const raw=registry();
  for(let i=0;i<300;i++)raw.obbs.push(box((i%20)*4-40,Math.floor(i/20)*4-28,i*.77));
  raw.ramps.push({cx:0,cz:0,width:2,length:6,cos:Math.cos(.6),sin:Math.sin(.6),yStart:-5,yEnd:-2,hasUnderside:true,thickness:.36,label:'ramp'});
  raw.cylinders.push({cx:4,cz:0,radius:1.1,yMin:-5,yMax:-3,label:'station'});
  raw.discs.push({cx:0,cz:0,radius:45,yMin:-5.5,yMax:-5,walkable:true,cutouts:[]});
  const indexed=snapshotConduitCollision(raw);
  let candidates=0,total=0;
  for(let i=0;i<2400;i++){
    const p={x:Math.sin(i*12.9898)*44,z:Math.cos(i*7.41)*32,y:[-5,-4,-3,0,5][i%5]},r=[0,.4,.55,1,1.5][i%5];
    compare(raw,indexed,p,r);
    const n=conduitBroadphaseStats(indexed,p.x,p.z,.4);candidates+=n.candidates;total+=n.total;
  }
  for(const x of [-8,-4,-.000001,0,.000001,4,8])for(const z of [-4,0,4])for(const r of [0,.4,1,2])compare(raw,indexed,{x,y:-5,z},r);
  assert.ok(candidates<total*.1);
  assert.equal(conduitCandidates(indexed,'obbs',0,0,2).length,raw.obbs.length);
  assert.equal(conduitBroadphaseStats(raw,0,0).indexed,false);
  raw.obbs.push(box(0,0,999));assert.equal(raw.obbs.length,indexed.obbs.length+1);
});
test('oversized bounds use full-scan fallback; swept movement remains exact',()=>{
  const raw=registry();
  raw.obbs.push({...box(0,0,0),hx:1000,hz:1000,cy:-5.25,hy:.25});
  const fallback=snapshotConduitCollision(raw);
  assert.equal(conduitCandidates(fallback,'obbs',0,0).length,1);
  compare(raw,fallback,{x:999,y:-5,z:999},.4);
  const w=registry();
  w.discs.push({cx:0,cz:0,radius:15,yMin:-5.5,yMax:-5,walkable:true});
  w.obbs.push({...box(2,0,0),walkable:false});
  const index=snapshotConduitCollision(w),a={x:0,y:-5,z:0},b={...a};
  for(let i=0;i<120;i++){
    const dx=.12,dz=Math.sin(i*.2)*.1,dy=i%20<6?.1:-.06;
    assert.deepEqual(moveConduitBody(index,b,dx,dz,dy),moveConduitBody(w,a,dx,dz,dy));
    assert.deepEqual(b,a);
  }
});
