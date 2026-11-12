// 22.0: an accepted, already-authenticated backend WebSocket *handoff*.
// Does NOT create HTTP, WebSocketServer, a port, combat input or player routes.
import {checkPrivateQuestUpgrade212,PRIVATE_QUEST_PROTOCOL_212}
 from './privateSocketPreflight212.mjs';
import {parsePrivateQuestFrame193}
 from './privateTransportFrame193.mjs';
import {attestPrivateSocket213,samePrivateSocket213}
 from './privateSocketAuthority213.mjs';
import {reservePrivateSocket214} from './privateSocketReservation214.mjs';
import {decodePrivateQuestFrame215}
 from './privateSocketDecode215.mjs';
import {createPrivateSocketLimit216}
 from './privateSocketLimit216.mjs';
import {readPrivateQuest217}
 from './privateSocketIngressAdapter217.mjs';
import {verifyPrivateQuestReply218}
 from './privateSocketReply218.mjs';
import {createPrivateSocketAudit219}
 from './privateSocketAudit219.mjs';
import {performance} from 'node:perf_hooks';
import {withPrivateQuestDeadline436} from './privateQuestDeadline436.mjs';

export async function createGame3DPrivateQuestSocketBridge220({
 enabled=false,socket,upgradeRequest,ingress211,scope,
 authenticateUpgrade,allowedOrigins=[],allowedHosts=[],now=Date.now,
 handshakeTimeoutMs=3000,readTimeoutMs=3000,
}={}){
 if(enabled!==true||process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    !socket||!upgradeRequest||!scope||
    typeof now!=='function'||typeof authenticateUpgrade!=='function'||
    ingress211?.version!=='21.1'||
    ingress211.privateServerOnly!==true||
    ingress211.publicRouteInstalled!==false||
    ingress211.transportBindingCreated!==false||
    ingress211.resumeCombatAuthorized!==false||
    typeof ingress211.bind!=='function'||typeof ingress211.receive!=='function'||
    typeof ingress211.close!=='function'||
    !Number.isInteger(handshakeTimeoutMs)||handshakeTimeoutMs<100||handshakeTimeoutMs>3000||
    !Number.isInteger(readTimeoutMs)||readTimeoutMs<100||readTimeoutMs>3000)
  throw Error('22.0 requires original 21.1 ingress and a separately authenticated accepted socket');
 const audit=createPrivateSocketAudit219();
 const limiter=createPrivateSocketLimit216();
 let stopped=false,state='new',original=null,timer=null,serial=Promise.resolve();
 // 44.8: one cancellation lifetime per ORIGINAL accepted private socket.
 // Never share this controller between players, workers, or reconnects.
 const sessionAbort=new AbortController();
 const safeClose=(code=1008)=>{
  if(stopped)return false;
  stopped=true;state='closed';
  sessionAbort.abort();
  limiter.close();
  if(timer!==null)clearTimeout(timer);
  try{ingress211.close()}catch{}
  if(socket&&typeof socket.off==='function'){
   socket.off('message',onMessage);
   socket.off('close',onClose);
   socket.off('error',onError);
  }
  try{if(socket.readyState===1)socket.close(code,'Private session closed')}catch{}
  audit.mark('closed');
  return true;
 };
 const onClose=()=>safeClose(1000),onError=()=>safeClose(1011);
 const reattest=signal=>attestPrivateSocket213({
  authenticateUpgrade,request:upgradeRequest,scope,now,signal,
 });
 const onMessage=(data,isBinary)=>{
  const submittedAt=performance.now();
  if(stopped||state!=='ready'){audit.mark('denied');safeClose();return}
  const text=decodePrivateQuestFrame215(data,isBinary);
  if(text===null){audit.mark('denied');safeClose();return}
  let frame;
  try{frame=parsePrivateQuestFrame193(JSON.parse(text))}catch{}
  if(!frame){audit.mark('denied');safeClose();return}
  if(!limiter.reserve()){audit.mark('overflow');safeClose();return}
  const task=serial.then(async()=>{
   if(stopped||state!=='ready'||socket.readyState!==1)return;
   // 43.7–44.0: one wall-clock budget from receipt, INCLUDING queued time.
   // No late auth/read result can be replayed after the deadline or teardown.
   const bounded=work=>withPrivateQuestDeadline436(work,{
    timeoutMs:readTimeoutMs,submittedAt,signal:sessionAbort.signal,
    onTimeout:()=>{audit.mark('denied');safeClose(1008)},
   });
   const beforeResult=await bounded(reattest);
   if(!beforeResult.ok){audit.mark('denied');safeClose(1008);return}
   if(stopped)return;
   const before=beforeResult.value;
   if(!samePrivateSocket213(original,before,now())){
    audit.mark('revoked');safeClose();return;
   }
   const readResult=await bounded(signal=>readPrivateQuest217({
    ingress:ingress211,serverTransportContext:before.serverTransportContext,
    rawFrame:text,abortSignal:signal,
   }));
   if(!readResult.ok){audit.mark('denied');safeClose(1008);return}
   if(stopped)return;
   const payload=readResult.value===null?null:verifyPrivateQuestReply218(readResult.value);
   if(!payload){audit.mark('denied');safeClose();return}
   if(JSON.parse(payload).seq!==frame.seq){
    audit.mark('denied');safeClose();return;
   }
   const afterResult=await bounded(reattest);
   if(!afterResult.ok){audit.mark('denied');safeClose(1008);return}
   if(stopped)return;
   const after=afterResult.value;
   if(!samePrivateSocket213(original,after,now())||
      socket.readyState!==1||stopped){
    audit.mark('revoked');safeClose();return;
   }
   if(performance.now()-submittedAt>=readTimeoutMs){
    audit.mark('denied');safeClose(1008);return;
   }
   if(typeof socket.bufferedAmount!=='number'||
      socket.bufferedAmount>16384||
      socket.protocol!==PRIVATE_QUEST_PROTOCOL_212){
    audit.mark('overflow');safeClose();return;
   }
   try{
    socket.send(payload,{binary:false},error=>{
     if(error) safeClose(1011);
    });
    audit.mark('sent');
   }catch{audit.mark('denied');safeClose(1011)}
  },()=>safeClose(1011));
  serial=task.then(()=>{},()=>{});
  task.finally(()=>limiter.release()).catch(()=>safeClose(1011));
 };
 // Reserve socket before any awaits. An unbound client message fails closed.
 if(!reservePrivateSocket214(socket)||
    !checkPrivateQuestUpgrade212({
     request:upgradeRequest,allowedOrigins,allowedHosts,
    })||socket.protocol!==PRIVATE_QUEST_PROTOCOL_212){
  try{if(socket?.readyState===1)socket.close(1008,'Private session closed')}catch{}
  throw Error('22.0 refused untrusted or already-adopted socket');
 }
 state='handshaking';
 const handshakeStarted=performance.now();
 const boundedHandshake=work=>withPrivateQuestDeadline436(work,{
  timeoutMs:handshakeTimeoutMs,submittedAt:handshakeStarted,
  signal:sessionAbort.signal,
  onTimeout:()=>safeClose(1008),
 });
 socket.on('message',onMessage);
 socket.on('close',onClose);
 socket.on('error',onError);
 try{
  const firstResult=await boundedHandshake(reattest);
  const before=firstResult.ok?firstResult.value:null;
  if(!before||stopped)throw Error('private upgrade not authenticated');
  const bindResult=await boundedHandshake(signal=>ingress211.bind(Object.freeze({
   serverTransportContext:before.serverTransportContext,
   serverReconnectContext:before.serverReconnectContext,
  }),{signal}));
  const bound=bindResult.ok?bindResult.value:null;
  if(bound?.ok!==true||bound.version!=='21.1'||
     bound.transportBindingCreated!==false||
     bound.resumeCombatAuthorized!==false||stopped)
   throw Error('original private handoff unavailable');
  const secondResult=await boundedHandshake(reattest);
  const after=secondResult.ok?secondResult.value:null;
  if(!samePrivateSocket213(before,after,now())||stopped||
     performance.now()-handshakeStarted>=handshakeTimeoutMs)
   throw Error('private transport changed or deadline elapsed during binding');
  original=Object.freeze({transportId:before.transportId,
   ownerId:before.ownerId,characterId:before.characterId,
   expiresAtMs:Math.min(before.expiresAtMs,after.expiresAtMs)});
  if(!Number.isSafeInteger(now())||original.expiresAtMs<=now())
   throw Error('private socket expired');
  timer=setTimeout(()=>safeClose(1008),original.expiresAtMs-now());
  timer.unref?.();
  state='ready';audit.mark('accepted');
 }catch(error){
  safeClose(1008);
  throw Error('22.0 private socket admission rejected');
 }
 return Object.freeze({version:'22.0',shutdown:()=>safeClose(1000),
  metrics:()=>audit.snapshot(),
  // Aggregate in-process queue depth only; never report player identity.
  get pendingOperations(){return limiter.pending},
  get active(){return !stopped&&state==='ready'&&
   !sessionAbort.signal.aborted&&now()<original.expiresAtMs},
  privateServerOnly:true,publicRouteInstalled:false,
  listenerCreated:false,transportBindingCreated:false,
  resumeCombatAuthorized:false,rewardsIssued:false,productionReady:false,
 });
}
