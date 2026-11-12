// Game 3D quest objective event reducer. The existing character-scoped store
// owns persistence; this pure helper only computes *client presentation*
// progress. It must never confer XP, loot, kills or authoritative rewards.
export const MAX_CLIENT_QUEST_EVENT_COUNT = 100;

export function normalizeQuestEventCount(event = {}) {
  // Normal interactions and single hits count once. Never coerce strings,
  // booleans, Infinity, negatives or arbitrary client-supplied bulk counts.
  if (event?.count === undefined) return 1;
  const count = event?.count;
  return Number.isSafeInteger(count) && count >= 1 &&
    count <= MAX_CLIENT_QUEST_EVENT_COUNT ? count : 0;
}

export function applyAXEQuestEventProgress(quest, previous = {}, event = {}, matches) {
  const objectives = Array.isArray(quest?.objectives) && quest.objectives.length
    ? quest.objectives : quest?.objective ? [quest.objective] : [];
  const count = normalizeQuestEventCount(event);
  if (!objectives.length || !count || typeof matches !== 'function' || !event?.type) {
    return { changed: false, progress: previous, primaryProgress: null };
  }

  const progress = { ...previous };
  let changed = false;
  objectives.forEach((objective, index) => {
    if (!matches(objective, event)) return;
    const id = objective?.id || `objective_${index}`;
    const requiredRaw = Number(objective?.count);
    const required = Number.isSafeInteger(requiredRaw) && requiredRaw > 0 ? requiredRaw : 1;
    const raw = Number(progress[id] || 0);
    const before = Number.isFinite(raw) ? Math.max(0, Math.min(required, raw)) : 0;
    const after = Math.min(required, before + count);
    if (after > before) {
      progress[id] = after;
      changed = true;
    }
  });

  if (!changed) return { changed: false, progress: previous, primaryProgress: null };
  const primaryId = objectives[0]?.id || 'objective_0';
  return { changed: true, progress, primaryProgress: Number(progress[primaryId] || 0) };
}
