// Game 3D 18.3 — staging-only sequencing of PG leases with world admission.
// No route, PG role, or authentication is created here; the verified
// privateSignedQuestWorldStaging183 factory must supply those dependencies.
export function createGame3DPrivateWorldLeaseLifecycle183({
 worldStage180,leaseIssuer183,route,enabled=false,
}={}) {
 if(enabled!==true||process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    worldStage180?.version!=='18.0'||worldStage180.privateServerOnly!==true||
    leaseIssuer183?.version!=='18.3'||leaseIssuer183.privateServerOnly!==true||
    leaseIssuer183.publicRouteInstalled!==false||
    ['activate','revoke','shutdown'].some(k=>typeof leaseIssuer183[k]!=='function')||
    ['open','beginWorldPairing','completeWorldPairing','revokeWorldPairing',
     'close','shutdown','sendWorldAction','recordNpcInteraction'].some(k=>
      typeof worldStage180[k]!=='function')||
    typeof route?.handle!=='function'||typeof route.shutdown!=='function')
  throw Error('18.3 lifecycle requires verified private world and PG lease issuer');
 const denied=reason=>Object.freeze({ok:false,version:'18.3',reason,
  privateServerOnly:true,rewardsIssued:false,productionReady:false});
 let stopped=false,leaseContext=null,serial=Promise.resolve();
 // Serialize the WHOLE lease+world operation, not merely the issuer SQL.
 // Otherwise two private opens/revokes can interleave between PG commit
 // and the 17.9 world transition, even though each issuer call is queued.
 const enqueue=fn=>{
  const result=serial.then(fn,fn);
  serial=result.then(()=>{},()=>{});
  return result;
 };
 const revokeLease=async requestContext=>{
  let revoked;
  try{revoked=await leaseIssuer183.revoke({
   serverRequestContext:leaseContext??requestContext,
  })}catch{}
  if(revoked?.ok!==true)return denied('database_lease_revocation_unconfirmed');
  leaseContext=null;
  return null;
 };
 const openWorld=(args={})=>enqueue(async()=>{
  if(stopped)return denied('staging_closed');
  // A prior world cannot be replaced before PG revocation has finished.
  const blocked=await revokeLease(args?.serverRequestContext);
  if(blocked)return blocked;
  if(stopped)return denied('staging_closed');
  let opened;
  try{opened=await worldStage180.open(args)}
  catch{return denied('private_world_open_unavailable')}
  if(opened?.ok!==true)return opened??denied('private_world_open_unavailable');
  let active;
  try{active=await leaseIssuer183.activate({
   serverRequestContext:args.serverRequestContext,
  })}catch{}
  if(active?.ok!==true||stopped){
   // Even if issuer PG publication completed during shutdown, the queued
   // shutdown operation will revoke that lease before this facade stops.
   try{await worldStage180.close({handle:opened.handle,
    serverRequestContext:args.serverRequestContext})}catch{}
   if(active?.ok===true)leaseContext=args.serverRequestContext;
   return denied(stopped?'staging_closed':'session_lease_not_published');
  }
  leaseContext=args.serverRequestContext;
  return opened;
 });
 const retireAndCall=(args,operation)=>enqueue(async()=>{
  if(stopped)return denied('staging_closed');
  const blocked=await revokeLease(args?.serverRequestContext);
  if(blocked)return blocked;
  if(stopped)return denied('staging_closed');
  try{return await operation(args)}
  catch{return denied('private_world_operation_unavailable')}
 });
 const beginWorldPairing=args=>
  retireAndCall(args,worldStage180.beginWorldPairing);
 const completeWorldPairing=args=>enqueue(async()=>{
  if(stopped)return denied('staging_closed');
  try{return await worldStage180.completeWorldPairing(args)}
  catch{return denied('private_pairing_unavailable')}
 });
 const revokeWorldPairing=args=>
  retireAndCall(args,worldStage180.revokeWorldPairing);
 const closeWorld=args=>retireAndCall(args,worldStage180.close);
 const shutdown=()=>{
  stopped=true;
  return enqueue(async()=>{
   let revoked;
   try{revoked=await leaseIssuer183.shutdown()}catch{}
   leaseContext=null;
   try{await route.shutdown()}catch{}
   try{await worldStage180.shutdown()}catch{}
   return revoked?.ok===true?
    Object.freeze({ok:true,version:'18.3',rewardsIssued:false}):
    denied('database_lease_revocation_unconfirmed');
  });
 };
 return Object.freeze({version:'18.3',
  handleSignedQuestAction:route.handle,
  openWorld,beginWorldPairing,
  completeWorldPairing,
  revokeWorldPairing,closeWorld,
  sendWorldAction:worldStage180.sendWorldAction,
  recordNpcInteraction:worldStage180.recordNpcInteraction,
  shutdown,
  privateServerOnly:true,publicPlayerRouteInstalled:false,
  publicQuestActionWriterInstalled:false,rewardsIssued:false,
  productionReady:false});
}
