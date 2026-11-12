import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyGame3DDuelTicket } from '../ticket.mjs';

const secret='dev-only-32-byte-secret-not-for-production';
const now=100000;
const payload={
  v:1,mode:'game3d-duel',duelId:'duel-123',sub:'userA',
  challengerId:'userA',opponentId:'userB',
  challengerStats:{damage:100,maxHP:1000},
  opponentStats:{damage:100,maxHP:1000},
  iat:now,exp:now+30000,nonce:'test-nonce-123',
};
const sign=body=>{
  const b=Buffer.from(JSON.stringify(body)).toString('base64url');
  return b+'.'+createHmac('sha256',secret).update(b).digest('base64url');
};
test('only a signed, active, short-lived participant ticket is accepted',()=>{
  const seen=new Map();
  const ticket=sign(payload);
  assert.equal(verifyGame3DDuelTicket(ticket,secret,{now,seen}).sub,'userA');
  assert.throws(()=>verifyGame3DDuelTicket(ticket,secret,{now,seen}),/already consumed/);
  assert.throws(()=>verifyGame3DDuelTicket(ticket,secret,{now:now+30000}),/Expired/);
});
test('unsigned identity modification and bogus duelist cannot enter a match',()=>{
  const ticket=sign(payload);
  const [b64,signature]=ticket.split('.');
  const other=Buffer.from(JSON.stringify({...payload,sub:'intruder'})).toString('base64url');
  assert.throws(()=>verifyGame3DDuelTicket(other+'.'+signature,secret,{now}),/signature/);
  assert.throws(()=>verifyGame3DDuelTicket(sign({...payload,sub:'intruder'}),secret,{now}),/invalid duel credential|Expired or invalid/);
  assert.throws(()=>verifyGame3DDuelTicket(sign({...payload,exp:now+99999}),secret,{now}),/Expired/);
  assert.ok(b64.length>10);
});
test('missing credentials, short secrets and replay nonce attempts fail closed',()=>{
  assert.throws(()=>verifyGame3DDuelTicket('abc',secret,{now}),/ticket/);
  assert.throws(()=>verifyGame3DDuelTicket(sign(payload),'short',{now}),/secret/);
  const seen=new Map([['test-nonce-123',now+1000]]);
  assert.throws(()=>verifyGame3DDuelTicket(sign(payload),secret,{now,seen}),/already consumed/);
});
