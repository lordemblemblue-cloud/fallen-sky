// Combat / Quest 45.8–46.8: cooperative server-owned cancellation.
// Mock original account/world only, never a browser session issuer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {attestPrivateSocket213} from '../privateSocketAuthority213.mjs';
import {readPrivateQuest217} from '../privateSocketIngressAdapter217.mjs';
import {createPrivateRecoveryReadGate414}
 from '../privateRecoveryReadGate414.mjs';
import {pinOriginalRecovery401}
 from '../privateRecoveryContinuity401.mjs';

const T=1793720000000;
const wait=()=>new Promise(resolve=>setImmediate(resolve));
async function entered(predicate){
 for(let i=0;i<120&&!predicate();i++)await wait();
 assert.ok(predicate(),'expected original backend stage');
}
function socket(){
 const request={original:true};
 const scope={ownerId:'owner468',characterId:'hero468'};
 const claim={authenticated:true,identitySource:'trusted-private-socket-upgrade-213',
  ownerId:scope.ownerId,characterId:scope.characterId,
  transportId:'tx-'+'a'.repeat(32),expiresAtMs:T+25000,
  serverTransportContext:{server:'transport'},
  serverReconnectContext:{server:'reconnect'}};
 return {request,scope,claim};
}
test('45.8 original attestation receives the private AbortSignal as second argument',async()=>{
 const f=socket(),controller=new AbortController();
 let seen=null;
 const proof=await attestPrivateSocket213({
  request:f.request,scope:f.scope,now:()=>T,signal:controller.signal,
  authenticateUpgrade:async (request,options)=>{
   assert.equal(request,f.request);seen=options.signal;return f.claim;
  },
 });
 assert.equal(seen,controller.signal);
 assert.equal(proof.ownerId,'owner468');
});
test('45.9 already-aborted socket never invokes original transport verifier',async()=>{
 const f=socket(),controller=new AbortController();controller.abort();
 let called=0;
 assert.equal(await attestPrivateSocket213({
  request:f.request,scope:f.scope,now:()=>T,signal:controller.signal,
  authenticateUpgrade:()=>{called++;return f.claim},
 }),null);
 assert.equal(called,0);
});
test('46.0 abort during original transport verifier never returns late authority',async()=>{
 const f=socket(),controller=new AbortController();let enteredPromise=false,release;
 const pending=attestPrivateSocket213({
  request:f.request,scope:f.scope,now:()=>T,signal:controller.signal,
  authenticateUpgrade:async ()=>{
   enteredPromise=true;await new Promise(resolve=>release=resolve);return f.claim;
  },
 });
 await entered(()=>enteredPromise);controller.abort();release();
 assert.equal(await pending,null);
});
function ingress(){
 let receives=0,lastRequest=null,lastSignal=null,hold=null,release;
 const adapter={version:'21.1',privateServerOnly:true,
  publicRouteInstalled:false,transportBindingCreated:false,
  resumeCombatAuthorized:false,
  async receive(request,options){
   receives++;lastRequest=request;lastSignal=options.signal;
   if(hold)await new Promise(resolve=>{release=resolve});
   return {ok:true,version:'21.1',privateServerOnly:true,
    publicRouteInstalled:false,transportBindingCreated:false,
    resumeCombatAuthorized:false,rewardsIssued:false,payload:'private snapshot'};
  },
 };
 return {adapter,
  get receives(){return receives},get lastRequest(){return lastRequest},
  get lastSignal(){return lastSignal},
  pause(){hold=true},resume(){release?.()},
 };
}
test('46.1 read ingress keeps strict original two-key payload and separate signal',async()=>{
 const f=ingress(),controller=new AbortController();
 const value=await readPrivateQuest217({
  ingress:f.adapter,serverTransportContext:{original:true},
  rawFrame:'{"v":1,"seq":1,"op":"questbook.read"}',abortSignal:controller.signal,
 });
 assert.equal(value,'private snapshot');
 assert.deepEqual(Object.keys(f.lastRequest).sort(),['rawFrame','serverTransportContext']);
 assert.equal(Object.isFrozen(f.lastRequest),true);
 assert.equal(f.lastSignal,controller.signal);
});
test('46.2 already-aborted read never calls original ingress',async()=>{
 const f=ingress(),controller=new AbortController();controller.abort();
 assert.equal(await readPrivateQuest217({
  ingress:f.adapter,rawFrame:'unused',abortSignal:controller.signal,
 }),null);
 assert.equal(f.receives,0);
});
test('46.3 abort during original ingress receive discards the late result',async()=>{
 const f=ingress(),controller=new AbortController();f.pause();
 const pending=readPrivateQuest217({
  ingress:f.adapter,rawFrame:'original',abortSignal:controller.signal,
 });
 await entered(()=>f.receives===1);
 controller.abort();f.resume();
 assert.equal(await pending,null);
});
function recovery(){
 const worker={name:'original-recovery-worker-468'};
 const request={originalNode:true};
 const proof={authenticated:true,identitySource:'trusted-original-worker-recovery-383',
  ownerId:'owner468',characterId:'hero468',instanceId:'world-468',
  instanceEpoch:'epoch-468',expiresAtMs:T+20000,serverWorkerContext:worker};
 const pinned=pinOriginalRecovery401(proof,worker,T);
 assert.ok(pinned);
 let verifyCalls=0,authCalls=0,revokeCalls=0;
 let holdVerifier=false,release;
 const verifyOriginalReplacement383=async (_,options)=>{
  verifyCalls++;
  if(holdVerifier)await new Promise(resolve=>{release=resolve});
  return {...proof};
 };
 const candidate={authenticateUpgrade:async (_,options)=>{
  authCalls++;return {trusted:true,signal:options.signal};
 }};
 const gate=createPrivateRecoveryReadGate414({
  request,candidate,pinned,serverWorkerContext:worker,
  verifyOriginalReplacement383,clock:()=>T,
  isActive:()=>true,revoke:()=>{revokeCalls++},timeoutMs:300,
 });
 return {request,gate,
  get verifyCalls(){return verifyCalls},get authCalls(){return authCalls},
  get revokeCalls(){return revokeCalls},
  hold(){holdVerifier=true},release(){release?.()},
 };
}
test('46.4 live recovery forwards same cancellation signal through world proofs',async()=>{
 const f=recovery(),controller=new AbortController();
 const result=await f.gate.authenticateUpgrade(f.request,{signal:controller.signal});
 assert.equal(result.trusted,true);assert.equal(result.signal,controller.signal);
 assert.equal(f.verifyCalls,2);assert.equal(f.authCalls,1);
});
test('46.5 revoked socket abort interrupts a blocked original world re-verifier',async()=>{
 const f=recovery(),controller=new AbortController();
 f.hold();
 const pending=f.gate.authenticateUpgrade(f.request,{signal:controller.signal});
 await entered(()=>f.verifyCalls===1);
 controller.abort();
 assert.equal(await pending,null);
 assert.equal(f.revokeCalls,1);assert.equal(f.authCalls,0);
 f.release();await wait();
 assert.equal(await f.gate.authenticateUpgrade(f.request,{signal:controller.signal}),null);
});
test('46.6 already-aborted original recovery cannot issue an account claim',async()=>{
 const f=recovery(),controller=new AbortController();controller.abort();
 assert.equal(await f.gate.authenticateUpgrade(f.request,{signal:controller.signal}),null);
 assert.equal(f.verifyCalls,0);assert.equal(f.authCalls,0);assert.equal(f.revokeCalls,1);
});
