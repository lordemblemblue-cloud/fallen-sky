/** Pure match result presentation, independent of React and rendering. */
export const VICTORY_HOLD_MS = 2300;
const TEAM_MODES = new Set(['tdm', 'ctf', 'football', 'control']);
export function resultOutcome(view, myTeam = null) {
  if (view?.phase !== 'over') return null;
  if (view.winner === 'draw') return 'DRAW';
  const me = view.me?.id ?? 'you';
  return view.winner === me || (myTeam && view.winner === myTeam) ? 'VICTORY' : 'DEFEAT';
}
export function resultsScoreText(view) {
  if (view?.mode === 'escort' && view.escort) return view.winner === 'red'
    ? 'Payload delivered · 100%' : 'Defense held · ' + Math.floor(view.escort.progress) + '% of route';
  if (!TEAM_MODES.has(view?.mode)) return '';
  const scores = view.teamScores || {};
  const number = (value) => Number.isFinite(value) ? value : 0;
  const format = (value) => view.mode === 'control' ? Math.floor(number(value)) + '%' : String(number(value));
  return 'Red ' + format(scores.red) + '   •   ' + format(scores.blue) + ' Blue';
}
