// What the dialogue box shows for a pledge, as plain data. Pure, so it can be
// tested in node; PledgeDialogueBox.jsx only draws it.
//
// A quest that is not a pledge gets null here, and QuestDialogueBox.jsx then
// draws it exactly as it always has.
import { isPledge } from '../../pledges/pledgeModel.mjs';
import { getPledgeStepProgress } from '../../pledges/pledgeProgress.mjs';
import { pledgeDialogueLines } from './pledgeScript.mjs';

export const PLEDGE_SWEAR_HOLD_SECONDS = 1;

// mode: 'offer' | 'in_progress' | 'turn_in' (the game's own three modes).
export function buildPledgeDialogueView(quest, { mode = 'offer', objectiveProgress = {}, questState = {} } = {}) {
  if (!isPledge(quest)) return null;
  const lines = pledgeDialogueLines(quest, questState);
  const rows = getPledgeStepProgress(quest, objectiveProgress || {});
  const steps = quest.pledge.steps.map((step, index) => ({
    id: step.id, text: step.text, optional: rows[index].optional,
    current: rows[index].current, required: rows[index].required, done: rows[index].done,
  }));
  const required = steps.filter(step => !step.optional);
  const open = required.find(step => !step.done) || null;
  // One page per spoken line; the offer ends on the oath itself.
  const pages = [];
  if (mode === 'offer') {
    for (const line of lines.offer) pages.push({ kind: 'line', line });
    pages.push({ kind: 'oath' });
  } else if (mode === 'turn_in') {
    for (const line of lines.complete) pages.push({ kind: 'line', line });
    if (!pages.length) pages.push({ kind: 'kept' });
  } else pages.push({ kind: 'step' });
  return {
    kind: 'pledge',
    id: quest.id,
    title: quest.title,
    mode,
    pages,
    swornTo: quest.pledge.swornTo,
    cause: quest.pledge.cause,
    cost: quest.pledge.cost,
    steps,
    step: open,
    stepNumber: open ? required.indexOf(open) + 1 : required.length,
    stepCount: required.length,
    holdSeconds: PLEDGE_SWEAR_HOLD_SECONDS,
  };
}
