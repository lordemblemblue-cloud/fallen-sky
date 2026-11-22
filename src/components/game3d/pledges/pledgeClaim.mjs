// The completion claim: what the browser would send a server when a pledge is
// turned in. Pure; it makes no network call and grants nothing. A server must
// check every line of it against its own record of what happened, and must
// read rewards and standings from its own copy of the pledge, never from here.
import { isPledge } from './pledgeModel.mjs';
import { getPledgeStepProgress, isPledgeReadyToComplete } from './pledgeProgress.mjs';
import { getPledgeChoices, resolvePledgeOutcome } from './pledgeOutcome.mjs';

export const PLEDGE_CLAIM_VERSION = 1;

export function buildPledgeCompletionClaim(pledge, state = {}) {
  if (!isPledge(pledge)) return null;
  const progress = state?.objectiveProgress?.[pledge.id] || {};
  const ready = isPledgeReadyToComplete(pledge, progress);
  return {
    kind: 'pledge_completion_claim',
    version: PLEDGE_CLAIM_VERSION,
    pledgeId: pledge.id,
    line: pledge.pledge.line,
    chapter: pledge.pledge.chapter,
    ready,
    steps: getPledgeStepProgress(pledge, progress).map((row) => ({
      id: row.id, kind: row.kind, count: row.current, required: row.required,
      optional: row.optional, done: row.done,
    })),
    choices: getPledgeChoices(pledge, state),
    // Null until every required step is done.
    outcome: ready ? resolvePledgeOutcome(pledge, state) : null,
  };
}
