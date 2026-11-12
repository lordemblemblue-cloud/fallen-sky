// Combat / Quest 16.9: transport adapter for a FUTURE authenticated player
// route. No HTTP listener is created or mounted by importing this module.
// Server-held 16.8 handles/epochs never enter the presentation response.
import {randomUUID} from 'node:crypto';

const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const SESSION=/^[A-Za-z0-9_.:-]{8,128}$/;
const SHA=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const who=x=>typeof x==='string'&&WHO.test(x)&&
 !['__anon__','__default__'].includes(x);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const safeTime=x=>Number.isSafeInteger(x)&&x>0;
const headers=origin=>Object.freeze({
 'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store, private',
 'X-Content-Type-Options':'nosniff',
 'Vary':'Origin',
 'Access-Control-Allow-Origin':origin,
});
const response=(origin,status,body)=>Object.freeze({
 status,headers:headers(origin),body:Object.freeze(body)
});
const denial=(origin,status,reason)=>response(origin,status,{
 ok:false,version:'16.9',reason,readOnly:true,
 rewardsIssued:false,productionReady:false
});
const array=(x,max)=>Array.isArray(x)&&x.length<=max;
const fields=(x,allowed)=>object(x)&&
 Object.keys(x).every(k=>allowed.includes(k));
const publicBody=(value)=>{
 // 16.8 already checks canonical quest counts/evidence. Whitelist once more:
 // no owner ID, session ID, raw handles, private votes, or arbitrary properties.
 if(!object(value)||value.readOnly!==true||
    !object(value.questbook)||value.questbook.readOnly!==true||
    !array(value.questbook.entries,9)||
    !array(value.questbook.acceptedIds,9)||
    !array(value.questbook.completedIds,9)||
    !array(value.npcInteractionLeads,7)||
    !array(value.rivalInvitations,128))throw Error('unsafe_read_projection');
 const quests=value.questbook.entries.map(q=>Object.freeze({
  id:q.id,title:q.title,npcId:q.npcId,category:q.category,
  requires:q.requires??null,status:q.status,statusLabel:q.statusLabel,
  acceptedAt:q.acceptedAt,completedAt:q.completedAt,
  progressPercent:q.progressPercent,requiresServerTurnIn:q.requiresServerTurnIn,
  objectives:Object.freeze(q.objectives.map(o=>Object.freeze({
   id:o.id,type:o.type,tier:o.tier,targetId:o.targetId,
   count:o.count,current:o.current,done:o.done
  }))),
  readOnly:true,serverVerified:q.serverVerified===true
 }));
 const npc=value.npcInteractionLeads.map(x=>Object.freeze({
  questId:x.questId,npcId:x.npcId,title:x.title,
  optional:x.optional,prerequisiteId:x.prerequisiteId,
  requiresExplicitAccept:true,autoAccepted:false,claimableReward:false
 }));
 const rivals=value.rivalInvitations.map(x=>Object.freeze({
  leadId:x.leadId,otherCharacterId:x.otherCharacterId,
  status:x.status,ownChoice:x.ownChoice,
  requiresExplicitConsent:x.requiresExplicitConsent,
  mutualConsent:x.mutualConsent,relationship:x.relationship,
  questAccepted:false,meetingScheduled:false,rewardsIssued:false
 }));
 if(quests.some(x=>x.serverVerified!==true)||
    rivals.some(x=>!['pending','declined','disputed','rival','friendly_rival'].includes(x.status)))
  throw Error('unverified_presentation');
 const displayed=Object.freeze({
  questbook:Object.freeze({
   acceptedIds:Object.freeze([...value.questbook.acceptedIds]),
   completedIds:Object.freeze([...value.questbook.completedIds]),
   entries:Object.freeze(quests),readOnly:true
  }),
  npcInteractionLeads:Object.freeze(npc),
  rivalInvitations:Object.freeze(rivals),
  readOnly:true,requiresExplicitNpcAcceptance:true,
  rewardsIssued:false
 });
 if(Buffer.byteLength(JSON.stringify(displayed))>131072)
  throw Error('oversized_presentation');
 return displayed;
};
export function createGame3DQuestbookReadTransport169({
 bridge168,resolveTrustedPlayerSession,allowedOrigins,now=Date.now,
 maxSessions=256
}={}){
 if(bridge168?.version!=='16.8'||bridge168.privateServerOnly!==true||
    bridge168.publicEndpointInstalled!==false||
    bridge168.browserQuestStoreConnected!==false||
    typeof bridge168.open!=='function'||typeof bridge168.read!=='function'||
    typeof resolveTrustedPlayerSession!=='function'||typeof now!=='function'||
    !Array.isArray(allowedOrigins)||allowedOrigins.length<1||
    allowedOrigins.length>8||
    !allowedOrigins.every(x=>typeof x==='string'&&
     /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(x))||
    new Set(allowedOrigins).size!==allowedOrigins.length||
    !Number.isSafeInteger(maxSessions)||maxSessions<1||maxSessions>4096)
  throw Error('16.9 needs an unmounted private bridge, trusted auth and origin allowlist');
 const active=new Map();let stopped=false,queue=Promise.resolve();
 const serialize=fn=>{
  const next=queue.then(fn,fn);
  queue=next.then(()=>{},()=>{});
  return next;
 };
 const principal=async context=>{
  let p;
  try{p=await resolveTrustedPlayerSession(context)}catch{return null}
  return p?.authenticated===true&&
    p.identitySource==='trusted-server-session'&&
    who(p.accountId)&&who(p.characterId)&&
    typeof p.serverSessionId==='string'&&SESSION.test(p.serverSessionId)&&
    safeTime(p.expiresAtMs)&&p.expiresAtMs>now()?p:null;
 };
 const same=(a,b)=>!!a&&!!b&&a.accountId===b.accountId&&
  a.characterId===b.characterId&&a.serverSessionId===b.serverSessionId;
 const key=p=>JSON.stringify([p.accountId,p.characterId,p.serverSessionId]);
 const open=async(p,context)=>{
  const started=await bridge168.open({serverRequestContext:context});
  if(started?.ok!==true||started.serverHeldHandle!==true||
     typeof started.handle!=='string'||typeof started.epoch!=='string'||
     !safeTime(started.sessionExpiresAtMs)||
     started.sessionExpiresAtMs<=now()||
     started.browserCredentialIssued!==false)
   throw Error('16.8_session_unavailable');
  const s={
   ownerId:p.accountId,characterId:p.characterId,
   serverSessionId:p.serverSessionId,
   handle:started.handle,epoch:started.epoch,
   expiresAtMs:started.sessionExpiresAtMs,
   viewId:randomUUID()
  };
  active.set(key(p),s);return s;
 };
 const handle=({method,origin,contentType,body,serverRequestContext}={})=>
  serialize(async()=>{
   // Future router must provide serverRequestContext from authenticated
   // middleware, not from any JSON or URL supplied by the browser.
   const safeOrigin=allowedOrigins.includes(origin)?origin:null;
   if(!safeOrigin)return denial('',403,'questbook_origin_denied');
   if(stopped)return denial(safeOrigin,503,'questbook_transport_closed');
   if(method!=='POST')return denial(safeOrigin,405,'questbook_read_only_post');
   if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType||''))
    return denial(safeOrigin,415,'questbook_json_required');
   if(!fields(body,['action','knownRevision','knownViewId'])||
      body.action!=='read'||Object.keys(body).length>3||
      Buffer.byteLength(JSON.stringify(body))>1024||
      !(body.knownRevision==null||
       (typeof body.knownRevision==='string'&&SHA.test(body.knownRevision)))||
      !(body.knownViewId==null||
       (typeof body.knownViewId==='string'&&UUID.test(body.knownViewId))))
    return denial(safeOrigin,422,'invalid_questbook_read_request');
   const p=await principal(serverRequestContext);
   if(!p)return denial(safeOrigin,401,'trusted_questbook_login_required');
   for(const [k,s] of active){
    if(s.expiresAtMs<=now()||
       (s.ownerId===p.accountId&&s.characterId===p.characterId&&
        s.serverSessionId!==p.serverSessionId)||
       (s.serverSessionId===p.serverSessionId&&
        (s.ownerId!==p.accountId||s.characterId!==p.characterId)))
     active.delete(k);
   }
   let s=active.get(key(p));
   if(!s){
    if(active.size>=maxSessions)
     return denial(safeOrigin,503,'questbook_transport_capacity');
    try{s=await open(p,serverRequestContext)}
    catch{return denial(safeOrigin,503,'questbook_session_unavailable')}
   }
   // Conditional reads are valid only inside the same presentation generation.
   const known=body.knownViewId===s.viewId?body.knownRevision??null:null;
   let read=await bridge168.read({serverRequestContext,
    handle:s.handle,epoch:s.epoch,knownRevision:known});
   if(read?.ok!==true&&read?.reason==='stale_questbook_session_fence'){
    active.delete(key(p));
    try{s=await open(p,serverRequestContext)}
    catch{return denial(safeOrigin,503,'questbook_session_unavailable')}
    read=await bridge168.read({serverRequestContext,
     handle:s.handle,epoch:s.epoch,knownRevision:null});
   }
   if(read?.ok!==true||read.version!=='16.8'||
      read.epoch!==s.epoch||typeof read.revision!=='string'||
      !SHA.test(read.revision)||!Number.isSafeInteger(read.sequence)||
      read.sequence<1||read.readOnly!==true||
      read.questWritesEnabled!==false||read.socialWritesEnabled!==false||
      read.rewardsIssued!==false){
    active.delete(key(p));
    return denial(safeOrigin,503,'unverified_questbook_read');
   }
   if(read.unchanged!==true&&read.unchanged!==false)
    return denial(safeOrigin,503,'invalid_questbook_revision');
   if(read.unchanged&&known!==read.revision)
    return denial(safeOrigin,503,'invalid_questbook_revision');
   let projection;
   try{
    if(!read.unchanged)projection=publicBody(read.snapshot);
    else if(Object.hasOwn(read,'snapshot'))
     throw Error('unwanted_snapshot');
   }catch{
    active.delete(key(p));
    return denial(safeOrigin,503,'unverified_questbook_presentation');
   }
   const after=await principal(serverRequestContext);
   if(!same(p,after)||s.expiresAtMs<=now()||
      active.get(key(p))!==s){
    active.delete(key(p));
    return denial(safeOrigin,401,'trusted_questbook_session_changed');
   }
   return response(safeOrigin,200,{
    ok:true,version:'16.9',viewId:s.viewId,
    revision:read.revision,sequence:read.sequence,
    unchanged:read.unchanged,readOnly:true,
    ...(projection?{snapshot:projection}:{}),
    rewardsIssued:false,productionReady:false
   });
  });
 const shutdown=()=>serialize(async()=>{
  stopped=true;active.clear();
  return Object.freeze({ok:true,sessionHandlesReleased:true,
   underlyingPrivateBridgeStillOwnedByServer:true});
 });
 return Object.freeze({version:'16.9',handle,shutdown,
  routeMounted:false,publicEndpointInstalled:false,
  authenticatedRouterRequired:true,originAllowlistRequired:true,
  browserTokensIssued:false,questWritesEnabled:false,
  rewardsIssued:false,productionReady:false});
}
