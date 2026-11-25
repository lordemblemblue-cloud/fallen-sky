// The match HUD (simple on purpose): the score line at the top, the countdown and "Fight!", the respawn
// note, the feed of what happened, and the result with the scoreboard.
import { useEffect, useState } from 'react';
import { TEAM_COLORS } from './matchProps.mjs';
import './glassVictory.css';
import { resultOutcome, resultsScoreText, VICTORY_HOLD_MS } from './resultPresentation.mjs';
import { captureText, pointState } from './glassHud.mjs';

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
  if (!view) return null;
  const { mode } = view;
  if (mode === 'control' && Array.isArray(view.controlPoints)) {
    return (
      <div className="duelist-scoreline duelist-scoreline--control">
        <div className="duelist-control-rail" role="group" aria-label="Control Point score and objectives">
          <div className="duelist-control-team duelist-control-team--red">
            <strong>{Math.floor(view.teamScores.red)}%</strong><span>RED TEAM</span>
          </div>
          <div className="duelist-control-centre">
            <div className="duelist-control-points">
              {view.controlPoints.map(point => (
                <div key={point.id} className="duelist-control-point" data-state={pointState(point)}
                  data-owner={point.owner || 'neutral'} title={captureText(point)} aria-label={captureText(point)}>
                  <strong>{point.id}</strong>
                  {point.contested && <small aria-hidden="true">!</small>}
                  {!point.contested && point.capturing && <small aria-hidden="true">{Math.round(Math.min(1, Math.max(0, point.progress || 0)) * 100)}%</small>}
                </div>
              ))}
            </div>
            <span className="duelist-control-caption">CAPTURE · HOLD TWO TO SCORE</span>
          </div>
          <div className="duelist-control-team duelist-control-team--blue">
            <strong>{Math.floor(view.teamScores.blue)}%</strong><span>BLUE TEAM</span>
          </div>
        </div>
      </div>
    );
  }
  // The rotating single-point and escort headers are deliberately waiting
  // for their own server-authoritative objectives. Never simulate a timer in UI.
  if (mode === 'single_control') {
    if (!view.singlePoint) return null;
    const point = view.singlePoint;
    const status = point.active ? point.contested ? 'CONTESTED' : point.owner ? 'ZONE CONTROLLED' : 'CAPTURE THE ZONE' :
      Number.isFinite(point.nextIn) ? `NEXT ZONE IN ${Math.ceil(Math.max(0, point.nextIn))}s` : 'ZONE INACTIVE';
    return (
      <div className="duelist-scoreline duelist-scoreline--single">
        <div className="duelist-single-rail" role="group" aria-label="Rotating control-point objective">
          <strong className="duelist-single-score duelist-single-score--blue">{Math.floor(view.teamScores?.blue || 0)}%</strong>
          <div className="duelist-single-middle">
            <strong>{point.active ? point.id || '◆' : '◇'}</strong>
            <span>{status}</span>
          </div>
          <strong className="duelist-single-score duelist-single-score--red">{Math.floor(view.teamScores?.red || 0)}%</strong>
        </div>
      </div>
    );
  }
  if (mode === 'escort') {
    if (!view.escort || !Number.isFinite(view.escort.progress)) return null;
    const percent = Math.max(0, Math.min(100, view.escort.progress));
    return (
      <div className="duelist-scoreline duelist-scoreline--escort">
        <div className="duelist-escort-rail" role="group" aria-label="Escort transport objective">
          <strong>ESCORT TRANSPORT</strong>
          <div className="duelist-escort-track" role="progressbar" aria-label="Escort progress"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
            <span style={{ width: `${percent}%` }} />
          </div>
          <span className="duelist-escort-percent">{Math.round(percent)}%</span>
          <span className="duelist-escort-subtitle">{!view.escort.pointACaptured ? 'CAPTURE POINT A · '+Math.floor(view.escort.captureProgress||0)+'%' : view.escort.contested ? 'CONTESTED · CLEAR THE TRANSPORT' :
            view.escort.moving ? 'TRANSPORT ADVANCING' : 'WAITING FOR ESCORT'}</span>
        </div>
      </div>
    );
  }

  let left = 'YOU', leftScore = 0, right = 'ENEMY', rightScore = 0, centre = clock(view.clockLeft) || '—', caption = view.name;
  if (mode === 'tdm' || mode === 'ctf' || mode === 'football') {
    left = 'BLUE TEAM'; leftScore = view.teamScores.blue;
    right = 'RED TEAM'; rightScore = view.teamScores.red;
    caption = mode === 'tdm' ? 'TEAM DEATHMATCH' : mode === 'ctf' ? 'CAPTURE THE FLAG' : 'FOOTBALL';
  } else if (mode === 'duel') {
    const foe = view.people.find(p => p.id !== meOf(view));
    left = 'YOUR ROUNDS'; leftScore = view.me?.roundWins ?? 0;
    right = foe?.name || 'RIVAL'; rightScore = foe?.roundWins ?? 0;
    caption = `ROUND ${view.round} · FIRST TO ${view.rounds}`;
  } else if (mode === 'ffa') {
    const leader = view.people[0];
    left = 'YOUR KILLS'; leftScore = view.me?.defeats ?? 0;
    right = leader?.id === meOf(view) ? 'YOU LEAD' : leader?.name || 'LEADER';
    rightScore = leader?.defeats ?? 0;
    caption = `FREE FOR ALL · FIRST TO ${view.scoreToWin}`;
  } else {
    // Practice, tutorial and any newly introduced mode retain a small label;
    // no imaginary score is rendered for modes without authoritative tallies.
    return <div className="duelist-scoreline duelist-scoreline--simple">
      <div className="duelist-scoreline-mode">{view.name}{view.clockLeft !== null ? ` · ${clock(view.clockLeft)}` : ''}</div>
    </div>;
  }
  return (
    <div className="duelist-scoreline duelist-scoreline--kills">
      <div className="duelist-kill-rail" role="group" aria-label={caption}>
        <div className="duelist-kill-side duelist-kill-side--blue">
          <strong>{leftScore}{view.scoreToWin && mode === 'tdm' ? `/${view.scoreToWin}` : ''}</strong>
          <span>{left}</span>
        </div>
        <div className="duelist-kill-clock"><strong>{centre}</strong><span>{caption}</span></div>
        <div className="duelist-kill-side duelist-kill-side--red">
          <strong>{rightScore}{view.scoreToWin && mode === 'tdm' ? `/${view.scoreToWin}` : ''}</strong>
          <span>{right}</span>
        </div>
      </div>
      {view.flags && (
        <div className="duelist-scoreline-flags" aria-label="Flag state">
          <FlagMark team="red" flag={view.flags.red} />
          <FlagMark team="blue" flag={view.flags.blue} />
        </div>
      )}
    </div>
  );
}

