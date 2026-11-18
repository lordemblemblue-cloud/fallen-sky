import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowUpRight, Gamepad2, LogOut, Monitor, Play, RotateCcw, Volume2, X } from 'lucide-react';
import { DEFAULT_SETTINGS, QUALITY_PRESETS, saveSettings } from './settings.js';
import Game2BindingEditor from './Game2BindingEditor';
import './game2-pause-cinematic.css';

// A quiet directional veil leaves the actual 3D world visible. Menu actions and
// saved controls stay wired to Game 2's existing runtime and settings store.
export default function Game2PauseMenu({ value, onChange, onResume, onExit, online = false }) {
  const [view, setView] = useState('menu');
  const resumeRef = useRef(null);
  const save = next => onChange(saveSettings(next));
  const set = (key, next) => save({ ...value, [key]: next });
  const back = () => setView('menu');

  useEffect(() => { if (view === 'menu') resumeRef.current?.focus(); }, [view]);

  // The game lives below the platform header in some layouts. Without a
  // document scroll lock, wheel input moves the 3D world behind the pause veil.
  // Keep the existing scrollbar gutter so opening Pause does not nudge the HUD.
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const previous = {
      htmlOverflow: root.style.overflow,
      bodyOverflow: body.style.overflow,
      scrollbarGutter: root.style.scrollbarGutter,
    };
    root.style.scrollbarGutter = 'stable';
    root.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous.htmlOverflow;
      body.style.overflow = previous.bodyOverflow;
      root.style.scrollbarGutter = previous.scrollbarGutter;
    };
  }, []);

  const slider = (name, key, min, max, step, format = v => v) => (
    <label className="axe2-pause__slider" key={key}>
      <span className="axe2-pause__field-heading"><span>{name}</span><output>{format(value[key])}</output></span>
      <input type="range" min={min} max={max} step={step} value={value[key]}
        onChange={event => set(key, Number(event.target.value))} />
    </label>
  );
  const toggle = (name, key) => (
    <button type="button" key={key} className="axe2-pause__toggle"
      aria-pressed={Boolean(value[key])} onClick={() => set(key, !value[key])}>
      <span>{name}</span><span className={value[key] ? 'axe2-pause__toggle-value is-on' : 'axe2-pause__toggle-value'}>
        {value[key] ? 'On' : 'Off'}</span>
    </button>
  );
  const nav = (label, Icon, action, primary = false) => (
    <button type="button" key={label} onClick={action} ref={primary ? resumeRef : undefined}
      data-game2-pause-action={label.toLowerCase()}
      className={'axe2-pause__choice' + (primary ? ' is-primary' : '')}>
      <Icon size={20} strokeWidth={1.6} aria-hidden="true" />
      <span className="axe2-pause__choice-name">{label}</span>
      {primary ? <kbd className="axe2-pause__key">ESC</kbd> :
        <ArrowUpRight size={15} className="axe2-pause__choice-arrow" aria-hidden="true" />}
    </button>
  );
  const title = view === 'menu' ? 'Paused' : view === 'keys' ? 'Controls' : view === 'audio' ? 'Audio' : 'Graphics';
  const subtitle = view === 'menu' ? 'Your journey continues when you are ready.'
    : view === 'keys' ? 'Make every movement your own.'
    : view === 'audio' ? 'Find your perfect atmosphere.'
    : 'Shape the world to your system.';

  // Portal outside the game canvas/overflow-hidden host: the veil must cover
  // the whole browser viewport, not just the measured WebGL scene rectangle.
  return createPortal((
    <div data-game2-interface="pause" data-testid="game2-pause-menu"
      data-game2-pause-design="cinematic" className="axe2-pause">
      <div className="axe2-pause__ambient" aria-hidden="true" />
      <section role="dialog" aria-modal="true" aria-label="Game 2 pause and settings" className="axe2-pause__content">
        <div className="axe2-pause__identity">
          <span className="axe2-pause__sigil" aria-hidden="true">✧</span>
          <span>ATOM X EVE</span><span className="axe2-pause__identity-separator" aria-hidden="true" /><span>GAME 02</span>
        </div>
        <header className="axe2-pause__heading">
          <div className="axe2-pause__heading-top">
            {view !== 'menu' && <button type="button" className="axe2-pause__back" onClick={back}
              aria-label="Back to pause menu"><ArrowLeft size={18} aria-hidden="true" /> Back</button>}
            <button type="button" aria-label="Resume Game 2" onClick={onResume} title="Resume game"
              className="axe2-pause__close"><X size={20} aria-hidden="true" /></button>
          </div>
          <h2>{title}</h2><span className="axe2-pause__heading-rule" aria-hidden="true" /><p>{subtitle}</p>
        </header>
        {online && <p role="status" className="axe2-pause__online-note">
          Online play does not pause while this menu is open.
        </p>}
        {view === 'menu' && <nav className="axe2-pause__choices" aria-label="Pause menu">
          {nav('Resume', Play, onResume, true)}
          {nav('Controls', Gamepad2, () => setView('keys'))}
          {nav('Graphics', Monitor, () => setView('graphics'))}
          {nav('Audio', Volume2, () => setView('audio'))}
          <span className="axe2-pause__choice-break" aria-hidden="true" />
          <button type="button" onClick={onExit} data-game2-pause-action="exit"
            className="axe2-pause__choice is-exit">
            <LogOut size={20} strokeWidth={1.6} aria-hidden="true" />
            <span className="axe2-pause__choice-name">Return to {online ? 'lobby' : 'main menu'}</span>
            <ArrowUpRight size={15} className="axe2-pause__choice-arrow" aria-hidden="true" />
          </button>
        </nav>}
        {view === 'keys' && <div className="axe2-pause__settings axe2-pause__bindings">
          <Game2BindingEditor bindings={value.bindings}
            onChange={bindings => save({ ...value, bindings })} />
        </div>}
        {view === 'graphics' && <div className="axe2-pause__settings">
          <fieldset className="axe2-pause__fieldgroup"><legend>Render quality</legend>
            <div className="axe2-pause__presets">{QUALITY_PRESETS.map(({id:q,label}) =>
              <button type="button" key={q} aria-pressed={value.quality === q}
                className="axe2-pause__preset" onClick={() => set('quality', q)}>{label}</button>)}</div>
          </fieldset>
          {slider('Field of view', 'fov', 50, 90, 1, v => v + '°')}
          {slider('Mouse sensitivity', 'sensitivity', 0.25, 3, 0.05, v => v.toFixed(2) + 'x')}
          <label className="axe2-pause__select-field"><span>Training time of day</span>
            <select value={value.timeOfDay} onChange={event => set('timeOfDay', event.target.value)}>
              <option value="morning">Morning</option><option value="day">Day</option>
              <option value="sunset">Sunset</option><option value="night">Night</option>
            </select>
          </label>
          {slider('Training air temperature', 'temperatureC', -15, 35, 1, v => v + '°C')}
          <p className="axe2-pause__hint">Breath becomes visible in cold conditions. 4K is an output resolution target.</p>
          {toggle('Invert vertical mouse look', 'invertY')}
          {toggle('Show FPS', 'showFps')}
          <button type="button" onClick={() => save({ ...DEFAULT_SETTINGS })}
            className="axe2-pause__restore"><RotateCcw size={15} aria-hidden="true" /> Restore defaults</button>
        </div>}
        {view === 'audio' && <div className="axe2-pause__settings axe2-pause__audio">
          {slider('Effects volume', 'masterVolume', 0, 1, 0.05, v => Math.round(v * 100) + '%')}
          {slider('Music volume', 'musicVolume', 0, 1, 0.05, v => Math.round(v * 100) + '%')}
          <p className="axe2-pause__hint">Volume changes are saved in this browser.</p>
        </div>}
        <footer className="axe2-pause__footer">
          <span><kbd>ESC</kbd> {view === 'menu' ? 'Resume game' : 'Close menu'}</span>
          <span>Settings saved automatically</span>
        </footer>
      </section>
      <div className="axe2-pause__world-mark" aria-hidden="true">
        <span className="axe2-pause__world-mark-line" />
        <span>THE JOURNEY CONTINUES</span>
        <span className="axe2-pause__world-mark-line" />
      </div>
    </div>
  ), document.body);
}
