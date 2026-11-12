import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame3DDuelMatch, MATCH_RULES } from '../authority.mjs';

const C='challenger-user', O='opponent-user';
function fixture(damage=60) {
  let clock=1000;
  let calls=0;
  const match=createGame3DDuelMatch({
    id:'duel-test',challengerId:C,opponentId:O,
    challengerStats:{maxHP:1000,damage:200,defense:100},
    opponentStats:{maxHP:1000,damage:200,defense:100},
    now:()=>clock,
    resolveStrike:()=>{calls++;return {
      damage,critical:false,blocked:false,reflected:0,lifeSteal:0,
    };},
  });
  match.setConnected(C,true);
  match.setConnected(O,true);
  match.setInput(C,{seq:1,x:0,z:0,facing:Math.PI/2});
  match.setInput(O,{seq:1,x:0,z:0,facing:-Math.PI/2});
  let n=0;
  const cmd=(action,extra={},user=C)=>{
    const id='axehi_test_'+String(++n).padStart(8,'0');
    const actor=match.get(user);
    const message={action,intentId:id,intentSeq:actor.lastIntentSeq+1,...extra};
    assert.equal(match.submit(user,message).ok,true);
    const results=match.tick(clock);
    return {reply:results[0],message};
  };
  const advance=ms=>{clock+=ms;match.tick(clock);};
  return {match,cmd,advance,clock:()=>clock,getCalls:()=>calls};
}

test('match begins only with both authenticated participants and does not trust remote user ID',()=>{
  const f=fixture();
  assert.equal(f.match.status(),'active');
  assert.equal(f.match.submit('random-user',{action:'basic',intentId:'axehi_bad_1234',intentSeq:1}).ok,false);
  assert.equal(f.match.snapshot().players.length,2);
});

test('movement uses normalized directional input, server tick and bounded world radius',()=>{
  const f=fixture();
  const p=f.match.get(C);
  const before=p.position.x;
  f.match.setInput(C,{seq:2,x:1,z:0,facing:Math.PI/2});
  f.advance(50);
  assert.ok(p.position.x>before);
  assert.ok(p.position.x-before<=MATCH_RULES.speed*0.05+1e-8);
  assert.equal(f.match.setInput(C,{seq:3,x:1000,z:0,facing:0}).reason,'invalid_input');
  assert.equal(f.match.setInput(C,{seq:2,x:0,z:0,facing:0}).reason,'stale_input');
});

test('one accepted basic hit consumes stamina, advances one receipt and never double-hits',()=>{
  const f=fixture();
  const {reply,message}=f.cmd('basic',{weaponPath:'damage'});
  assert.equal(reply.ok,true);
  assert.equal(f.match.get(O).hp,940);
  assert.equal(f.match.get(C).stamina,94);
  const before=f.match.get(O).hp;
  assert.equal(f.match.submit(C,message).ok,true);
  const replay=f.match.tick(f.clock())[0];
  assert.equal(replay.ok,true);
  assert.equal(replay.eventId,reply.eventId);
  assert.equal(f.match.get(O).hp,before);
  assert.equal(f.getCalls(),1);
});

test('out of range and facing away never deal damage or consume basic stamina',()=>{
  const f=fixture();
  f.match.setInput(C,{seq:2,x:0,z:0,facing:0});
  assert.equal(f.cmd('basic',{weaponPath:'damage'}).reply.reason,'target_not_in_front');
  assert.equal(f.match.get(C).stamina,100);
  f.match.setInput(C,{seq:3,x:0,z:0,facing:Math.PI/2});
  f.match.get(O).position.x=20;
  assert.equal(f.cmd('basic',{weaponPath:'damage'}).reply.reason,'out_of_range');
  assert.equal(f.getCalls(),0);
});

test('AEGIS shield prevents HP damage and manual guard reduces subsequent damage',()=>{
  const f=fixture();
  assert.equal(f.cmd('shield',{},O).reply.ok,true);
  const a=f.cmd('basic',{weaponPath:'damage'});
  assert.equal(a.reply.ok,true);
  assert.equal(f.match.get(O).hp,1000);
  assert.equal(f.match.get(O).shield.current,40);
  f.advance(500);
  assert.equal(f.cmd('guard',{held:true},O).reply.ok,true);
  const b=f.cmd('basic',{weaponPath:'damage'});
  assert.equal(b.reply.ok,true);
  assert.ok(b.reply.hpDamage===0);
  assert.ok(f.match.get(O).shield.current<40);
});

test('server validates one-second hold and timed three-hit events',()=>{
  const f=fixture(20);
  const chargeId='axech_demo_1234567',castId='axe_cast_demo_12345';
  assert.equal(f.cmd('charge_begin',{
    skillId:'axe_offensive_skill_5',weaponPath:'damage',chargeId,
  }).reply.ok,true);
  f.advance(1000);
  const started=f.cmd('cast',{
    skillId:'axe_offensive_skill_5',weaponPath:'damage',castId,chargeId,
  });
  assert.equal(started.reply.serverTimedCharge,true);
  for(let i=0;i<3;i++){
    f.advance(i===0?0:170);
    const r=f.cmd('skill_hit',{
      castId,hitIndex:i,weaponPath:'damage',
    });
    assert.equal(r.reply.ok,true);
  }
  assert.equal(f.getCalls(),3);
  assert.equal(f.match.get(O).hp,940);
});

test('successful dodge creates bounded server movement and brief hit immunity',()=>{
  const f=fixture();
  const r=f.cmd('dodge',{x:1,z:0},O);
  assert.equal(r.reply.ok,true);
  assert.equal(f.match.get(O).stamina,78);
  const first=f.cmd('basic',{weaponPath:'damage'});
  assert.equal(first.reply.ok,true);
  assert.equal(first.reply.hpDamage,0);
  assert.equal(f.match.get(O).hp,1000);
});

test('server only accepts next ordered intent, and replays a refusal deterministically',()=>{
  const f=fixture();
  const invalid={
    action:'basic',weaponPath:'bogus',
    intentId:'axehi_rejected_12345678',intentSeq:1,
  };
  assert.equal(f.match.submit(C,invalid).ok,true);
  const first=f.match.tick(f.clock())[0];
  assert.equal(first.reason,'invalid_weapon');
  assert.equal(f.match.submit(C,invalid).ok,true);
  assert.equal(f.match.tick(f.clock())[0].reason,'invalid_weapon');
  assert.equal(f.match.get(C).lastIntentSeq,1);
  const skipped={
    action:'basic',weaponPath:'damage',
    intentId:'axehi_skip_12345678',intentSeq:7,
  };
  assert.equal(f.match.submit(C,skipped).ok,true);
  assert.equal(f.match.tick(f.clock())[0].reason,'out_of_order_intent');
  assert.equal(f.match.get(C).lastIntentSeq,1);
});
