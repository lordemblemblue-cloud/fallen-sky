// Combat / Quest 16.8 — SERVER-HELD, READ-ONLY session bridge.
// Contract only: no HTTP handler, public route, browser bearer, quest writes,
// rewards, NPC dialogue or mutation of the existing client useQuestStore.
import {createHash,randomUUID} from 'node:crypto';
import {PRIVATE_QUESTBOOK_PROJECTION_VERSION_167}
 from './privateQuestbookProjection167.mjs';

const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const SESSION=/^[A-Za-z0-9_.:-]{8,128}$/;
const ID=/^[A-Za-z0-9_.:-]{1,160}$/;
const SHA=/^[a-f0-9]{64}$/;
const allowedStatus=new Set(['pending','declined','disputed','rival','friendly_rival']);
const ownVotes=new Set(['rival','friendly_rival','decline']);
const who=x=>typeof x==='string'&&WHO.test(x)&&
 !['__anon__','__default__'].includes(x);
const id=x=>typeof x==='string'&&ID.test(x);
const str=(x,max=200)=>typeof x==='string'&&x.length>0&&x.length<=max;
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const bounded=(x,max)=>Array.isArray(x)&&x.length<=max;
const count=x=>Number.isSafeInteger(x)&&x>=0;
const refusal=reason=>Object.freeze({ok:false,version:'16.8',reason,
 readOnly:true,privateServerOnly:true,publicEndpointInstalled:false,
 browserQuestStoreConnected:false,questWritesEnabled:false,
 socialWritesEnabled:false,rewardsIssued:false,productionReady:false});
