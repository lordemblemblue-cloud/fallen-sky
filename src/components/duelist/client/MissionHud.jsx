// The story mission's HUD (simple on purpose): the objective and its clock, who is talking, what the
// interact key does where you stand, the crew, and the two ways a fight ends (the crew is down and the stage
// starts again; the mission is done).
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const meOf = (view) => view.people.find((p) => p.id === view.me?.id) || null;

export function Objective({ view }) {
  return (
    <div className="duelist-objective">
      <div className="duelist-objective-mission">{view.name} · {view.stage.index + 1}/{view.stage.count}</div>
      <div className="duelist-objective-title" key={view.stage.index}>{view.stage.title}</div>
      <div className="duelist-objective-text">
        {view.stage.text}
        {view.timer !== null && <b>{clock(Math.ceil(view.timer))}</b>}
      </div>
    </div>
  );
}

export function Comms({ view }) {
  if (!view.comms || view.phase === 'complete') return null;
  return (
    <div className="duelist-comms" key={view.comms.text}>
      <span className="duelist-comms-who">{view.comms.speaker}</span>
      <span>{view.comms.text}</span>
    </div>
  );
}

export function Prompt({ view }) {
  if (!view.prompt || view.phase !== 'live' || meOf(view)?.dead) return null;
  return (
    <div className="duelist-prompt">
      <span><kbd>F</kbd> hold: {view.prompt.label}</span>
      <div className="duelist-prompt-bar"><div style={{ width: `${Math.round(view.prompt.progress * 100)}%` }} /></div>
    </div>
  );
}

/** The crew, when there is more than one of you. */
export function Crew({ view }) {
  if (view.people.length < 2) return null;
  return (
    <div className="duelist-crew">
      {view.people.map((p) => (
        <div key={p.id} className={p.dead ? 'is-down' : ''}>
          {p.id === view.me?.id ? 'You' : p.name}{p.dead ? ` · down${p.respawnIn > 0 ? ` ${Math.ceil(p.respawnIn)}` : ''}` : ''}
        </div>
      ))}
    </div>
  );
}

/** You fell and a crewmate still stands: you are back in a moment. */
export function DownNote({ view }) {
  const me = meOf(view);
  if (!me?.dead || view.phase !== 'live') return null;
  return <div className="duelist-respawn">Down. Back in {Math.max(0, me.respawnIn).toFixed(1)}</div>;
}

export function MissionEnd({ view, onAgain, onLeave = null }) {
  if (view.phase === 'failed') {
    return (
      <div className="duelist-center duelist-result">
        <div className="duelist-result-title duelist-result-failed">The crew is down</div>
        <div className="duelist-result-sub">Back to the last checkpoint in {Math.ceil(view.retryIn)}</div>
      </div>
    );
  }
  if (view.phase !== 'complete') return null;
  return (
    <div className="duelist-center duelist-result">
      <div className="duelist-result-title">Mission complete</div>
      <div className="duelist-result-sub duelist-result-ending">{view.ending}</div>
      <div className="duelist-result-actions">
        {onAgain && <button type="button" onClick={onAgain}>Play again</button>}
        {onLeave && <button type="button" onClick={onLeave}>Back to the menu</button>}
      </div>
    </div>
  );
}
