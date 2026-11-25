import {test} from 'node:test';
import assert from 'node:assert/strict';
import {snapshotConduitCollision,conduitSupport,conduitBlockers,conduitGrounded,moveConduitBody,auditConduitSpawn,probeConduitWalk,probeConduitPad} from '../src/components/duelist/sim/conduitTraversal.mjs';

const registry=(parts={})=>snapshotConduitCollision({obbs:[],ramps:[],cylinders:[],discs:[],annuli:[],shaftOpenings:[],jumpPads:[],...parts});
const disc=(y,radius=10,cutouts=[])=>({cx:0,cz:0,radius,yMin:y-.5,yMax:y,walkable:true,cutouts});
const box=(cx,cy,cz,hx,hy,hz,label='wall',walkable=false)=>({cx,cy,cz,hx,hy,hz,cos:1,sin:0,label,walkable});

test('negative elevation, real floor cutout and high-speed landing',()=>{
  const w=registry({discs:[disc(-5),disc(0,10,[{cx:2,cz:0,hx:1,hz:1,cos:1,sin:0}])]});
  assert.equal(conduitSupport(w,0,0,1),0);
  assert.equal(conduitSupport(w,2,0,1),-5);
  const b={x:2,y:1,z:0};
  const result=moveConduitBody(w,b,0,0,-10);
  assert.equal(b.y,-5);assert.equal(result.landed,true);
  assert.equal(conduitGrounded(w,b),true);
  assert.equal(conduitGrounded(w,{x:20,y:-5,z:0}),false);
  assert.equal(auditConduitSpawn(w,{id:'floating',x:2,y:0,z:0}).ok,false);
});
test('basement ceiling cannot be crossed by a jump; wall blocks lateral sprint',()=>{
  const w=registry({discs:[disc(-5),disc(0)],obbs:[box(2,-3,0,.25,2,2)]});
  const b={x:0,y:-5,z:0};
  assert.equal(moveConduitBody(w,b,0,0,8).ceiling,true);
  assert.ok(b.y<=-2.3+1e-4);
  const walker={x:0,y:-5,z:0};
  assert.equal(moveConduitBody(w,walker,6,0,0).hit,true);
  assert.ok(walker.x<1.4);
  assert.equal(conduitBlockers(w,walker).length,0);
});
test('ramp support changes height in both directions without teleporting',()=>{
  const w=registry({ramps:[{cx:0,cz:0,width:3,length:10,yStart:-5,yEnd:0,cos:1,sin:0,hasUnderside:true,thickness:.3}]});
  const low={x:0,y:-5,z:-5},high={x:0,y:0,z:5};
  assert.equal(probeConduitWalk(w,low,high).ok,true);
  assert.equal(probeConduitWalk(w,high,low).ok,true);
});
test('four idealized jump pads land on same-height center from multiple offsets',()=>{
  const w=registry({discs:[disc(5,9)],annuli:[{rMin:27,rMax:32,yMin:4.5,yMax:5,walkable:true}]});
  for(let i=0;i<4;i++){
    const a=i*Math.PI/2,pad={x:29*Math.sin(a),y:5,z:29*Math.cos(a),targetX:6.5*Math.sin(a),targetY:5,targetZ:6.5*Math.cos(a),triggerRadius:1.05};
    for(const [offsetX,offsetZ] of [[0,0],[.2,.2],[-.2,-.2]])assert.equal(probeConduitPad(w,pad,{offsetX,offsetZ}).ok,true);
  }
});
test('registry snapshots are deeply immutable and independent of original data',()=>{
  const src={obbs:[],ramps:[],cylinders:[],discs:[disc(-5)],annuli:[],shaftOpenings:[],jumpPads:[]};
  const w=snapshotConduitCollision(src);src.discs[0].yMax=0;
  assert.equal(w.discs[0].yMax,-5);assert.equal(Object.isFrozen(w.discs[0]),true);
  assert.throws(()=>moveConduitBody(w,{x:0,y:0,z:0},NaN,0,0),TypeError);
});
