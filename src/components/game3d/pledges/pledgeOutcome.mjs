// How a pledge ended. Pure.
//   kept   = done as sworn
//   bent   = done another way (a choice the pledge marks as "bent")
//   broken = abandoned after it was sworn
// The store records the outcome when a pledge is completed or abandoned
// (pledgeState.mjs); these functions only read.
import { isPledge, pledgeChoiceKey } from './pledgeModel.mjs';
import { getPledgeStepProgress } from './pledgeProgress.mjs';

// The choices made so far, by step id. A choice counts only once its step is
// done, so a stale value left by an earlier run is never read.
export function getPledgeChoices(pledge, state = {}) {
  if (!isPledge(pledge)) return {};
  const stored = state?.choices || {};
  const rows = getPledgeStepProgress(pledge, state?.objectiveProgress?.[pledge.id] || {});
  const result = {};
  for (const row of rows) {
    if (row.kind !== 'choose' || !row.done) continue;
    const choiceId = stored[pledgeChoiceKey(pledge.id, row.id)];
    const options = pledge.pledge.choices[row.id]?.options || [];
    if (options.some((option) => option.id === choiceId)) result[row.id] = choiceId;
  }
  return result;
}

// What the outcome would be if the pledge were completed now: "bent" when any
// choice made is marked bent, otherwise "kept".
export function resolvePledgeOutcome(pledge, state = {}) {
  if (!isPledge(pledge)) return null;
  const made = getPledgeChoices(pledge, state);
  for (const [stepId, choiceId] of Object.entries(made)) {
    const option = pledge.pledge.choices[stepId].options.find((entry) => entry.id === choiceId);
    if (option?.outcome === 'bent') return 'bent';
  }
  return 'kept';
}

// What the store has on record for a pledge: the last outcome and how many
// times each outcome happened. Null when it has never been completed or broken.
export function getPledgeRecord(pledgeId, state = {}) {
  const record = state?.pledgeOutcomes?.[pledgeId];
  if (!record || typeof record !== 'object') return null;
  return {
    outcome: record.outcome ?? null,
    kept: Number(record.kept || 0),
    bent: Number(record.bent || 0),
    broken: Number(record.broken || 0),
  };
}

// 'kept', 'bent', 'broken', or null if the pledge has not ended yet. For a
// pledge sworn again after it ended, this stays the last ending until the new
// one is reached.
export function getPledgeOutcome(pledgeId, state = {}) {
  return getPledgeRecord(pledgeId, state)?.outcome ?? null;
}
