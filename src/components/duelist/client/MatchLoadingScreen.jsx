/** Cinematic but lightweight match transition. No fictitious loading percentages or timers. */
const BRIEFS = {
  duel: ['DUEL', 'Face one opponent. Win three rounds to take the match.'],
  practice: ['PRACTICE', 'Train against bots and get familiar with your abilities.'],
  ffa: ['FREE FOR ALL', 'Every fighter is a rival. Keep moving and watch your surroundings.'],
  tdm: ['TEAM DEATHMATCH', 'Fight beside your team and secure the most eliminations.'],
  ctf: ['CAPTURE THE FLAG', 'Defend your base and bring the opposing flag home.'],
  control: ['CONTROL POINT', 'Hold two of three points to build your team score.'],
  football: ['FOOTBALL', 'Dribble toward goal and press F near the ball to kick.'],
  story: ['STORY CAMPAIGN', 'Follow your mission objectives and work with your crew.'],
  online: ['ONLINE MATCH', 'Join an available battle with other fighters.'],
  any: ['FIND A MATCH', 'Joining an available arena and preparing your fighter.'],
};

const STAGES = ['CHOOSE MODE', 'SELECT FIGHTER', 'PREPARE ARENA', 'ENTER MATCH'];

export default function MatchLoadingScreen({ mode = 'practice', message = 'Preparing arena…', variant = 'loading', note = '' }) {
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
        <div className="duelist-match-loading__rail" aria-hidden="true" />
      </div>
    </div>
  );
}
