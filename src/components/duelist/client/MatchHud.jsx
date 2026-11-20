// The match HUD (simple on purpose): the score line at the top, the countdown and "Fight!", the respawn
// note, the feed of what happened, and the result with the scoreboard.
import { TEAM_COLORS } from './matchProps.mjs';

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const clock = (s) => (s === null || s === undefined ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);
// the player is view.me ('you' in a local match, the account id online)
const meOf = (view) => view.me?.id ?? 'you';
const nameOf = (view, id) => (id === meOf(view) ? 'You' : view.people.find((p) => p.id === id)?.name || 'Someone');
const teamName = (t) => (t === 'red' ? 'Red' : 'Blue');

function FlagMark({ team, flag }) {
  const label = flag.state === 'home' ? 'home' : flag.state === 'carried' ? 'taken' : 'dropped';
  return <span className={`duelist-flag duelist-flag-${flag.state}`} style={{ color: hex(TEAM_COLORS[team]) }}>⚑ {label}</span>;
}

export function ScoreLine({ view }) {
  const { mode } = view;
  let middle = null;
  if (mode === 'duel') {
    const foe = view.people.find((p) => p.id !== meOf(view));
    middle = (
      <>
        <span>You {view.me?.roundWins ?? 0}</span>
        <span className="duelist-score-sep">Round {view.round} · first to {view.rounds}</span>
        <span>{foe?.roundWins ?? 0} {foe?.name}</span>
      </>
    );
  } else if (mode === 'control') {
    middle = (
      <>
        <span style={{ color: hex(TEAM_COLORS.red) }}>Red {Math.floor(view.teamScores.red)}%</span>
        <span className="duelist-score-sep">First to 100%</span>
        <span style={{ color: hex(TEAM_COLORS.blue) }}>{Math.floor(view.teamScores.blue)}% Blue</span>
      </>
    );
  } else if (mode === 'tdm' || mode === 'ctf' || mode === 'football') {
    middle = (
      <>
        <span style={{ color: hex(TEAM_COLORS.red) }}>Red {view.teamScores.red}</span>
        <span className="duelist-score-sep">{view.scoreToWin ? `to ${view.scoreToWin}` : ''}</span>
        <span style={{ color: hex(TEAM_COLORS.blue) }}>{view.teamScores.blue} Blue</span>
      </>
    );
  } else if (mode === 'ffa') {
    const leader = view.people[0];
    middle = (
      <>
        <span>You {view.me?.defeats ?? 0}</span>
        <span className="duelist-score-sep">to {view.scoreToWin}</span>
        <span>{leader && leader.id !== meOf(view) ? `${leader.name} ${leader.defeats}` : 'You lead'}</span>
      </>
    );
  }
  return (
    <div className="duelist-scoreline">
      <div className="duelist-scoreline-mode">{view.name}{view.clockLeft !== null ? ` · ${clock(view.clockLeft)}` : ''}</div>
      {middle && <div className="duelist-scoreline-score">{middle}</div>}
      {view.controlPoints && (
        <div className="duelist-scoreline-flags" aria-label="Three-Point Control objectives">
          {view.controlPoints.map(point => (
            <span key={point.id}
              title={point.contested ? `${point.id}: contested` : point.capturing ? `${point.id}: ${point.capturing} capturing ${Math.round(point.progress * 100)}%` : `${point.id}: ${point.owner || 'neutral'}`}
              style={{ color: point.owner === 'red' ? hex(TEAM_COLORS.red) : point.owner === 'blue' ? hex(TEAM_COLORS.blue) : '#d6e1eb', fontWeight: 800 }}>
              {point.id}{point.contested ? ' ⚔' : point.capturing ? ` ${Math.round(point.progress * 100)}%` : ''}
            </span>
          ))}
        </div>
      )}
      {view.flags && (
        <div className="duelist-scoreline-flags">
          <FlagMark team="red" flag={view.flags.red} />
          <FlagMark team="blue" flag={view.flags.blue} />
        </div>
      )}
    </div>
  );
}

