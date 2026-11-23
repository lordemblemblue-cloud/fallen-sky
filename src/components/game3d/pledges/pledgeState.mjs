// What the quest store changes for a pledge, as pure functions of the store's
// state. Each returns only the top-level state fields it replaces, so the
// store can do `state = { ...state, ...patch }`. useQuestStore.jsx calls these
// for pledges only; the 32 existing quests never pass through here.
import { isPledge, pledgeChoiceKey, pledgeOutcomeFlag, PLEDGE_OUTCOMES } from './pledgeModel.mjs';
import { applyPledgeEventProgress } from './pledgeProgress.mjs';
import { resolvePledgeOutcome } from './pledgeOutcome.mjs';

const zeroProgress = (pledge) => Object.fromEntries(pledge.objectives.map((objective) => [objective.id, 0]));

function withoutPledgeChoices(pledge, choices = {}) {
  const next = { ...choices };
  for (const step of pledge.pledge.steps) {
    if (step.kind === 'choose') delete next[pledgeChoiceKey(pledge.id, step.id)];
  }
  return next;
}

function recordOutcome(pledge, state, outcome) {
  const previous = state.pledgeOutcomes?.[pledge.id] || {};
  const storyFlags = { ...(state.storyFlags || {}) };
  // Exactly one outcome flag is set: the latest ending.
  for (const name of PLEDGE_OUTCOMES) storyFlags[pledgeOutcomeFlag(pledge.id, name)] = name === outcome;
  return {
    storyFlags,
    pledgeOutcomes: {
      ...(state.pledgeOutcomes || {}),
      [pledge.id]: {
        outcome,
        kept: Number(previous.kept || 0) + (outcome === 'kept' ? 1 : 0),
        bent: Number(previous.bent || 0) + (outcome === 'bent' ? 1 : 0),
        broken: Number(previous.broken || 0) + (outcome === 'broken' ? 1 : 0),
      },
    },
  };
}

// Swearing a pledge always starts from zero, with no choice left over from an
// earlier run of a repeatable pledge.
export function pledgeStateOnAccept(state, pledge) {
  if (!isPledge(pledge)) return {};
  return {
    objectiveProgress: { ...(state.objectiveProgress || {}), [pledge.id]: zeroProgress(pledge) },
    progress: { ...(state.progress || {}), [pledge.id]: 0 },
    choices: withoutPledgeChoices(pledge, state.choices),
  };
}

// One world event. `changed` is false when the event does nothing for this
// pledge; otherwise `patch` holds the fields to replace.
export function pledgeStateOnEvent(state, pledge, event) {
  if (!isPledge(pledge)) return { changed: false, patch: {}, result: null };
  const previous = state.objectiveProgress?.[pledge.id] || zeroProgress(pledge);
  const result = applyPledgeEventProgress(pledge, previous, event);
  if (!result.changed) return { changed: false, patch: {}, result };
  const patch = {
    objectiveProgress: { ...(state.objectiveProgress || {}), [pledge.id]: result.progress },
    progress: { ...(state.progress || {}), [pledge.id]: result.primaryProgress },
  };
  if (result.choice) {
    patch.choices = { ...(state.choices || {}), [result.choice.key]: result.choice.choiceId };
    const storyFlags = { ...(state.storyFlags || {}) };
    for (const flag of result.choice.flagsOff) storyFlags[flag] = false;
    for (const flag of result.choice.flagsOn) storyFlags[flag] = true;
    patch.storyFlags = storyFlags;
  }
  return { changed: true, patch, result };
}

// Completing a pledge records "kept" or "bent", read from the choices made.
export function pledgeStateOnComplete(state, pledge) {
  if (!isPledge(pledge)) return {};
  return recordOutcome(pledge, state, resolvePledgeOutcome(pledge, state));
}

// Abandoning a sworn pledge records "broken" and undoes its choices: the
// choice records are removed and the story flags those choices set are
// cleared, because the steps have to be played again.
export function pledgeStateOnAbandon(state, pledge) {
  if (!isPledge(pledge)) return {};
  const patch = recordOutcome(pledge, state, 'broken');
  for (const step of pledge.pledge.steps) {
    if (step.kind !== 'choose') continue;
    const chosen = state.choices?.[pledgeChoiceKey(pledge.id, step.id)];
    const option = pledge.pledge.choices[step.id]?.options.find((entry) => entry.id === chosen);
    for (const flag of option?.flags || []) patch.storyFlags[flag] = false;
  }
  patch.choices = withoutPledgeChoices(pledge, state.choices);
  return patch;
}
