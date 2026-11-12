// 23.2 - REAL TLS loopback listener for separately authenticated staging ONLY.
// Deliberately not imported by index.mjs; no public GameView route, combat input or rewards.
import https from 'node:https';
import {validatePrivateLoopbackConfig224} from './privateLoopbackConfig224.mjs';
import {validatePrivateLoopbackUpgrade225} from './privateLoopbackUpgrade225.mjs';
import {resolvePrivateLoopbackAdmission226} from './privateLoopbackAdmission226.mjs';
import {createPrivateLoopbackCapacity227} from './privateLoopbackCapacity227.mjs';
import {createPrivateLoopbackSessions236} from './privateLoopbackSessions236.mjs';
import {createPrivateSocketLeases353} from './privateSocketLeases353.mjs';
import {createPrivateWorkerDrain373} from './privateWorkerDrain373.mjs';
import {withPrivateLoopbackDeadline228} from './privateLoopbackDeadline228.mjs';
import {createPrivateLoopbackLifecycle229} from './privateLoopbackLifecycle229.mjs';
import {createPrivateLoopbackMetrics230} from './privateLoopbackMetrics230.mjs';
import {reviewPrivateLoopback231} from './privateLoopbackReview231.mjs';
import {createGame3DPrivateQuestSocketBridge220} from './privateQuestSocketBridge220.mjs';
import {PRIVATE_QUEST_PROTOCOL_212} from './privateSocketPreflight212.mjs';

