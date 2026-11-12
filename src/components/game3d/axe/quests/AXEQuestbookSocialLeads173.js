// Game 3D Combat / Quest 17.3 — verified, read-only NPC/Rival presentation.
// This is a DISPLAY-ONLY projection of the 16.9 authenticated Questbook view.
// Browser state cannot create invitations, consent, quest completion or rewards.
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const text=x=>typeof x==='string'&&x.trim().length>0&&x.length<=200;
const list=(x,max)=>Array.isArray(x)&&x.length<=max;
const freezeRows=x=>Object.freeze(x.map(row=>Object.freeze(row)));
const empty=reason=>Object.freeze({
  verified:false,readOnly:true,rewardsIssued:false,reason,
  npcInvitations:Object.freeze([]),rivalStatuses:Object.freeze([])
});
const statuses=Object.freeze({
  pending:'Awaiting consent',
  declined:'Declined',
  disputed:'Different choices',
  rival:'Rival — mutually agreed',
  friendly_rival:'Friendly rivals — mutually agreed'
});
function npc(x,completed,started){
  if(!object(x)||!id(x.questId)||!id(x.npcId)||
     !id(x.prerequisiteId)||!text(x.title)||
     !completed.has(x.prerequisiteId)||started.has(x.questId)||
     x.requiresExplicitAccept!==true||x.autoAccepted!==false||
     x.claimableReward!==false||Object.hasOwn(x,'reward'))return null;
  return {
    questId:x.questId,npcId:x.npcId,
    title:x.title,prerequisiteId:x.prerequisiteId,
    optional:x.optional===true,readOnly:true,
    actionAvailable:false,rewardsIssued:false,
    requiresServerAcceptance:true,
    invitationLabel:'Invitation available — not accepted'
  };
}
function rival(x){
  if(!object(x)||!id(x.leadId)||!id(x.otherCharacterId)||
     !Object.hasOwn(statuses,x.status)||
     ![null,'rival','friendly_rival','decline'].includes(x.ownChoice)||
     typeof x.mutualConsent!=='boolean'||
     typeof x.requiresExplicitConsent!=='boolean'||
     x.relationship!==(x.mutualConsent?x.status:null)||
     x.requiresExplicitConsent!==(x.status==='pending'&&x.ownChoice===null)||
     x.mutualConsent!==['rival','friendly_rival'].includes(x.status)||
     x.questAccepted!==false||x.meetingScheduled!==false||
     x.rewardsIssued!==false||Object.hasOwn(x,'otherChoice')||
     Object.hasOwn(x,'privateVote'))return null;
  return {
    leadId:x.leadId,otherCharacterId:x.otherCharacterId,
    status:x.status,statusLabel:statuses[x.status],
    ownChoice:x.ownChoice,
    requiresExplicitConsent:x.requiresExplicitConsent,
    mutualConsent:x.mutualConsent,
    choiceSubmitted:x.ownChoice!==null,
    readOnly:true,canSubmitChoice:false,
    meetingScheduled:false,questAccepted:false,rewardsIssued:false
  };
}
export function projectAXEQuestbookSocialLeads173(view){
  if(!object(view)||view.readOnly!==true||view.rewardsIssued!==false||
     !object(view.questState)||
     !list(view.questState.completedIds,9)||
     !list(view.entries,9)||
     !list(view.npcInteractionLeads,7)||
     !list(view.rivalInvitations,128))return empty('unverified_questbook');
  const completed=new Set(view.questState.completedIds);
  const started=new Set(view.entries.map(x=>x?.id));
  if([...completed].some(x=>!id(x))||
     [...started].some(x=>!id(x)))return empty('invalid_questbook_ids');
  const invitations=[],rivals=[],seenNpc=new Set(),seenRival=new Set();
  for(const x of view.npcInteractionLeads){
    const row=npc(x,completed,started);
    if(!row||seenNpc.has(row.questId))return empty('invalid_npc_invitation');
    seenNpc.add(row.questId);invitations.push(row);
  }
  for(const x of view.rivalInvitations){
    const row=rival(x);
    if(!row||seenRival.has(row.leadId))return empty('invalid_rival_status');
    seenRival.add(row.leadId);rivals.push(row);
  }
  return Object.freeze({
    verified:true,readOnly:true,rewardsIssued:false,reason:null,
    npcInvitations:freezeRows(invitations),
    rivalStatuses:freezeRows(rivals)
  });
}
