// The few things the pledge world needs from the game itself, in one place.
// pledgeWorldSubsystem.mjs loads this file with a dynamic import, because it
// reaches .jsx modules that node cannot import and the subsystem has to stay
// loadable in node tests. Tests hand the subsystem a fake of this object.
import { QUESTS } from '../../questData';
import { getQuestState, setQuestStoryFlag, subscribeQuests } from '../../useQuestStore';
import { getActiveCharacter } from '../../characterStore';

export const pledgeWorldGameBindings = Object.freeze({
  quests: QUESTS,
  getQuestState,
  subscribeQuests,
  setQuestStoryFlag,
  getFactionId: () => getActiveCharacter()?.factionId || null,
});
