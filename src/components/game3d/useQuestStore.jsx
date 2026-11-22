// AXE Prompt 036 — character-scoped Quest Store.
// Preserves the legacy single-objective API while adding data-driven campaigns,
// multi-objective progress, story flags, abandonment, repeatability, choices,
// party-share hooks, and world discovery/interact event support.

import { characterScopedStorage, subscribeCharacterChange } from './characterStorage';
import {
  AXE_QUESTS,
  getAXEQuestObjectives,
  objectiveMatchesAXEQuestEvent,
} from './axe/quests/AXEQuestFramework';
import { applyAXEQuestEventProgress } from './axe/quests/AXEQuestEventProgress';
// Pledges (multi-step quests). Pure .mjs modules that import no quest data, so
// there is no import cycle with questData.jsx. See pledges/pledgeModel.mjs.
import { isPledge } from './pledges/pledgeModel.mjs';
import { getRegisteredPledge, listRegisteredPledges } from './pledges/pledgeRegistry.mjs';
import {
  pledgeStateOnAbandon,
  pledgeStateOnAccept,
  pledgeStateOnComplete,
  pledgeStateOnEvent,
} from './pledges/pledgeState.mjs';

const storage = characterScopedStorage('axe_quest_state_v2');
const LEGACY_STORAGE_KEY = 'wwm_quest_state_v1';

const defaultState = () => ({
  acceptedIds: [],
  completedIds: [],
  progress: {},
  objectiveProgress: {},
  lastAcceptedId: null,
  storyFlags: {},
  choices: {},
  abandonedIds: [],
  completionCounts: {},
});

const loadState = () => {
  try {
    let raw = storage.get();
    // One-way compatibility migration from the original non-character-scoped store.
    if (!raw && typeof localStorage !== 'undefined') raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...defaultState(),
        ...parsed,
        acceptedIds: Array.isArray(parsed.acceptedIds) ? parsed.acceptedIds : [],
        completedIds: Array.isArray(parsed.completedIds) ? parsed.completedIds : [],
        progress: parsed.progress || {},
        objectiveProgress: parsed.objectiveProgress || {},
        storyFlags: parsed.storyFlags || {},
        choices: parsed.choices || {},
        abandonedIds: Array.isArray(parsed.abandonedIds) ? parsed.abandonedIds : [],
        completionCounts: parsed.completionCounts || {},
      };
    }
  } catch {}
  return defaultState();
};

let state = loadState();
const listeners = new Set();

const persist = () => storage.set(JSON.stringify(state));
const notify = () => {
  persist();
  const snapshot = getQuestState();
  listeners.forEach((fn) => fn(snapshot));
};

subscribeCharacterChange(() => {
  state = loadState();
  listeners.forEach((fn) => fn(getQuestState()));
});

export function getQuestState() {
  return {
    ...state,
    acceptedIds: [...state.acceptedIds],
    completedIds: [...state.completedIds],
    progress: { ...state.progress },
    objectiveProgress: { ...state.objectiveProgress },
    storyFlags: { ...state.storyFlags },
    choices: { ...state.choices },
    abandonedIds: [...state.abandonedIds],
    completionCounts: { ...state.completionCounts },
    // Present only once a pledge has been completed or abandoned.
    ...(state.pledgeOutcomes ? { pledgeOutcomes: { ...state.pledgeOutcomes } } : {}),
  };
}

export function subscribeQuests(fn) {
  listeners.add(fn);
  fn(getQuestState());
  return () => listeners.delete(fn);
}

const objectiveId = (objective, index) =>
  objective?.id || `objective_${index}`;

const initializeQuestObjectives = (questDef) => {
  const objectives = getAXEQuestObjectives(questDef);
  const current = state.objectiveProgress[questDef?.id] || {};
  const next = { ...current };
  objectives.forEach((objective, index) => {
    const id = objectiveId(objective, index);
    if (!Number.isFinite(Number(next[id]))) next[id] = 0;
  });
  return next;
};

