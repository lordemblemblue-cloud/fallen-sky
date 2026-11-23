import { useEffect, useRef, useState } from 'react';
import { FantasyBattleStage } from './FantasyBattleStage.js';
import StudioPanel from './StudioPanel.jsx';
import { showLandscapeSuggestion, requestLandscapeOnGesture } from '@/components/mobile/mobileLandscape.mjs';
import './fantasybattle.css';

function UnitCard({ unit, side }) {
  if (!unit) return null;
  const pct = Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100));
  return (
    <div className={`fb-card fb-card-${side}`}>
      <div className="fb-card-name">
        {unit.name}
        {unit.guarding && <span className="fb-badge">Guarding</span>}
      </div>
      <div className="fb-hp" role="meter" aria-label={`${unit.name} health`} aria-valuemin={0} aria-valuemax={unit.maxHp} aria-valuenow={unit.hp}>
        <div className={`fb-hp-fill ${pct < 30 ? 'low' : ''}`} style={{ width: `${pct}%` }} />
        <span className="fb-hp-text">{unit.hp} / {unit.maxHp}</span>
      </div>
      <div className="fb-focus" aria-label={`Focus ${unit.focus} of ${unit.maxFocus}`}>
        <span className="fb-focus-label">Focus</span>
        {Array.from({ length: unit.maxFocus }, (_, i) => <i key={i} className={i < unit.focus ? 'on' : ''} />)}
      </div>
    </div>
  );
}

export default function FantasyBattlePage() {
  const mountRef = useRef(null);
  const stageRef = useRef(null);
  const [hud, setHud] = useState(null);
  const [error, setError] = useState(null);
  const [studio, setStudio] = useState(false);
  const [muted, setMuted] = useState(false);
  const [view, setView] = useState({ w: 1280, h: 720, touch: false });

  useEffect(() => {
    const stage = new FantasyBattleStage(mountRef.current, { onHud: setHud });
    stageRef.current = stage;
    window.__fantasyBattle = stage;
    stage.init().then(() => { if (!stage.disposed) setHud(stage.hudState()); }).catch((e) => { console.error('[fantasy-battle]', e); setError(String(e?.message || e)); });
    return () => {
      stage.dispose();
      if (window.__fantasyBattle === stage) delete window.__fantasyBattle;
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') { setStudio(false); return; }
      if (stageRef.current?.handleKey(e.key)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const measure = () => setView({ w: window.innerWidth, h: window.innerHeight, touch: window.matchMedia?.('(pointer: coarse)').matches ?? false });
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const stage = stageRef.current;
  const toggleMute = () => { const next = !muted; setMuted(next); stage?.setMuted(next); };
  const portrait = showLandscapeSuggestion({ touch: view.touch, width: view.w, height: view.h });
  const battle = hud?.mode === 'battle';

  return (
    <div className="fb-root">
      <div className="fb-stage" ref={mountRef} />
      {!hud && !error && <div className="fb-loading">Stringing the bow...</div>}
      {error && <div className="fb-loading fb-error">Fantasy Battle could not start: {error}</div>}
      {hud && (
        <>
          <div className="fb-top">
            <UnitCard unit={hud.units[0]} side="left" />
            <div className="fb-round">
              <div className="fb-round-title">{battle ? `Round ${hud.round}` : 'Practice'}</div>
              {battle && (
                <ol className="fb-order" aria-label="Turn order">
                  {hud.order.map((o, i) => (
                    <li key={o.id} className={`${o.active ? 'active' : ''} ${o.id === 'hero' ? 'ally' : 'foe'}`}>
                      <b>{i + 1}</b>{o.name}{o.action && <em>{o.action}</em>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <UnitCard unit={hud.units[1]} side="right" />
          </div>
          <div className="fb-bottom">
            <div className="fb-log" aria-live="polite">{hud.log[hud.log.length - 1]}</div>
            <div className="fb-actions">
              {battle
                ? hud.legal.map((a) => (
                  <button key={a.id} type="button" className={`fb-action fb-action-${a.id}`} disabled={!a.enabled}
                    title={a.reason && hud.phase === 'choose' ? a.reason : a.action.summary}
                    onClick={() => { if (view.touch) requestLandscapeOnGesture(); stage?.chooseAction(a.id); }}>
                    <kbd>{a.action.hotkey}</kbd>
                    <span className="fb-action-name">{a.action.name}</span>
                    <span className="fb-action-note">{a.reason && hud.phase === 'choose' ? a.reason : a.action.summary}</span>
                  </button>
                ))
                : ['quickShot', 'chargedShot', 'volley', 'guard'].map((id, i) => (
                  <button key={id} type="button" className={`fb-action fb-action-${id}`} onClick={() => stage?.practice(id)}>
                    <kbd>{i + 1}</kbd>
                    <span className="fb-action-name">{hud.skills.find((s) => s.id === id)?.name ?? id}</span>
                    <span className="fb-action-note">Play now</span>
                  </button>
                ))}
            </div>
          </div>
          <div className="fb-corner">
            <button type="button" onClick={toggleMute} aria-pressed={muted} title="Sound">{muted ? 'Sound off' : 'Sound on'}</button>
            <button type="button" onClick={() => setStudio((s) => !s)} aria-expanded={studio}>Studio</button>
          </div>
          {hud.phase === 'over' && (
            <div className="fb-result" role="dialog" aria-label="Battle result">
              <h2>{hud.winner === 'player' ? 'Victory' : 'Defeat'}</h2>
              <p>{hud.winner === 'player' ? 'The shade archer falls.' : 'The shade archer stands over you.'}</p>
              <button type="button" onClick={() => stage?.restart()}>Fight again</button>
            </div>
          )}
          {studio && stage && <StudioPanel stage={stage} hud={hud} onClose={() => setStudio(false)} />}
        </>
      )}
      {portrait && <div className="fb-rotate">Turn your phone sideways to play Fantasy Battle.</div>}
    </div>
  );
}
