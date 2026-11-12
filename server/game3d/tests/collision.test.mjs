import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceDuelBody, separateDuelBodies, DUEL_BODY_RADIUS } from '../arenaCollision.mjs';
import { createGame3DDuelMatch, MATCH_RULES } from '../authority.mjs';

test('arena limits circle, not a square corner; body radius remains inside',()=>{
  const p=advanceDuelBody({x:90,z:90},20,20,100);
  assert.ok(Math.abs(Math.hypot(p.x,p.z)-(100-DUEL_BODY_RADIUS))<1e-6);
});

test('two colliding players separate without leaving the arena',()=>{
  for(const [a,b] of [
    [{x:0,z:0},{x:0,z:0}],
    [{x:1,z:0},{x:1.2,z:0}],
    [{x:99.4,z:0},{x:99.4,z:0}],
  ]){
    const [left,right]=separateDuelBodies(a,b);
    assert.ok(Math.hypot(left.x-right.x,left.z-right.z)>=2*DUEL_BODY_RADIUS-1e-5);
    assert.ok(Math.hypot(left.x,left.z)<=100-DUEL_BODY_RADIUS+1e-6);
    assert.ok(Math.hypot(right.x,right.z)<=100-DUEL_BODY_RADIUS+1e-6);
  }
});

test('movement expires if the sender goes silent and signed world origin persists',()=>{
  let time=1000;
  const duel=createGame3DDuelMatch({
    id:'arena-33',challengerId:'p1',opponentId:'p2',
    challengerStats:{maxHP:100},opponentStats:{maxHP:100},
    challengerSpawn:{x:0,z:0},opponentSpawn:{x:3,z:0},
    checkpoint:{worldOrigin:{x:142,z:280},state:null},
    now:()=>time,resolveStrike:()=>({damage:0}),
  });
  duel.setConnected('p1',true);duel.setConnected('p2',true);
  assert.equal(duel.setInput('p1',{seq:1,x:0,z:1,facing:0}).ok,true);
  time+=50;duel.tick(time);
  const moved=duel.get('p1').position.z;
  assert.ok(moved>0);
  time+=MATCH_RULES.inputHoldMs+100;duel.tick(time);
  const paused=duel.get('p1').position.z;
  time+=100;duel.tick(time);
  assert.equal(duel.get('p1').position.z,paused);
  assert.deepEqual(duel.snapshot().worldOrigin,{x:142,z:280});
  assert.equal(duel.checkpointState().actors.length,2);
});
