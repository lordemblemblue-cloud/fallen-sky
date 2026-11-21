import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepMatch } from '../src/components/duelist/sim/match.mjs';
import { parseClassSelectionPacket, dispatchAuthenticatedClassSelection } from '../src/components/duelist/sim/classSelectionBoundary.mjs';

const packet = classId => ({ type: 'class.select', classId });
const send = (match, verifiedSeatId, p) => dispatchAuthenticatedClassSelection({ match, verifiedSeatId, packet: p });

test('strict packet shape accepts four classes, rejects spoofing and extra state', () => {
  for (const id of ['assassin','duelist','juggernaut','healer']) {
    assert.deepEqual(parseClassSelectionPacket(packet(id)), { ok: true, classId: id });
  }
  for (const p of [null, [], 'assassin', packet('__proto__'), packet('unknown'),
    { ...packet('assassin'), id:'victim' }, { ...packet('assassin'), dead:true },
    { ...packet('assassin'), specialMeter:100 }, { type:'class.select' }]) {
    assert.equal(parseClassSelectionPacket(p).ok, false);
  }
});
test('server seat identity alone determines whose pending class changes', () => {
  const match = createMatch({ mode:'duel', players:[{id:'a'},{id:'b'}] });
  assert.equal(send(match,'a',packet('healer')).accepted,true);
  assert.equal(match.seats.get('a').pendingClass,'healer');
  assert.equal(match.seats.get('b').pendingClass,null);
  assert.equal(send(match,'b',{...packet('assassin'),id:'a'}).accepted,false);
  assert.equal(match.seats.get('b').pendingClass,null);
});
test('missing verified seat, bot seat and malformed context fail closed', () => {
  const match = createMatch({mode:'practice',players:[{id:'a'}]});
  for (const id of [undefined,'','ghost','bot1']) {
    assert.equal(send(match,id,packet('duelist')).accepted,false);
  }
  assert.equal(dispatchAuthenticatedClassSelection({verifiedSeatId:'a',packet:packet('duelist')}).accepted,false);
});
test('live fighter cannot swap class from a verified request', () => {
  const match = createMatch({mode:'duel',players:[{id:'a'},{id:'b'}]});
  stepMatch(match,3.1,{});
  assert.equal(match.phase,'live');
  assert.equal(send(match,'a',packet('assassin')).accepted,false);
  assert.equal(match.seats.get('a').pendingClass,null);
});