export async function createGame3DPrivateQuestLoopbackGateway232({
 enabled=false,port=0,tlsKey,tlsCert,allowedOrigins=[],resolveBackendAdmission,
 now=Date.now,authTimeoutMs=1500,onPrivateAdmissionClosed353=()=>{},
 onPrivateAdmissionAttemptClosed232=()=>{},
 handshakeTimeoutMs=3000,readTimeoutMs=3000,
}={}){
 const config=validatePrivateLoopbackConfig224({enabled,port,tlsKey,tlsCert,allowedOrigins});
 if(typeof resolveBackendAdmission!=='function'||typeof now!=='function'||
    typeof onPrivateAdmissionClosed353!=='function'||
    typeof onPrivateAdmissionAttemptClosed232!=='function'||
    !Number.isInteger(authTimeoutMs)||authTimeoutMs<100||authTimeoutMs>3000||
    !Number.isInteger(handshakeTimeoutMs)||handshakeTimeoutMs<100||handshakeTimeoutMs>3000||
    !Number.isInteger(readTimeoutMs)||readTimeoutMs<100||readTimeoutMs>3000)
  throw Error('23.2 requires a separately authenticated backend admission provider');
 // Dependency is already pinned in server/game3d/package.json; no ad hoc WS implementation.
 const {WebSocketServer}=await import('ws');
 const wss=new WebSocketServer({noServer:true,clientTracking:false,maxPayload:192,
  perMessageDeflate:false,handleProtocols:protocols=>
   protocols.size===1&&protocols.has(PRIVATE_QUEST_PROTOCOL_212)
    ? PRIVATE_QUEST_PROTOCOL_212:false});
 const capacity=createPrivateLoopbackCapacity227();
 const sessionSlots=createPrivateLoopbackSessions236({now});
 const socketLeases=createPrivateSocketLeases353({onClosed:onPrivateAdmissionClosed353});
 const lifecycle=createPrivateLoopbackLifecycle229();
 const metrics=createPrivateLoopbackMetrics230();
 const server=https.createServer({key:config.tlsKey,cert:config.tlsCert,
  minVersion:'TLSv1.2'},(_,response)=>{
  response.writeHead(404,{'Cache-Control':'no-store','Connection':'close'});
  response.end();
 });
 let closed=false,listeningPort=0;
 const reject=(socket,reason='denied')=>{
  metrics.mark(reason==='failed'?'failed':'denied');
  try{socket.destroy()}catch{}
 };
 const onUpgrade=async(request,socket,head)=>{
  metrics.mark('attempted');
  const releaseHandshake=capacity.reserve('handshake');
  if(!releaseHandshake){reject(socket);return;}
  let transferred=false,releaseSocket=null,sessionSlot=null,lease=null;
  socket.once('close',()=>{
   releaseHandshake();releaseSocket?.();sessionSlot?.release();lease?.release('socket-closed');
   // 40.9: the request can be in recovery's pending/active ledger even if
   // original 22.6 attestation or the TLS upgrade failed before lease adoption.
   // This is server-only lifecycle cleanup, not a new client authentication API.
   try{void Promise.resolve(onPrivateAdmissionAttemptClosed232(request))
     .catch(()=>{})}catch{}
  });
  try{
   if(closed||!validatePrivateLoopbackUpgrade225(request,{
    allowedOrigins:config.allowedOrigins,port:listeningPort})){
    reject(socket);return;
   }
   const admission=await withPrivateLoopbackDeadline228(
    ()=>resolvePrivateLoopbackAdmission226({request,resolveBackendAdmission,now}),
    {timeoutMs:authTimeoutMs});
   if(!admission||closed||socket.destroyed){reject(socket);return;}
   lease=socketLeases.adopt(request,admission);
   if(!lease){reject(socket);return;}
   metrics.mark('authenticated');
   sessionSlot=sessionSlots.reserve(admission);
   if(!sessionSlot){reject(socket);return;}
   releaseSocket=capacity.reserve('socket');
   if(!releaseSocket){reject(socket);return;}
   if(!sessionSlot.matches(admission)||!lease.matches(admission)||
      !validatePrivateLoopbackUpgrade225(request,{
    allowedOrigins:config.allowedOrigins,port:listeningPort})){
    reject(socket);return;
   }
   transferred=true;
   // `handleUpgrade` consumes an already-authenticated, TLS-protected request.
   // No token from HTTP headers or browser JSON is trusted as the player identity.
   wss.handleUpgrade(request,socket,head,ws=>{
    releaseHandshake();
    let released=false;
    const closeSlot=()=>{
     if(released)return;released=true;
     lifecycle.drop(ws);releaseSocket();sessionSlot?.release();
     lease?.release('socket-closed');metrics.mark('closed');
    };
    ws.once('close',closeSlot);
    ws.once('error',closeSlot);
    // Re-verify the ORIGINAL admitted lease on handoff. Expired sockets
    // must terminate before attaching the Questbook bridge.
    if(closed||!lease.attachSocket(ws)||!lease.matches(admission)||
       !lifecycle.add(ws,null)){
     try{ws.terminate()}catch{}
     closeSlot();return;
    }
    metrics.mark('upgraded');
    void (async()=>{
     try{
      const bridge=await createGame3DPrivateQuestSocketBridge220({
       enabled:true,socket:ws,upgradeRequest:request,
       ingress211:admission.ingress211,scope:admission.scope,
       authenticateUpgrade:admission.authenticateUpgrade,
       allowedOrigins:config.allowedOrigins,
       allowedHosts:[`127.0.0.1:${listeningPort}`],now,
       handshakeTimeoutMs,readTimeoutMs,
      });
      if(closed||!lifecycle.setBridge(ws,bridge)){
       bridge.shutdown();try{ws.terminate()}catch{};closeSlot();
      }else metrics.mark('ready');
     }catch{
      metrics.mark('failed');
      try{ws.terminate()}catch{};closeSlot();
     }
    })();
   });
  }catch{
   reject(socket,'failed');
   if(transferred){releaseHandshake();releaseSocket?.();sessionSlot?.release();lease?.release('socket-closed');}
  }finally{
   if(!transferred){releaseHandshake();releaseSocket?.();sessionSlot?.release();lease?.release('socket-closed');}
  }
 };
 server.on('upgrade',onUpgrade);
 const workerDrain=createPrivateWorkerDrain373({
  server,wss,capacity,sessionSlots,socketLeases,lifecycle,onUpgrade,
  onDraining:()=>{closed=true},
  onFatal:()=>{metrics.mark('failed')},
 });
 try{
  await new Promise((resolve,reject)=>{
   const fail=e=>{server.off('listening',ready);reject(e)};
   const ready=()=>{server.off('error',fail);resolve()};
   server.once('error',fail);
   server.once('listening',ready);
   server.listen(config.port,config.host);
  });
  listeningPort=server.address().port;
  server.on('error',()=>{void workerDrain.failClosed()});
 }catch(error){
  await workerDrain.failClosed();
  throw error;
 }
 const close=()=>workerDrain.close();
 const failClosed=()=>workerDrain.failClosed();
 return Object.freeze({version:'23.2',port:listeningPort,host:config.host,
  close,shutdown:close,failClosed,
  inspect:()=>Object.freeze({
   ...reviewPrivateLoopback231({config,capacity,lifecycle,metrics,sessionSlots,port:listeningPort}),
   socketLeaseActive:socketLeases.inspect().active,
   workerDraining:workerDrain.inspect().draining,
  }),
  privateServerOnly:true,loopbackOnly:true,tlsRequired:true,
  publicRouteInstalled:false,combatRouteInstalled:false,
  resumeCombatAuthorized:false,rewardsIssued:false,productionReady:false});
}
