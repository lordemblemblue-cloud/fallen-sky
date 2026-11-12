import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateRecoveryAdmission383} from '../privateRecoveryAdmission383.mjs';
import {createPrivateWorkerDrain373} from '../privateWorkerDrain373.mjs';

process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const T=1793720000000;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function entered(check){for(let i=0;i<100&&!check();i++)await tick();assert.ok(check(),'async operation entered')}
function fixture({ownerId='ownerA',instanceEpoch='world-epoch-392'}={}){
 const context={role:'original-replacement-worker-392'};
 const scope={ownerId,characterId:ownerId+'Hero',instanceId:'world-instance-392',instanceEpoch};
 const request={original:'node-server-request'};
 let t=T,active=true,authenticated=true,enteredVerify=0,enteredOriginal=0,
  verifyHold=null,originalHold=null,verifyResolve,originalResolve,closed=0,revokeCount=0,
  staleContext=false,wrongEpoch=false,expiresAt=T+30000;
 const admission={scope,ingress211:{version:'21.1',privateServerOnly:true,
  publicRouteInstalled:false,transportBindingCreated:false,resumeCombatAuthorized:false,
  bind:async()=>({ok:true}),receive:async()=>({ok:true}),close(){closed++}},
  authenticateUpgrade:async()=>({transportId:'tx-'+'a'.repeat(32)})};
 const verifyOriginalReplacement383=async req=>{
  enteredVerify++;
  if(verifyHold)await new Promise(resolve=>verifyResolve=resolve);
  return active&&authenticated&&req===request?{authenticated:true,
   identitySource:'trusted-original-worker-recovery-383',
   serverWorkerContext:staleContext?{}:context,
   ownerId:scope.ownerId,characterId:scope.characterId,
   instanceId:scope.instanceId,instanceEpoch:wrongEpoch?'stale-epoch-392':scope.instanceEpoch,
   expiresAtMs:expiresAt}:null;
 };
 const resolveOriginalBackendAdmission=async req=>{
  enteredOriginal++;
  if(originalHold)await new Promise(resolve=>originalResolve=resolve);
  return req===request&&active?admission:null;
 };
 const options=()=>({enabled:true,serverWorkerContext:context,
  verifyOriginalReplacement383,resolveOriginalBackendAdmission,
  revokeOriginalAdmission:()=>{revokeCount++},now:()=>t,timeoutMs:100});
 return {request,context,admission,scope,options,
  get closed(){return closed},get revokeCount(){return revokeCount},
  get enteredVerify(){return enteredVerify},get enteredOriginal(){return enteredOriginal},
  disableLogin(){authenticated=false},disableWorld(){active=false},
  staleWorker(){staleContext=true},rotateEpoch(){wrongEpoch=true},
  expire(){t=T+30001},expiryBeyondWindow(){expiresAt=T+40000},
  rewind(){t=T-1},holdVerify(){verifyHold=true},
  releaseVerify(){verifyHold=false;verifyResolve?.()},
  holdOriginal(){originalHold=true},
  releaseOriginal(){originalHold=false;originalResolve?.()},
 };
}
test('38.3 backend recovery disabled by default and requires independent verifier',()=>{
 assert.throws(()=>createPrivateRecoveryAdmission383(),/38.3/);
 const f=fixture();
 assert.throws(()=>createPrivateRecoveryAdmission383({...f.options(),verifyOriginalReplacement383:null}),/38.3/);
 const g=createPrivateRecoveryAdmission383(f.options());
 assert.equal(g.publicRouteInstalled,false);assert.equal(g.listenerInstalled,false);
 assert.equal(g.originalTicketIssued,false);g.shutdown();
});
test('38.4 new server request requires original independent account, character, and world',async()=>{
 const f=fixture(),g=createPrivateRecoveryAdmission383(f.options());
 const candidate=await g.resolveBackendAdmission(f.request);
 assert.equal(candidate.scope.ownerId,f.admission.scope.ownerId);
 assert.equal(typeof candidate.authenticateUpgrade,'function');
 assert.equal(g.inspect().active,1);
 assert.equal(g.revoke(f.request),true);assert.equal(f.closed,1);
 g.shutdown();
});
test('38.5 browser-selected account and copied requests cannot enter recovery',async()=>{
 const f=fixture(),g=createPrivateRecoveryAdmission383(f.options());
 assert.equal(await g.resolveBackendAdmission({...f.request}),null);
 assert.equal(await g.resolveBackendAdmission({ownerId:'ownerA',characterId:'ownerAHero'}),null);
 assert.equal((await g.resolveBackendAdmission(f.request))?.scope.ownerId,f.admission.scope.ownerId);
 assert.equal(await g.resolveBackendAdmission(f.request),null);
 assert.equal(g.inspect().active,1);g.shutdown();
});
test('38.6 stale worker context and changed world epoch are rejected',async()=>{
 const a=fixture(),g=createPrivateRecoveryAdmission383(a.options());
 a.staleWorker();assert.equal(await g.resolveBackendAdmission(a.request),null);
 assert.equal(a.closed,0);g.shutdown();
 const b=fixture(),h=createPrivateRecoveryAdmission383(b.options());
 b.rotateEpoch();assert.equal(await h.resolveBackendAdmission(b.request),null);
 assert.equal(b.closed,1,'denied original candidate is disposed');h.shutdown();
});
test('38.7 revoked or expired original recovery session does not authorize',async()=>{
 const a=fixture(),g=createPrivateRecoveryAdmission383(a.options());
 a.disableLogin();assert.equal(await g.resolveBackendAdmission(a.request),null);g.shutdown();
 const b=fixture(),h=createPrivateRecoveryAdmission383(b.options());
 b.expiryBeyondWindow();assert.equal(await h.resolveBackendAdmission(b.request),null);h.shutdown();
 const c=fixture(),j=createPrivateRecoveryAdmission383(c.options());
 c.expire();assert.equal(await j.resolveBackendAdmission(c.request),null);j.shutdown();
});
test('38.8 40 simultaneous reuse attempts on one request resolve at most once',async()=>{
 const f=fixture(),g=createPrivateRecoveryAdmission383(f.options());
 const values=await Promise.all(Array.from({length:40},()=>g.resolveBackendAdmission(f.request)));
 assert.equal(values.filter(Boolean).length,1);
 assert.equal(f.enteredOriginal,1);g.shutdown();
});
test('38.8 revoke during pending world verification denies late valid receipt',async()=>{
 const f=fixture(),g=createPrivateRecoveryAdmission383(f.options());
 f.holdVerify();const pending=g.resolveBackendAdmission(f.request);
 await entered(()=>f.enteredVerify>0);
 assert.equal(g.revoke(f.request),true);
 f.releaseVerify();assert.equal(await pending,null);
 assert.equal(await g.resolveBackendAdmission(f.request),null);
 assert.equal(g.inspect().pending,0);g.shutdown();
});
test('38.9 original backend provider result arriving after timeout is closed',async()=>{
 const f=fixture(),g=createPrivateRecoveryAdmission383(f.options());
 f.holdOriginal();const pending=g.resolveBackendAdmission(f.request);
 await entered(()=>f.enteredOriginal>0);
 assert.equal(await pending,null);
 f.releaseOriginal();await delay(15);
 assert.equal(f.closed,1);
 assert.equal(g.inspect().active,0);
 g.shutdown();
});
test('38.9 shutdown during pending original admission cannot resurrect worker',async()=>{
 const f=fixture(),g=createPrivateRecoveryAdmission383(f.options());
 f.holdOriginal();const pending=g.resolveBackendAdmission(f.request);
 await entered(()=>f.enteredOriginal>0);
 assert.equal(g.shutdown(),true);
 f.releaseOriginal();assert.equal(await pending,null);
 assert.equal(g.inspect().active,0);assert.equal(g.shutdown(),false);
});
test('39.0 independent fresh replacement context accepts only new valid request',async()=>{
 const old=fixture(),oldWorker=createPrivateRecoveryAdmission383(old.options());
 assert.equal((await oldWorker.resolveBackendAdmission(old.request))?.scope.ownerId,old.scope.ownerId);
 assert.equal(oldWorker.shutdown(),true);
 assert.equal(old.closed,1);
 const replacement=fixture(),nextWorker=createPrivateRecoveryAdmission383(replacement.options());
 assert.equal(await nextWorker.resolveBackendAdmission(old.request),null);
 assert.equal((await nextWorker.resolveBackendAdmission(replacement.request))?.scope.ownerId,replacement.scope.ownerId);
 nextWorker.shutdown();
});
test('39.0 a new worker refuses a recovery receipt tied to a previous worker context',async()=>{
 const f=fixture(),g=createPrivateRecoveryAdmission383(f.options());
 f.staleWorker();assert.equal(await g.resolveBackendAdmission(f.request),null);
 assert.equal(g.inspect().active,0);g.shutdown();
});
test('39.1 staging flag loss during asynchronous lookup irreversibly denies recovery',async()=>{
 const f=fixture(),g=createPrivateRecoveryAdmission383(f.options());
 f.holdVerify();const pending=g.resolveBackendAdmission(f.request);
 await entered(()=>f.enteredVerify>0);
 process.env.GAME3D_PRIVATE_STAGING_ENV='production';
 try{f.releaseVerify();assert.equal(await pending,null)}finally{
  process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
 }
 assert.equal(await g.resolveBackendAdmission(f.request),null);g.shutdown();
});
test('39.1 clock rollback fails closed for the original replacement worker',async()=>{
 const f=fixture(),g=createPrivateRecoveryAdmission383(f.options());
 f.rewind();assert.equal(await g.resolveBackendAdmission(f.request),null);
 assert.equal(g.inspect().active,0);g.shutdown();
});
test('39.2 two separately authorized accounts can coexist and revoke independently',async()=>{
 const a=fixture(),b=fixture({ownerId:'ownerB'});
 const byRequest=new Map([[a.request,a.admission],[b.request,b.admission]]);
 const byProof=new Map([[a.request,{...a.options(),ctx:a.context}],[b.request,{...b.options(),ctx:b.context}]]);
 const workerContext={role:'shared-new-worker'};
 const g=createPrivateRecoveryAdmission383({enabled:true,serverWorkerContext:workerContext,now:()=>T,
  resolveOriginalBackendAdmission:async req=>byRequest.get(req)??null,
  verifyOriginalReplacement383:async req=>{
   const source=byProof.get(req);if(!source)return null;
   return {authenticated:true,identitySource:'trusted-original-worker-recovery-383',
    ownerId:source.scope?.ownerId??(req===a.request?a.scope.ownerId:b.scope.ownerId),
    characterId:req===a.request?a.scope.characterId:b.scope.characterId,
    instanceId:a.scope.instanceId,instanceEpoch:a.scope.instanceEpoch,
    expiresAtMs:T+30000,serverWorkerContext:workerContext};
  }});
 assert.equal((await g.resolveBackendAdmission(a.request))?.scope.ownerId,a.scope.ownerId);
 assert.equal((await g.resolveBackendAdmission(b.request))?.scope.ownerId,b.scope.ownerId);
 assert.equal(g.inspect().active,2);
 assert.equal(g.revoke(a.request),true);assert.equal(a.closed,1);
 assert.equal(b.closed,0);assert.equal(g.inspect().active,1);
 g.shutdown();assert.equal(b.closed,1);
});
// Fail-closed drain checks with a blocked HTTPS close callback.
const fakeDrain=()=>{
 let doneHttp,doneWs;
 const opts={server:{off(){},close(cb){doneHttp=cb},closeAllConnections(){},closeIdleConnections(){}},
  wss:{close(cb){doneWs=cb}},capacity:{shutdown(){}},sessionSlots:{shutdown(){}},
  socketLeases:{shutdown(){}},lifecycle:{shutdown(){}},onUpgrade(){},closeTimeoutMs:100};
 return {opts,http:()=>doneHttp?.(),ws:()=>doneWs?.()};
};
test('39.2 bounded worker drain fails closed if HTTPS callback never arrives',async()=>{
 const f=fakeDrain(),drain=createPrivateWorkerDrain373(f.opts);
 const result=await drain.failClosed();
 assert.equal(result,false);assert.equal(drain.inspect().draining,true);
 assert.equal(drain.inspect().completed,false);assert.equal(drain.inspect().timedOut,true);
});
test('39.2 drain does not claim success until both original close callbacks finish',async()=>{
 const f=fakeDrain(),drain=createPrivateWorkerDrain373(f.opts);
 const pending=drain.close();f.ws();await tick();
 assert.equal(drain.inspect().completed,false);
 f.http();assert.equal(await pending,true);
 assert.equal(drain.inspect().completed,true);assert.equal(drain.inspect().timedOut,false);
});
