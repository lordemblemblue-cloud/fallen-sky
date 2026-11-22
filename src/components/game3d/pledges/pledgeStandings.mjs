// The standings a pledge asks for. Pure, and it grants nothing: the numbers
// are a request read from the pledge definition, for a server to decide on.
//   renown = standing with your own empire
//   trust  = standing with the valley's people
//   regard = the Wolf's regard
import { isPledge, PLEDGE_OUTCOMES, PLEDGE_STANDING_KEYS } from './pledgeModel.mjs';
import { getPledgeStepProgress } from './pledgeProgress.mjs';

const zero = () => ({ renown: 0, trust: 0, regard: 0 });

// The change in standings the definition asks for, for this outcome. Pass the
// quest state as well to add what the definition asks for each optional step
// that was done (never for a broken pledge).
export function getPledgeStandingRequest(pledge, outcome, state = null) {
  const request = zero();
  if (!isPledge(pledge) || !PLEDGE_OUTCOMES.includes(outcome)) return request;
  const standings = pledge.pledge.standings;
  for (const key of PLEDGE_STANDING_KEYS) request[key] += Number(standings[outcome]?.[key] || 0);
  if (state && outcome !== 'broken') {
    const rows = getPledgeStepProgress(pledge, state.objectiveProgress?.[pledge.id] || {});
    for (const row of rows) {
      if (!row.optional || !row.done) continue;
      const bonus = standings.optional?.[row.id];
      if (!bonus) continue;
      for (const key of PLEDGE_STANDING_KEYS) request[key] += Number(bonus[key] || 0);
    }
  }
  return request;
}
