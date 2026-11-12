import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createGame3DPrivateQuestSocketBridge220} from '../privateQuestSocketBridge220.mjs';
import {checkPrivateQuestUpgrade212,PRIVATE_QUEST_PROTOCOL_212,
 PRIVATE_QUEST_PATH_212} from '../privateSocketPreflight212.mjs';
import {decodePrivateQuestFrame215} from '../privateSocketDecode215.mjs';
import {verifyPrivateQuestReply218} from '../privateSocketReply218.mjs';
import {createPrivateSocketLimit216} from '../privateSocketLimit216.mjs';

const epoch=1793720000000;
const goodPayload=seq=>JSON.stringify({v:1,type:'questbook.snapshot',seq,
 objectives:[{questId:'axe_patrol',objectiveId:'wolves',type:'kill',
 status:'accepted',current:2,required:3}]});
const wait=async condition=>{
 for(let i=0;i<60;i++){
  if(condition())return;
  await new Promise(resolve=>setTimeout(resolve,2));
 }
 assert.fail('timed out waiting for async socket message');
};
class MockSocket extends EventEmitter{
 constructor(){super();this.protocol=PRIVATE_QUEST_PROTOCOL_212;
  this.readyState=1;this.bufferedAmount=0;this.outbound=[];this.closed=[]}
 send(payload,opts,callback){this.outbound.push({payload,opts});callback?.()}
 close(code,reason){if(this.readyState!==1)return;
  this.readyState=3;this.closed.push({code,reason});
  this.emit('close',code)}
 message(input,isBinary=false){this.emit('message',input,isBinary)}
}
function fixture(overrides={}){
 let now=epoch,authorized=true,rotation=false,readerFail=false,
  pauses=false,pendingResolve=null,bindCount=0,receiveCount=0;
 const request={method:'GET',url:PRIVATE_QUEST_PATH_212,
  headers:{origin:'https://test.game.example',host:'test.game.example',
   upgrade:'websocket',connection:'keep-alive, Upgrade',
   'sec-websocket-protocol':PRIVATE_QUEST_PROTOCOL_212,
   'sec-websocket-version':'13',
   'sec-websocket-key':'dGhlIHNhbXBsZSBub25jZQ=='},
  socket:{encrypted:true}};
 const socket=new MockSocket(),transportCtx={kind:'trusted-server-transport'},
  reconnectCtx={kind:'original-trusted-reconnect'};
 const scope={ownerId:'owner223',characterId:'hero223'};
 const auth=async req=>{
  if(!authorized||req!==request)return null;
  return {authenticated:true,identitySource:'trusted-private-socket-upgrade-213',
   ownerId:scope.ownerId,characterId:scope.characterId,
   transportId:'tx-'+(rotation?'2':'1').repeat(32),
   expiresAtMs:epoch+30000,serverTransportContext:transportCtx,
   serverReconnectContext:reconnectCtx};
 };
 let expected=1,ingressClosed=0;
 const ingress={
  version:'21.1',privateServerOnly:true,publicRouteInstalled:false,
  transportBindingCreated:false,resumeCombatAuthorized:false,
  async bind({serverTransportContext,serverReconnectContext}){
   bindCount++;
   assert.equal(serverTransportContext,transportCtx);
   assert.equal(serverReconnectContext,reconnectCtx);
   return {ok:true,version:'21.1',transportBindingCreated:false,
    resumeCombatAuthorized:false};
  },
  async receive({serverTransportContext,rawFrame}){
   receiveCount++;
   if(readerFail)return {ok:false};
   assert.equal(serverTransportContext,transportCtx);
   if(pauses)await new Promise(resolve=>pendingResolve=resolve);
   const frame=JSON.parse(rawFrame);
   if(frame.op!=='questbook.read'||frame.seq!==expected++)return {ok:false};
   return {ok:true,version:'21.1',privateServerOnly:true,
    publicRouteInstalled:false,transportBindingCreated:false,
    resumeCombatAuthorized:false,rewardsIssued:false,
    payload:goodPayload(frame.seq)};
  },
  close(){ingressClosed++;},
 };
 const create=()=>createGame3DPrivateQuestSocketBridge220({
  enabled:true,socket,upgradeRequest:request,ingress211:ingress,scope,
  authenticateUpgrade:auth,allowedOrigins:['https://test.game.example'],
  allowedHosts:['test.game.example'],now:()=>now,
 });
 return {socket,request,scope,ingress,create,
  get bindCount(){return bindCount},get receiveCount(){return receiveCount},
  get ingressClosed(){return ingressClosed},
  revoke(){authorized=false},rotate(){rotation=true},
  expire(){now=epoch+30001},failReader(){readerFail=true},
  pauseReader(){pauses=true},
  releaseReader(){pauses=false;pendingResolve?.()},
 };
}
const raw=seq=>JSON.stringify({v:1,seq,op:'questbook.read'});

