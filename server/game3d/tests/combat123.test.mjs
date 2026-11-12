import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DDuelMatch} from '../authority.mjs';
import {
  assessGame3DServerWorldStrike123,
  WORLD_STRIKE_MAX_VERTICAL_123,
} from '../serverWorldStrike123.mjs';

const C='challenger',O='opponent';
const origin={x:0,z:0};
const createMap=(config={})=>({
  id:'test-height-map',fingerprint:'abc'.repeat(21)+'a',
  valid:()=>true,
  height:pose=>pose.x>=1?config.targetY??2.5:0,
  move:(_,to)=>to,
  canStrike:()=>config.los!==false,
  ...config,
});

function fixture(mapWorld=createMap()){
  let now=1000,rolls=0;
  const match=createGame3DDuelMatch({
    id:'world-12-3',challengerId:C,opponentId:O,
    challengerStats:{maxHP:100,damage:50,defense:5},
    opponentStats:{maxHP:100,damage:50,defense:5},
    mapWorld,checkpoint:{worldOrigin:origin,mapId:mapWorld?.id,
      mapFingerprint:mapWorld?.fingerprint},
    now:()=>now,
    resolveStrike:()=>{rolls++;return {
      damage:20,critical:false,blocked:false,reflected:0,lifeSteal:0};
    },
  });
  match.setConnected(C,true);match.setConnected(O,true);
  match.setInput(C,{seq:1,x:0,z:0,facing:Math.PI/2});
  match.setInput(O,{seq:1,x:0,z:0,facing:-Math.PI/2});
  let intent=0;
  const action=(weaponPath='damage')=>{
    const request={action:'basic',weaponPath,
      intentId:'axehi_123_test_'+String(++intent).padStart(4,'0'),
      intentSeq:match.get(C).lastIntentSeq+1};
    assert.equal(match.submit(C,request).ok,true);
    return {request,result:match.tick(now)[0]};
  };
  return {match,action,get rolls(){return rolls},
    replay:request=>{match.submit(C,request);return match.tick(now)[0]}};
}

test('12.3 preserves existing flat arena range and forward sector',()=>{
  assert.equal(assessGame3DServerWorldStrike123({
    attacker:{x:0,z:0},defender:{x:2.5,z:0},
    facingYaw:Math.PI/2,range:3,weaponPath:'damage',
  }).ok,true);
  assert.equal(assessGame3DServerWorldStrike123({
    attacker:{x:0,z:0},defender:{x:2.5,z:0},
    facingYaw:0,range:3,weaponPath:'damage',
  }).reason,'target_not_in_front');
  assert.equal(assessGame3DServerWorldStrike123({
    attacker:{x:0,z:0},defender:{x:10,z:0},
    facingYaw:Math.PI/2,range:3,weaponPath:'damage',
  }).reason,'out_of_range');
});

test('12.3 server refuses cross-floor melee without spending stamina or rolling damage',()=>{
  const f=fixture(createMap({targetY:2.5}));
  const start=f.match.get(O).hp;
  const {result,request}=f.action('damage');
  assert.equal(result.reason,'target_elevation_mismatch');
  assert.equal(f.match.get(O).hp,start);
  assert.equal(f.match.get(C).stamina,100);
  assert.equal(f.rolls,0);
  assert.equal(f.replay(request).reason,'target_elevation_mismatch');
  assert.equal(f.rolls,0);
  assert.equal(WORLD_STRIKE_MAX_VERTICAL_123.damage,1.6);
});

test('12.3 ranged attack uses server terrain heights while preserving normal damage resolution',()=>{
  const f=fixture(createMap({targetY:2.5}));
  const {result}=f.action('ranged');
  assert.equal(result.ok,true);
  assert.equal(result.hpDamage,20);
  assert.equal(f.match.get(O).hp,80);
  assert.equal(f.rolls,1);
});

test('12.3 even a ranged attack cannot hit beyond vertical allowance',()=>{
  const f=fixture(createMap({targetY:4}));
  const {result}=f.action('ranged');
  assert.equal(result.reason,'target_elevation_mismatch');
  assert.equal(f.rolls,0);
});

test('12.3 3D distance exceeds range even when horizontal distance passes',()=>{
  const verdict=assessGame3DServerWorldStrike123({
    attacker:{x:0,z:0},defender:{x:7.4,z:0},
    facingYaw:Math.PI/2,range:7,weaponPath:'ranged',
    mapWorld:createMap({targetY:3}),worldOrigin:origin,
  });
  assert.equal(verdict.reason,'out_of_range');
});

test('12.3 blocked line of sight cannot call damage resolver',()=>{
  const f=fixture(createMap({targetY:0,los:false}));
  const {result}=f.action();
  assert.equal(result.reason,'blocked_by_world');
  assert.equal(f.rolls,0);
  assert.equal(f.match.get(C).stamina,100);
});

test('12.3 malformed/throwing world height fails closed; never falls back to flat',()=>{
  const invalid=createMap({height:()=>NaN});
  assert.equal(assessGame3DServerWorldStrike123({
    attacker:{x:0,z:0},defender:{x:2.5,z:0},facingYaw:Math.PI/2,
    range:3,weaponPath:'damage',mapWorld:invalid,worldOrigin:origin,
  }).reason,'blocked_by_world');
  const throwing=createMap({height:()=>{throw Error('terrain offline')}});
  const f=fixture(throwing);
  const {result}=f.action();
  assert.equal(result.reason,'blocked_by_world');
  assert.equal(f.rolls,0);
  assert.equal(assessGame3DServerWorldStrike123({
    attacker:{x:NaN,z:0},defender:{x:2,z:0},
    facingYaw:Math.PI/2,range:3,weaponPath:'damage',
  }).reason,'invalid_server_strike_geometry');
});
