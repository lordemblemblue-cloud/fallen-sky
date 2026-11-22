// Ordered progress for pledges. Pure: it computes what the browser shows and
// must never confer XP, loot, kills or anything a server should decide.
//
// The rule: in a pledge only the first unfinished required step may advance,
// together with the optional steps listed directly after it. An event that
// matches a later step is ignored. A step that names an event in `failsOn`
// goes back to zero when that event arrives while the step is open.
import { normalizeQuestEventCount } from '../axe/quests/AXEQuestEventProgress.js';
import { isPledge, pledgeChoiceKey, pledgeObjectiveMatchesEvent } from './pledgeModel.mjs';

const clampCount = (value, required) => {
  const raw = Number(value || 0);
  return Number.isFinite(raw) ? Math.max(0, Math.min(required, Math.floor(raw))) : 0;
};

// One row per step, in order: how far it is and whether it is done.
export function getPledgeStepProgress(pledge, objectiveProgress = {}) {
  if (!isPledge(pledge)) return [];
  const stored = objectiveProgress || {};
  return pledge.objectives.map((objective, index) => {
    const current = clampCount(stored[objective.id], objective.count);
    return {
      id: objective.id,
      kind: pledge.pledge.steps[index].kind,
      current,
      required: objective.count,
      optional: objective.optional === true,
      done: current >= objective.count,
    };
  });
}

// The steps that may advance now: the first unfinished required step and the
// optional steps listed directly after it. Null when every required step is
// done (the pledge is ready to be turned in).
export function getPledgeActiveGroup(pledge, objectiveProgress = {}) {
  const rows = getPledgeStepProgress(pledge, objectiveProgress);
  const index = rows.findIndex((row) => !row.optional && !row.done);
  if (index < 0) return null;
  const optional = [];
  for (let i = index + 1; i < rows.length && rows[i].optional; i++) optional.push(i);
  return {
    index,
    stepId: rows[index].id,
    step: pledge.pledge.steps[index],
    optionalIndexes: optional,
    optionalStepIds: optional.map((i) => rows[i].id),
  };
}

export function isPledgeReadyToComplete(pledge, objectiveProgress = {}) {
  return isPledge(pledge) && getPledgeActiveGroup(pledge, objectiveProgress) === null;
}

const failTargetMatches = (objective, event) => event.targetId === undefined ||
  event.targetId === (objective.targetId ?? objective.itemId);

// Apply one event to one pledge. Same return shape as
// applyAXEQuestEventProgress, plus which steps advanced or failed and the
// choice the event made, if any.
export function applyPledgeEventProgress(pledge, previous = {}, event = {}) {
  const unchanged = {
    changed: false, progress: previous, primaryProgress: null,
    advanced: [], failed: [], choice: null,
  };
  if (!isPledge(pledge) || !event || typeof event.type !== 'string' || !event.type) return unchanged;
  // An event may name the one pledge it is meant for.
  if (event.pledgeId !== undefined && event.pledgeId !== pledge.id) return unchanged;
  const group = getPledgeActiveGroup(pledge, previous);
  if (!group) return unchanged;

  const count = normalizeQuestEventCount(event);
  const progress = { ...(previous || {}) };
  const advanced = [];
  const failed = [];
  let choice = null;
  for (const index of [group.index, ...group.optionalIndexes]) {
    const objective = pledge.objectives[index];
    const required = objective.count;
    const before = clampCount(progress[objective.id], required);

    if (objective.failsOn.includes(event.type)) {
      if (failTargetMatches(objective, event) && before > 0) {
        progress[objective.id] = 0;
        failed.push(objective.id);
      }
      continue;
    }
    if (before >= required || !count) continue;
    if (!pledgeObjectiveMatchesEvent(objective, event)) continue;

    if (objective.stepKind === 'choose') {
      const options = pledge.pledge.choices[objective.id]?.options || [];
      const option = options.find((entry) => entry.id === event.choiceId);
      if (!option) continue; // not one of the choices on offer
      const flagsOn = [...option.flags];
      const flagsOff = [...new Set(options.flatMap((entry) => entry.flags))]
        .filter((flag) => !flagsOn.includes(flag));
      choice = {
        stepId: objective.id, choiceId: option.id, outcome: option.outcome,
        key: pledgeChoiceKey(pledge.id, objective.id), flagsOn, flagsOff,
      };
      progress[objective.id] = 1;
    } else {
      progress[objective.id] = Math.min(required, before + count);
    }
    advanced.push(objective.id);
  }

  if (!advanced.length && !failed.length) return unchanged;
  return {
    changed: true,
    progress,
    primaryProgress: clampCount(progress[pledge.objectives[0].id], pledge.objectives[0].count),
    advanced,
    failed,
    choice,
  };
}
