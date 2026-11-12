// 23.1 - non-sensitive admission-plan snapshot for staging operators.
export function reviewPrivateLoopback231({config,capacity,lifecycle,metrics,sessionSlots,port}={}){
 if(config?.host!=='127.0.0.1'||!Number.isInteger(port)||port<=0||port>65535)
  return null;
 return Object.freeze({version:'23.1',host:'127.0.0.1',port,
  tlsRequired:true,publicListenerCreated:false,liveGameRouteInstalled:false,
  stagingOnly:true,maxConcurrentSockets:2,maxPendingHandshakes:2,
  currentlyActive:capacity.snapshot().sockets,
  currentHandshakes:capacity.snapshot().handshakes,
  adoptedSockets:lifecycle.snapshot().active,
  verifiedAccounts:sessionSlots?.snapshot().accounts??0,
  counters:metrics.snapshot(),
  rewardsIssued:false,resumeCombatAuthorized:false,productionReady:false});
}
