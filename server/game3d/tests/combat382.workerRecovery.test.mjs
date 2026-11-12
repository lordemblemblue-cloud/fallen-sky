import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateWorkerDrain373} from '../privateWorkerDrain373.mjs';
import {createPrivateSocketLeases353} from '../privateSocketLeases353.mjs';

const proof=(owner='ownerA',symbol='a')=>{
 let closures=0;
 const value={scope:{ownerId:owner,characterId:owner+'Hero'},
  transportId:'tx-'+symbol.repeat(32),expiresAtMs:Date.now()+10000,
  ingress211:{version:'21.1',privateServerOnly:true,publicRouteInstalled:false,
   close(){closures++}}};
 return {value,get closed(){return closures}};
};
const fakeDrain=({onDrain=()=>{},onFatal=()=>{},throwing=false}={})=>{
 const events=[];
 const shutdown=name=>{events.push(name);if(throwing)throw Error('bad '+name)};
 const source={
  server:{off(){events.push('detach')},close(done){events.push('http-close');done()}},
  wss:{close(done){events.push('ws-close');done()}},
  capacity:{shutdown(){shutdown('capacity')}},
  sessionSlots:{shutdown(){shutdown('slots')}},
  socketLeases:{shutdown(reason){events.push('ledger:'+reason)}},
  lifecycle:{shutdown(){shutdown('lifecycle')}},
  onUpgrade(){},onDraining:()=>{events.push('draining');onDrain()},
  onFatal:()=>{events.push('fatal');onFatal()},
 };
 return {events,...source};
};
const later=()=>new Promise(resolve=>setImmediate(resolve));

test('37.3 mutated original proof cannot extend authenticated socket lifetime',()=>{
 const ledger=createPrivateSocketLeases353(),item=proof();
 const token=ledger.adopt({},item.value),socket={count:0,terminate(){this.count++}};
 assert.ok(token);assert.equal(token.attachSocket(socket),true);
 const deadline=token.expiresAtMs;
 item.value.expiresAtMs+=60000;
 assert.equal(token.expiresAtMs,deadline);
 assert.equal(token.matches(item.value),false);
 assert.equal(token.closed,true);assert.equal(socket.count,1);assert.equal(item.closed,1);
 ledger.shutdown();
});
test('37.4 original account and transport change cannot be smuggled into a cached lease',()=>{
 const ledger=createPrivateSocketLeases353(),item=proof();
 const token=ledger.adopt({},item.value);item.value.scope.characterId='newHero';
 assert.equal(token.matches(item.value),false);assert.equal(token.closed,true);
 assert.equal(item.closed,1);ledger.shutdown();
});
test('37.5 throwing server clock cannot create a new authenticated ledger entry',()=>{
 const ledger=createPrivateSocketLeases353({now:()=>{throw Error('clock offline')}});
 assert.equal(ledger.adopt({},proof().value),null);
 assert.equal(ledger.inspect().active,0);ledger.shutdown();
});
test('37.6 fatal worker error latches draining before any socket is released',async()=>{
 let draining=false;
 const f=fakeDrain({onDrain:()=>{draining=true}});
 const drain=createPrivateWorkerDrain373(f);
 const done=drain.failClosed();
 assert.equal(draining,true);assert.equal(drain.inspect().draining,true);
 assert.equal(await done,true);
 assert.deepEqual(f.events,['draining','fatal','detach','capacity','slots',
  'ledger:server-error','lifecycle','ws-close','http-close']);
});
test('37.7 repeated graceful/fatal close shares one cleanup and no duplicate disconnect',async()=>{
 const f=fakeDrain(),drain=createPrivateWorkerDrain373(f);
 const first=drain.close();const second=drain.failClosed();
 assert.equal(first,second);assert.equal(await second,true);
 assert.equal(f.events.filter(x=>x==='capacity').length,1);
 assert.equal(f.events.includes('fatal'),false);
 assert.equal(f.events.filter(x=>x==='ledger:shutdown').length,1);
});
test('37.8 thrown cleanup steps cannot prevent remaining resource shutdown',async()=>{
 const f=fakeDrain({throwing:true}),drain=createPrivateWorkerDrain373(f);
 assert.equal(await drain.failClosed(),true);
 assert.equal(f.events.includes('capacity'),true);
 assert.equal(f.events.includes('slots'),true);
 assert.equal(f.events.includes('lifecycle'),true);
 assert.equal(f.events.includes('ws-close'),true);
});
test('37.9 fatal ledger shutdown actively terminates two adopted sockets once',async()=>{
 const events=[],ledger=createPrivateSocketLeases353({onClosed:(_,reason)=>events.push(reason)});
 const a=proof('ownerA','a'),b=proof('ownerB','b');
 const sockA={calls:0,terminate(){this.calls++}};
 const sockB={calls:0,terminate(){this.calls++}};
 const tokA=ledger.adopt({},a.value),tokB=ledger.adopt({},b.value);
 assert.ok(tokA.attachSocket(sockA));assert.ok(tokB.attachSocket(sockB));
 ledger.shutdown('server-error');ledger.shutdown('server-error');
 await later();
 assert.equal(sockA.calls,1);assert.equal(sockB.calls,1);
 assert.equal(a.closed,1);assert.equal(b.closed,1);
 assert.deepEqual(events,['server-error','server-error']);
});
test('38.0 server error does not emit owner, transport or credentials in metrics',async()=>{
 const f=fakeDrain(),drain=createPrivateWorkerDrain373(f);
 await drain.failClosed();
 const value=JSON.stringify(drain.inspect());
 assert.equal(value.includes('ownerA'),false);
 assert.equal(value.includes('tx-'),false);
 assert.equal(drain.publicRouteInstalled,false);
 assert.equal(drain.resumeCombatAuthorized,false);
 assert.equal(drain.rewardsIssued,false);
});
test('38.1 a new independent worker can accept a fresh reconnect after prior worker stops',()=>{
 const a=createPrivateSocketLeases353(),first=proof('ownerA','a');
 assert.ok(a.adopt({},first.value));a.shutdown('server-error');
 const b=createPrivateSocketLeases353(),second=proof('ownerA','b');
 assert.ok(b.adopt({},second.value));
 assert.equal(b.inspect().active,1);
 b.shutdown();
});
test('38.2 missing original private worker dependencies are denied',()=>{
 assert.throws(()=>createPrivateWorkerDrain373({}),/37.4/);
 const f=fakeDrain();
 assert.throws(()=>createPrivateWorkerDrain373({...f,wss:null}),/37.4/);
});
