// Combat / Quest 42.5–43.5 — original-world provider mutation checks.
// Mock original backend only. No authentic user, PG16, or gameplay authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateRecoveryAdmission383}
  from '../privateRecoveryAdmission383.mjs';
import {sealOriginalRecoveryCandidate425}
  from '../privateRecoveryCandidateSeal425.mjs';

process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const T=1793720000000;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function entered(check){
 for(let i=0;i<100&&!check();i++)await tick();
 assert.equal(check(),true,'entered original backend operation');
}
function fixture(owner='ownerA'){
 const request={nodeOriginal:'private-upgrade-'+owner};
 const worker={kind:'original-replacement-worker-435'};
 const scope={ownerId:owner,characterId:owner+'Hero',
   instanceId:'original-world-435',instanceEpoch:'original-epoch-435'};
 let authCalls=0,closeCalls=0,revokeCalls=0,verifyCalls=0;
 let holdAuth=false,resumeAuth=null;
 const ingress={version:'21.1',privateServerOnly:true,
   publicRouteInstalled:false,transportBindingCreated:false,
   resumeCombatAuthorized:false,
   async bind(){return {ok:true,version:'21.1'}},
   async receive(){return {ok:true,version:'21.1'}},
   close(){closeCalls++}};
 const candidate={scope,ingress211:ingress,
   authenticateUpgrade:async req=>{
    authCalls++;
    if(holdAuth)await new Promise(resolve=>resumeAuth=resolve);
    return req===request?{originalTransport:true}:null;
   }};
 const options=()=>({enabled:true,serverWorkerContext:worker,
   verifyOriginalReplacement383:async req=>{
    verifyCalls++;
    return req!==request?null:{
     authenticated:true,identitySource:'trusted-original-worker-recovery-383',
     ...{ownerId:owner,characterId:owner+'Hero',
      instanceId:'original-world-435',instanceEpoch:'original-epoch-435'},
     expiresAtMs:T+25000,serverWorkerContext:worker};
   },
   resolveOriginalBackendAdmission:async req=>req===request?candidate:null,
   revokeOriginalAdmission:()=>{revokeCalls++},
   now:()=>T,timeoutMs:350,liveCheckTimeoutMs:250});
 return {request,worker,scope,ingress,candidate,options,
   get authCalls(){return authCalls},get closeCalls(){return closeCalls},
   get revokeCalls(){return revokeCalls},get verifyCalls(){return verifyCalls},
   hold(){holdAuth=true},resume(){resumeAuth?.()}};
}
async function opened(owner='ownerA'){
 const f=fixture(owner),recovery=createPrivateRecoveryAdmission383(f.options());
 const accepted=await recovery.resolveBackendAdmission(f.request);
 assert.ok(accepted);assert.equal(f.verifyCalls,2);
 return {f,recovery,accepted};
}
test('42.5 rejects provider-supplied accessor for original callback',()=>{
 const f=fixture();
 Object.defineProperty(f.candidate,'authenticateUpgrade',{configurable:true,
  get(){return async()=>({originalTransport:true})}});
 const pinned={...f.scope,expiresAtMs:T+25000};
 assert.equal(sealOriginalRecoveryCandidate425(f.candidate,pinned),null);
});
test('42.6 supports a genuine unchanged original candidate without reissuing credentials',async()=>{
 const {f,recovery,accepted}=await opened();
 assert.deepEqual(await accepted.authenticateUpgrade(f.request),
   {originalTransport:true});
 assert.equal(f.authCalls,1);assert.equal(f.verifyCalls,4);
 assert.equal(accepted.scope.ownerId,'ownerA');
 assert.equal(accepted.ingress211.publicRouteInstalled,false);
 assert.equal(accepted.ingress211.resumeCombatAuthorized,false);
 recovery.shutdown();assert.equal(f.closeCalls,1);
});
test('42.7 rejects a swapped original 21.3 callback before use',async()=>{
 const {f,recovery,accepted}=await opened();
 f.candidate.authenticateUpgrade=async()=>({fakeTransport:true});
 assert.equal(await accepted.authenticateUpgrade(f.request),null);
 assert.equal(f.authCalls,0);
 assert.equal(f.revokeCalls,1);assert.equal(f.closeCalls,1);
 assert.equal(recovery.inspect().active,0);
 recovery.shutdown();assert.equal(f.closeCalls,1);
});
test('42.8 detects modified original character/instance/epoch and ingress handle',async()=>{
 for(const mutate of [
   f=>{f.scope.ownerId='ownerB'},
   f=>{f.scope.instanceId='wrong-instance-435'},
   f=>{f.scope.instanceEpoch='rotated-epoch-435'},
   f=>{f.candidate.ingress211={...f.ingress}},
 ]){
  const {f,recovery,accepted}=await opened();
  mutate(f);
  assert.equal(await accepted.authenticateUpgrade(f.request),null);
  assert.equal(recovery.inspect().active,0);
  assert.equal(f.closeCalls,1);
  recovery.shutdown();
 }
});
test('42.9 rejects a replaced original 21.1 private bind or receive',async()=>{
 for(const method of ['bind','receive']){
  const {f,recovery,accepted}=await opened();
  f.ingress[method]=async()=>({ok:true});
  assert.equal(await accepted.authenticateUpgrade(f.request),null);
  assert.equal(f.closeCalls,1);assert.equal(f.revokeCalls,1);
  recovery.shutdown();
 }
});
test('43.0 callback substitution DURING an outstanding original attestation fails closed',async()=>{
 const {f,recovery,accepted}=await opened();
 f.hold();
 const pending=accepted.authenticateUpgrade(f.request);
 await entered(()=>f.authCalls===1);
 f.candidate.authenticateUpgrade=async()=>({fakeTransport:true});
 f.resume();
 assert.equal(await pending,null);
 assert.equal(f.closeCalls,1);assert.equal(f.revokeCalls,1);
 recovery.shutdown();
});
test('43.1 direct private ingress bind rejects a mutated original provider',async()=>{
 const {f,recovery,accepted}=await opened();
 assert.equal((await accepted.ingress211.bind({})).ok,true);
 f.ingress.bind=async()=>({ok:true});
 assert.equal((await accepted.ingress211.bind({})).ok,false);
 assert.equal(f.closeCalls,1);assert.equal(f.revokeCalls,1);
 recovery.shutdown();
});
test('43.2 ingress read never accepts a late original handler swap',async()=>{
 const {f,recovery,accepted}=await opened();
 let enteredReceive=false,finish;
 f.ingress.receive=async()=>{enteredReceive=true;
   return await new Promise(resolve=>finish=resolve)};
 // A mutated method from BEFORE entry must fail without being called.
 assert.equal(await accepted.ingress211.receive({}),null);
 assert.equal(enteredReceive,false);assert.equal(f.closeCalls,1);
 recovery.shutdown();
});
test('43.3 a revoked original account does not terminate an independent account',async()=>{
 const a=await opened('ownerA'),b=await opened('ownerB');
 a.f.candidate.authenticateUpgrade=async()=>({fakeTransport:true});
 assert.equal(await a.accepted.authenticateUpgrade(a.f.request),null);
 assert.deepEqual(await b.accepted.authenticateUpgrade(b.f.request),
   {originalTransport:true});
 assert.equal(a.f.closeCalls,1);assert.equal(b.f.closeCalls,0);
 a.recovery.shutdown();b.recovery.shutdown();
 assert.equal(b.f.closeCalls,1);
});
test('43.4 a rejected proof never reports credential or identity in metrics',async()=>{
 const {f,recovery,accepted}=await opened();
 f.candidate.authenticateUpgrade=async()=>null;
 await accepted.authenticateUpgrade(f.request);
 const status=recovery.inspect();
 assert.equal(status.liveDenials,1);
 assert.equal(status.active,0);
 assert.equal(JSON.stringify(status).includes('ownerA'),false);
 assert.equal(JSON.stringify(status).includes('original-world-435'),false);
 recovery.shutdown();
});
test('43.5 replay after callback substitution and shutdown cannot revive the ingress',async()=>{
 const {f,recovery,accepted}=await opened();
 f.candidate.authenticateUpgrade=async()=>({fakeTransport:true});
 assert.equal(await accepted.authenticateUpgrade(f.request),null);
 assert.equal(await accepted.authenticateUpgrade(f.request),null);
 assert.equal(await recovery.resolveBackendAdmission(f.request),null);
 assert.equal(f.revokeCalls,1);
 assert.equal(recovery.shutdown(),true);
 assert.equal(recovery.shutdown(),false);
 assert.equal(f.closeCalls,1);
});

test('43.0 original candidate stays pinned across the SECOND world-verifier await',async()=>{
 const f=fixture(),opts=f.options();
 const verify=opts.verifyOriginalReplacement383;
 let calls=0,resumeSecond;
 opts.verifyOriginalReplacement383=async req=>{
  calls++;
  if(calls===2)await new Promise(resolve=>resumeSecond=resolve);
  return verify(req);
 };
 const recovery=createPrivateRecoveryAdmission383(opts);
 const pending=recovery.resolveBackendAdmission(f.request);
 await entered(()=>calls===2);
 const originalIngress=f.ingress;
 f.candidate.ingress211={...originalIngress,close(){throw Error('redirected cleanup')}};
 resumeSecond();
 assert.equal(await pending,null);
 assert.equal(f.closeCalls,1,'the original pinned ingress is closed');
 assert.equal(f.revokeCalls,1);
 assert.equal(recovery.inspect().active,0);
 recovery.shutdown();
});