export function acceptQuest(questId, questDef = null) {
  if (state.acceptedIds.includes(questId)) return { ok: false, reason: 'ALREADY_ACCEPTED' };

  const def = questDef || AXE_QUESTS.find((q) => q.id === questId) ||
    getRegisteredPledge(questId) || null;
  const repeatable = !!def?.repeatable;
  if (def?.requires && !state.completedIds.includes(def.requires)) {
    return { ok: false, reason: 'PREREQUISITE_REQUIRED' };
  }
  if (Array.isArray(def?.requiresAll) &&
      def.requiresAll.some((id) => !state.completedIds.includes(id))) {
    return { ok: false, reason: 'PREREQUISITE_REQUIRED' };
  }
  if (state.completedIds.includes(questId) && !repeatable) {
    return { ok: false, reason: 'ALREADY_COMPLETED' };
  }

  const requiredFlags = def?.storyFlagsRequired || [];
  if (requiredFlags.some((flag) => !state.storyFlags[flag])) {
    return { ok: false, reason: 'STORY_FLAG_REQUIRED' };
  }

  state = {
    ...state,
    acceptedIds: [...state.acceptedIds, questId],
    progress: { ...state.progress, [questId]: 0 },
    objectiveProgress: def
      ? { ...state.objectiveProgress, [questId]: initializeQuestObjectives(def) }
      : state.objectiveProgress,
    lastAcceptedId: questId,
    abandonedIds: state.abandonedIds.filter((id) => id !== questId),
  };
  // A pledge is always sworn from zero, with no choice left from an earlier run.
  if (isPledge(def)) state = { ...state, ...pledgeStateOnAccept(state, def) };
  notify();
  return { ok: true };
}

export function completeQuest(questId, questDef = null) {
  if (!state.acceptedIds.includes(questId)) return { ok: false, reason: 'NOT_ACCEPTED' };

  const def = questDef || AXE_QUESTS.find((q) => q.id === questId) ||
    getRegisteredPledge(questId) || null;
  if (def && !isQuestComplete(def, state)) {
    return { ok: false, reason: 'OBJECTIVES_INCOMPLETE' };
  }

  const acceptedIds = state.acceptedIds.filter((id) => id !== questId);
  const completedIds = state.completedIds.includes(questId)
    ? state.completedIds
    : [...state.completedIds, questId];

  const storyFlags = { ...state.storyFlags };
  for (const flag of def?.storyFlagsOnComplete || []) storyFlags[flag] = true;

  state = {
    ...state,
    acceptedIds,
    completedIds,
    storyFlags,
    completionCounts: {
      ...state.completionCounts,
      [questId]: Number(state.completionCounts[questId] || 0) + 1,
    },
    lastAcceptedId: state.lastAcceptedId === questId
      ? (acceptedIds[acceptedIds.length - 1] || null)
      : state.lastAcceptedId,
  };
  // Records how the pledge ended: "kept" or "bent", read from its choices.
  if (isPledge(def)) state = { ...state, ...pledgeStateOnComplete(state, def) };
  notify();
  return { ok: true };
}

export function abandonQuest(questId, questDef = null) {
  if (!state.acceptedIds.includes(questId)) return { ok: false, reason: 'NOT_ACCEPTED' };
  const def = questDef || getRegisteredPledge(questId) || null;
  const acceptedIds = state.acceptedIds.filter((id) => id !== questId);
  state = {
    ...state,
    acceptedIds,
    progress: { ...state.progress, [questId]: 0 },
    objectiveProgress: { ...state.objectiveProgress, [questId]: {} },
    abandonedIds: [...new Set([...state.abandonedIds, questId])],
    lastAcceptedId: state.lastAcceptedId === questId
      ? (acceptedIds[acceptedIds.length - 1] || null)
      : state.lastAcceptedId,
  };
  // A sworn pledge that is abandoned is recorded as "broken".
  if (isPledge(def)) state = { ...state, ...pledgeStateOnAbandon(state, def) };
  notify();
  return { ok: true };
}

