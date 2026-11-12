import test from 'node:test';
import assert from 'node:assert/strict';
import {projectAXEQuestbookSocialLeads173}
 from '../../../src/components/game3d/axe/quests/AXEQuestbookSocialLeads173.js';

const view=()=>({
 readOnly:true,rewardsIssued:false,
 questState:{completedIds:['axe_q_first_patrol']},
 entries:[{id:'axe_q_first_patrol'}],
 npcInteractionLeads:[{
  questId:'echo_ch_14_first_echo',npcId:'archer_lyra',
  title:'Chapter 1.4 — The First Echo',optional:false,
  prerequisiteId:'axe_q_first_patrol',requiresExplicitAccept:true,
  autoAccepted:false,claimableReward:false
 }],
 rivalInvitations:[{
  leadId:'lead_173',otherCharacterId:'rival_hero',
  status:'pending',ownChoice:null,mutualConsent:false,
  requiresExplicitConsent:true,relationship:null,
  questAccepted:false,meetingScheduled:false,rewardsIssued:false
 }]
});
const npc=d=>d.npcInteractionLeads[0];
const rival=d=>d.rivalInvitations[0];

test('17.3 accepts a verified snapshot and derives read-only invitation',()=>{
 const result=projectAXEQuestbookSocialLeads173(view());
 assert.equal(result.verified,true);
 assert.equal(result.npcInvitations.length,1);
 const first=result.npcInvitations[0];
 assert.equal(first.title,'Chapter 1.4 — The First Echo');
 assert.equal(first.prerequisiteId,'axe_q_first_patrol');
 assert.equal(first.requiresServerAcceptance,true);
 assert.equal(first.actionAvailable,false);
 assert.equal(first.rewardsIssued,false);
 assert.equal(result.rewardsIssued,false);
 assert(Object.isFrozen(first));
 assert(Object.isFrozen(result.npcInvitations));
});
test('17.3 shows only our own Rival decision and no opponent vote',()=>{
 const v=view();
 rival(v).ownChoice='rival';
 rival(v).requiresExplicitConsent=false;
 const result=projectAXEQuestbookSocialLeads173(v);
 assert.equal(result.verified,true);
 const lead=result.rivalStatuses[0];
 assert.equal(lead.ownChoice,'rival');
 assert.equal(lead.choiceSubmitted,true);
 assert.equal(lead.mutualConsent,false);
 assert.equal(lead.canSubmitChoice,false);
 assert.equal(Object.hasOwn(lead,'otherChoice'),false);
 assert.equal(Object.hasOwn(lead,'privateVote'),false);
 assert.equal(lead.meetingScheduled,false);
});
test('17.3 mutually agreed rival and friendly rivalry are distinguished',()=>{
 for(const status of ['rival','friendly_rival']){
  const v=view(),r=rival(v);
  r.status=status;r.ownChoice=status;r.mutualConsent=true;
  r.requiresExplicitConsent=false;r.relationship=status;
  const result=projectAXEQuestbookSocialLeads173(v);
  assert.equal(result.verified,true,status);
  assert.equal(result.rivalStatuses[0].mutualConsent,true);
  assert.match(result.rivalStatuses[0].statusLabel,/mutually agreed/);
 }
});
test('17.3 declined and disputed do not imply mutual consent',()=>{
 for(const status of ['declined','disputed']){
  const v=view(),r=rival(v);
  r.status=status;r.ownChoice='decline';r.requiresExplicitConsent=false;
  const result=projectAXEQuestbookSocialLeads173(v);
  assert.equal(result.verified,true,status);
  assert.equal(result.rivalStatuses[0].mutualConsent,false);
  assert.equal(result.rivalStatuses[0].canSubmitChoice,false);
 }
});
test('17.3 no trusted view cannot show invitations or rivals',()=>{
 for(const sample of [null,{},view()]){
  if(sample?.questState)sample.readOnly=false;
  const result=projectAXEQuestbookSocialLeads173(sample);
  assert.equal(result.verified,false);
  assert.deepEqual(result.npcInvitations,[]);
  assert.deepEqual(result.rivalStatuses,[]);
 }
});
test('17.3 rewards flag is fail-closed for any candidate view',()=>{
 const v=view();v.rewardsIssued=true;
 assert.equal(projectAXEQuestbookSocialLeads173(v).verified,false);
});
test('17.3 local incomplete prerequisite cannot manufacture NPC invite',()=>{
 const v=view();v.questState.completedIds=[];
 const r=projectAXEQuestbookSocialLeads173(v);
 assert.equal(r.verified,false);
 assert.equal(r.reason,'invalid_npc_invitation');
});
test('17.3 already accepted quest cannot be shown as new invitation',()=>{
 const v=view();v.entries.push({id:npc(v).questId});
 assert.equal(projectAXEQuestbookSocialLeads173(v).verified,false);
});
test('17.3 forged auto-accepted quest and claimed rewards are refused',()=>{
 for(const key of ['autoAccepted','claimableReward']){
  const v=view();npc(v)[key]=true;
  assert.equal(projectAXEQuestbookSocialLeads173(v).verified,false,key);
 }
 const v=view();npc(v).reward={xp:999};
 assert.equal(projectAXEQuestbookSocialLeads173(v).verified,false);
});
test('17.3 private rival vote fields are refused, never displayed',()=>{
 for(const key of ['otherChoice','privateVote']){
  const v=view();rival(v)[key]='rival';
  assert.equal(projectAXEQuestbookSocialLeads173(v).verified,false,key);
 }
});
test('17.3 false mutual consent and forged meetings are refused',()=>{
 for(const key of ['mutualConsent','meetingScheduled','questAccepted','rewardsIssued']){
  const v=view();rival(v)[key]=true;
  assert.equal(projectAXEQuestbookSocialLeads173(v).verified,false,key);
 }
});
test('17.3 duplicate NPC and Rival invitations fail closed',()=>{
 const a=view();a.npcInteractionLeads.push({...npc(a)});
 assert.equal(projectAXEQuestbookSocialLeads173(a).verified,false);
 const b=view();b.rivalInvitations.push({...rival(b)});
 assert.equal(projectAXEQuestbookSocialLeads173(b).verified,false);
});
test('17.3 oversized lists and malformed IDs are rejected',()=>{
 const a=view();a.rivalInvitations=Array.from({length:129},()=>rival(a));
 assert.equal(projectAXEQuestbookSocialLeads173(a).verified,false);
 const b=view();npc(b).questId='<script>';
 assert.equal(projectAXEQuestbookSocialLeads173(b).verified,false);
});
test('17.3 empty verified social view stays empty and immutable',()=>{
 const a=view();a.npcInteractionLeads=[];a.rivalInvitations=[];
 const result=projectAXEQuestbookSocialLeads173(a);
 assert.equal(result.verified,true);
 assert.deepEqual(result.npcInvitations,[]);
 assert.deepEqual(result.rivalStatuses,[]);
 assert(Object.isFrozen(result));
});
test('17.3 source projection never submits a quest, sends consent, or grants XP',()=>{
 const result=projectAXEQuestbookSocialLeads173(view());
 assert.equal(result.readOnly,true);
 assert.equal(result.rivalStatuses[0].canSubmitChoice,false);
 assert.equal(result.npcInvitations[0].actionAvailable,false);
 assert.equal(result.rivalStatuses[0].rewardsIssued,false);
 assert.equal(result.npcInvitations[0].rewardsIssued,false);
});
