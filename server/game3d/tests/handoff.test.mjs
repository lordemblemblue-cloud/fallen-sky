import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  DEDICATED_HANDOFF_MS, dedicatedVoting, legacyCombatAllowed,
  validateDedicatedReport, initialDedicatedCheckpoint,
} from '../../../base44/shared/duelDedicatedHandoff.mjs';
import { createGame3DDuelMatch } from '../authority.mjs';
import { createDuelReportSender } from '../reporting.mjs';

const sample={id:'duel123',status:'active',challenger_id:'a',opponent_id:'b',
  dedicated_mode:'legacy'};
const snapshot={matchId:'duel123',seq:0,status:'active',winnerId:null,
  players:[
    {id:'a',x:0,z:0,hp:90,maxHp:100,stamina:80,will:50},
    {id:'b',x:2,z:0,hp:80,maxHp:100,stamina:100,will:60},
  ]};

test('both authenticated players must approve before legacy attacks are paused permanently',()=>{
  const a=dedicatedVoting(sample,'a',1000);
  assert.equal(a.ok,true);assert.equal(a.complete,false);
  assert.equal(a.mode,'preparing');assert.equal(a.expiresAt,1000+DEDICATED_HANDOFF_MS);
  assert.equal(legacyCombatAllowed({...sample,dedicated_mode:'preparing'}),false);
  const b=dedicatedVoting({...sample,dedicated_mode:'preparing',
    dedicated_votes:a.votes,dedicated_vote_expires:a.expiresAt},'b',1005);
  assert.equal(b.complete,true);assert.equal(b.mode,'dedicated');
  assert.equal(legacyCombatAllowed({...sample,dedicated_mode:'dedicated'}),false);
  assert.equal(dedicatedVoting(sample,'intruder',1000).ok,false);
});

test('an expired vote does not secretly activate with an obsolete approval',()=>{
  const vote=dedicatedVoting({...sample,dedicated_mode:'preparing',
    dedicated_votes:{a:true},dedicated_vote_expires:500},'b',1000);
  assert.equal(vote.complete,false);
  assert.deepEqual(vote.votes,{b:true});
});

test('worker checkpoint requires exact authority epoch, participants and valid HP',()=>{
  const checkpoint={state:{status:'active',sequence:0,actors:snapshot.players.map(
    p=>({id:p.id,x:p.x,z:p.z,hp:p.hp,stamina:p.stamina,will:p.will}))}};
  const duel={...sample,dedicated_mode:'dedicated',
    dedicated_epoch:'worker-epoch-1',dedicated_sequence:1};
  assert.equal(validateDedicatedReport({duel,epoch:'worker-epoch-1',
    sequence:2,snapshot,checkpoint}).ok,true);
  assert.equal(validateDedicatedReport({duel,epoch:'old-worker',
    sequence:2,snapshot}).reason,'authority_mismatch');
  assert.equal(validateDedicatedReport({duel,epoch:'worker-epoch-1',
    sequence:0,snapshot,checkpoint}).reason,'stale_sequence');
  assert.equal(validateDedicatedReport({duel,epoch:'worker-epoch-1',
    sequence:2,snapshot:{...snapshot,players:[snapshot.players[0]]},checkpoint})
    .reason,'invalid_snapshot');
});

test('terminal settlement idempotently replays only its own original result ID',()=>{
  const duel={...sample,dedicated_mode:'dedicated',status:'finished',
    dedicated_epoch:'epoch',dedicated_result_id:'duel123:epoch:20'};
  assert.equal(validateDedicatedReport({duel,epoch:'epoch',sequence:22,
    resultId:'duel123:epoch:20'}).replay,true);
  assert.equal(validateDedicatedReport({duel,epoch:'epoch',sequence:23,
    resultId:'duel123:epoch:21'}).reason,'duel_finished');
});

test('signed worker reporting never sends browser user credentials',async()=>{
  const secret='one-test-secret-which-is-more-than-32-chars-long';
  let recorded=null;
  const report=createDuelReportSender({
    url:'https://example.test/functions/game3dCombatReport',
    secret,now:()=>1000,
    fetchImpl:async(_url,request)=>{
      const expected=createHmac('sha256',secret).update(request.body).digest('hex');
      assert.equal(request.headers['x-game3d-signature'],expected);
      recorded=JSON.parse(request.body);
      return {ok:true,json:async()=>({success:true})};
    },
  });
  await report({duelId:'duel123',epoch:'epoch',kind:'checkpoint',
    sequence:1,snapshot,checkpoint:{state:{actors:[]}}});
  assert.equal(recorded.at,1000);
  assert.equal(recorded.kind,'checkpoint');
});

test('worker restores last server-approved HP, position, shield and intent counter',()=>{
  let time=1000;
  const create=(checkpoint=null)=>createGame3DDuelMatch({
    id:'duel123',challengerId:'a',opponentId:'b',
    challengerStats:{maxHP:100,damage:100,defense:30},
    opponentStats:{maxHP:100,damage:100,defense:30},
    now:()=>time,checkpoint,
    resolveStrike:()=>({damage:10,critical:false,blocked:false,
      reflected:0,lifeSteal:0}),
  });
  const first=create();
  first.setConnected('a',true);first.setConnected('b',true);
  first.submit('a',{action:'shield',
    intentId:'axehi_test_start_1234',intentSeq:1});
  first.tick(time);
  const checkpoint={state:first.checkpointState()};
  const restored=create(checkpoint);
  assert.equal(restored.status(),'active');
  assert.equal(restored.get('a').lastIntentSeq,1);
  assert.equal(restored.get('a').shield.current,10);
  assert.equal(restored.get('a').input.x,0);
  assert.equal(restored.get('a').connected,false);
});

test('handoff preserves existing legacy HP, AEGIS and basic-attack timing',()=>{
  const now=1000000;
  const duel={
    ...sample,challenger_hp:43,opponent_hp:61,
    challenger_stats:{maxHP:100,damage:20},opponent_stats:{maxHP:120,damage:20},
    challenger_max_hp:100,opponent_max_hp:120,
    duel_shields:{a:{current:14,expiresAt:now+8000}},
    duel_skill_cooldowns:{a:{aegis_shield:now+20000}},
    duel_intent_seq:{a:4,b:8},
  };
  const checkpoint=initialDedicatedCheckpoint(duel,now);
  assert.equal(checkpoint.state.actors[0].hp,43);
  assert.equal(checkpoint.state.actors[1].hp,61);
  assert.equal(checkpoint.state.actors[0].shield.current,14);
  assert.equal(checkpoint.state.actors[0].shieldReadyAt,now+20000);
  assert.equal(checkpoint.state.actors[1].lastIntentSeq,8);
  const resumed=createGame3DDuelMatch({
    id:'duel123',challengerId:'a',opponentId:'b',
    challengerStats:duel.challenger_stats,
    opponentStats:duel.opponent_stats,checkpoint,
    now:()=>now,
    resolveStrike:()=>({damage:10,critical:false,blocked:false,
      reflected:0,lifeSteal:0}),
  });
  assert.equal(resumed.get('a').hp,43);
  assert.equal(resumed.get('b').hp,61);
  assert.equal(resumed.get('a').shield.current,14);
});