export function reportQuestEvent(quests, event = {}) {
  const list = Array.isArray(quests) ? quests : [];
  if (!event?.type) return false;

  // Stage updates per quest instead of mutating state during iteration. A
  // combat kill, NPC conversation or discovery must never rewrite unrelated
  // active quests just because a *previous* quest matched the same event.
  let nextObjectives = null;
  let nextProgress = null;
  // Staged by pledges only: a choice that was made and the story flags it sets.
  let nextChoices = null;
  let nextStoryFlags = null;
  for (const questId of state.acceptedIds) {
    const quest = list.find((entry) => entry.id === questId);
    if (!quest) continue;

    // Pledges (sequential quests) take their steps in order: only the first
    // unfinished required step may advance. Every other quest keeps the
    // parallel reducer below, unchanged.
    if (isPledge(quest)) {
      const staged = pledgeStateOnEvent({
        objectiveProgress: nextObjectives || state.objectiveProgress,
        progress: nextProgress || state.progress,
        choices: nextChoices || state.choices,
        storyFlags: nextStoryFlags || state.storyFlags,
      }, quest, event);
      if (!staged.changed) continue;
      nextObjectives = staged.patch.objectiveProgress;
      nextProgress = staged.patch.progress;
      if (staged.patch.choices) nextChoices = staged.patch.choices;
      if (staged.patch.storyFlags) nextStoryFlags = staged.patch.storyFlags;
      continue;
    }

    const previous = state.objectiveProgress[questId] || initializeQuestObjectives(quest);
    const updated = applyAXEQuestEventProgress(
      quest, previous, event, objectiveMatchesAXEQuestEvent,
    );
    if (!updated.changed) continue;

    if (!nextObjectives) {
      nextObjectives = { ...state.objectiveProgress };
      nextProgress = { ...state.progress };
    }
    nextObjectives[questId] = updated.progress;
    nextProgress[questId] = updated.primaryProgress;
  }

  if (!nextObjectives) return false; // no match or already complete
  state = {
    ...state,
    objectiveProgress: nextObjectives,
    progress: nextProgress,
    ...(nextChoices ? { choices: nextChoices } : {}),
    ...(nextStoryFlags ? { storyFlags: nextStoryFlags } : {}),
  };
  notify(); // one persistence write / subscriber update per valid event
  return true;
}

// Report one event to the registered pledges only. World hooks use this (or
// the window event 'axePledgeEvent') for events the 32 older quests already
// receive another way, such as a kill, so those are never counted twice.
export function reportPledgeEvent(event = {}) {
  const pledges = listRegisteredPledges();
  return pledges.length ? reportQuestEvent(pledges, event) : false;
}

// Backward-compatible kill reporter used by GameWorld3D.
export function reportEnemyKill(quests, killedTier) {
  return reportQuestEvent(quests, {
    type: 'enemy_killed',
    tier: killedTier,
    count: 1,
  });
}

export function reportLocationDiscovery(quests, locationId) {
  return reportQuestEvent(quests, {
    type: 'location_discovered',
    targetId: locationId,
    count: 1,
  });
}

export function isQuestComplete(questDef, snapshot = state) {
  const objectives = getAXEQuestObjectives(questDef);
  if (!objectives.length) return false;
  const qProgress = snapshot.objectiveProgress?.[questDef.id] || {};

  return objectives
    .filter((objective) => !objective.optional)
    .every((objective, index) => {
      const id = objectiveId(objective, index);
      const required = Math.max(1, Number(objective.count) || 1);
      const fallback = index === 0 ? Number(snapshot.progress?.[questDef.id] || 0) : 0;
      return Number(qProgress[id] ?? fallback) >= required;
    });
}

export function setTrackedQuest(questId) {
  if (!state.acceptedIds.includes(questId)) return false;
  state = { ...state, lastAcceptedId: questId };
  notify();
  return true;
}

export function setQuestStoryFlag(flagId, value = true) {
  if (!flagId) return false;
  state = {
    ...state,
    storyFlags: { ...state.storyFlags, [flagId]: !!value },
  };
  notify();
  return true;
}

export function setQuestChoice(choiceId, value) {
  if (!choiceId) return false;
  state = {
    ...state,
    choices: { ...state.choices, [choiceId]: value },
  };
  notify();
  return true;
}

export function shareQuestWithParty(questId) {
  if (!state.acceptedIds.includes(questId)) return { ok: false, reason: 'NOT_ACCEPTED' };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('axeQuestShareRequested', {
      detail: { questId },
    }));
  }
  return { ok: true };
}

// World-event bridge. AXEWorldStreamingMount already emits axePOIDiscovered.
// The bridge reaches AXE_QUESTS, as before, and every registered pledge. The
// older quests in questData.jsx are still not reached from here.
const bridgeQuests = () => {
  const pledges = listRegisteredPledges();
  return pledges.length ? [...AXE_QUESTS, ...pledges] : AXE_QUESTS;
};

if (typeof window !== 'undefined' && !window.__axeQuestEventBridgeInstalled) {
  window.__axeQuestEventBridgeInstalled = true;

  window.addEventListener('axePOIDiscovered', (event) => {
    reportQuestEvent(bridgeQuests(), {
      type: 'location_discovered',
      targetId: event?.detail?.id,
      count: 1,
    });
  });

  window.addEventListener('axeQuestEvent', (event) => {
    if (event?.detail?.type) reportQuestEvent(bridgeQuests(), event.detail);
  });

  // Pledges only: see reportPledgeEvent.
  window.addEventListener('axePledgeEvent', (event) => {
    if (event?.detail?.type) reportPledgeEvent(event.detail);
  });
}
