// A read-only projection of the existing Game 3D character-scoped quest store.
// NPCs, combat and exploration own the quests and their progress; this view
// never accepts quests, completes them, grants XP or issues inventory rewards.
const requiredCount = objective => Number.isFinite(Number(objective?.count))
  ? Math.max(1, Math.floor(Number(objective.count))) : 1;
const clamp = (value, max) => Math.max(0, Math.min(max, Number(value) || 0));

const objectivesFor = quest => Array.isArray(quest?.objectives) && quest.objectives.length
  ? quest.objectives : quest?.objective ? [quest.objective] : [];

const readableObjective = objective => {
  if (objective?.label || objective?.description) return objective.label || objective.description;
  const count = requiredCount(objective);
  switch (objective?.type) {
    case 'kill': return 'Defeat hostile enemies';
    case 'kill_tier': return `Defeat ${objective.tier || 'elite'} enemies`;
    case 'defeat_boss': return 'Defeat the boss';
    case 'discover_location': return 'Discover the marked location';
    case 'collect_item': return 'Collect quest materials';
    case 'talk': return 'Speak to the quest giver';
    case 'interact': return 'Interact with the objective';
    case 'enter_cave': return 'Find the cave entrance';
    default: return count > 1 ? 'Complete quest objectives' : 'Complete the objective';
  }
};

export function getJadeQuestTrackerEntries(questDefinitions = [], snapshot = {}, maxEntries = 3) {
  const byId = new Map((Array.isArray(questDefinitions) ? questDefinitions : []).map(q => [q.id, q]));
  const accepted = Array.isArray(snapshot?.acceptedIds) ? snapshot.acceptedIds : [];
  const completed = new Set(Array.isArray(snapshot?.completedIds) ? snapshot.completedIds : []);
  const active = [...new Set(accepted)].filter(id => byId.has(id) && !completed.has(id));
  const trackedId = active.includes(snapshot?.lastAcceptedId) ? snapshot.lastAcceptedId : null;
  const ordered = trackedId ? [trackedId, ...active.filter(id => id !== trackedId)] : active;
  const limit = Number.isSafeInteger(maxEntries) ? Math.max(1, Math.min(5, maxEntries)) : 3;
  return ordered.slice(0, limit).map(id => {
    const quest = byId.get(id);
    const objectives = objectivesFor(quest).filter(objective => !objective.optional);
    const progress = objectives.map((objective, index) => {
      const target = requiredCount(objective);
      const key = objective.id || `objective_${index}`;
      const raw = snapshot?.objectiveProgress?.[id]?.[key];
      // The first objective in legacy quests is also stored in progress[id].
      const fallback = index === 0 ? snapshot?.progress?.[id] : 0;
      const current = clamp(raw ?? fallback, target);
      return { id: key, label: readableObjective(objective), current, target };
    });
    const current = progress.reduce((sum, p) => sum + p.current, 0);
    const total = progress.reduce((sum, p) => sum + p.target, 0);
    const readyToTurnIn = progress.length > 0 && progress.every(p => p.current >= p.target);
    const nextObjective = progress.find(p => p.current < p.target) || progress[0] || null;
    return {
      id, title: quest.title, tracked: id === trackedId, current, total,
      percent: total ? Math.round(current / total * 100) : 0,
      readyToTurnIn, objective: nextObjective?.label || 'Return to the quest giver',
      objectiveCurrent: nextObjective?.current || 0,
      objectiveTotal: nextObjective?.target || 0,
    };
  });
}
