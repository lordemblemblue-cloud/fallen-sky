// Combat / Quest 39.0–39.2: optional original 23.2 TLS loopback composition.
// The replacement server requires its OWN independently authenticated world
// callback, original one-use 19.9 provider, and new original HTTP requests.
import {createPrivateRecoveryAdmission383} from './privateRecoveryAdmission383.mjs';
import {createGame3DPrivateQuestLoopbackGateway232}
 from './privateQuestLoopbackGateway232.mjs';

export async function createPrivateReplacementLoopbackGateway390(options={}){
 // 41.0: never let the inner recovery verifier outlive the outer original
 // TLS handshake. Otherwise a destroyed socket could leave an active admit.
 const outerMs=options.authTimeoutMs??1500,innerMs=options.timeoutMs??1200;
 if(!Number.isInteger(outerMs)||!Number.isInteger(innerMs)||
    innerMs<100||innerMs>3000||outerMs<100||outerMs>3000||
    outerMs-innerMs<100)
  throw Error('41.0 replacement recovery must finish before TLS auth deadline');
 const recovery=createPrivateRecoveryAdmission383(options);
 let listener;
 try{
  listener=await createGame3DPrivateQuestLoopbackGateway232({
   ...options,resolveBackendAdmission:recovery.resolveBackendAdmission,
   onPrivateAdmissionAttemptClosed232:(request)=>{
    recovery.revoke(request);
    try{void Promise.resolve(options.onPrivateAdmissionAttemptClosed232?.(request))
      .catch(()=>{})}catch{}
   },
   onPrivateAdmissionClosed353:(request,reason)=>{
    recovery.revoke(request);
    // Optional private lifecycle callback cannot affect other account cleanup.
    try{void Promise.resolve(options.onPrivateAdmissionClosed353?.(request,reason))
      .catch(()=>{})}catch{}
   },
  });
 }catch(error){recovery.shutdown();throw error}
 let stopped=false,closeTask=null;
 const close=(fatal=false)=>{
  if(closeTask)return closeTask;
  stopped=true;recovery.shutdown();
  closeTask=fatal?listener.failClosed():listener.close();
  return closeTask;
 };
 return Object.freeze({version:'39.0',port:listener.port,host:listener.host,
  close:()=>close(),shutdown:()=>close(),failClosed:()=>close(true),
  inspect:()=>Object.freeze({...listener.inspect(),
   recoveryPending:recovery.inspect().pending,
   recoveryActive:recovery.inspect().active,recoveryStopped:stopped}),
  privateServerOnly:true,loopbackOnly:true,tlsRequired:true,
  publicRouteInstalled:false,combatRouteInstalled:false,
  resumeCombatAuthorized:false,rewardsIssued:false,productionReady:false});
}
