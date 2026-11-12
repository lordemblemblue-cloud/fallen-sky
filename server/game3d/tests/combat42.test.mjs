// Combat Foundation 4.2 — source-only journal lifecycle contracts, deferred to beta.
import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCommittedDuelLifecycle} from '../../../base44/shared/duelJournalLifecycle.mjs';

const duelId='cf42-duel';
const pair=['alpha','bravo'];
const base=(status='active',winnerId=null)=>({
  duelId,epoch:'epoch-cf42',reportSequence:5,
  simulationSequence:17,settled:status==='finished',
  resultId:status==='finished'?'cf42-duel:epoch-cf42:17':null,
  participants:pair,
  snapshot:{matchId:duelId,seq:17,status,winnerId,
    ...(status==='finished'?{finishReason:'knockout'}:{}),
    players:pair.map((id,i)=>({id,hp:i?0:84,maxHp:100}))},
});
test('journal-backed winner and loser are derived from one committed terminal',()=>{
  const v=projectCommittedDuelLifecycle(base('finished','alpha'));
  assert.equal(v.ok,true);
  assert.equal(v.finished,true);
  assert.equal(v.winnerId,'alpha');
  assert.equal(v.loserId,'bravo');
  assert.equal(v.draw,false);
  assert.equal(v.status,'finished');
  assert.equal(v.rewardsEligible,false);
  assert.equal(v.rewardsIssued,false);
});
test('journal-backed draw does not invent a victor or reward',()=>{
  const v=projectCommittedDuelLifecycle(base('finished',null));
  assert.equal(v.ok,true);
  assert.equal(v.draw,true);
  assert.equal(v.winnerId,null);
  assert.equal(v.loserId,null);
  assert.equal(v.rewardsIssued,false);
});
test('unfinished checkpoint never declares a winner',()=>{
  const v=projectCommittedDuelLifecycle(base());
  assert.equal(v.ok,true);
  assert.equal(v.finished,false);
  assert.equal(v.winnerId,null);
  assert.equal(v.resultId,null);
});
test('contradictory terminal/status/result/match/roster fail closed',()=>{
  const done=base('finished','alpha');
  assert.equal(projectCommittedDuelLifecycle({...done,settled:false}).ok,false);
  assert.equal(projectCommittedDuelLifecycle({...done,resultId:null}).ok,false);
  assert.equal(projectCommittedDuelLifecycle({...done,
    snapshot:{...done.snapshot,winnerId:'outsider'}}).ok,false);
  assert.equal(projectCommittedDuelLifecycle({...done,
    snapshot:{...done.snapshot,matchId:'another-duel'}}).ok,false);
  assert.equal(projectCommittedDuelLifecycle({...done,
    snapshot:{...done.snapshot,players:[...done.snapshot.players,
      done.snapshot.players[0]]}}).ok,false);
  assert.equal(projectCommittedDuelLifecycle({...done,
    snapshot:{...done.snapshot,seq:16}}).ok,false);
  assert.equal(projectCommittedDuelLifecycle({...done,
    participants:['alpha','alpha']}).ok,false);
});
