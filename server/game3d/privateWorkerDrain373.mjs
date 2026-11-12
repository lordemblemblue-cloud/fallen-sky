// 37.4–38.1: fail-closed drain for the EXISTING private loopback worker.
// No new socket listener, login authority, public route, or gameplay capability.
export function createPrivateWorkerDrain373({server,wss,capacity,sessionSlots,
 socketLeases,lifecycle,onUpgrade,onDraining=()=>{},onFatal=()=>{},
 closeTimeoutMs=2500}={}){
 if(typeof server?.close!=='function'||typeof server?.off!=='function'||
    typeof wss?.close!=='function'||typeof capacity?.shutdown!=='function'||
    typeof sessionSlots?.shutdown!=='function'||
    typeof socketLeases?.shutdown!=='function'||
    typeof lifecycle?.shutdown!=='function'||
    typeof onUpgrade!=='function'||typeof onDraining!=='function'||
    typeof onFatal!=='function'||!Number.isInteger(closeTimeoutMs)||
    closeTimeoutMs<100||closeTimeoutMs>10000)
  throw Error('37.4 requires original private worker cleanup dependencies');
 let stopped=false,task=null,completed=false,timedOut=false;
 const safe=fn=>{try{fn()}catch{}};
 const close=(reason='shutdown')=>{
  if(task)return task;
  stopped=true;
  safe(onDraining); // latch closed BEFORE cleanup or asynchronous close callbacks
  if(reason==='server-error')safe(onFatal);
  safe(()=>server.off('upgrade',onUpgrade));
  safe(()=>capacity.shutdown());
  safe(()=>sessionSlots.shutdown());
  safe(()=>socketLeases.shutdown(reason==='server-error'?'server-error':'shutdown'));
  safe(()=>lifecycle.shutdown());
  // HTTP keep-alive and incomplete TLS requests are not covered by WS lifecycle.
  safe(()=>server.closeIdleConnections?.());
  safe(()=>server.closeAllConnections?.());
  // The registered 23.2 listener and ws server are stopped; this module
  // cannot and does not restart the original one-use authentication session.
  const closing=fn=>new Promise(resolve=>{
   let settled=false;
   const done=error=>{if(!settled){settled=true;resolve(!error)}};
   try{fn(done)}catch{done(Error('private server close exception'))}
  });
  let timer;
  task=Promise.race([
   Promise.all([
    closing(done=>wss.close(done)),
    closing(done=>server.close(done)),
   ]).then(results=>results.every(Boolean)),
   new Promise(resolve=>{timer=setTimeout(()=>{
    timedOut=true;resolve(false);
   },closeTimeoutMs)}),
  ]).then(ok=>{completed=ok;return ok},()=>false).finally(()=>clearTimeout(timer));
  return task;
 };
 return Object.freeze({version:'37.4',close,failClosed:()=>close('server-error'),
  inspect:()=>Object.freeze({draining:stopped,completed,timedOut}),
  privateServerOnly:true,publicRouteInstalled:false,
  resumeCombatAuthorized:false,rewardsIssued:false,productionReady:false});
}
