/** Cinematic but lightweight match transition. No fictitious loading percentages or timers. */
const BRIEFS = {
  duel: ['DUEL', 'Face one opponent. Win three rounds to take the match.'],
  practice: ['PRACTICE', 'Train against bots and get familiar with your abilities.'],
  ffa: ['FREE FOR ALL', 'Every fighter is a rival. Keep moving and watch your surroundings.'],
  tdm: ['TEAM DEATHMATCH', 'Fight beside your team and secure the most eliminations.'],
  ctf: ['CAPTURE THE FLAG', 'Defend your base and bring the opposing flag home.'],
  control: ['CONTROL POINT', 'Hold two of three points to build your team score.'],
  escort: ['ESCORT TRANSPORT', 'Red advances the carrier. Blue contests inside its ring.'],
  football: ['FOOTBALL', 'Dribble toward goal and press F near the ball to kick.'],
  story: ['STORY CAMPAIGN', 'Follow your mission objectives and work with your crew.'],
  online: ['ONLINE MATCH', 'Join an available battle with other fighters.'],
  any: ['FIND A MATCH', 'Joining an available arena and preparing your fighter.'],
};

const STAGES = ['CHOOSE MODE', 'SELECT FIGHTER', 'PREPARE ARENA', 'ENTER MATCH'];

export default function MatchLoadingScreen({ mode = 'practice', message = 'Preparing arena…', variant = 'loading', note = '', onRetry, onLeave }) {
  const [title, rule] = BRIEFS[mode] || BRIEFS.practice;
  const isError = variant === 'error';
  return (
    <div className={`duelist-match-loading duelist-match-loading--${isError ? 'error' : 'active'}`}
      role={isError ? 'alert' : 'status'} aria-live={isError ? 'assertive' : 'polite'} aria-label={message}>
      <div className="duelist-match-loading__panel">
        <span className="duelist-match-loading__eyebrow">EMBLEM BLUE / DUELIST ADVENTURE / MATCH BRIEFING</span>
        <h2 className="duelist-match-loading__mode">{title}</h2>
        <p className="duelist-match-loading__rule">{rule}</p>
        <ol className="duelist-match-loading__states" aria-label="Match entry sequence">
          {STAGES.map((stage, index) => (
            <li key={stage}><b>{String(index + 1).padStart(2, '0')}</b>{stage}</li>
          ))}
        </ol>
        <div className="duelist-match-loading__message">{message}</div>
        {note && <p className="duelist-match-loading__rule">{note}</p>}
        {isError ? <div className="flex flex-wrap justify-center gap-3 mt-4">
          {onRetry && <button type="button" className="rounded border border-cyan-300/50 px-4 py-2 text-white" onClick={onRetry}>Retry loading</button>}
          {onLeave && <button type="button" className="rounded border border-white/30 px-4 py-2 text-white" onClick={onLeave}>Return to menu</button>}
        </div> : <div className="duelist-match-loading__rail" aria-hidden="true" />}
      </div>
    </div>
  );
}