function normalizedTime(x,nullable=false){
 if(nullable&&x===null)return null;
 const t=x instanceof Date?x:new Date(x);
 if(!Number.isFinite(t.getTime()))throw Error('Unverified quest time');
 return t.toISOString();
}
function questEntry(q){
 if(!object(q)||!id(q.id)||q.questId!==q.id||
    !str(q.title)||!id(q.npcId)||!str(q.category,64)||
    !['accepted','completed'].includes(q.status)||
    !['In Progress','Ready to turn in','Completed'].includes(q.statusLabel)||
    !count(q.progressPercent)||q.progressPercent>100||
    q.serverVerified!==true||q.readOnly!==true||
    !bounded(q.objectives,16)||q.objectives.length!==1||
    typeof q.requiresServerTurnIn!=='boolean')
  throw Error('Invalid 16.7 quest entry');
 const o=q.objectives[0];
 if(!object(o)||!id(o.id)||!str(o.type,64)||
    !count(o.count)||o.count===0||!count(o.current)||
    o.current>o.count||o.done!==(o.current===o.count)||
    ![null,undefined].includes(o.tier)&&!str(o.tier,64))
  throw Error('Invalid 16.7 quest objective');
 if(o.targetId!=null&&!id(o.targetId))throw Error('Invalid quest target');
 if(q.requires!=null&&!id(q.requires))throw Error('Invalid quest prerequisite');
 if(q.progressPercent!==Math.round(100*o.current/o.count)||
    q.statusLabel!==(q.status==='completed'?'Completed':
      o.current===o.count?'Ready to turn in':'In Progress')||
    (q.status==='completed'&&o.current!==o.count)||
    q.requiresServerTurnIn!==(q.status==='accepted'&&o.current===o.count))
  throw Error('Conflicting quest progress');
 const acceptedAt=normalizedTime(q.acceptedAt);
 const completedAt=normalizedTime(q.completedAt,true);
 if((q.status==='completed')!==(completedAt!==null))
  throw Error('Conflicting quest completion');
 return Object.freeze({
  id:q.id,questId:q.id,title:q.title,npcId:q.npcId,
  category:q.category,requires:q.requires??null,
  status:q.status,statusLabel:q.statusLabel,
  progressPercent:q.progressPercent,acceptedAt,completedAt,
  objectives:Object.freeze([Object.freeze({
   id:o.id,type:o.type,tier:o.tier??null,targetId:o.targetId??null,
   count:o.count,current:o.current,done:o.done,optional:false
  })]),
  serverVerified:true,readOnly:true,
  requiresServerTurnIn:q.requiresServerTurnIn,
  canTrackFromServer:false,canAbandonFromServer:false,
  hasUnissuedRewards:false,rewardState:'not_authorized_in_projection'
 });
}
function npcLead(x){
 if(!object(x)||!id(x.questId)||!id(x.npcId)||!str(x.title)||
    !id(x.prerequisiteId)||typeof x.optional!=='boolean'||
    x.action!=='request_private_server_quest_acceptance'||
    x.requiresExplicitAccept!==true||x.autoAccepted!==false||
    x.claimableReward!==false||x.readOnly!==true)
  throw Error('Invalid NPC lead');
 return Object.freeze({questId:x.questId,npcId:x.npcId,
  title:x.title,prerequisiteId:x.prerequisiteId,optional:x.optional,
  requiresExplicitAccept:true,autoAccepted:false,
  claimableReward:false,readOnly:true,
  action:'request_private_server_quest_acceptance'});
}
function rival(x){
 if(!object(x)||!id(x.leadId)||!id(x.otherCharacterId)||
    !allowedStatus.has(x.status)||
    !['initiator','counterpart'].includes(x.actorRole)||
    !(x.ownChoice===null||ownVotes.has(x.ownChoice))||
    x.otherChoice!==null||typeof x.requiresExplicitConsent!=='boolean'||
    typeof x.mutualConsent!=='boolean'||x.readOnly!==true||
    x.questAccepted!==false||x.meetingScheduled!==false||
    x.rewardsIssued!==false||
    x.mutualConsent!==['rival','friendly_rival'].includes(x.status)||
    x.requiresExplicitConsent!==(x.status==='pending'&&x.ownChoice===null)||
    x.relationship!==(x.mutualConsent?x.status:null))
  throw Error('Invalid Rival projection');
 return Object.freeze({leadId:x.leadId,otherCharacterId:x.otherCharacterId,
  status:x.status,actorRole:x.actorRole,ownChoice:x.ownChoice,
  otherChoice:null,requiresExplicitConsent:x.requiresExplicitConsent,
  mutualConsent:x.mutualConsent,relationship:x.relationship,
  questAccepted:false,meetingScheduled:false,rewardsIssued:false,
  readOnly:true});
}
function sanitizeSnapshot(snapshot,principal){
 if(!object(snapshot)||snapshot.ok!==true||snapshot.version!=='16.7'||
    snapshot.projectionVersion!==PRIVATE_QUESTBOOK_PROJECTION_VERSION_167||
    snapshot.ownerId!==principal.accountId||
    snapshot.characterId!==principal.characterId||
    snapshot.privateServerOnly!==true||
    snapshot.publicEndpointInstalled!==false||
    snapshot.browserQuestStoreConnected!==false||
    snapshot.questWritesEnabled!==false||
    snapshot.socialWritesEnabled!==false||
    snapshot.rewardsIssued!==false||
    !object(snapshot.questbook)||snapshot.questbook.readOnly!==true||
    !bounded(snapshot.questbook.entries,9)||
    !bounded(snapshot.questbook.acceptedIds,9)||
    !bounded(snapshot.questbook.completedIds,9)||
    !bounded(snapshot.npcInteractionLeads,7)||
    !bounded(snapshot.rivalInvitations,128))
  throw Error('Unverified 16.7 read model');
 const entries=snapshot.questbook.entries.map(questEntry);
 const entryIds=new Set(entries.map(q=>q.id));
 if(entryIds.size!==entries.length)throw Error('Duplicate quest');
 const accepted=entries.filter(q=>q.status==='accepted').map(q=>q.id);
 const completed=entries.filter(q=>q.status==='completed').map(q=>q.id);
 const sameSet=(items,expected)=>items.length===expected.length&&
   new Set(items).size===items.length&&
   items.every(x=>id(x)&&expected.includes(x));
 if(!sameSet(snapshot.questbook.acceptedIds,accepted)||
    !sameSet(snapshot.questbook.completedIds,completed))
  throw Error('Quest indexes disagree');
 const leads=snapshot.npcInteractionLeads.map(npcLead);
 if(new Set(leads.map(x=>x.questId)).size!==leads.length||
    leads.some(x=>entryIds.has(x.questId)||
     !completed.includes(x.prerequisiteId)))
  throw Error('Invalid NPC eligibility');
 const rivals=snapshot.rivalInvitations.map(rival);
 if(new Set(rivals.map(x=>x.leadId)).size!==rivals.length||
    rivals.some(x=>x.otherCharacterId===principal.characterId))
  throw Error('Duplicate or self Rival');
 const safe=Object.freeze({
  projectionVersion:PRIVATE_QUESTBOOK_PROJECTION_VERSION_167,
  questbook:Object.freeze({acceptedIds:Object.freeze(accepted),
   completedIds:Object.freeze(completed),entries:Object.freeze(entries),
   readOnly:true}),
  npcInteractionLeads:Object.freeze(leads),
  rivalInvitations:Object.freeze(rivals),
  requiresExplicitNpcAcceptance:true,readOnly:true
 });
 if(Buffer.byteLength(JSON.stringify(safe))>131072)
  throw Error('Oversized private Questbook');
 return safe;
}
// Each read is independently authorized by a private server session resolver;
// no caller-supplied ownerId/characterId, cookie, token or browser claims.
export function createGame3DPrivateQuestbookSessionBridge168({
 projection167,resolveTrustedPlayerSession,now=Date.now,
 leaseMs=120000,maxHandles=256
}={}){
 if(projection167?.version!=='16.7'||
    projection167.privateServerOnly!==true||
    projection167.publicEndpointInstalled!==false||
    projection167.browserQuestStoreConnected!==false||
    typeof projection167.readSnapshot!=='function'||
    typeof resolveTrustedPlayerSession!=='function'||
    typeof now!=='function'||!count(leaseMs)||
    leaseMs<1000||leaseMs>900000||
    !Number.isSafeInteger(maxHandles)||maxHandles<1||maxHandles>4096)
  throw Error('16.8 requires trusted session resolver and private 16.7 reader');
 const active=new Map();let stopped=false,queue=Promise.resolve();
 const sequential=fn=>{
  const next=queue.then(fn,fn);
  queue=next.then(()=>undefined,()=>undefined);
  return next;
 };
 const principal=async context=>{
  let p=null;
  try{p=await resolveTrustedPlayerSession(context)}catch{}
  return p?.authenticated===true&&
   p.identitySource==='trusted-server-session'&&
   who(p.accountId)&&who(p.characterId)&&
   typeof p.serverSessionId==='string'&&SESSION.test(p.serverSessionId)&&
   Number.isSafeInteger(p.expiresAtMs)&&p.expiresAtMs>now()?p:null;
 };
 const purge=()=>{
  for(const [handle,s] of active){
   if(s.expiresAtMs<=now())active.delete(handle);
  }
 };
 const matches=(s,p)=>!!s&&!!p&&s.serverSessionId===p.serverSessionId&&
   s.ownerId===p.accountId&&s.characterId===p.characterId&&
   s.expiresAtMs>now();
 const open=({serverRequestContext}={})=>sequential(async()=>{
  if(stopped)return refusal('questbook_bridge_closed');
  const p=await principal(serverRequestContext);
  if(!p)return refusal('trusted_questbook_login_required');
  purge();
  // A reconnect, re-login or character switch fences old handles.
  for(const [handle,s] of active)
   if(s.serverSessionId===p.serverSessionId||
      (s.ownerId===p.accountId&&s.characterId===p.characterId))
    active.delete(handle);
  if(active.size>=maxHandles)return refusal('private_questbook_capacity');
  const handle=randomUUID(),epoch=randomUUID();
  const expiresAtMs=Math.min(now()+leaseMs,p.expiresAtMs);
  active.set(handle,{epoch,serverSessionId:p.serverSessionId,
   ownerId:p.accountId,characterId:p.characterId,expiresAtMs,
   revision:null,sequence:0});
  return Object.freeze({ok:true,version:'16.8',handle,epoch,
   sessionExpiresAtMs:expiresAtMs,readOnly:true,serverHeldHandle:true,
   browserCredentialIssued:false,privateServerOnly:true,
   publicEndpointInstalled:false,productionReady:false});
 });
 const read=({handle,epoch,knownRevision=null,serverRequestContext}={})=>
  sequential(async()=>{
   if(stopped)return refusal('questbook_bridge_closed');
   if(typeof handle!=='string'||typeof epoch!=='string'||
      !(knownRevision===null||
        (typeof knownRevision==='string'&&SHA.test(knownRevision))))
    return refusal('invalid_private_questbook_read');
   purge();
   const s=active.get(handle);
   if(!s||s.epoch!==epoch)return refusal('stale_questbook_session_fence');
   const p=await principal(serverRequestContext);
   if(!matches(s,p))return refusal('trusted_questbook_session_mismatch');
   let snapshot;
   try{
    const projected=await projection167.readSnapshot({
     ownerId:s.ownerId,characterId:s.characterId});
    snapshot=sanitizeSnapshot(projected,p);
   }catch{return refusal('unverified_private_questbook_snapshot')}
   // Credentials may expire or be revoked while the DB transaction is in flight.
   const again=await principal(serverRequestContext);
   if(!matches(s,again)||active.get(handle)!==s||
      s.epoch!==epoch)return refusal('trusted_questbook_session_mismatch');
   const revision=createHash('sha256')
    .update(s.ownerId+'\0'+s.characterId+'\0')
    .update(JSON.stringify(snapshot)).digest('hex');
   if(revision!==s.revision){s.revision=revision;s.sequence++;}
   const unchanged=knownRevision===revision;
   return Object.freeze({ok:true,version:'16.8',epoch,revision,
    sequence:s.sequence,unchanged,readOnly:true,
    // The already-authenticated server may send a separately reviewed
    // presentation model later. This bridge itself is never a browser route.
    ...(unchanged?{}:{snapshot}),
    privateServerOnly:true,publicEndpointInstalled:false,
    browserQuestStoreConnected:false,questWritesEnabled:false,
    socialWritesEnabled:false,rewardsIssued:false,
    productionReady:false});
  });
 const close=({handle,epoch,serverRequestContext}={})=>sequential(async()=>{
  if(stopped)return refusal('questbook_bridge_closed');
  const s=active.get(handle),p=await principal(serverRequestContext);
  if(!s||s.epoch!==epoch||!matches(s,p))
   return refusal('trusted_questbook_session_mismatch');
  active.delete(handle);
  return Object.freeze({ok:true,version:'16.8',closed:true,
   privateServerOnly:true,publicEndpointInstalled:false,
   rewardsIssued:false,productionReady:false});
 });
 // Privileged server shutdown, never a browser action.
 const shutdown=()=>sequential(async()=>{
  const alreadyClosed=stopped;stopped=true;active.clear();
  return Object.freeze({ok:true,alreadyClosed});
 });
 return Object.freeze({version:'16.8',open,read,close,shutdown,
  privateServerOnly:true,readOnly:true,serverHeldHandles:true,
  authenticatedServerResolverRequired:true,
  publicEndpointInstalled:false,publicTransportInstalled:false,
  browserQuestStoreConnected:false,clientReconciliationInstalled:false,
  npcDialogueBridgeInstalled:false,questWritesEnabled:false,
  socialWritesEnabled:false,rewardsIssued:false,productionReady:false});
}
