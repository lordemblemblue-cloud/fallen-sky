// Combat / Quest 38.3–38.9: backend-only, one-use replacement-worker admission.
// This is a trust boundary for a NEW independently authenticated original
// world session. It does not mint/recover the old one-use 19.9 ticket.
import {isServerRequest271} from './privateRequestContract271.mjs';
import {performance} from 'node:perf_hooks';
import {pinOriginalRecovery401,sameOriginalRecovery401} from './privateRecoveryContinuity401.mjs';
import {createPrivateRecoveryReadGate414} from './privateRecoveryReadGate414.mjs';
import {sealOriginalRecoveryCandidate425} from './privateRecoveryCandidateSeal425.mjs';

const validAdmission=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 x.ingress211?.version==='21.1'&&x.ingress211.privateServerOnly===true&&
 x.ingress211.publicRouteInstalled===false&&
 x.ingress211.transportBindingCreated===false&&
 x.ingress211.resumeCombatAuthorized===false&&
 typeof x.ingress211.bind==='function'&&
 typeof x.ingress211.receive==='function'&&
 typeof x.ingress211.close==='function'&&
 typeof x.authenticateUpgrade==='function';

export function createPrivateRecoveryAdmission383({
 enabled=false,serverWorkerContext,resolveOriginalBackendAdmission,
 verifyOriginalReplacement383,revokeOriginalAdmission=()=>{},
 now=Date.now,timeoutMs=1200,maxPending=2,maxActive=2,
 liveCheckTimeoutMs=1100,
}={}){
 if(enabled!==true||process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    !isServerRequest271(serverWorkerContext)||
    typeof resolveOriginalBackendAdmission!=='function'||
    typeof verifyOriginalReplacement383!=='function'||
    typeof revokeOriginalAdmission!=='function'||typeof now!=='function'||
    !Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>3000||
    !Number.isInteger(maxPending)||maxPending<1||maxPending>2||
    !Number.isInteger(maxActive)||maxActive<1||maxActive>2||
    !Number.isInteger(liveCheckTimeoutMs)||liveCheckTimeoutMs<100||
    liveCheckTimeoutMs>1200)
  throw Error('38.3 requires independently authenticated original replacement worker');
 let stopped=false,stageLost=false,badClock=false,lastTime=null;
 const consumed=new WeakSet(),revoked=new WeakSet(),notified=new WeakSet(),
  pending=new Set(),active=new Map(),liveGates=new Map(),seals=new Map();
 let liveChecks=0,liveDenials=0,liveTimeouts=0;
 const live=()=>{
  if(process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging')stageLost=true;
  return !stopped&&!stageLost&&!badClock;
 };
 const clock=()=>{
  if(!live())return null;
  let t;
  try{t=now()}catch{badClock=true;return null}
  if(!Number.isSafeInteger(t)||t<=0||(lastTime!==null&&t<lastTime)){
   badClock=true;return null;
  }
  lastTime=t;return t;
 };
 const safeClose=candidate=>{
  try{candidate?.ingress211?.close()}catch{}
 };
 const originalRevoke=request=>{
  if(!isServerRequest271(request)||notified.has(request))return;
  notified.add(request);
  try{void Promise.resolve(revokeOriginalAdmission(request)).catch(()=>{})}catch{}
 };
 const revoke=request=>{
  if(!isServerRequest271(request)||!consumed.has(request)||revoked.has(request))return false;
  const had=pending.has(request)||active.has(request);
  revoked.add(request);
  const candidate=active.get(request);
  active.delete(request);
  liveGates.get(request)?.stop();liveGates.delete(request);
  const seal=seals.get(request);seals.delete(request);
  if(seal)seal.close();else safeClose(candidate);
  originalRevoke(request);
  return had;
 };
 const matches=(candidate,receipt)=>validAdmission(candidate)&&
  candidate.scope?.ownerId===receipt.ownerId&&
  candidate.scope?.characterId===receipt.characterId&&
  candidate.scope?.instanceId===receipt.instanceId&&
  candidate.scope?.instanceEpoch===receipt.instanceEpoch;
 // Race a backend operation against a response deadline. A late admission is
 // disposed instead of being silently adopted after failure/shutdown.
 const deadline=async (factory,onLate=()=>{},budgetMs=timeoutMs)=>{
  let timedOut=false,timer;
  const task=Promise.resolve().then(factory);
  task.then(value=>{if(timedOut)onLate(value)},()=>{});
  try{return await Promise.race([task,new Promise((_,reject)=>{
   timer=setTimeout(()=>{timedOut=true;reject(Error('recovery timeout'))},budgetMs);
  })])}finally{clearTimeout(timer)}
 };
 const resolveBackendAdmission=async request=>{
  if(!isServerRequest271(request)||!live()||consumed.has(request)||
     revoked.has(request)||pending.size>=maxPending||active.size>=maxActive||
     clock()===null)return null;
  consumed.add(request);pending.add(request);
  let candidate=null,seal=null,admitted=false;
  // 40.5: one monotonic TOTAL timeout for all three backend operations.
  // The outer original 23.2 handshake has a separate, longer deadline.
  const began=performance.now();
  const withBudget=(factory,onLate)=>{
   const remaining=timeoutMs-(performance.now()-began);
   if(remaining<=0)throw Error('recovery timeout');
   return deadline(factory,onLate,Math.max(1,Math.ceil(remaining)));
  };
  try{
   const receipt=await withBudget(()=>verifyOriginalReplacement383(request));
   let at=clock();
   const pinned=pinOriginalRecovery401(receipt,serverWorkerContext,at);
   if(!pinned||revoked.has(request))return null;
   candidate=await withBudget(()=>resolveOriginalBackendAdmission(request),safeClose);
   // Seal the ORIGINAL candidate immediately upon return, before awaiting the
   // second world verifier. A mutable provider cannot redirect cleanup during
   // the handoff window or replace its 21.3/21.1 methods mid-verification.
   seal=sealOriginalRecoveryCandidate425(candidate,pinned,
     ()=>{if(active.has(request))revoke(request)});
   at=clock();
   if(at===null||revoked.has(request)||!live()||
      pinned.expiresAtMs<=at||!matches(candidate,pinned)||
      !seal||!seal.stable()||active.size>=maxActive)return null;
   // 40.2–40.4: recheck independent original account/world authority
   // AFTER async candidate creation, detecting epoch rotation or logout.
   const fresh=await withBudget(()=>verifyOriginalReplacement383(request));
   at=clock();
   if(at===null||revoked.has(request)||!live()||
      !sameOriginalRecovery401(pinned,fresh,serverWorkerContext,at)||
      !matches(candidate,pinned)||!seal.stable()||
      active.size>=maxActive)return null;
   // 41.4–42.1: wrap the original 21.3 authenticateUpgrade with
   // independently refreshed original-world authority. 22.0 invokes this
   // BEFORE and AFTER each read, so there are no trust-on-first-use reads.
   const gate=createPrivateRecoveryReadGate414({
    request,candidate:seal,pinned,serverWorkerContext,
    verifyOriginalReplacement383,clock,candidateStable:seal.stable,
    isActive:()=>live()&&active.get(request)===candidate&&!revoked.has(request),
    revoke:()=>revoke(request),timeoutMs:liveCheckTimeoutMs,
    onCheck:()=>{liveChecks++},onDeny:()=>{liveDenials++},
    onTimeout:()=>{liveTimeouts++},
   });
   const wrapped=Object.freeze({
    scope:seal.scope,
    ingress211:seal.ingress211,
    authenticateUpgrade:gate.authenticateUpgrade,
   });
   active.set(request,candidate);seals.set(request,seal);
   liveGates.set(request,gate);
   admitted=true;return wrapped;
  }catch{return null}
  finally{
   pending.delete(request);
   if(!admitted){if(seal)seal.close();else safeClose(candidate);
    originalRevoke(request)}
  }
 };
 const shutdown=()=>{
  if(stopped)return false;
  stopped=true;
  for(const request of [...pending])revoke(request);
  for(const request of [...active.keys()])revoke(request);
  return true;
 };
 return Object.freeze({version:'38.3',resolveBackendAdmission,revoke,shutdown,
  inspect:()=>Object.freeze({pending:pending.size,active:active.size,stopped,
   liveChecks,liveDenials,liveTimeouts,
   liveInFlight:[...liveGates.values()].filter(g=>g.inspect().busy).length}),
  privateServerOnly:true,publicRouteInstalled:false,listenerInstalled:false,
  originalTicketIssued:false,resumeCombatAuthorized:false,rewardsIssued:false,
  productionReady:false});
}
