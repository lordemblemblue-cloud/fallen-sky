// Game 3D Quest 17.5: check trusted in-world NPC proximity BEFORE any quest
// acceptance. Browser coordinates, screenshots or questbook clicks are not proof.
// This gate REQUIRES an independently trusted world service/receipt resolver.
// The currently deployed world has no such resolver, so acceptance stays OFF.
import {PRIVATE_QUEST_CATALOG_154} from './privateQuestCatalog154.mjs';
import {PRIVATE_ECHO_QUESTS_165} from './privateEchoQuest165.mjs';

const NPCS=Object.freeze({
 axe_q_first_patrol:'archer_lyra',axe_q_first_elite:'archer_lyra',
 echo_ch_14_first_echo:'archer_lyra',
 echo_ch_15_world_signs:'archer_kira',
 echo_ch_16_crossroads:'archer_vex',
 echo_ch_17_aftershocks:'archer_zephyr',
 echo_ch_18_traces_remain:'archer_lyra',
 echo_branch_hidden_echo:'archer_noor',
 echo_branch_broken_road:'archer_vex'
});
export const getGame3DPrivateQuestNpc175 = questId =>
 typeof questId==='string'&&Object.hasOwn(NPCS,questId)?NPCS[questId]:null;
const SESSION=/^qb174-[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const EVENT=/^[A-Za-z0-9_.:-]{8,160}$/;
const validWho=x=>typeof x==='string'&&ID.test(x)&&
 !['__anon__','__default__','__dev_test__'].includes(x);
const point=x=>x&&typeof x==='object'&&!Array.isArray(x)&&
 ['x','y','z'].every(k=>Number.isFinite(x[k])&&Math.abs(x[k])<=100000);
const denied=reason=>Object.freeze({ok:false,version:'17.5',reason,
 accepted:false,rewardsIssued:false,worldAttested:false});

export function createGame3DNpcInteractionGate175({
 resolveTrustedInteraction,now=Date.now,maxDistance=4.5,
 maxAgeMs=5000
}={}){
 if(typeof resolveTrustedInteraction!=='function'||typeof now!=='function'||
    !Number.isFinite(maxDistance)||maxDistance<=0||maxDistance>5||
    !Number.isInteger(maxAgeMs)||maxAgeMs<1000||maxAgeMs>5000)
  throw Error('17.5 requires a trusted world resolver and bounded proximity');
 // Only one trusted worker replica may own this in-memory replay fence.
 const used=new Map();
 const validate=async({ownerId,characterId,questId,sessionId}={})=>{
  if(!validWho(ownerId)||!validWho(characterId)||!SESSION.test(sessionId)||
     !Object.hasOwn(NPCS,questId)||
     !(Object.hasOwn(PRIVATE_QUEST_CATALOG_154,questId)||
       Object.hasOwn(PRIVATE_ECHO_QUESTS_165,questId)))
   return denied('invalid_world_interaction_identity');
  let evidence;
  try{
   evidence=await resolveTrustedInteraction(Object.freeze({
    ownerId,characterId,questId,npcId:NPCS[questId],sessionId
   }));
  }catch{return denied('trusted_world_unavailable')}
  const t=now();
  if(!evidence||typeof evidence!=='object'||Array.isArray(evidence)||
     evidence.source!=='trusted-server-npc-interaction-175'||
     evidence.worldVerified!==true||
     evidence.ownerId!==ownerId||evidence.characterId!==characterId||
     evidence.questId!==questId||evidence.npcId!==NPCS[questId]||
     evidence.sessionId!==sessionId||
     typeof evidence.worldInstanceId!=='string'||
     !EVENT.test(evidence.worldInstanceId)||
     typeof evidence.interactionId!=='string'||
     !EVENT.test(evidence.interactionId)||
     !Number.isSafeInteger(evidence.occurredAtMs)||
     evidence.occurredAtMs>t||t-evidence.occurredAtMs>maxAgeMs||
     evidence.lineOfSight!==true||!point(evidence.player)||
     !point(evidence.npc)||
     Math.hypot(evidence.player.x-evidence.npc.x,
       evidence.player.y-evidence.npc.y,
       evidence.player.z-evidence.npc.z)>maxDistance)
   return denied('npc_interaction_not_server_verified');
  for(const [key,expiresAt] of used)if(expiresAt<=t)used.delete(key);
  if(used.has(evidence.interactionId))return denied('npc_interaction_replayed');
  if(used.size>=4096)return denied('npc_interaction_replay_capacity');
  used.set(evidence.interactionId,evidence.occurredAtMs+maxAgeMs);
  return Object.freeze({ok:true,version:'17.5',worldAttested:true,
   questId,npcId:NPCS[questId],rewardsIssued:false});
 };
 return Object.freeze({version:'17.5',validate,
  requiresTrustedWorldSource:true,clientCoordinatesAccepted:false,
  rewardsIssued:false,productionReady:false});
}
