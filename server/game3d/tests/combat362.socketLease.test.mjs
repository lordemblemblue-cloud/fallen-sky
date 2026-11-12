import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateSocketLeases353} from '../privateSocketLeases353.mjs';
const scope={ownerId:'ownerA',characterId:'heroA'};
function fixture(){
 let closures=0;
 const request={headers:{origin:'https://qa.example'}};
 const ingress={version:'21.1',privateServerOnly:true,publicRouteInstalled:false,close(){closures++}};
 const proof={scope,ingress211:ingress,transportId:'tx-'+'a'.repeat(32),expiresAtMs:1800000000000};
 return {request,proof,get closures(){return closures}};
}
test('35.3 disabled from claiming unverified or invalid socket owner',()=>{
 const ledger=createPrivateSocketLeases353();
 const f=fixture();
 for(const proof of [null,{}, {...f.proof,transportId:'tx-no'},
  {...f.proof,scope:{...scope,ownerId:'__anon__'}},
  {...f.proof,ingress211:{version:'21.1',privateServerOnly:false,publicRouteInstalled:false,close(){}}}]){
    assert.equal(ledger.adopt(f.request,proof),null);
 }
 assert.equal(ledger.inspect().active,0);ledger.shutdown();
});
test('35.4 exact request identity required, no double adoption',()=>{
 const ledger=createPrivateSocketLeases353(),f=fixture();
 const claim=ledger.adopt(f.request,f.proof);assert.ok(claim);
 assert.equal(claim.matches(f.proof),true);
 assert.equal(claim.matches({...f.proof}),false);
 assert.equal(ledger.adopt(f.request,f.proof),null);
 assert.equal(ledger.inspect().active,1);
 assert.equal(claim.release('socket-closed'),true);
 assert.equal(claim.release('socket-closed'),false);
 assert.equal(ledger.adopt({newRequest:true},f.proof),null,
  'an already used transport must not reconnect under another request');
 assert.equal(f.closures,1);ledger.shutdown();
});
test('35.5 same transport token cannot serve two different sockets',()=>{
 const ledger=createPrivateSocketLeases353(),a=fixture(),b=fixture();
 assert.ok(ledger.adopt(a.request,a.proof));
 assert.equal(ledger.adopt(b.request,b.proof),null);
 assert.equal(ledger.inspect().active,1);ledger.shutdown();
});
test('35.6 different accounts coexist and close independently',()=>{
 const ledger=createPrivateSocketLeases353(),a=fixture(),b=fixture();
 b.proof.scope={ownerId:'ownerB',characterId:'heroB'};
 b.proof.transportId='tx-'+'b'.repeat(32);
 assert.ok(ledger.adopt(a.request,a.proof));
 assert.ok(ledger.adopt(b.request,b.proof));
 assert.equal(ledger.inspect().active,2);
 assert.equal(ledger.release(a.request),true);
 assert.equal(ledger.inspect().active,1);
 assert.equal(b.closures,0);
 ledger.shutdown();assert.equal(b.closures,1);
});
test('35.7 shutdown closes all adopted backend ingresses exactly once',()=>{
 const ledger=createPrivateSocketLeases353(),a=fixture(),b=fixture();
 b.proof.transportId='tx-'+'c'.repeat(32);
 ledger.adopt(a.request,a.proof);ledger.adopt(b.request,b.proof);
 assert.equal(ledger.shutdown(),true);
 assert.equal(ledger.shutdown(),false);
 assert.equal(a.closures,1);assert.equal(b.closures,1);
 assert.equal(ledger.inspect().active,0);
 assert.equal(ledger.adopt({headers:{}},a.proof),null);
});
test('35.8 once-only cleanup callback is limited to server request and reason',()=>{
 const events=[],ledger=createPrivateSocketLeases353({onClosed:(req,reason)=>events.push({req,reason})});
 const f=fixture();const token=ledger.adopt(f.request,f.proof);
 token.release('network-error');token.release('socket-closed');ledger.shutdown();
 assert.equal(events.length,1);assert.equal(events[0].req,f.request);
 assert.equal(events[0].reason,'socket-closed');
});
test('35.9 callback failure does not block socket cleanup or poison other player',()=>{
 let calls=0;
 const ledger=createPrivateSocketLeases353({onClosed:()=>{calls++;throw Error('external cleanup failed')}}),a=fixture(),b=fixture();
 b.proof.transportId='tx-'+'d'.repeat(32);
 const one=ledger.adopt(a.request,a.proof),two=ledger.adopt(b.request,b.proof);
 assert.equal(one.release('socket-closed'),true);
 assert.equal(two.matches(b.proof),true);
 assert.equal(ledger.inspect().active,1);
 ledger.shutdown();assert.equal(calls,2);
});
test('36.0 two sockets cannot adopt the same original request with cloned proof',()=>{
 const ledger=createPrivateSocketLeases353(),a=fixture();
 assert.ok(ledger.adopt(a.request,a.proof));
 assert.equal(ledger.adopt(a.request,{...a.proof}),null);
 ledger.shutdown();
});
test('36.1 no public API, combat authority or rewards',()=>{
 const ledger=createPrivateSocketLeases353(),f=fixture();
 const token=ledger.adopt(f.request,f.proof);
 assert.equal(ledger.privateServerOnly,true);
 assert.equal(ledger.publicRouteInstalled,false);
 assert.equal(ledger.productionReady,false);
 assert.equal(Object.hasOwn(token,'authorizeAttack'),false);
 assert.equal(Object.hasOwn(token,'issueReward'),false);
 ledger.shutdown();
});
test('36.2 concurrent release/shutdown remains idempotent',async()=>{
 const calls=[],ledger=createPrivateSocketLeases353({onClosed:(_,reason)=>calls.push(reason)}),f=fixture();
 const token=ledger.adopt(f.request,f.proof);
 await Promise.all([Promise.resolve().then(()=>token.release('socket-closed')),
  Promise.resolve().then(()=>ledger.shutdown())]);
 assert.equal(calls.length,1);assert.equal(f.closures,1);
});
