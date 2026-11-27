import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { animationGrounded, createFighterAnimator } from '../src/components/duelist/client/animator.mjs';
import { createLocalSource } from '../src/components/duelist/client/localSource.mjs';
import { IMPORTED_CONTROL as map } from '../src/components/duelist/sim/importedControlLayout.mjs';

function makeAnimator(stance) {
  const model = new THREE.Group();
  const hips = new THREE.Bone(); hips.name='mixamorigHips'; model.add(hips);
  const pack={};
  for (const [name,height] of Object.entries({swordIdle:1,bladesIdle:1,staffIdle:1,walk:1,jog:1,sprint:1,jumpLoop:2,jumpLand:0.8})) {
    pack[name]=new THREE.AnimationClip(name,1,[new THREE.VectorKeyframeTrack('mixamorigHips.position',[0,.5,1],[0,height,0,0,height+.1,0,0,height,0])]);
  }
  return createFighterAnimator({model,clips:{pack},stance});
}

test('elevated surfaces and ramps count as grounded, but real takeoff and falls do not',()=>{
  for (const b of [{x:0,y:8,z:-105},{x:-114,y:4,z:90},{x:0,y:0,z:-105},{x:-108,y:2,z:85},{x:108,y:2,z:85}]) {
    assert.ok(animationGrounded(b,map),JSON.stringify(b));
    assert.equal(animationGrounded({...b,y:b.y+1},map),false);
    assert.equal(animationGrounded({...b,jumped:true,vy:5},map),false);
  }
  assert.equal(animationGrounded({x:0,y:0,z:0}),true);
  assert.equal(animationGrounded({x:0,y:1,z:0}),false);
  assert.equal(animationGrounded({x:40,y:-1,z:50},map),false);
});

for (const [classId,stance] of [['warrior','sword'],['duelist','dualBlades'],['assassin','staff'],['healer','sword']]) {
  test(classId+' animator keeps locomotion on stairs, rooftops and bridges and plays actual jump/landing',()=>{
    const source=createLocalSource({mode:'control',testMode:true,classId});
    source.match.phase='live';
    const body=source.world.bodies.get('you'),fighter=source.world.fighters.get('you');
    const anim=makeAnimator(stance);let now=0;
    const tick=(frames)=>{for(let i=0;i<frames;i++)anim.update(1/60,{fighter,body,now:now+=1/60,arenaLayout:map});};
    try {
      Object.assign(body,{x:-108,y:2,z:85,speed:4.6,vy:0,jumped:false});
      tick(30);assert.equal(anim.current(),null,'stair traversal');
      Object.assign(body,{x:-114,y:4,z:90,speed:0});
      tick(30);assert.equal(anim.current(),null,'rooftop idle');
      Object.assign(body,{x:0,y:8,z:-50,speed:4.6});
      tick(30);assert.equal(anim.current(),null,'bridge movement');
      Object.assign(body,{x:0,y:9,z:-50,jumped:true,vy:2});
      tick(30);assert.equal(anim.current(),'jumpLoop','real jump at altitude');
      Object.assign(body,{y:8,jumped:false,vy:0});
      tick(9);assert.equal(anim.current(),'jumpLand','real elevated landing');
      tick(30);assert.equal(anim.current(),null,'return to locomotion');
    }finally{anim.dispose();}
  });
}
