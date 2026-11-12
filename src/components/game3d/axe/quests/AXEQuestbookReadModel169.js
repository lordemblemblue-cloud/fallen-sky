// Combat / Quest 16.9: opt-in READ-ONLY presentation reconciler.
// Not a credential validator. Accept envelopes ONLY from the authenticated
// Questbook route, never localStorage, window messages, NPC or combat events.
import { projectEchoConstellation } from '../../livingChronicles/echoConstellation.mjs';
import { projectChronicleNarrative } from '../../livingChronicles/chronicleNarrative.mjs';
const SHA=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ID=/^[A-Za-z0-9_.:-]{1,160}$/;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const bounded=(x,n)=>Array.isArray(x)&&x.length<=n;
const count=x=>Number.isSafeInteger(x)&&x>=0;
const bad=reason=>Object.freeze({ok:false,reason,readOnly:true});
const usable=(s)=>{
 if(!object(s)||s.readOnly!==true||s.rewardsIssued!==false||
    s.requiresExplicitNpcAcceptance!==true||
    !object(s.questbook)||s.questbook.readOnly!==true||
    !bounded(s.questbook.entries,9)||
    !bounded(s.questbook.acceptedIds,9)||
    !bounded(s.questbook.completedIds,9)||
    !bounded(s.npcInteractionLeads,7)||
    !bounded(s.rivalInvitations,128))return false;
 const quests=s.questbook.entries,ids=new Set();
 for(const q of quests){
  if(!object(q)||typeof q.id!=='string'||!ID.test(q.id)||
     ids.has(q.id)||typeof q.title!=='string'||q.title.length>200||
     !ID.test(q.npcId)||typeof q.category!=='string'||
     !['accepted','completed'].includes(q.status)||
     !bounded(q.objectives,1)||q.objectives.length!==1||
     q.serverVerified!==true||q.readOnly!==true||
     !count(q.progressPercent)||q.progressPercent>100)return false;
  const o=q.objectives[0];
  if(!object(o)||!ID.test(o.id)||!count(o.count)||o.count===0||
     !count(o.current)||o.current>o.count||o.done!==(o.current===o.count)||
     q.progressPercent!==Math.round(100*o.current/o.count)||
     q.statusLabel!==(q.status==='completed'?'Completed':
      o.current===o.count?'Ready to turn in':'In Progress')||
     (q.status==='completed'&&o.current!==o.count))return false;
  ids.add(q.id);
 }
 const accept=quests.filter(q=>q.status==='accepted').map(q=>q.id);
 const complete=quests.filter(q=>q.status==='completed').map(q=>q.id);
 const same=(x,expected)=>x.length===expected.length&&
   new Set(x).size===x.length&&
   x.every(id=>expected.includes(id));
 if(!same(s.questbook.acceptedIds,accept)||
    !same(s.questbook.completedIds,complete))return false;
 const leads=s.npcInteractionLeads;
 if(new Set(leads.map(x=>x.questId)).size!==leads.length||
    leads.some(x=>!object(x)||!ID.test(x.questId)||!ID.test(x.npcId)||
     !complete.includes(x.prerequisiteId)||ids.has(x.questId)||
     x.autoAccepted!==false||x.requiresExplicitAccept!==true||
     x.claimableReward!==false))return false;
 const rivals=s.rivalInvitations;
 if(new Set(rivals.map(x=>x.leadId)).size!==rivals.length||
    rivals.some(x=>!object(x)||!ID.test(x.leadId)||
     !ID.test(x.otherCharacterId)||typeof x.requiresExplicitConsent!=='boolean'||
     typeof x.mutualConsent!=='boolean'||
     !['pending','declined','disputed','rival','friendly_rival'].includes(x.status)||
     x.mutualConsent!==['rival','friendly_rival'].includes(x.status)||
     x.requiresExplicitConsent!==(x.status==='pending'&&x.ownChoice===null)||
     x.relationship!==(x.mutualConsent?x.status:null)||
     x.questAccepted!==false||x.meetingScheduled!==false||
     x.rewardsIssued!==false||Object.hasOwn(x,'otherChoice')))return false;
 return true;
};
function derive(snapshot,localState={}){
 const entries=snapshot.questbook.entries.map(q=>Object.freeze({
  id:q.id,title:q.title,npcId:q.npcId,category:q.category,
  requires:q.requires??null,status:q.status,statusLabel:q.statusLabel,
  acceptedAt:q.acceptedAt,completedAt:q.completedAt,
  progressPercent:q.progressPercent,
  requiresServerTurnIn:q.requiresServerTurnIn===true,
  objectives:Object.freeze(q.objectives.map(o=>Object.freeze({
   id:o.id,type:o.type,tier:o.tier??null,targetId:o.targetId??null,
   count:o.count,current:o.current,done:o.done
  }))),readOnly:true,serverVerified:true
 }));
 const acceptedIds=Object.freeze([...snapshot.questbook.acceptedIds]);
 const completedIds=Object.freeze([...snapshot.questbook.completedIds]);
 const objectiveProgress={},progress={};
 for(const q of entries){
  objectiveProgress[q.id]=Object.freeze(
   Object.fromEntries(q.objectives.map(o=>[o.id,o.current])));
  progress[q.id]=q.objectives[0].current;
 }
 const selected=acceptedIds.includes(localState?.lastAcceptedId)?
  localState.lastAcceptedId:(acceptedIds[0]??null);
 const localOnlyIds=Object.freeze([...new Set([
  ...(Array.isArray(localState?.acceptedIds)?localState.acceptedIds:[]),
  ...(Array.isArray(localState?.completedIds)?localState.completedIds:[])
 ])].filter(id=>typeof id==='string'&&
   !acceptedIds.includes(id)&&!completedIds.includes(id)));
 return Object.freeze({
  entries:Object.freeze(entries),
  constellations:Object.freeze([projectEchoConstellation(entries)]),
  chronicleNarrative:projectChronicleNarrative(entries),
  questState:Object.freeze({
   acceptedIds,completedIds,
   objectiveProgress:Object.freeze(objectiveProgress),
   progress:Object.freeze(progress),
   lastAcceptedId:selected,storyFlags:Object.freeze({}),
   choices:Object.freeze({}),abandonedIds:Object.freeze([]),
   completionCounts:Object.freeze({})
  }),
  npcInteractionLeads:Object.freeze(snapshot.npcInteractionLeads.map(x=>
   Object.freeze({
    questId:x.questId,npcId:x.npcId,title:x.title,
    optional:x.optional,prerequisiteId:x.prerequisiteId,
    requiresExplicitAccept:true,autoAccepted:false,claimableReward:false
   }))),
  rivalInvitations:Object.freeze(snapshot.rivalInvitations.map(x=>
   Object.freeze({
    leadId:x.leadId,otherCharacterId:x.otherCharacterId,
    status:x.status,ownChoice:x.ownChoice,
    requiresExplicitConsent:x.requiresExplicitConsent,
    mutualConsent:x.mutualConsent,relationship:x.relationship,
    questAccepted:false,meetingScheduled:false,rewardsIssued:false
   }))),
  localOnlyIds,readOnly:true,rewardsIssued:false
 });
}
export function createAXEQuestbookReadModel169(){
 let current=null,viewId=null,revision=null,sequence=0;
 const reset=()=>{
  current=null;viewId=null;revision=null;sequence=0;
 };
 const getQuery=()=>Object.freeze({
  action:'read',knownRevision:revision,knownViewId:viewId
 });
 const getView=()=>current;
 const apply=(envelope,localState={})=>{
  if(!object(envelope)||envelope.ok!==true||
     envelope.version!=='16.9'||envelope.readOnly!==true||
     envelope.rewardsIssued!==false||!UUID.test(envelope.viewId)||
     !SHA.test(envelope.revision)||
     !Number.isSafeInteger(envelope.sequence)||
     envelope.sequence<1||typeof envelope.unchanged!=='boolean'){
   reset();return bad('invalid_trusted_questbook_envelope');
  }
  const sameSession=envelope.viewId===viewId;
  if(sameSession&&(envelope.sequence<sequence||
      (envelope.sequence===sequence&&envelope.revision!==revision))){
   reset();return bad('stale_questbook_revision');
  }
  if(envelope.unchanged){
   if(!sameSession||!current||revision!==envelope.revision||
      sequence!==envelope.sequence||
      Object.hasOwn(envelope,'snapshot')){
    reset();return bad('unbacked_questbook_unchanged');
   }
   return Object.freeze({ok:true,updated:false,view:current});
  }
  if(!usable(envelope.snapshot)){
   reset();return bad('unverified_questbook_snapshot');
  }
  if(sameSession&&sequence===envelope.sequence&&
     revision===envelope.revision){
   // Duplicate full data is allowed but has no authority to revise
   // a previously accepted identical revision.
   return Object.freeze({ok:true,updated:false,view:current});
  }
  // If a new view generation is received, discard the old snapshot and
  // treat it as a replacement, never merge progress with prior data.
  const safe=derive(envelope.snapshot,localState);
  current=safe;
  viewId=envelope.viewId;
  revision=envelope.revision;sequence=envelope.sequence;
  return Object.freeze({ok:true,updated:true,view:current});
 };
 return Object.freeze({version:'16.9',apply,reset,getQuery,getView,
  readOnly:true,persistsLocalState:false});
}

