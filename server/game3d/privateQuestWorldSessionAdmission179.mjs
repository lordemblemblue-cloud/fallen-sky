// Combat / Quest 17.9 — private account/character + Base44 action-session
// admission to the existing 15.0 server-held PvE world bridge.
// No browser-supplied identity, NPC position or quest progress is trusted.
import {randomUUID} from 'node:crypto';

const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const WORLD=/^[A-Za-z0-9_.:-]{8,128}$/;
const ACTION=/^qb174-[a-f0-9]{64}$/;
const clean=x=>typeof x==='string'&&WHO.test(x)&&
 !['__anon__','__default__','__dev_test__'].includes(x);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const denied=reason=>Object.freeze({ok:false,version:'17.9',reason,
 privateServerOnly:true,rewardsIssued:false,productionReady:false});

export function createGame3DQuestWorldSessionAdmission179({
 worldBridge150,scope,resolveTrustedWorldPrincipal,
 resolveVerifiedBase44ActionSession,verifySessionActive,
 createTrustedNpcHost178,now=Date.now,
}={}){
 if(worldBridge150?.version!=='15.0'||worldBridge150.privateServerOnly!==true||
    worldBridge150.publicPlayerRouteInstalled!==false||
    ['open','send','close','shutdown'].some(k=>typeof worldBridge150[k]!=='function')||
    !object(scope)||!clean(scope.ownerId)||!clean(scope.characterId)||
    typeof scope.instanceId!=='string'||!WORLD.test(scope.instanceId)||
    [resolveTrustedWorldPrincipal,resolveVerifiedBase44ActionSession,
      verifySessionActive,createTrustedNpcHost178,now]
      .some(f=>typeof f!=='function'))
  throw Error('17.9 requires private 15.0 bridge and two independently verified sessions');
 const pinned=Object.freeze({ownerId:scope.ownerId,characterId:scope.characterId,
  instanceId:scope.instanceId});
 const internal=new WeakMap();
 let active=null,closed=false,serial=Promise.resolve(),generation=0;
 const enqueue=fn=>{const p=serial.then(fn,fn);serial=p.then(()=>{},()=>{});return p};
 const attest=async context=>{
  if(closed||!object(context))return null;
  let p,a;
  try{
   [p,a]=await Promise.all([
    resolveTrustedWorldPrincipal(context),
    resolveVerifiedBase44ActionSession(context)
   ]);
  }catch{return null}
  const t=now();
  if(!Number.isSafeInteger(t)||!object(p)||!object(a)||
     p.authenticated!==true||p.identitySource!=='trusted-server-session'||
     a.authenticated!==true||
     a.identitySource!=='base44-verified-action-session-179'||
     p.accountId!==pinned.ownerId||p.characterId!==pinned.characterId||
     a.accountId!==pinned.ownerId||a.characterId!==pinned.characterId||
     typeof p.serverSessionId!=='string'||!WORLD.test(p.serverSessionId)||
     a.worldSessionId!==p.serverSessionId||
     typeof a.actionSessionId!=='string'||!ACTION.test(a.actionSessionId)||
     !Number.isSafeInteger(p.expiresAtMs)||p.expiresAtMs<=t||
     !Number.isSafeInteger(a.expiresAtMs)||a.expiresAtMs<=t||
     p.expiresAtMs>t+900000||a.expiresAtMs>t+900000)
   return null;
  const claim=Object.freeze({ownerId:pinned.ownerId,
   characterId:pinned.characterId,instanceId:pinned.instanceId,
   serverSessionId:p.serverSessionId,actionSessionId:a.actionSessionId});
  try{if(await verifySessionActive(claim)!==true)return null}
  catch{return null}
  if(closed||now()>=Math.min(p.expiresAtMs,a.expiresAtMs))return null;
  return Object.freeze({...claim,expiresAtMs:Math.min(p.expiresAtMs,a.expiresAtMs)});
 };
 const same=(x,y)=>x&&y&&x.ownerId===y.ownerId&&
  x.characterId===y.characterId&&x.instanceId===y.instanceId&&
  x.serverSessionId===y.serverSessionId&&x.actionSessionId===y.actionSessionId;
 const verify=async({handle,serverRequestContext})=>{
  if(closed||!active||handle!==active.handle||active.expiresAtMs<=now())return null;
  const proof=await attest(serverRequestContext);
  if(!same(proof,active)||active.expiresAtMs<=now())return null;
  return proof;
 };
 const open=({serverRequestContext}={})=>enqueue(async()=>{
  if(closed)return denied('admission_closed');
  const before=await attest(serverRequestContext);
  if(!before)return denied('unverified_world_or_base44_session');
  // The 15.0 issuer may revoke the previous bearer while opening a new one.
  // Retire the previous Questbook/world binding BEFORE that issuer call.
  active=null;generation++;
  let result;
  try{result=await worldBridge150.open({serverRequestContext})}
  catch{return denied('private_world_unavailable')}
  if(result?.ok!==true||typeof result.handle!=='string'||
     !WORLD.test(result.handle)||result.worldInstanceId!==pinned.instanceId||
     result.credentialDeliveredToBrowser!==false||
     !Number.isSafeInteger(result.sessionExpiresAtMs)||
     result.sessionExpiresAtMs<=now()){
   if(typeof result?.handle==='string')
    try{await worldBridge150.close({handle:result.handle,serverRequestContext})}catch{}
   return denied('private_world_admission_failed');
  }
  const after=await attest(serverRequestContext);
  if(!same(before,after)||!after){
   try{await worldBridge150.close({handle:result.handle,serverRequestContext})}catch{}
   return denied('admission_session_changed');
  }
  // Only one session is active in this single private world. 15.0 itself
  // invalidates previous bearer tokens when a new one is issued.
  generation++;
  active=Object.freeze({...after,handle:result.handle,
   expiresAtMs:Math.min(after.expiresAtMs,result.sessionExpiresAtMs),generation});
  return Object.freeze({ok:true,version:'17.9',handle:result.handle,
   worldInstanceId:pinned.instanceId,expiresAtMs:active.expiresAtMs,
   credentialDeliveredToBrowser:false,privateServerOnly:true,
   rewardsIssued:false,productionReady:false});
 });
 const resolveTrustedWorldActor=async opaque=>{
  if(closed||!object(opaque))return null;
  const entry=internal.get(opaque);
  if(!entry||!active||entry.generation!==active.generation||
     !same(entry,active)||entry.expiresAtMs<=now())return null;
  // Revalidate against the authoritative session store; an independently
  // revoked Base44 action session cannot be used after its last HTTP request.
  try{
   if(await verifySessionActive(Object.freeze({ownerId:entry.ownerId,
    characterId:entry.characterId,instanceId:entry.instanceId,
    serverSessionId:entry.serverSessionId,
    actionSessionId:entry.actionSessionId}))!==true)return null;
  }catch{return null}
  if(closed||!active||entry.generation!==active.generation||
     entry.expiresAtMs<=now())return null;
  return Object.freeze({authenticated:true,
   identitySource:'trusted-server-session',accountId:entry.ownerId,
   characterId:entry.characterId,actionSessionId:entry.actionSessionId,
   sessionExpiresAtMs:entry.expiresAtMs});
 };
 // Bind exactly one world-NPC host at construction. A caller may NEVER
 // substitute an arbitrary host/receipt provider on an action request.
 const privateNpcHost=createTrustedNpcHost178(Object.freeze({
  resolveTrustedWorldActor
 }));
 if(privateNpcHost?.version!=='17.8'||
    privateNpcHost.publicRouteInstalled!==false||
    typeof privateNpcHost.recordServerInteraction!=='function')
  throw Error('17.9 requires the actual private 17.8 NPC host');
 const recordNpcInteraction=async request=>{
  if(!object(request)||Object.keys(request).length!==4||
     Object.keys(request).some(k=>!
      ['handle','serverRequestContext','questId','npcId'].includes(k)))
   return denied('unexpected_browser_npc_fields');
  const {handle,serverRequestContext,questId,npcId}=request;
  const proof=await verify({handle,serverRequestContext});
  if(!proof)return denied('private_action_session_unverified');
  const opaque=Object.freeze({privateNpcIntent179:randomUUID()});
  internal.set(opaque,Object.freeze({...proof,generation:active.generation}));
  let result;
  try{result=await privateNpcHost.recordServerInteraction({
   serverRequestContext:opaque,questId,npcId});}
  catch{return denied('private_npc_interaction_failed')}
  if(!await verify({handle,serverRequestContext})||
     !active||!same(proof,active)||proof.expiresAtMs<=now()||
     result?.ok!==true)return denied('private_npc_interaction_denied');
  return Object.freeze({ok:true,version:'17.9',receiptId:result.receiptId,
   rewardsIssued:false,productionReady:false});
 };
 const sendWorldAction=async({handle,action,payload,serverRequestContext}={})=>{
  if(!await verify({handle,serverRequestContext}))
   return denied('private_action_session_unverified');
  try{return await worldBridge150.send({handle,action,payload,serverRequestContext})}
  catch{return denied('private_world_unavailable')}
 };
 const close=({handle,serverRequestContext}={})=>enqueue(async()=>{
  if(!await verify({handle,serverRequestContext}))
   return denied('private_action_session_unverified');
  active=null;generation++;
  try{return await worldBridge150.close({handle,serverRequestContext})}
  catch{return denied('private_world_revoke_unconfirmed')}
 });
 const shutdown=()=>enqueue(async()=>{
  if(closed)return denied('already_closed');
  closed=true;active=null;generation++;
  try{return await worldBridge150.shutdown()}
  catch{return denied('world_shutdown_unconfirmed')}
 });
 return Object.freeze({version:'17.9',open,close,shutdown,
  recordNpcInteraction,resolveTrustedWorldActor,sendWorldAction,
  privateServerOnly:true,publicPlayerRouteInstalled:false,
  browserClaimsAccepted:false,realBase44ProviderInstalled:false,
  rewardsIssued:false,productionReady:false});
}
