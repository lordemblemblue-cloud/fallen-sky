// Shared live-world quest NPC decision. Both E-interaction and the 3D marker
// must use the same character-scoped state and the same quest prerequisites.
// UI-only: this never accepts quests, completes them or grants rewards.
import { QUESTS, getAvailableQuestForNPC } from '../../questData';
import { isQuestComplete } from '../../useQuestStore';

export function getAXENPCQuestHandoff({
  npcId, playerLevel = 1, questState = {}, factionId = null,
} = {}) {
  if (typeof npcId !== 'string' || !npcId) return { mode: null, quest: null };

  const accepted = Array.isArray(questState.acceptedIds) ? questState.acceptedIds : [];
  const completed = Array.isArray(questState.completedIds) ? questState.completedIds : [];
  const activeHere = QUESTS.filter(quest =>
    quest.npcId === npcId && accepted.includes(quest.id) && !completed.includes(quest.id)
  );

  // A finished objective should be offered for turn-in before an unrelated
  // active quest from the same NPC. Never hide a completed quest behind one
  // of that NPC's other ongoing quests.
  const ready = activeHere.find(quest => isQuestComplete(quest, questState));
  const quest = ready || activeHere[0];
  if (quest) {
    const value = Number(questState.progress?.[quest.id]);
    return {
      mode: ready ? 'turn_in' : 'in_progress',
      quest,
      progress: Number.isFinite(value) ? Math.max(0, value) : 0,
      objectiveProgress: { ...(questState.objectiveProgress?.[quest.id] || {}) },
    };
  }

  const available = getAvailableQuestForNPC(npcId, playerLevel, accepted, completed, {
    factionId,
    storyFlags: questState.storyFlags || {},
  });
  return available
    ? { mode: 'offer', quest: available, progress: 0, objectiveProgress: {} }
    : { mode: null, quest: null };
}
