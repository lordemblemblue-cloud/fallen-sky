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

// keyName: the key the player uses things with (their own binding)
export function Prompt({ view, keyName = 'F' }) {
  if (!view.prompt || view.phase !== 'live' || meOf(view)?.dead) return null;
  return (
    <div className="duelist-prompt">
      <span><kbd>{keyName}</kbd> hold: {view.prompt.label}</span>
      <div className="duelist-prompt-bar"><div style={{ width: `${Math.round(view.prompt.progress * 100)}%` }} /></div>
    </div>
  );
}

/** The crew, when there is more than one of you; online, the room's code to give to friends. */
export function Crew({ view }) {
  const code = view.room?.code || null;
  if (view.people.length < 2 && !code) return null;
  return (
    <div className="duelist-crew">
      {code && <div className="duelist-crew-code">Crew code <b>{code}</b>{view.room.open ? ' · open to anyone' : ''}</div>}
      {view.people.map((p) => (
        <div key={p.id} className={p.dead || view.away?.includes(p.id) ? 'is-down' : ''}>
          {p.id === view.me?.id ? 'You' : p.name}{p.dead ? ` · down${p.respawnIn > 0 ? ` ${Math.ceil(p.respawnIn)}` : ''}` : ''}
          {view.away?.includes(p.id) ? ' · reconnecting' : ''}
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

// onNext(id): (playing alone) on to the story's next mission
export function MissionEnd({ view, onAgain, onLeave = null, onNext = null }) {
  if (view.phase === 'failed') {
    return (
      <div className="duelist-center duelist-result">
        <div className="duelist-result-title duelist-result-failed">The crew is down</div>
        <div className="duelist-result-sub">Back to the last checkpoint in {Math.ceil(view.retryIn)}</div>
      </div>
    );
  }
  if (view.phase !== 'complete') return null;
  const next = view.next || null;
  return (
    <div className="duelist-center duelist-result">
      <div className="duelist-result-title">Mission complete</div>
      <div className="duelist-result-sub duelist-result-ending">{view.ending}</div>
      {view.againIn !== null && view.againIn !== undefined && (
        <div className="duelist-result-sub">{next ? `The crew goes on to ${next.title} in ${view.againIn}` : `The mission starts again in ${view.againIn}`}</div>
      )}
      <div className="duelist-result-actions">
        {next && onNext && <button type="button" onClick={() => onNext(next.id)}>Next: {next.title}</button>}
        {onAgain && <button type="button" onClick={onAgain}>Play again</button>}
        {onLeave && <button type="button" onClick={onLeave}>Back to the menu</button>}
      </div>
    </div>
  );
}
