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
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const awaitCheck=async check=>{for(let i=0;i<100&&!check();i++)await delay(5);assert.ok(check())};

test('36.3 reject already expired transport even when proof is otherwise shaped',()=>{
 const ledger=createPrivateSocketLeases353(),f=fixture();
 f.proof.expiresAtMs=Date.now()-1;
 assert.equal(ledger.adopt(f.request,f.proof),null);
 assert.equal(ledger.inspect().active,0);
 ledger.shutdown();
});
test('36.4 server deadline expires original ingress without waiting for client traffic',async()=>{
 const events=[],ledger=createPrivateSocketLeases353({onClosed:(_,reason)=>events.push(reason)}),f=fixture();
 f.proof.expiresAtMs=Date.now()+65;
 const token=ledger.adopt(f.request,f.proof);assert.ok(token);
 await awaitCheck(()=>token.closed);
 assert.equal(f.closures,1);assert.deepEqual(events,['expired']);
 assert.equal(ledger.inspect().active,0);
 ledger.shutdown();
});
test('36.5 the attached WebSocket terminates when the authenticated expiry arrives',async()=>{
 const ledger=createPrivateSocketLeases353(),f=fixture(),ws={calls:0,terminate(){this.calls++}};
 f.proof.expiresAtMs=Date.now()+75;
 const token=ledger.adopt(f.request,f.proof);assert.equal(token.attachSocket(ws),true);
 await awaitCheck(()=>token.closed);
 assert.equal(ws.calls,1);assert.equal(f.closures,1);
 assert.equal(token.release('socket-closed'),false);
 ledger.shutdown();
});
test('36.6 unattested socket object cannot be silently attached twice',()=>{
 const ledger=createPrivateSocketLeases353(),f=fixture();
 const token=ledger.adopt(f.request,f.proof);
 assert.equal(token.attachSocket({close(){}}),false);
 const ws={terminate(){}};
 assert.equal(token.attachSocket(ws),true);
 assert.equal(token.attachSocket(ws),false);
 assert.equal(token.attachSocket({terminate(){}}),false);
 ledger.shutdown();
});
test('36.7 late socket attachment after expiry or close is denied',async()=>{
 const ledger=createPrivateSocketLeases353(),f=fixture();
 f.proof.expiresAtMs=Date.now()+55;
 const token=ledger.adopt(f.request,f.proof);
 await awaitCheck(()=>token.closed);
 assert.equal(token.attachSocket({terminate(){}}),false);
 assert.equal(token.matches(f.proof),false);
 ledger.shutdown();
});
test('36.8 valid fresh reconnect cannot reuse earlier transport ID after expiry',async()=>{
 const ledger=createPrivateSocketLeases353(),f=fixture();
 f.proof.expiresAtMs=Date.now()+60;
 const old=ledger.adopt(f.request,f.proof);await awaitCheck(()=>old.closed);
 const replacement=fixture();replacement.proof.transportId='tx-'+'e'.repeat(32);
 const renewed=ledger.adopt(replacement.request,replacement.proof);
 assert.ok(renewed);
 assert.equal(ledger.adopt({different:true},f.proof),null);
 assert.equal(ledger.inspect().active,1);
 ledger.shutdown();
});
test('36.9 shutdown before expiry cancels scheduled expiration and callback duplicates',async()=>{
 const events=[],ledger=createPrivateSocketLeases353({onClosed:(_,reason)=>events.push(reason)}),f=fixture();
 f.proof.expiresAtMs=Date.now()+100;
 const token=ledger.adopt(f.request,f.proof);
 assert.equal(ledger.shutdown(),true);
 await delay(140);
 assert.equal(token.closed,true);assert.equal(f.closures,1);
 assert.deepEqual(events,['shutdown']);
});
test('37.0 one player expiry does not terminate a different live socket',async()=>{
 const ledger=createPrivateSocketLeases353(),a=fixture(),b=fixture();
 a.proof.expiresAtMs=Date.now()+60;
 b.proof.scope={ownerId:'ownerB',characterId:'heroB'};
 b.proof.transportId='tx-'+'f'.repeat(32);
 const asock={count:0,terminate(){this.count++}},bsock={count:0,terminate(){this.count++}};
 const ta=ledger.adopt(a.request,a.proof),tb=ledger.adopt(b.request,b.proof);
 assert.equal(ta.attachSocket(asock),true);assert.equal(tb.attachSocket(bsock),true);
 await awaitCheck(()=>ta.closed);
 assert.equal(asock.count,1);assert.equal(bsock.count,0);
 assert.equal(tb.matches(b.proof),true);
 assert.equal(ledger.inspect().active,1);
 ledger.shutdown();
});
test('37.1 server clock failure closes the session before any subsequent use',()=>{
 let broken=false;
 const ledger=createPrivateSocketLeases353({now:()=>broken?Number.NaN:Date.now()}),f=fixture();
 const token=ledger.adopt(f.request,f.proof);assert.ok(token);
 broken=true;
 assert.equal(token.matches(f.proof),false);
 assert.equal(token.closed,true);
 assert.equal(f.closures,1);
 ledger.shutdown();
});
test('37.2 cleanup after expiry does not reveal login headers to a second player',async()=>{
 const events=[],ledger=createPrivateSocketLeases353({onClosed:(req,reason)=>events.push({req,reason})}),f=fixture();
 f.proof.expiresAtMs=Date.now()+55;
 const token=ledger.adopt(f.request,f.proof);
 await awaitCheck(()=>token.closed);
 assert.equal(events.length,1);assert.equal(events[0].req,f.request);
 assert.equal(events[0].reason,'expired');
 assert.equal(JSON.stringify(ledger.inspect()).includes('origin'),false);
 ledger.shutdown();
});
