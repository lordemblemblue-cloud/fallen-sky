import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateLoopbackSessions236} from '../privateLoopbackSessions236.mjs';

const T=1793720000000;
const claim=(ownerId,transportId)=>({
 ownerId,characterId:ownerId+'-hero',transportId:'tx-'+transportId.repeat(32),
 expiresAtMs:T+30000,
});
const manager=()=>{let t=T;const registry=createPrivateLoopbackSessions236({now:()=>t});
 return {registry,clock(v){t=v}};
};

test('23.6 accepts two distinct private accounts and enforces capacity',()=>{
 const {registry}=manager();
 const a=registry.reserve(claim('ownerA','a'));
 const b=registry.reserve(claim('ownerB','b'));
 assert.ok(a);assert.ok(b);
 assert.equal(registry.snapshot().accounts,2);
 assert.equal(registry.reserve(claim('ownerC','c')),null);
 registry.shutdown();
});
test('23.6 same account cannot open second character or socket',()=>{
 const {registry}=manager(),a=registry.reserve(claim('ownerA','a'));
 assert.ok(a);
 assert.equal(registry.reserve({...claim('ownerA','b'),characterId:'differentHero'}),null);
 assert.equal(registry.reserve(claim('ownerA','c')),null);
 assert.equal(registry.snapshot().accounts,1);
 assert.equal(a.release(),true);assert.equal(a.release(),false);
 assert.ok(registry.reserve(claim('ownerA','b')));
 registry.shutdown();
});
test('23.6 transport ID cannot be shared across different owners',()=>{
 const {registry}=manager();assert.ok(registry.reserve(claim('ownerA','a')));
 assert.equal(registry.reserve(claim('ownerB','a')),null);
 registry.shutdown();
});
test('23.6 one completed disconnect frees both account and transport',()=>{
 const {registry}=manager();
 const a=registry.reserve(claim('ownerA','a'));
 const b=registry.reserve(claim('ownerB','b'));
 assert.equal(a.release(),true);
 assert.ok(registry.reserve(claim('ownerC','a')));
 assert.equal(registry.snapshot().accounts,2);
 assert.equal(b.release(),true);
 registry.shutdown();
});
test('23.6 duplicate and wrong identity match attempts fail',()=>{
 const {registry}=manager(),a=registry.reserve(claim('ownerA','a'));
 assert.equal(a.matches(claim('ownerA','a')),true);
 assert.equal(a.matches(claim('ownerB','a')),false);
 assert.equal(a.matches(claim('ownerA','b')),false);
 assert.equal(a.matches({...claim('ownerA','a'),expiresAtMs:T+35000}),false);
 registry.shutdown();
});
test('23.6 expiry refuses stale claims and matches',()=>{
 const {registry,clock}=manager(),a=registry.reserve(claim('ownerA','a'));
 clock(T+30000);
 assert.equal(a.matches(claim('ownerA','a')),false);
 assert.equal(registry.reserve(claim('ownerB','b')),null);
 registry.shutdown();
});
test('23.6 rejects malformed, unsafe or anonymous identities',()=>{
 const {registry}=manager();
 for(const invalid of [
  {...claim('ownerA','a'),ownerId:'__anon__'},
  {...claim('ownerA','a'),characterId:'invalid id'},
  {...claim('ownerA','a'),transportId:'tx-z'},
  {...claim('ownerA','a'),expiresAtMs:T+61000},
  {...claim('ownerA','a'),expiresAtMs:0},
  {},
 ])assert.equal(registry.reserve(invalid),null);
 assert.equal(registry.snapshot().accounts,0);
 registry.shutdown();
});
test('23.6 shutdown blocks new claims and redacts private identity',()=>{
 const {registry}=manager(),a=registry.reserve(claim('ownerA','a'));
 const report=registry.snapshot();
 assert.deepEqual(Object.keys(report).sort(),['accounts','stopped']);
 assert.equal(JSON.stringify(report).includes('ownerA'),false);
 registry.shutdown();
 assert.equal(registry.snapshot().accounts,0);
 assert.equal(a.matches(claim('ownerA','a')),false);
 assert.equal(registry.reserve(claim('ownerB','b')),null);
 assert.equal(a.release(),true);
});
test('23.6 reject invalid capacity and clock',()=>{
 assert.throws(()=>createPrivateLoopbackSessions236({maxAccounts:3}),/23.6/);
 assert.throws(()=>createPrivateLoopbackSessions236({maxAccounts:0}),/23.6/);
 assert.throws(()=>createPrivateLoopbackSessions236({now:null}),/23.6/);
});