export function Countdown({ view, fightFlash }) {
  if (view.phase === 'countdown' && view.countdown > 0) {
    return <div className="duelist-countdown">{view.mode === 'duel' && view.round > 1 ? <small>Round {view.round}</small> : null}{Math.ceil(view.countdown)}</div>;
  }
  if (view.phase === 'roundOver') {
    const who = view.roundWinner ? `${nameOf(view, view.roundWinner)} ${view.roundWinner === meOf(view) ? 'take' : 'takes'} the round` : 'Round drawn';
    return <div className="duelist-countdown duelist-countdown-small">{who}</div>;
  }
  if (fightFlash) return <div className="duelist-countdown duelist-countdown-fight">Fight!</div>;
  return null;
}

export function RespawnNote({ view }) {
  if (!view.me?.dead || view.mode === 'duel' || view.phase !== 'live') return null;
  return <div className="duelist-respawn">Back in {Math.max(0, view.me.respawnIn).toFixed(1)}</div>;
}

function feedLine(view, e) {
  const n = (id) => nameOf(view, id);
  switch (e.type) {
    case 'defeat': return e.by ? `${n(e.by)} defeated ${n(e.who)}` : `${n(e.who)} fell`;
    case 'flagTaken': return `${n(e.by)} took the ${teamName(e.team).toLowerCase()} flag`;
    case 'flagDropped': return `The ${teamName(e.team).toLowerCase()} flag was dropped`;
    case 'flagReturned': return e.by ? `${n(e.by)} returned the ${teamName(e.team).toLowerCase()} flag` : `The ${teamName(e.team).toLowerCase()} flag went home`;
    case 'captured': return `${teamName(e.team)} scored! (${n(e.by)})`;
    case 'goal': return `${teamName(e.team)} scored a goal${e.by ? ` (${n(e.by)})` : ''}!`;
    case 'pointCaptured': return `${teamName(e.team)} captured point ${e.point}`;
    case 'roundOver': return e.winner ? `Round ${e.round}: ${n(e.winner)}` : `Round ${e.round} drawn`;
    case 'joined': return `${e.name} joined`;
    case 'left': return `${e.name} left`;
    case 'away': return `${e.id === meOf(view) ? 'You' : e.name} lost connection`;
    case 'back': return `${e.id === meOf(view) ? 'You are' : `${e.name} is`} back`;
    default: return null;
  }
}

export function Feed({ view }) {
  const lines = view.feed.map((e, i) => ({ key: `${e.at}-${i}`, text: feedLine(view, e) })).filter((l) => l.text);
  if (!lines.length) return null;
  return <div className="duelist-feed">{lines.map((l) => <div key={l.key}>{l.text}</div>)}</div>;
}

export function Result({ view, myTeam, onAgain, online = false }) {
  if (view.phase !== 'over') return null;
  const w = view.winner;
  const won = w === meOf(view) || (myTeam && w === myTeam);
  const title = w === 'draw' ? 'Draw' : won ? 'Victory' : 'Defeated';
  const teams = view.mode === 'tdm' || view.mode === 'ctf' || view.mode === 'football' || view.mode === 'control';
  return (
    <div className="duelist-center duelist-result">
      <div className="duelist-result-title">{title}</div>
      {teams && <div className="duelist-result-sub">Red {view.mode === 'control' ? Math.floor(view.teamScores.red) + '%' : view.teamScores.red} · {view.mode === 'control' ? Math.floor(view.teamScores.blue) + '%' : view.teamScores.blue} Blue</div>}
      <table className="duelist-board">
        <thead><tr><th>Fighter</th><th>Defeats</th><th>Falls</th>{view.mode === 'ctf' && <th>Captures</th>}{view.mode === 'duel' && <th>Rounds</th>}</tr></thead>
        <tbody>
          {view.people.map((p) => (
            <tr key={p.id} className={p.id === meOf(view) ? 'is-you' : ''}>
              <td style={p.team ? { color: hex(TEAM_COLORS[p.team]) } : undefined}>{p.id === meOf(view) ? 'You' : p.name}</td>
              <td>{p.defeats}</td><td>{p.falls}</td>{view.mode === 'ctf' && <td>{p.captures}</td>}{view.mode === 'duel' && <td>{p.roundWins}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {online ? <div className="duelist-result-sub">The next match starts in a few seconds.</div> : <button type="button" onClick={onAgain}>Play again</button>}
    </div>
  );
}
