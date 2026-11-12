import { AXE_ECHO_QUESTS } from '../axe/quests/AXEEchoChapters.js';

// Presentation of the ORIGINAL 16.5 turn-ins, never a second progress ledger.
// Call only after the authenticated 16.9 read model has accepted a snapshot.
// Shape validation here is not authentication and cannot authorize rewards.
const positions = [[50,12],[32,32],[68,32],[27,58],[73,58],[43,83],[57,83]];
export const ECHO_CONSTELLATION = Object.freeze({
  id: 'echoes_of_the_first_territory', revision: 1, category: 'minor',
  title: 'Echoes of the First Territory',
  description: 'Seven memories reveal the spirit crystal: a patrol, a discovery, a crossroads, and the paths you chose beyond it.',
  stars: Object.freeze(AXE_ECHO_QUESTS.map((quest, index) => Object.freeze({
    id: quest.id, questId: quest.id, title: quest.title, description: quest.description,
    requires: quest.requires, npcId: quest.npcId, chapter: quest.chapter ?? null,
    branchOf: quest.branchOf ?? null, x: positions[index][0], y: positions[index][1],
  }))),
  edges: Object.freeze([[0,1],[0,2],[1,2],[1,3],[2,4],[3,4],[3,5],[4,6],[5,6],[1,5],[2,6]]
    .map(([a,b]) => Object.freeze([AXE_ECHO_QUESTS[a].id,AXE_ECHO_QUESTS[b].id]))),
});

const timestamp = value => typeof value === 'string' && value.length <= 40 &&
  Number.isFinite(Date.parse(value)) ? Date.parse(value) : NaN;
const unavailable = () => Object.freeze({
  ...ECHO_CONSTELLATION, availability: 'unavailable', completedStars: null,
  totalStars: ECHO_CONSTELLATION.stars.length, complete: false,
  stars: Object.freeze(ECHO_CONSTELLATION.stars.map(star => Object.freeze({
    ...star, status: 'unknown', memory: null,
  }))), illuminatedEdges: Object.freeze([]), readOnly: true, rewardsIssued: false,
});

/** @returns {import('./constellationContracts').ConstellationView} */
export function projectEchoConstellation(verifiedEntries) {
  if (!Array.isArray(verifiedEntries) || verifiedEntries.length > 9) return unavailable();
  const entries = new Map();
  for (const entry of verifiedEntries) {
    if (!entry || typeof entry.id !== 'string' || entries.has(entry.id) ||
        entry.serverVerified !== true || entry.readOnly !== true ||
        !['accepted','completed'].includes(entry.status)) return unavailable();
    entries.set(entry.id, entry);
  }
  const stars = [];
  for (const star of ECHO_CONSTELLATION.stars) {
    const entry = entries.get(star.questId);
    const parent = entries.get(star.requires);
    const eligible = parent?.status === 'completed';
    let status = eligible ? 'available' : 'locked';
    let memory = null;
    if (entry) {
      const def = AXE_ECHO_QUESTS.find(quest => quest.id === star.questId);
      const objective = entry.objectives?.[0];
      const acceptedAt = timestamp(entry.acceptedAt);
      const completedAt = timestamp(entry.completedAt);
      if (!eligible || !Number.isFinite(acceptedAt) ||
          !Number.isFinite(timestamp(parent.completedAt)) ||
          acceptedAt < timestamp(parent.completedAt) ||
          entry.requires !== star.requires || entry.npcId !== star.npcId ||
          !Array.isArray(entry.objectives) || entry.objectives.length !== 1 ||
          !objective || objective.id !== def.objective.id ||
          objective.type !== def.objective.type || objective.count !== def.objective.count ||
          (objective.tier ?? null) !== (def.objective.tier ?? null) ||
          (objective.targetId ?? null) !== (def.objective.targetId ?? null) ||
          !Number.isSafeInteger(objective.current) || objective.current < 0 ||
          objective.current > objective.count || objective.done !== (objective.current === objective.count) ||
          (entry.status === 'accepted' && entry.completedAt !== null) ||
          (entry.status === 'completed' && (!objective.done || !Number.isFinite(completedAt) || completedAt < acceptedAt))) {
        return unavailable();
      }
      status = entry.status === 'completed' ? 'completed' : objective.done ? 'turn_in' : 'active';
      if (status === 'completed') memory = Object.freeze({
        id: 'echo165:' + star.questId, source: 'echo_quest_turnin_165',
        questId: star.questId, objectiveId: objective.id, outcome: 'completed',
        completedAt: new Date(completedAt).toISOString(), npcId: star.npcId,
        chapter: star.chapter, branchOf: star.branchOf,
      });
    }
    stars.push(Object.freeze({ ...star, status, memory }));
  }
  const done = new Set(stars.filter(star => star.status === 'completed').map(star => star.id));
  return Object.freeze({
    ...ECHO_CONSTELLATION, availability: 'available', stars: Object.freeze(stars),
    totalStars: stars.length, completedStars: done.size, complete: done.size === stars.length,
    illuminatedEdges: Object.freeze(ECHO_CONSTELLATION.edges.filter(([a,b]) => done.has(a) && done.has(b))),
    readOnly: true, rewardsIssued: false,
  });
}