test('22.1 disabled-by-default: no independent network listener',async()=>{
 await assert.rejects(
  createGame3DPrivateQuestSocketBridge220(),/requires original/);
 const h=fixture(),bridge=await h.create();
 assert.equal(bridge.listenerCreated,false);
 assert.equal(bridge.publicRouteInstalled,false);
 assert.equal(bridge.transportBindingCreated,false);
 assert.equal(bridge.resumeCombatAuthorized,false);
 bridge.shutdown();
});
test('22.1 accepts authenticated already-upgraded socket and only Questbook response',async()=>{
 const h=fixture(),bridge=await h.create();
 assert.equal(bridge.active,true);
 assert.equal(h.bindCount,1);
 h.socket.message(Buffer.from(raw(1)),false);
 await wait(()=>h.socket.outbound.length===1);
 assert.deepEqual(JSON.parse(h.socket.outbound[0].payload),JSON.parse(goodPayload(1)));
 assert.equal(h.socket.outbound[0].opts.binary,false);
 assert.equal(bridge.metrics().sent,1);
 bridge.shutdown();
});
test('22.1 strict TLS origin, host, path, protocol, headers',async()=>{
 for(const path of ['url','socket','headers']){
  const h=fixture();
  if(path==='url')h.request.url+='?token=secret';
  if(path==='socket')h.request.socket.encrypted=false;
  if(path==='headers')h.request.headers.cookie='auth=stolen';
  assert.equal(checkPrivateQuestUpgrade212({
   request:h.request,allowedOrigins:['https://test.game.example'],
   allowedHosts:['test.game.example']}),false);
  await assert.rejects(h.create(),/refused untrusted/);
  assert.equal(h.socket.closed.length,1);
 }
 const h=fixture();h.request.headers.host='evil.example';
 await assert.rejects(h.create(),/refused untrusted/);
});
test('22.1 unauthorized binary and malformed frames close without forwarding',async()=>{
 for(const [value,binary] of [[Buffer.from(raw(1)),true],
  [Buffer.from([0xff,0xff]),false],
  [Buffer.from(JSON.stringify({v:1,seq:1,op:'combat.attack'})),false],
  [Buffer.alloc(193,65),false]]){
  const h=fixture(),bridge=await h.create();
  h.socket.message(value,binary);
  await wait(()=>h.socket.closed.length===1);
  assert.equal(h.receiveCount,0);
  assert.equal(bridge.active,false);
 }
});
test('22.1 signed backend identity is required, not client claims',async()=>{
 const h=fixture();h.revoke();
 await assert.rejects(h.create(),/private socket admission rejected/);
 assert.equal(h.socket.closed.length,1);
 assert.equal(h.bindCount,0);
});
test('22.1 revoked after admission denies response and tears down socket',async()=>{
 const h=fixture(),bridge=await h.create();
 h.revoke();h.socket.message(Buffer.from(raw(1)),false);
 await wait(()=>h.socket.closed.length===1);
 assert.equal(h.socket.outbound.length,0);
 assert.equal(bridge.metrics().revoked,1);
});
test('22.1 rejects change in transport identity after admission',async()=>{
 const h=fixture(),bridge=await h.create();
 h.rotate();h.socket.message(Buffer.from(raw(1)),false);
 await wait(()=>h.socket.closed.length===1);
 assert.equal(h.socket.outbound.length,0);
 bridge.shutdown();
});
test('22.1 expired session denies future data',async()=>{
 const h=fixture(),bridge=await h.create();
 h.expire();h.socket.message(Buffer.from(raw(1)),false);
 await wait(()=>h.socket.closed.length===1);
 assert.equal(h.socket.outbound.length,0);
 bridge.shutdown();
});
test('22.1 revoked during in-flight private read sends no payload',async()=>{
 const h=fixture(),bridge=await h.create();
 h.pauseReader();h.socket.message(Buffer.from(raw(1)),false);
 await wait(()=>h.receiveCount===1);
 h.revoke();h.releaseReader();
 await wait(()=>h.socket.closed.length===1);
 assert.equal(h.socket.outbound.length,0);
 bridge.shutdown();
});
test('22.1 downstream ingress refusal fails closed',async()=>{
 const h=fixture(),bridge=await h.create();
 h.failReader();h.socket.message(Buffer.from(raw(1)),false);
 await wait(()=>h.socket.closed.length===1);
 assert.equal(h.socket.outbound.length,0);
 bridge.shutdown();
});
test('22.1 more than four queued frames triggers backpressure',async()=>{
 const h=fixture(),bridge=await h.create();
 h.pauseReader();
 for(let i=1;i<=5;i++)h.socket.message(Buffer.from(raw(i)),false);
 await wait(()=>h.socket.closed.length===1);
 assert.equal(bridge.metrics().overflow,1);
 assert.equal(h.socket.outbound.length,0);
 h.releaseReader();bridge.shutdown();
});
test('22.1 second adoption of same socket is impossible',async()=>{
 const h=fixture(),bridge=await h.create();
 await assert.rejects(h.create(),/refused untrusted/);
 assert.equal(h.socket.closed.length,1);
 bridge.shutdown();
});
test('22.1 buffered output backpressure rejects send',async()=>{
 const h=fixture(),bridge=await h.create();
 h.socket.bufferedAmount=16385;
 h.socket.message(Buffer.from(raw(1)),false);
 await wait(()=>h.socket.closed.length===1);
 assert.equal(h.socket.outbound.length,0);
 bridge.shutdown();
});
test('22.1 idempotent shutdown detaches message and error hooks',async()=>{
 const h=fixture(),bridge=await h.create();
 assert.equal(bridge.shutdown(),true);
 assert.equal(bridge.shutdown(),false);
 assert.equal(h.socket.listenerCount('message'),0);
 assert.equal(h.ingressClosed,1);
 h.socket.message(Buffer.from(raw(1)),false);
 assert.equal(h.socket.outbound.length,0);
 assert.deepEqual(Object.keys(bridge.metrics()).sort(),
  ['accepted','closed','denied','overflow','revoked','sent']);
});
test('22.1 pure frame decoder, queue and strict output sanitizer',()=>{
 assert.equal(decodePrivateQuestFrame215(Buffer.from(raw(1)),false),raw(1));
 assert.equal(decodePrivateQuestFrame215(Buffer.from(raw(1)),true),null);
 assert.equal(decodePrivateQuestFrame215(Buffer.from([255]),false),null);
 assert.equal(verifyPrivateQuestReply218(goodPayload(1)),goodPayload(1));
 const leaking=JSON.parse(goodPayload(1));leaking.objectives[0].secret='x';
 assert.equal(verifyPrivateQuestReply218(JSON.stringify(leaking)),null);
 const lim=createPrivateSocketLimit216();
 for(let i=0;i<4;i++)assert.equal(lim.reserve(),true);
 assert.equal(lim.reserve(),false);
 lim.release();assert.equal(lim.reserve(),true);lim.close();
 assert.equal(lim.reserve(),false);
});
