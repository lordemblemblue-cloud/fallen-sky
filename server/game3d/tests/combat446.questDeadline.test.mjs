// Combat / Quest 43.6–44.6: mock original socket. No live accounts or PG16.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {performance} from 'node:perf_hooks';
import {withPrivateQuestDeadline436} from '../privateQuestDeadline436.mjs';
import {createGame3DPrivateQuestSocketBridge220}
 from '../privateQuestSocketBridge220.mjs';
import {PRIVATE_QUEST_PROTOCOL_212,PRIVATE_QUEST_PATH_212}
 from '../privateSocketPreflight212.mjs';

process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const T=1793720000000;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(condition){
 for(let n=0;n<150&&!condition();n++)await pause(2);
 assert.equal(condition(),true,'expected original action');
}
class PrivateTestSocket extends EventEmitter {
 constructor(){
  super();this.readyState=1;this.protocol=PRIVATE_QUEST_PROTOCOL_212;
  this.bufferedAmount=0;this.outbound=[];this.closeCodes=[];
 }
 send(payload,options,callback){
  if(this.readyState!==1)throw Error('socket closed');
  this.outbound.push({payload,options});callback?.();
 }
 close(code,reason){
  if(this.readyState!==1)return;
  this.readyState=3;this.closeCodes.push(code);this.emit('close',code,reason);
 }
 message(seq){
  this.emit('message',Buffer.from(JSON.stringify({v:1,seq,op:'questbook.read'})),false);
 }
}
function fixture(owner='owner436'){
 const socket=new PrivateTestSocket(),originalTransport={kind:'private-original'},
  originalReconnect={kind:'private-reconnect'};
 const scope={ownerId:owner,characterId:owner+'Hero'};
 const request={method:'GET',url:PRIVATE_QUEST_PATH_212,
  headers:{origin:'https://test.game.example',host:'test.game.example',
   upgrade:'websocket',connection:'Upgrade',
   'sec-websocket-protocol':PRIVATE_QUEST_PROTOCOL_212,
   'sec-websocket-version':'13',
   'sec-websocket-key':'dGhlIHNhbXBsZSBub25jZQ=='},
  socket:{encrypted:true}};
 let bindBlocked=false,readBlocked=false,authBlocked=false,
  bindResolve,readResolve,authResolve;
 let binds=0,reads=0,auths=0,closed=0;
 const authenticateUpgrade=async original=>{
  auths++;
  if(authBlocked)await new Promise(resolve=>authResolve=resolve);
  if(original!==request)return null;
  return {authenticated:true,identitySource:'trusted-private-socket-upgrade-213',
   ownerId:scope.ownerId,characterId:scope.characterId,
   transportId:'tx-'+'b'.repeat(32),expiresAtMs:T+30000,
   serverTransportContext:originalTransport,serverReconnectContext:originalReconnect};
 };
 const ingress211={version:'21.1',privateServerOnly:true,publicRouteInstalled:false,
  transportBindingCreated:false,resumeCombatAuthorized:false,
  async bind({serverTransportContext,serverReconnectContext}){
   binds++;
   assert.equal(serverTransportContext,originalTransport);
   assert.equal(serverReconnectContext,originalReconnect);
   if(bindBlocked)await new Promise(resolve=>bindResolve=resolve);
   return {ok:true,version:'21.1',transportBindingCreated:false,
    resumeCombatAuthorized:false};
  },
  async receive({serverTransportContext,rawFrame}){
   reads++;
   assert.equal(serverTransportContext,originalTransport);
   if(readBlocked)await new Promise(resolve=>readResolve=resolve);
   const {seq}=JSON.parse(rawFrame);
   return {ok:true,version:'21.1',privateServerOnly:true,
    publicRouteInstalled:false,transportBindingCreated:false,
    resumeCombatAuthorized:false,rewardsIssued:false,
    payload:JSON.stringify({v:1,type:'questbook.snapshot',seq,
     objectives:[{questId:'q436',objectiveId:'wolf436',type:'kill',
      status:'accepted',current:1,required:3}]})};
  },
  close(){closed++},
 };
 const open=(options={})=>createGame3DPrivateQuestSocketBridge220({
  enabled:true,socket,upgradeRequest:request,ingress211,scope,
  authenticateUpgrade,allowedOrigins:['https://test.game.example'],
  allowedHosts:['test.game.example'],now:()=>T,
  handshakeTimeoutMs:250,readTimeoutMs:250,...options,
 });
 return {socket,scope,request,ingress211,open,
  blockBind(){bindBlocked=true},releaseBind(){bindResolve?.()},
  blockRead(){readBlocked=true},releaseRead(){readResolve?.()},
  blockAuth(){authBlocked=true},releaseAuth(){authResolve?.()},
  get binds(){return binds},get reads(){return reads},
  get auths(){return auths},get closed(){return closed}};
}
test('43.6 bounded utility returns successful original backend result',async()=>{
 assert.deepEqual(await withPrivateQuestDeadline436(()=>42,{timeoutMs:100}),
  {ok:true,value:42});
});
test('43.7 expired original backend call fails closed and never adopts late output',async()=>{
 let finish,timeoutCalls=0;
 const pending=withPrivateQuestDeadline436(
  ()=>new Promise(resolve=>finish=resolve),
  {timeoutMs:100,onTimeout:()=>timeoutCalls++});
 await until(()=>typeof finish==='function');
 assert.deepEqual(await pending,{ok:false,timedOut:true});
 finish({late:true});await tick();
 assert.equal(timeoutCalls,1);
});
test('43.7 expired queued read does not call original backend at all',async()=>{
 let called=0,timeouts=0;
 const result=await withPrivateQuestDeadline436(
  ()=>{called++;return 'should not run'},
  {timeoutMs:100,submittedAt:performance.now()-200,
   onTimeout:()=>timeouts++});
 assert.deepEqual(result,{ok:false,timedOut:true});
 assert.equal(called,0);assert.equal(timeouts,1);
});
test('43.7 rejected original operation never becomes a successful reply',async()=>{
 const result=await withPrivateQuestDeadline436(
  async()=>{throw Error('original backend unavailable')},{timeoutMs:100});
 assert.deepEqual(result,{ok:false,timedOut:false});
});
test('43.7 blocked event loop cannot extend an original read budget',async()=>{
 let timeouts=0;
 const result=await withPrivateQuestDeadline436(()=>{
  const started=performance.now();
  while(performance.now()-started<120){}
  return 'late-result';
 },{timeoutMs:100,onTimeout:()=>timeouts++});
 assert.deepEqual(result,{ok:false,timedOut:true});
 assert.equal(timeouts,1);
});
test('43.8 original bind deadline closes a stalled handshake',async()=>{
 const f=fixture();f.blockBind();
 const pending=f.open();
 await until(()=>f.binds===1);
 await assert.rejects(pending,/private socket admission rejected/);
 assert.equal(f.socket.closeCodes.length,1);
 assert.equal(f.closed,1);
 f.releaseBind();await tick();
 assert.equal(f.socket.outbound.length,0);
});
test('43.9 slow original Questbook read closes instead of sending a late snapshot',async()=>{
 const f=fixture(),bridge=await f.open();
 f.blockRead();f.socket.message(1);
 await until(()=>f.reads===1);
 await until(()=>f.socket.readyState===3);
 assert.equal(f.socket.outbound.length,0);
 f.releaseRead();await tick();
 assert.equal(f.socket.outbound.length,0);
 assert.equal(f.closed,1);bridge.shutdown();
});
test('44.0 stale queued requests cannot send after earlier read timeout',async()=>{
 const f=fixture(),bridge=await f.open();
 f.blockRead();f.socket.message(1);f.socket.message(2);
 await until(()=>f.reads===1);
 await until(()=>f.socket.readyState===3);
 f.releaseRead();await tick();
 assert.equal(f.reads,1);
 assert.equal(f.socket.outbound.length,0);
 bridge.shutdown();
});
test('44.1 original reattestation timeout before read suppresses payload',async()=>{
 const f=fixture(),bridge=await f.open();
 f.blockAuth();f.socket.message(1);
 await until(()=>f.auths===3);
 await until(()=>f.socket.readyState===3);
 assert.equal(f.reads,0);
 f.releaseAuth();await tick();
 assert.equal(f.socket.outbound.length,0);
 bridge.shutdown();
});
test('44.2 externally closed socket cannot receive late original backend result',async()=>{
 const f=fixture(),bridge=await f.open();
 f.blockRead();f.socket.message(1);await until(()=>f.reads===1);
 f.socket.close(1000,'client left');
 f.releaseRead();await tick();
 assert.equal(f.socket.outbound.length,0);
 assert.equal(f.closed,1);bridge.shutdown();
});
test('44.3 an unaffected original account can still read while another stalls',async()=>{
 const a=fixture('ownerA'),b=fixture('ownerB');
 const [aBridge,bBridge]=await Promise.all([a.open(),b.open()]);
 a.blockRead();a.socket.message(1);
 await until(()=>a.reads===1);
 b.socket.message(1);
 await until(()=>b.socket.outbound.length===1);
 assert.equal(JSON.parse(b.socket.outbound[0].payload).seq,1);
 await until(()=>a.socket.readyState===3);
 assert.equal(a.socket.outbound.length,0);
 a.releaseRead();aBridge.shutdown();bBridge.shutdown();
});
test('44.4 default and invalid deadline budgets are not client-controlled',async()=>{
 const f=fixture();
 await assert.rejects(f.open({readTimeoutMs:0}),/requires original/);
 await assert.rejects(f.open({handshakeTimeoutMs:3001}),/requires original/);
 await assert.rejects(withPrivateQuestDeadline436(()=>true,{timeoutMs:0}),/43.6/);
 await assert.rejects(withPrivateQuestDeadline436(()=>true,{timeoutMs:3001}),/43.6/);
});
test('44.5 ordinary original Questbook read still returns a bounded snapshot',async()=>{
 const f=fixture(),bridge=await f.open();
 f.socket.message(1);
 await until(()=>f.socket.outbound.length===1);
 assert.equal(JSON.parse(f.socket.outbound[0].payload).objectives[0].questId,'q436');
 assert.equal(bridge.privateServerOnly,true);
 assert.equal(bridge.publicRouteInstalled,false);
 assert.equal(bridge.resumeCombatAuthorized,false);
 bridge.shutdown();assert.equal(f.closed,1);
});
test('44.6 failed original backend read never releases a response',async()=>{
 const f=fixture(),bridge=await f.open();
 f.ingress211.receive=async()=>{throw Error('private test refusal')};
 f.socket.message(1);
 await until(()=>f.socket.readyState===3);
 assert.equal(f.socket.outbound.length,0);
 bridge.shutdown();
});
