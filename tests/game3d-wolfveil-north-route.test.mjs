// The foot route north from the town plaza (story mode, 2026-11-22): the main
// road climbs to the Luna palace site, whose authored house is not in this
// build (lakesideManor sources), so its footprint is an empty, invisible box.
// Its back wall (local z 131.5 = world z 201.5) had no opening: a straight,
// invisible dead end on the road to the Wolf Sanctuary and the Ridge Path
// gate. The back wall now has the same opening as the south door, on the
// road axis, on the client and in the server's map collision.
import test from 'node:test';
import assert from 'node:assert/strict';
import {WOLFVEIL_PALACE,palaceWallCrosses}
  from '../src/components/game3d/wolfveil/WolfveilPalaceLayout.mjs';
import {createWolfveilMapCollision} from '../server/game3d/mapCollision.mjs';
import {resolveWolfveilAreaVeilMovement,wolfveilAreaGates}
  from '../src/components/game3d/wolfveil/streaming/WolfveilAreaVeils.mjs';
import {wolfveilGateTravel} from '../src/components/game3d/wolfveil/streaming/WolfveilGateTravel.mjs';
import {buildLakesideManorWorld} from '../src/components/dashboard/lakesideManor/buildLakesideManor.js';

const W=z=>z+70; // local -> world z
const back=WOLFVEIL_PALACE.z+WOLFVEIL_PALACE.depth/2;
const front=WOLFVEIL_PALACE.z-WOLFVEIL_PALACE.depth/2;
const ON_FOOT=.62,MOUNTED=.9;

test('the palace is an empty footprint in this build, and its back wall is at world z 201.5',()=>{
  assert.throws(()=>buildLakesideManorWorld(),/not available in this build/);
  assert.equal(back,131.5);
  assert.equal(W(back),201.5,'the "straight barrier at 201.5" the story session met');
});

test('walking or riding along the road passes the palace through both doors; its walls still hold',()=>{
  for(const radius of [ON_FOOT,MOUNTED]){
    const step=(x,z0,z1)=>palaceWallCrosses({x,z:W(z0)},{x,z:W(z1)},radius);
    // North out through the back opening and back in, on the road axis.
    assert.equal(step(0,back-.4,back+.4),false,'north opening, radius '+radius);
    assert.equal(step(1.5,back+.4,back-.4),false,'north opening inwards');
    // The south door is unchanged.
    assert.equal(step(0,front-.4,front+.4),false,'south door');
    // Off the road the walls hold, front and back.
    for(const x of [-20,-10,10,20]){
      assert.equal(step(x,back-.4,back+.4),true,'back wall at x '+x);
      assert.equal(step(x,front-.4,front+.4),true,'front wall at x '+x);
    }
    // The side walls are unchanged.
    const side=WOLFVEIL_PALACE.x+WOLFVEIL_PALACE.width/2;
    assert.equal(palaceWallCrosses({x:side-.4,z:W(115)},{x:side+.4,z:W(115)},radius),true);
  }
});

test('the server map collision lets a walker out of the palace site to the north, and nowhere else',()=>{
  const map=createWolfveilMapCollision(),origin={x:0,z:0};
  const walk=(from,to)=>{
    let at={x:from[0],z:W(from[1])};const goal={x:to[0],z:W(to[1])};
    for(let i=0;i<600;i++){
      const d=Math.hypot(goal.x-at.x,goal.z-at.z);if(d<.3)return {ok:true,at};
      const s=Math.min(.5,d),next=map.move(at,{x:at.x+(goal.x-at.x)/d*s,z:at.z+(goal.z-at.z)/d*s},origin);
      if(Math.hypot(next.x-at.x,next.z-at.z)<1e-4)return {ok:false,at};
      at=next;
    }
    return {ok:false,at};
  };
  assert.equal(walk([0,110],[0,140]).ok,true,'out through the north opening');
  const blocked=walk([12,110],[12,140]);
  assert.equal(blocked.ok,false,'the back wall still holds off the road');
  assert.ok(blocked.at.z-70<back,'stopped inside the footprint');
});

test('from the palace site the road reaches the Ridge Path gate, and the gate takes the walker north',()=>{
  // Client rules on the way: the palace walls and the area veils (border at z 240).
  const road=[[0,110],[0,136],[2,175],[-6,215],[-22,236],[-22.5,239.2]];
  for(const radius of [ON_FOOT,MOUNTED]){
    let at={x:road[0][0],z:W(road[0][1])};
    for(const [x,z] of road.slice(1)){
      const goal={x,z:W(z)};
      for(let i=0;i<400;i++){
        const d=Math.hypot(goal.x-at.x,goal.z-at.z);if(d<.05)break;
        const s=Math.min(.4,d),next={x:at.x+(goal.x-at.x)/d*s,z:at.z+(goal.z-at.z)/d*s};
        assert.equal(palaceWallCrosses(at,next,radius),false,`palace wall at ${next.x.toFixed(1)},${(next.z-70).toFixed(1)}`);
        const local={x:next.x,z:next.z-70};
        assert.equal(resolveWolfveilAreaVeilMovement(local,{x:at.x,z:at.z-70}).blocked,false,'veil');
        at=next;
      }
    }
    // Into the Ridge Path gate's opening: travel to the north area.
    const gate=wolfveilAreaGates().find(g=>g.id==='town_north_ridge_path');
    const into={x:gate.x+gate.facing[0]*.6,z:W(gate.z+gate.facing[1]*.6)};
    const pass=wolfveilGateTravel(at,into,{area:'town'});
    assert.equal(pass?.to,'north','radius '+radius);
  }
});
