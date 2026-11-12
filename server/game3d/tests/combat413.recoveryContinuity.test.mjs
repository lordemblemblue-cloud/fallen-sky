// Combat / Quest 40.1–41.3: original backend recovery continuity checks.
// Native mocks test the trust contract; they do NOT prove real Base44/PG16/ws.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pinOriginalRecovery401,sameOriginalRecovery401} from '../privateRecoveryContinuity401.mjs';
import {createPrivateRecoveryAdmission383} from '../privateRecoveryAdmission383.mjs';
import {createPrivateReplacementLoopbackGateway390} from '../privateReplacementLoopbackGateway390.mjs';

process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const T=1793720000000;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(predicate){
 for(let i=0;i<150&&!predicate();i++)await tick();
 assert.equal(predicate(),true,'pending trusted operation started');
}
function fixture(owner='ownerA'){
 const worker={kind:'original-recovery-worker-401'};
 const request={originalRequest:owner};
 const scope={ownerId:owner,characterId:owner+'Hero',
  instanceId:'original-world-401',instanceEpoch:'epoch-original-401'};
 let time=T,verifications=0,providerCalls=0,closed=0,revokeCalls=0;
 let secondHold=false,releaseSecond=null,logout=false,rotate=false,
  changedOwner=false,stagingLoss=false;
 const receipt=()=>({authenticated:true,
  identitySource:'trusted-original-worker-recovery-383',
  ...scope,ownerId:changedOwner&&verifications>=2?'otherOwner':scope.ownerId,
  instanceEpoch:rotate&&verifications>=2?'rotated-epoch-401':scope.instanceEpoch,
  expiresAtMs:T+25000,serverWorkerContext:worker});
 const ingress211={version:'21.1',privateServerOnly:true,
  publicRouteInstalled:false,transportBindingCreated:false,
  resumeCombatAuthorized:false,bind:async()=>({ok:true}),
  receive:async()=>({ok:true}),close(){closed++}};
 const candidate={scope,ingress211,
  authenticateUpgrade:async()=>({transportId:'tx-'+'a'.repeat(32)})};
 const verifyOriginalReplacement383=async req=>{
  verifications++;
  if(secondHold&&verifications===2)await new Promise(resolve=>releaseSecond=resolve);
  if(stagingLoss&&verifications>=2)process.env.GAME3D_PRIVATE_STAGING_ENV='production';
  return req!==request||logout&&verifications>=2?null:receipt();
 };
 const resolveOriginalBackendAdmission=async req=>{
  providerCalls++;return req===request?candidate:null;
 };
 const options=()=>({enabled:true,serverWorkerContext:worker,
  resolveOriginalBackendAdmission,verifyOriginalReplacement383,
  revokeOriginalAdmission:()=>{revokeCalls++},now:()=>time,timeoutMs:250});
 return {worker,request,scope,candidate,receipt,options,
  get verifications(){return verifications},
  get providerCalls(){return providerCalls},
  get closed(){return closed},
  get revokeCalls(){return revokeCalls},
  holdSecond(){secondHold=true},
  resumeSecond(){releaseSecond?.()},
  logout(){logout=true},
  rotate(){rotate=true},
  changeOwner(){changedOwner=true},
  loseStaging(){stagingLoss=true},
  expire(){time=T+25001},
 };
}
test('40.1 proof pinning rejects spoofed, malformed and accessor receipts',()=>{
 const f=fixture();
 const proof=f.receipt();
 assert.equal(pinOriginalRecovery401(proof,f.worker,T).instanceEpoch,'epoch-original-401');
 assert.equal(pinOriginalRecovery401({...proof,extra:true},f.worker,T),null);
 assert.equal(pinOriginalRecovery401({...proof,ownerId:'__anon__'},f.worker,T),null);
 assert.equal(pinOriginalRecovery401({...proof,serverWorkerContext:{}},f.worker,T),null);
 const withGetter={...proof};
 Object.defineProperty(withGetter,'ownerId',{enumerable:true,get(){throw Error('evil getter')}});
 assert.equal(pinOriginalRecovery401(withGetter,f.worker,T),null);
 const silentGetter={...proof};
 Object.defineProperty(silentGetter,'ownerId',{enumerable:true,get(){return 'ownerA'}});
 assert.equal(pinOriginalRecovery401(silentGetter,f.worker,T),null);
 assert.equal(pinOriginalRecovery401(Object.create(proof),f.worker,T),null);
});
test('40.2 immutable snapshot cannot be rewritten by shared backend object',()=>{
 const f=fixture(),proof=f.receipt();
 const pinned=pinOriginalRecovery401(proof,f.worker,T);
 proof.instanceEpoch='rotated-epoch-401';
 assert.equal(pinned.instanceEpoch,'epoch-original-401');
 assert.equal(sameOriginalRecovery401(pinned,proof,f.worker,T),false);
 assert.equal(Object.isFrozen(pinned),true);
});
test('40.3 re-verification requires same original owner/character/world',()=>{
 const f=fixture(),original=f.receipt();
 const pinned=pinOriginalRecovery401(original,f.worker,T);
 assert.equal(sameOriginalRecovery401(pinned,{...original,instanceEpoch:'rotated-epoch-401'},f.worker,T),false);
 assert.equal(sameOriginalRecovery401(pinned,{...original,ownerId:'otherOwner'},f.worker,T),false);
 assert.equal(sameOriginalRecovery401(pinned,{...original,characterId:'otherHero'},f.worker,T),false);
 assert.equal(sameOriginalRecovery401(pinned,{...original,instanceId:'different-world-401'},f.worker,T),false);
 assert.equal(sameOriginalRecovery401(pinned,{...original,serverWorkerContext:{}},f.worker,T),false);
 assert.equal(sameOriginalRecovery401(pinned,original,f.worker,T),true);
});
test('40.4 first expiry is a ceiling even if later verifier refreshes it',()=>{
 const f=fixture(),proof=f.receipt();
 const pinned=pinOriginalRecovery401(proof,f.worker,T);
 assert.equal(sameOriginalRecovery401(pinned,{...proof,expiresAtMs:T+28000},f.worker,T+24000),true);
 assert.equal(sameOriginalRecovery401(pinned,{...proof,expiresAtMs:T+29000},f.worker,T+25000),false);
 assert.equal(sameOriginalRecovery401(pinned,{...proof,expiresAtMs:T+1000},f.worker,T+2000),false);
});
test('40.5 successful admission calls independent original verifier twice',async()=>{
 const f=fixture(),recovery=createPrivateRecoveryAdmission383(f.options());
 assert.equal((await recovery.resolveBackendAdmission(f.request))?.scope.ownerId,f.scope.ownerId);
 assert.equal(f.verifications,2);assert.equal(f.providerCalls,1);
 assert.equal(recovery.inspect().active,1);
 recovery.shutdown();assert.equal(f.closed,1);assert.equal(f.revokeCalls,1);
});
test('40.6 logout after provider resolves rejects and closes candidate',async()=>{
 const f=fixture();f.holdSecond();
 const recovery=createPrivateRecoveryAdmission383(f.options());
 const attempt=recovery.resolveBackendAdmission(f.request);
 await until(()=>f.verifications===2);f.logout();f.resumeSecond();
 assert.equal(await attempt,null);
 assert.equal(f.closed,1);assert.equal(f.revokeCalls,1);
 assert.equal(recovery.inspect().active,0);recovery.shutdown();
});
test('40.7 original world epoch rotation during handoff fails closed',async()=>{
 const f=fixture();f.holdSecond();
 const recovery=createPrivateRecoveryAdmission383(f.options());
 const attempt=recovery.resolveBackendAdmission(f.request);
 await until(()=>f.verifications===2);f.rotate();f.resumeSecond();
 assert.equal(await attempt,null);assert.equal(f.closed,1);
 assert.equal(recovery.inspect().active,0);recovery.shutdown();
});
test('40.8 pending revocation is immediate and backend cleanup is once-only',async()=>{
 const f=fixture();f.holdSecond();
 const recovery=createPrivateRecoveryAdmission383(f.options());
 const attempt=recovery.resolveBackendAdmission(f.request);
 await until(()=>f.verifications===2);
 assert.equal(recovery.revoke(f.request),true);
 assert.equal(recovery.revoke(f.request),false);
 f.resumeSecond();assert.equal(await attempt,null);
 assert.equal(f.revokeCalls,1);assert.equal(f.closed,1);
 assert.equal(recovery.shutdown(),true);assert.equal(recovery.shutdown(),false);
 assert.equal(f.revokeCalls,1);
});
test('40.9 unknown request cannot trigger original backend revocation',()=>{
 const f=fixture(),recovery=createPrivateRecoveryAdmission383(f.options());
 assert.equal(recovery.revoke({foreign:'request'}),false);
 assert.equal(f.revokeCalls,0);recovery.shutdown();
});
test('41.0 aggregate deadline stops a late SECOND verifier and closes candidate',async()=>{
 const f=fixture();let calls=0;
 const opts=f.options();
 opts.timeoutMs=100;
 opts.verifyOriginalReplacement383=async()=>{
  calls++;
  if(calls===1)await pause(35);
  if(calls===2)await pause(175);
  return f.receipt();
 };
 opts.resolveOriginalBackendAdmission=async()=>{
  await pause(35);
  return f.candidate;
 };
 const recovery=createPrivateRecoveryAdmission383(opts);
 assert.equal(await recovery.resolveBackendAdmission(f.request),null);
 assert.equal(calls,2);assert.equal(f.closed,1);
 assert.equal(recovery.inspect().active,0);assert.equal(f.revokeCalls,1);
 await pause(180);
 assert.equal(recovery.inspect().active,0);
 recovery.shutdown();
});
test('41.1 two original accounts isolate rotated one from valid one',async()=>{
 const a=fixture('ownerA'),b=fixture('ownerB'),worker={kind:'shared-recovery-worker-411'};
 const entries=new Map([[a.request,{f:a,scope:a.scope}],[b.request,{f:b,scope:b.scope}]]);
 const rounds=new WeakMap(),closeCount={ownerA:0,ownerB:0};
 const recovery=createPrivateRecoveryAdmission383({
  enabled:true,serverWorkerContext:worker,now:()=>T,timeoutMs:250,
  resolveOriginalBackendAdmission:async req=>{
   const e=entries.get(req);if(!e)return null;
   return {...e.f.candidate,scope:e.scope,ingress211:{
    ...e.f.candidate.ingress211,close(){closeCount[e.scope.ownerId]++}}};
  },
  verifyOriginalReplacement383:async req=>{
   const e=entries.get(req);if(!e)return null;
   const count=(rounds.get(req)||0)+1;rounds.set(req,count);
   return {authenticated:true,identitySource:'trusted-original-worker-recovery-383',
    ...e.scope,instanceEpoch:req===a.request&&count===2?
      'revoked-epoch-411':e.scope.instanceEpoch,
    expiresAtMs:T+25000,serverWorkerContext:worker};
  },
 });
 assert.equal(await recovery.resolveBackendAdmission(a.request),null);
 assert.ok(await recovery.resolveBackendAdmission(b.request));
 assert.equal(recovery.inspect().active,1);
 assert.equal(closeCount.ownerA,1);
 assert.equal(recovery.revoke(b.request),true);
 assert.equal(closeCount.ownerB,1);
 recovery.shutdown();
});
test('41.2 replacement composition refuses backend deadline outside TLS deadline',async()=>{
 await assert.rejects(
  createPrivateReplacementLoopbackGateway390({authTimeoutMs:700,timeoutMs:650}),
  /41.0 replacement recovery/);
});
test('41.3 continuity contract remains disabled by default',()=>{
 assert.throws(()=>createPrivateRecoveryAdmission383(),/38.3/);
 const f=fixture();const recovery=createPrivateRecoveryAdmission383(f.options());
 assert.equal(recovery.publicRouteInstalled,false);
 assert.equal(recovery.originalTicketIssued,false);
 assert.equal(recovery.resumeCombatAuthorized,false);
 assert.equal(recovery.rewardsIssued,false);
 assert.equal(recovery.productionReady,false);
 recovery.shutdown();
});
