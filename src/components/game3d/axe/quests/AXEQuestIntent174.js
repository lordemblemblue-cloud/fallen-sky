// 17.4 client intent adapter: explicit confirmation only; server is authority.
// This does not mutate local Questbook state, XP, rewards or Rival flags.
import {callGameServer} from '../../social/socialServer';
import {getActiveId} from '../../characterStorage';

const QUEST=/^[A-Za-z0-9_.:-]{1,160}$/;
const LEAD=/^[A-Za-z0-9_.:-]{8,128}$/;
const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const choices=new Set(['rival','friendly_rival','decline']);
export const axeQuestActionEnabled174=
 import.meta.env.VITE_GAME3D_QUESTBOOK_VERIFIED_READ==='true'&&
 import.meta.env.VITE_GAME3D_QUEST_ACTION_174_ENABLED==='true';

export async function commitVerifiedQuestIntent174({intent,questId=null,
 leadId=null,choice=null,confirmed=false}={}){
 if(!axeQuestActionEnabled174||confirmed!==true)
  throw Error('Verified Questbook intent is disabled or unconfirmed');
 const characterId=getActiveId();
 if(typeof characterId!=='string'||!WHO.test(characterId)||
    ['__anon__','__default__','__dev_test__'].includes(characterId))
  throw Error('Selected character required');
 const accept=intent==='accept_quest'&&QUEST.test(questId)&&
  leadId===null&&choice===null;
 const rival=intent==='choose_rival'&&questId===null&&
  LEAD.test(leadId)&&choices.has(choice);
 if(!accept&&!rival)throw Error('Unsupported Questbook intent');
 const result=await callGameServer('game3dQuestAction174','commit',{
  characterId,intent,questId,leadId,choice,confirmed:true
 });
 if(result?.ok!==true||result.version!=='17.4'||
    result.intent!==intent||result.rewardsIssued!==false)
  throw Error('Questbook action was not verified');
 if(accept&&(result.questId!==questId||result.accepted!==true||
     result.questCompleted!==false))throw Error('Quest acceptance was not verified');
 if(rival&&(result.leadId!==leadId||result.choiceRecorded!==true||
     typeof result.mutualConsent!=='boolean'))
  throw Error('Rival decision was not verified');
 return result;
}