export function Countdown({ view, fightFlash }) {
  if (view.phase === 'countdown' && view.countdown > 0) {
    if(view.mode==='escort'){
      const prep=view.preparation??Math.max(0,view.countdown-5);
      if(prep>.0001)return <div className="duelist-countdown duelist-escort-preparation" role="status"><small>Prepare for battle</small><strong>{Math.ceil(prep-1e-6)}</strong><span>Choose your class and equipment</span></div>;
      return <div className="duelist-countdown" role="status"><small>Match begins in</small>{Math.min(5,Math.ceil(view.countdown-1e-6))}</div>;
    }
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
  return <div className="duelist-respawn">Back in {Math.max(0, view.me.respawnIn).toFixed(1)}{view.mode==='escort'&&view.me.team==='blue'&&view.escort?.defenderRespawnSeconds>4&&<small style={{display:'block',fontSize:'.7em'}}>Defense reinforcement delay increased</small>}</div>;
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

/** The result animates over the still-visible arena before the details panel appears. */
export function Result({ view, myTeam, onAgain, online = false }) {
  const [showBoard, setShowBoard] = useState(false);
  useEffect(() => {
    if (view.phase !== 'over') {
      setShowBoard(false);
      return undefined;
    }
    setShowBoard(false);
    const timer = setTimeout(() => setShowBoard(true), VICTORY_HOLD_MS);
    return () => clearTimeout(timer);
  }, [view.phase, view.winner]);
  if (view.phase !== 'over') return null;
  const w = view.winner;
  const outcome = resultOutcome(view, myTeam);
  const won = outcome === 'VICTORY';
  const scoreText = resultsScoreText(view);
  const teams = Boolean(scoreText);
  return (
    <div className={'duelist-win-layer ' + (showBoard ? 'is-revealed ' : '') + (won ? 'is-victory' : w === 'draw' ? 'is-draw' : 'is-defeat')} data-testid="duelist-result-layer" role="status" aria-live="polite">
      <div className="duelist-win-burst" aria-hidden="true" />
      <div className="duelist-win-sweep" aria-hidden="true" />
      <div className="duelist-win-banner">
        <img src="/ui/duelist/glass-victory.svg" alt="" aria-hidden="true" />
        <strong>{outcome}!</strong>
        <small>{view.name || 'DUELIST ADVENTURE'}</small>
      </div>
      {showBoard && (
        <section className="duelist-win-board" aria-label="Match results">
          <div className="duelist-win-board-title">
            <span>AFTER-ACTION REPORT</span>
            {teams && <strong>{scoreText}</strong>}
          </div>
          <div className="duelist-win-board-scroll">
            <table className="duelist-board">
              <thead>
                <tr><th>Fighter</th><th>Eliminations</th><th>Falls</th>{view.mode === 'ctf' && <th>Captures</th>}{view.mode === 'duel' && <th>Rounds</th>}</tr>
              </thead>
              <tbody>
                {(view.people || []).map((p) => (
                  <tr key={p.id} className={p.id === meOf(view) ? 'is-you' : ''}>
                    <td style={p.team ? { color: hex(TEAM_COLORS[p.team]) } : undefined}>{p.id === meOf(view) ? 'You' : p.name}</td>
                    <td>{p.defeats}</td><td>{p.falls}</td>
                    {view.mode === 'ctf' && <td>{p.captures}</td>}
                    {view.mode === 'duel' && <td>{p.roundWins}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {online
            ? <div className="duelist-win-next">The next match starts shortly.</div>
            : <button type="button" className="duelist-win-play-again" onClick={onAgain}>PLAY AGAIN</button>}
        </section>
      )}
    </div>
  );
}
