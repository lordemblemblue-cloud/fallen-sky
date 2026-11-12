// Combat / Quest 41.4–42.2: original-world re-verification for every
// pre-upgrade and per-read authenticated Questbook transport check.
// This is a PRIVATE staging-only guard; it never authenticates the browser.
import {performance} from 'node:perf_hooks';
import {pinOriginalRecovery401,sameOriginalRecovery401}
 from './privateRecoveryContinuity401.mjs';

export function createPrivateRecoveryReadGate414({
 request,candidate,pinned,serverWorkerContext,verifyOriginalReplacement383,
 clock,isActive,candidateStable=()=>true,revoke,timeoutMs=1100,onCheck=()=>{},onDeny=()=>{},
 onTimeout=()=>{},
}={}){
 if(!request||typeof request!=='object'||!candidate||
    typeof candidate.authenticateUpgrade!=='function'||!pinned||
    typeof verifyOriginalReplacement383!=='function'||
    typeof clock!=='function'||typeof isActive!=='function'||
    typeof candidateStable!=='function'||
    typeof revoke!=='function'||typeof onCheck!=='function'||
    typeof onDeny!=='function'||typeof onTimeout!=='function'||
    !Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>1200)
  throw Error('41.4 requires original backend authority and bounded read re-verification');
 let stopped=false,busy=false,expiryCeiling=pinned.expiresAtMs,checks=0,denials=0;
 const deny=()=>{
  if(!stopped){
   stopped=true;denials++;
   try{onDeny()}catch{}
   try{revoke()}catch{}
  }
  return null;
 };
 const validTime=()=>{
  const at=clock();
  return Number.isSafeInteger(at)&&at>0&&at<expiryCeiling&&
   isActive()&&candidateStable() ? at : null;
 };
 const authenticateUpgrade=async (attemptedRequest,{signal=null}={})=>{
  // 41.8: no copied HTTP requests, parallel original auth attempts,
  // stale cached proofs or access after a shut-down worker.
  if(stopped||busy||attemptedRequest!==request||signal?.aborted)return deny();
  busy=true;checks++;
  try{onCheck()}catch{}
  const started=performance.now();
  const bounded=async fn=>{
   const remaining=timeoutMs-(performance.now()-started);
   if(remaining<=0){try{onTimeout()}catch{};throw Error('live recovery timeout')}
   if(signal?.aborted)throw Error('original private socket closed');
   let timer,removeAbort=()=>{};
   const aborted=signal?new Promise((_,reject)=>{
    const onAbort=()=>reject(Error('original private socket closed'));
    signal.addEventListener('abort',onAbort,{once:true});
    removeAbort=()=>signal.removeEventListener('abort',onAbort);
    if(signal.aborted)onAbort();
   }):new Promise(()=>{});
   const work=Promise.resolve().then(()=>{
    if(signal?.aborted)throw Error('original private socket closed');
    return fn();
   });
   // Late backend completions are never adopted as new authority.
   try{
    return await Promise.race([work,aborted,new Promise((_,reject)=>{
     timer=setTimeout(()=>{
      try{onTimeout()}catch{}
      reject(Error('live recovery timeout'));
     },Math.max(1,Math.ceil(remaining)));
    })]);
   }finally{clearTimeout(timer);removeAbort()}
  };
  try{
   const beforeTime=validTime();
   if(beforeTime===null)return deny();
   // 41.4–41.5: independent current account/world/epoch validation.
   const before=await bounded(()=>verifyOriginalReplacement383(request,{signal}));
   let at=validTime();
   const beforePin=pinOriginalRecovery401(before,serverWorkerContext,at);
   if(at===null||!sameOriginalRecovery401(pinned,before,serverWorkerContext,at)||
      !beforePin)return deny();
   expiryCeiling=Math.min(expiryCeiling,beforePin.expiresAtMs);
   if(at>=expiryCeiling)return deny();
   // 41.6: retain original 21.3 transport authentication. The backend's
   // original transport claim is still independently validated by 21.3.
   const original=await bounded(()=>candidate.authenticateUpgrade(attemptedRequest,{signal}));
   if(!original||validTime()===null||stopped)return deny();
   // 41.7: revoke/logout/epoch rotation DURING original auth cannot issue
   // a successful stale response. The second verifier is never cached.
   const after=await bounded(()=>verifyOriginalReplacement383(request,{signal}));
   at=validTime();
   const afterPin=pinOriginalRecovery401(after,serverWorkerContext,at);
   if(at===null||!sameOriginalRecovery401(pinned,after,serverWorkerContext,at)||
      !afterPin)return deny();
   expiryCeiling=Math.min(expiryCeiling,afterPin.expiresAtMs);
   if(at>=expiryCeiling||stopped||signal?.aborted||performance.now()-started>timeoutMs)
    return deny();
   return original;
  }catch{return deny()}
  finally{busy=false}
 };
 return Object.freeze({version:'41.4',authenticateUpgrade,
  stop(){stopped=true},
  inspect:()=>Object.freeze({checks,denials,busy,stopped}),
  privateServerOnly:true,publicRouteInstalled:false,
  resumeCombatAuthorized:false,rewardsIssued:false,productionReady:false});
}
