// Combat / Quest 44.7–45.7: deterministic ORIGINAL private session abort.
// Fake server claims only; neither gameplay authority nor signed-in accounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {withPrivateQuestDeadline436} from '../privateQuestDeadline436.mjs';
import {createGame3DPrivateQuestSocketBridge220}
 from '../privateQuestSocketBridge220.mjs';
import {PRIVATE_QUEST_PROTOCOL_212,PRIVATE_QUEST_PATH_212}
 from '../privateSocketPreflight212.mjs';

process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const T=1793720000000;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){
 for(let i=0;i<150&&!check();i++)await wait(2);
 assert.ok(check(),'original private operation reached expected state');
}
const fast=async p=>{
 let timer;
 try{return await Promise.race([p,new Promise((_,reject)=>{
  timer=setTimeout(()=>reject(Error('cancellation did not settle promptly')),600);
 })]);}
 finally{clearTimeout(timer)}
};
class OriginalSocket extends EventEmitter{
 constructor(){
  super();this.readyState=1;this.protocol=PRIVATE_QUEST_PROTOCOL_212;
  this.bufferedAmount=0;this.sent=[];this.closes=0;
 }
 send(payload,options,callback){this.sent.push(payload);callback?.()}
 close(code=1000){
  if(this.readyState!==1)return;
  this.closes++;this.readyState=3;this.emit('close',code);
 }
 message(seq){this.emit('message',
  Buffer.from(JSON.stringify({v:1,seq,op:'questbook.read'})),false)}
}
function fixture(ownerId='ownerA'){
 const socket=new OriginalSocket();
 const scope={ownerId,characterId:ownerId+'Hero'};
 const request={method:'GET',url:PRIVATE_QUEST_PATH_212,
  headers:{origin:'https://qa.game.example',host:'qa.game.example',
   upgrade:'websocket',connection:'Upgrade',
   'sec-websocket-protocol':PRIVATE_QUEST_PROTOCOL_212,
   'sec-websocket-version':'13',
   'sec-websocket-key':'dGhlIHNhbXBsZSBub25jZQ=='},
  socket:{encrypted:true}};
 const serverTransportContext={original:'transport'},
  serverReconnectContext={original:'reconnect'};
 let holdAuth=false,holdAuthAt=Infinity,holdBind=false,holdRead=false;
 let resolveAuth=null,resolveBind=null,resolveRead=null;
 const calls={auth:0,bind:0,read:0,close:0};
 const authenticateUpgrade=async original=>{
  calls.auth++;
  if(holdAuth&&calls.auth>=holdAuthAt)
   await new Promise(resolve=>{resolveAuth=resolve});
  if(original!==request)return null;
  return {authenticated:true,identitySource:'trusted-private-socket-upgrade-213',
   ownerId,characterId:scope.characterId,transportId:'tx-'+'a'.repeat(32),
   expiresAtMs:T+30000,serverTransportContext,serverReconnectContext};
 };
 const ingress211={version:'21.1',privateServerOnly:true,
  publicRouteInstalled:false,transportBindingCreated:false,
  resumeCombatAuthorized:false,
  async bind(context){
   calls.bind++;
   if(holdBind)await new Promise(resolve=>{resolveBind=resolve});
   assert.equal(context.serverTransportContext,serverTransportContext);
   return {ok:true,version:'21.1',transportBindingCreated:false,
    resumeCombatAuthorized:false};
  },
  async receive(context){
   calls.read++;
   if(holdRead)await new Promise(resolve=>{resolveRead=resolve});
   const {seq}=JSON.parse(context.rawFrame);
   return {ok:true,version:'21.1',privateServerOnly:true,
    publicRouteInstalled:false,transportBindingCreated:false,
    resumeCombatAuthorized:false,rewardsIssued:false,
    payload:JSON.stringify({v:1,type:'questbook.snapshot',seq,
     objectives:[{questId:'quest457',objectiveId:'wolf457',type:'kill',
      status:'accepted',current:0,required:3}]})};
  },
  close(){calls.close++},
 };
 const open=(options={})=>createGame3DPrivateQuestSocketBridge220({
  enabled:true,socket,upgradeRequest:request,ingress211,scope,
  authenticateUpgrade,allowedOrigins:['https://qa.game.example'],
  allowedHosts:['qa.game.example'],now:()=>T,
  handshakeTimeoutMs:2000,readTimeoutMs:2000,...options,
 });
 return {socket,request,calls,open,
  pauseAuth(at=1){holdAuth=true;holdAuthAt=at},
  resumeAuth(){holdAuth=false;resolveAuth?.()},
  pauseBind(){holdBind=true},resumeBind(){holdBind=false;resolveBind?.()},
  pauseRead(){holdRead=true},resumeRead(){holdRead=false;resolveRead?.()},
 };
}
test('44.7 already aborted original request never invokes the backend',async()=>{
 const controller=new AbortController();controller.abort();
 let calls=0,timeout=0;
 const result=await withPrivateQuestDeadline436(()=>{calls++;return 1},{
  signal:controller.signal,timeoutMs:200,onTimeout:()=>timeout++});
 assert.deepEqual(result,{ok:false,aborted:true});
 assert.equal(calls,0);assert.equal(timeout,0);
});
test('44.8 aborted stalled original backend settles before timeout',async()=>{
 const controller=new AbortController();let started=0,finish,timeout=0;
 const pending=withPrivateQuestDeadline436(()=>{started++;
  return new Promise(resolve=>{finish=resolve})},{
  signal:controller.signal,timeoutMs:2500,onTimeout:()=>timeout++});
 await until(()=>started===1);controller.abort();
 assert.deepEqual(await fast(pending),{ok:false,aborted:true});
 finish('late');await wait(0);
 assert.equal(timeout,0);assert.equal(started,1);
});
test('44.9 aborted original backend late rejection is harmless',async()=>{
 const controller=new AbortController();let rejectOriginal;
 const pending=withPrivateQuestDeadline436(
  ()=>new Promise((_,reject)=>{rejectOriginal=reject}),
  {signal:controller.signal,timeoutMs:2500});
 await until(()=>typeof rejectOriginal==='function');
 controller.abort();assert.deepEqual(await fast(pending),{ok:false,aborted:true});
 rejectOriginal(Error('late original failure'));await wait(0);
});
test('45.0 cooperative backend receives the same server-owned AbortSignal',async()=>{
 const controller=new AbortController();let observed=null;
 const result=await withPrivateQuestDeadline436(signal=>{
  observed=signal;return 'read-only';
 },{signal:controller.signal,timeoutMs:200});
 assert.deepEqual(result,{ok:true,value:'read-only'});
 assert.equal(observed,controller.signal);
});
test('45.0 abort on second read does not poison an unrelated controller',async()=>{
 const a=new AbortController(),b=new AbortController();
 a.abort();
 assert.deepEqual(await withPrivateQuestDeadline436(()=>1,{
  signal:a.signal,timeoutMs:200}),{ok:false,aborted:true});
 assert.deepEqual(await withPrivateQuestDeadline436(()=>2,{
  signal:b.signal,timeoutMs:200}),{ok:true,value:2});
});
test('45.1 invalid signal cannot bypass server-only deadline validation',async()=>{
 await assert.rejects(withPrivateQuestDeadline436(()=>1,{
  signal:{aborted:false},timeoutMs:200}),/43.6/);
});
test('45.1 socket closing during first original attestation rejects handshake immediately',async()=>{
 const f=fixture();f.pauseAuth();
 const pending=f.open();await until(()=>f.calls.auth===1);
 f.socket.close();await assert.rejects(fast(pending),/admission rejected/);
 assert.equal(f.calls.bind,0);assert.equal(f.calls.close,1);
 f.resumeAuth();await wait(0);
 assert.equal(f.socket.sent.length,0);
});
test('45.2 socket closing during original private ingress binding aborts handshake',async()=>{
 const f=fixture();f.pauseBind();
 const pending=f.open();await until(()=>f.calls.bind===1);
 f.socket.close();await assert.rejects(fast(pending),/admission rejected/);
 assert.equal(f.calls.close,1);
 f.resumeBind();await wait(0);
 assert.equal(f.socket.sent.length,0);
});
test('45.3 client close aborts in-flight read and releases queued operations',async()=>{
 const f=fixture(),bridge=await f.open();
 f.pauseRead();f.socket.message(1);f.socket.message(2);
 await until(()=>f.calls.read===1);
 assert.equal(bridge.pendingOperations,2);
 f.socket.close();
 await until(()=>bridge.pendingOperations===0);
 assert.equal(bridge.active,false);
 assert.equal(f.calls.read,1);
 assert.equal(f.socket.sent.length,0);
 f.resumeRead();await wait(0);
 assert.equal(f.socket.sent.length,0);assert.equal(f.calls.close,1);
});
test('45.4 client close during post-read original attestation sends nothing',async()=>{
 const f=fixture(),bridge=await f.open();
 f.pauseAuth(4);f.socket.message(1);
 await until(()=>f.calls.auth===4); // initial twice, pre-read once, post-read once
 assert.equal(f.calls.read,1);
 f.socket.close();
 await until(()=>bridge.pendingOperations===0);
 f.resumeAuth();await wait(0);
 assert.equal(f.socket.sent.length,0);
 bridge.shutdown();
});
test('45.5 normal read is unchanged when original socket stays live',async()=>{
 const f=fixture(),bridge=await f.open();
 f.socket.message(1);
 await until(()=>f.socket.sent.length===1);
 await until(()=>bridge.pendingOperations===0);
 assert.equal(JSON.parse(f.socket.sent[0]).objectives[0].questId,'quest457');
 assert.equal(bridge.pendingOperations,0);
 assert.equal(bridge.privateServerOnly,true);
 assert.equal(bridge.publicRouteInstalled,false);
 bridge.shutdown();
});
test('45.5 socket error and shutdown are idempotent for original ingress',async()=>{
 const f=fixture(),bridge=await f.open();
 f.socket.emit('error',Error('private socket error'));
 assert.equal(bridge.active,false);
 assert.equal(bridge.shutdown(),false);
 assert.equal(f.calls.close,1);
 assert.equal(f.socket.closes,1);
});
test('45.6 aborting player A never aborts player B original read',async()=>{
 const a=fixture('ownerA'),b=fixture('ownerB');
 const [ga,gb]=await Promise.all([a.open(),b.open()]);
 a.pauseRead();a.socket.message(1);
 await until(()=>a.calls.read===1);
 a.socket.close();
 await until(()=>ga.pendingOperations===0);
 b.socket.message(1);
 await until(()=>b.socket.sent.length===1);
 assert.equal(JSON.parse(b.socket.sent[0]).seq,1);
 assert.equal(b.calls.close,0);
 a.resumeRead();ga.shutdown();gb.shutdown();
});
test('45.7 after shutdown a forged combat frame still cannot invoke original read',async()=>{
 const f=fixture(),bridge=await f.open();
 assert.equal(bridge.shutdown(),true);
 f.socket.emit('message',Buffer.from(JSON.stringify({v:1,seq:1,op:'combat.attack'})),false);
 await wait(0);
 assert.equal(f.calls.read,0);assert.equal(f.socket.sent.length,0);
});
