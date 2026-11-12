// Game 3D — one-way Artemis cinematic -> canonical character-scoped questbook.
// This does not verify kills, award XP, or grant loot. Later server-attested
// monster identity and completion receipts must satisfy the objective.
import {QUESTS,LIVING_QUEST_ID} from './questData';
import {acceptQuest,getQuestState} from './useQuestStore';

export function acceptLivingQuestIntoBook() {
 const definition=QUESTS.find(q=>q.id===LIVING_QUEST_ID);
 if (!definition) return {ok:false,reason:'MISSING_LIVING_QUEST'};
 const current=getQuestState();
 if (current.acceptedIds.includes(LIVING_QUEST_ID))
  return {ok:false,reason:'ALREADY_ACCEPTED'};
 if (current.completedIds.includes(LIVING_QUEST_ID))
  return {ok:false,reason:'ALREADY_COMPLETED'};
 // Match the existing HUD's five-slot tracker; do not silently hide the quest.
 if (current.acceptedIds.length>=5)
  return {ok:false,reason:'QUEST_LOG_FULL'};
 return acceptQuest(LIVING_QUEST_ID,definition);
}
