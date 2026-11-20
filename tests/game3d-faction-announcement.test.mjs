import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeVerifiedFactionAnnouncement} from '../src/components/game3d/axe/factions/factionAnnouncementModel.mjs';
const now=Date.parse('2026-11-20T17:00:00Z');
const valid={
 id:'call-17',factionId:'AXE_Faction_2',authorized:true,
 senderRole:'vice',senderName:'Vice Dawn',text:'Gather at the town gate!',
 expiresAt:'2026-11-20T17:10:00Z',
};
test('only authenticated server-ranked announcement to the listener faction is rendered',()=>{
 assert.deepEqual(normalizeVerifiedFactionAnnouncement(valid,'AXE_Faction_2',now),{
  id:'call-17',factionId:'AXE_Faction_2',senderRole:'vice',
  senderName:'Vice Dawn',text:'Gather at the town gate!',
  expiresAt:Date.parse(valid.expiresAt),
 });
});
test('unverified role, wrong faction, expired, or excessive TTL never display',()=>{
 for(const value of [
  {...valid,authorized:false},
  {...valid,senderRole:'member'},
  {...valid,factionId:'AXE_Faction_1'},
  {...valid,expiresAt:'2026-11-20T16:00:00Z'},
  {...valid,expiresAt:'2026-11-21T17:00:00Z'},
 ])assert.equal(normalizeVerifiedFactionAnnouncement(value,'AXE_Faction_2',now),null);
});
test('announcements are length bounded and empty payloads refused',()=>{
 assert.equal(normalizeVerifiedFactionAnnouncement(null,'AXE_Faction_2',now),null);
 assert.equal(normalizeVerifiedFactionAnnouncement({...valid,text:' '},'AXE_Faction_2',now),null);
 assert.equal(normalizeVerifiedFactionAnnouncement({...valid,text:'x'.repeat(500)},'AXE_Faction_2',now).text.length,180);
});
