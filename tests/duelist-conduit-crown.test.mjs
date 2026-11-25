import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createConduitCrownPlan,crownCoverOverlap,crownSegmentClear,crownPadArcClear} from '../src/components/duelist/client/maps/conduitCrown.mjs';
const cfg={yCrown:5,crownRadius:9,crownLandingR:6.5,cardinals:[0,Math.PI/2,Math.PI,3*Math.PI/2],buildings:[-3*Math.PI/4,3*Math.PI/4,-Math.PI/4,Math.PI/4].map((angle,i)=>({id:String(i),angle,pad:[Math.sin(angle)*29.4,5,Math.cos(angle)*29.4]}))};
const plan=createConduitCrownPlan(cfg);
test('four rotationally equivalent cover pieces and 88 details stay inside Crown footprint',()=>{
  assert.equal(plan.cover.length,4);assert.equal(plan.details.length,88);
  for(const b of [...plan.cover,...plan.details])for(const x of [-b.sx/2,b.sx/2])for(const z of [-b.sz/2,b.sz/2]){
    const wx=b.x+x*Math.cos(b.rotY)+z*Math.sin(b.rotY),wz=b.z-x*Math.sin(b.rotY)+z*Math.cos(b.rotY);
    assert.ok(Math.hypot(wx,wz)<=9);
  }
  assert.equal(new Set(plan.cover.map(b=>b.label)).size,4);
});
test('all four landing envelopes and paths to pickup and existing navigation anchor are clear',()=>{
  for(const p of plan.landings){
    assert.ok(Math.hypot(p.x,p.z)+p.radius+.4<=9);
    assert.ok(plan.cover.every(b=>!crownCoverOverlap(b,p,p.radius+.4)));
    for(const dest of [{x:0,y:5,z:0},{x:0,y:5,z:2}]){
      assert.ok(crownSegmentClear(plan,p,dest));assert.ok(crownSegmentClear(plan,dest,p));
    }
  }
});
test('twelve idealized pad trajectories avoid new cover; four cardinal edge approaches remain clear',()=>{
  for(const b of cfg.buildings){
    const p=plan.landings.find(l=>l.id===b.id);
    for(const [dx,dz] of [[0,0],[.2,.2],[-.2,-.2]])assert.ok(crownPadArcClear(plan,{x:b.pad[0]+dx,y:5,z:b.pad[2]+dz},p));
  }
  for(const exit of plan.exits)assert.ok(crownSegmentClear(plan,{x:0,y:5,z:0},exit));
});
