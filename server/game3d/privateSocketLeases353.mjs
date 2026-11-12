// 35.3–35.8: worker-local lifecycle ledger for independently authenticated
// private Questbook loopback sockets. Not a cross-worker lock or auth issuer.
const TRANSPORT=/^tx-[a-f0-9]{32}$/;
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const RESERVED=new Set(['__anon__','__default__','__dev_test__']);
const validId=x=>typeof x==='string'&&ID.test(x)&&!RESERVED.has(x);
export function createPrivateSocketLeases353({onClosed=()=>{},now=Date.now}={}){
 if(typeof now!=='function'||typeof onClosed!=='function')throw Error('35.3 invalid socket cleanup callback');
 const records=new WeakMap(),active=new Set(),transportIds=new Set(),seenTransports=new Set();
 let stopped=false;
 const admit=(request,proof)=>{
  if(stopped||!request||typeof request!=='object'||Array.isArray(request)||
     records.has(request)||!proof||typeof proof!=='object'||
     !TRANSPORT.test(proof.transportId)||
     !validId(proof.scope?.ownerId)||!validId(proof.scope?.characterId)||
     !Number.isSafeInteger(proof.expiresAtMs)||
     proof.ingress211?.version!=='21.1'||
     proof.ingress211.privateServerOnly!==true||
     proof.ingress211.publicRouteInstalled!==false||
     typeof proof.ingress211.close!=='function'||
     transportIds.has(proof.transportId)||seenTransports.has(proof.transportId)||
     seenTransports.size>=4096)return null;
  let checkedAt;try{checkedAt=now()}catch{return null}
  if(!Number.isSafeInteger(checkedAt)||checkedAt<=0||proof.expiresAtMs<=checkedAt)return null;
  // 37.3: pin the independent original admission as scalars. Even an
  // accidentally mutable backend object must not extend its own lifetime.
  const pinned=Object.freeze({transportId:proof.transportId,
   ownerId:proof.scope.ownerId,characterId:proof.scope.characterId,
   expiresAtMs:proof.expiresAtMs});
  const record={request,proof,closed:false};
  let socket=null,timer=null;
  records.set(request,record);active.add(record);transportIds.add(proof.transportId);
  seenTransports.add(proof.transportId);
  const release=reason=>{
   if(record.closed)return false;
   record.closed=true;clearTimeout(timer);timer=null;
   active.delete(record);transportIds.delete(proof.transportId);
   if(reason==='expired'||reason==='server-error'||reason==='shutdown')
    try{socket?.terminate()}catch{}
   try{proof.ingress211.close()}catch{}
   try{void Promise.resolve(onClosed(request,reason==='shutdown'?'shutdown':
    reason==='server-error'?'server-error':
    reason==='expired'?'expired':'socket-closed')).catch(()=>{})}catch{}
   return true;
  };
  // 36.3–36.6: a server-time deadline closes the original ingress and,
  // once attached, terminates the expired WS even without client traffic.
  // Timers are wakeups, not authentication; still check the clock on each use.
  const current=()=>{
   let at;try{at=now()}catch{release('expired');return false}
   if(!Number.isSafeInteger(at)||at<=0||at>=pinned.expiresAtMs||
      proof.expiresAtMs!==pinned.expiresAtMs||
      proof.transportId!==pinned.transportId||
      proof.scope?.ownerId!==pinned.ownerId||
      proof.scope?.characterId!==pinned.characterId){
    release('expired');return false;
   }
   return !record.closed&&!stopped;
  };
  const arm=()=>{
   if(!current())return;
   let at;try{at=now()}catch{release('expired');return}
   if(!Number.isSafeInteger(at)||at<=0){release('expired');return}
   const ms=Math.min(30000,Math.max(1,pinned.expiresAtMs-at));
   timer=setTimeout(arm,ms);
   timer.unref?.();
  };
  arm();
  const attachSocket=ws=>{
   if(!current()||socket||!ws||typeof ws.terminate!=='function')return false;
   socket=ws;
   return current();
  };
  return Object.freeze({release,attachSocket,
   matches:(p)=>current()&&p===proof&&
    p.transportId===pinned.transportId&&
    p.scope?.ownerId===pinned.ownerId&&
    p.scope?.characterId===pinned.characterId&&
    p.expiresAtMs===pinned.expiresAtMs,
   get closed(){return record.closed},get expiresAtMs(){return pinned.expiresAtMs}});
 };
 const release=request=>{
  const item=records.get(request);
  return item&&!item.closed?item.release('socket-closed'):false;
 };
 // Store the once-only release on the record as well for global shutdown.
 const adopt=(request,proof)=>{
  const token=admit(request,proof);
  if(token)records.get(request).release=token.release;
  return token;
 };
 const shutdown=(reason='shutdown')=>{
  if(stopped)return false;
  stopped=true;
  for(const item of [...active])item.release(reason==='server-error'?'server-error':'shutdown');
  return true;
 };
 return Object.freeze({adopt,release,shutdown,
  inspect:()=>Object.freeze({active:active.size,stopped}),
  privateServerOnly:true,publicRouteInstalled:false,productionReady:false});
}
