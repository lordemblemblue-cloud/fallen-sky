import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Shield, Sparkles } from 'lucide-react';
import {GAME2_CHARACTERS,game2Character} from './characters/game2Characters.js';
import Game2CharacterPortrait from './characters/Game2CharacterPortrait';
import './Game2Menus.css';

export function readLoadout() {
  try {
    const kit = localStorage.getItem('atomxe.game2.saber');
    return {
      saber: ['single', 'dual', 'staff'].includes(kit) ? kit : 'single',
      side: localStorage.getItem('atomxe.game2.side') === 'dark' ? 'dark' : 'light',
    };
  } catch {
    return { saber: 'single', side: 'light' };
  }
}

const KIT_OPTIONS = [
  { id: 'single', title: 'Single Blade', text: 'One blade. Every stance.' },
  { id: 'dual', title: 'Dual Sabers', text: 'A blade in each hand.' },
  { id: 'staff', title: 'Saberstaff', text: 'Two ends. One weapon.' },
];

export default function Game2Loadout({
  name, serverName, mapName, teamMode, onPreview, onDeploy, onBack,
  selectedCharacterId='explorer', onCharacterChange, explorerPortrait=null,
}) {
  const [selection, setSelection] = useState(readLoadout);
  const [callsign, setCallsign] = useState(() => String(name || 'Jedi').trim().slice(0, 20));
  const formRef = useRef(null);
  const rosterRef = useRef(null);
  const offlineDesktop = typeof window !== 'undefined' && window.atomXEGame2?.mode === 'offline';
  // The original Explorer is the first real card, immediately before Revan.
  // Hosted GLBs remain unavailable in the offline desktop build.
  const uploadedCharacters=GAME2_CHARACTERS.filter(model=>!!model.url && !offlineDesktop);
  const rosterCharacters=[GAME2_CHARACTERS[0],...uploadedCharacters];
  const activeCharacter=game2Character(selectedCharacterId);
  const moveCarousel=direction=>{
    const viewport=rosterRef.current;
    if(!viewport)return;
    const card=viewport.querySelector('.g2-deploy-character-card');
    const step=(card?.getBoundingClientRect().width||112)+10;
    viewport.scrollBy({left:direction*step*2,behavior:'smooth'});
  };
  useEffect(()=>{
    const button=rosterRef.current?.querySelector('[aria-pressed="true"]');
    button?.scrollIntoView?.({block:'nearest',inline:'nearest',behavior:'smooth'});
  },[selectedCharacterId]);

  useEffect(() => { formRef.current?.querySelector('input')?.focus(); }, []);
  // Populate the signed-in player's chosen name, but never overwrite a name
  // they have already edited in the deployment screen.
  useEffect(() => {
    if (name) setCallsign(previous => previous === 'Jedi'
      ? String(name).trim().slice(0, 20) : previous);
  }, [name]);
  useEffect(() => { onPreview?.(selection); }, [selection, onPreview]);

  const setSide = side => setSelection(previous => ({ ...previous, side }));
  const setSaber = saber => setSelection(previous => ({ ...previous, saber }));
  const deploy = event => {
    event.preventDefault();
    const playerName = callsign.trim();
    if (!playerName) return;
    try {
      localStorage.setItem('atomxe.game2.saber', selection.saber);
      localStorage.setItem('atomxe.game2.side', selection.side);
      localStorage.setItem('atomxe.game2.callsign', playerName);
    } catch { /* private browsing */ }
    // Character choice is already saved/account-scoped via onCharacterChange.
    // Keep the existing match admission payload limited to the old loadout
    // contract; online join does not need a new client-authoritative avatarId.
    onDeploy({ ...selection, name: playerName });
  };
  const trap = event => {
    if (event.key !== 'Tab') return;
    const controls = [...formRef.current.querySelectorAll('input,button:not(:disabled)')];
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div data-game2-interface className="g2-shell g2-overlay g2-loadout">
      <form ref={formRef} className="g2-deploy-layout" onSubmit={deploy}
        onKeyDown={trap} role="dialog" aria-modal="true" aria-labelledby="g2-loadout-title">
        <aside className="g2-deploy-portrait" aria-label="Live character preview and player name">
          <label className="g2-deploy-name" htmlFor="g2-deploy-player-name">
            <Shield size={26} aria-hidden="true" />
            <span className="g2-deploy-name__rule" aria-hidden="true" />
            <span className="g2-deploy-name__entry">
              <span className="g2-deploy-name__label">Player name</span>
              <input id="g2-deploy-player-name" type="text" autoComplete="nickname"
                value={callsign} maxLength={20} required placeholder="Enter player name"
                onChange={event => setCallsign(event.target.value)} />
            </span>
            <span className="g2-deploy-name__rule" aria-hidden="true" />
          </label>
          <div className="g2-deploy-portrait__glow" aria-hidden="true" />
          {/* An invisible viewport over the same live arena scene: no second WebGL context. */}
          <div className="g2-deploy-live-preview" role="img"
            aria-label={`Live 3D preview of ${activeCharacter.name}`} />
        </aside>

        <section className="g2-dialog g2-deploy-panel">
          <button type="button" className="g2-back g2-deploy-back" onClick={onBack}>
            <ArrowLeft size={14} aria-hidden="true" /> Leave arena
          </button>
          <header className="g2-deploy-heading">
            <div className="g2-eyebrow">
              {serverName || 'Private training'} / {mapName || 'Arena'}
            </div>
            <h1 id="g2-loadout-title">Prepare to Deploy</h1>
            <p className="g2-muted">Configure your fighter and blade, then enter the arena.</p>
          </header>

          <fieldset className="g2-deploy-section">
            <legend><Shield size={16} aria-hidden="true" /> Alignment</legend>
            <div className="g2-deploy-choice-grid g2-deploy-choice-grid--two">
              {['light', 'dark'].map(side => (
                <button key={side} type="button"
                  className="g2-deploy-choice g2-deploy-choice--alignment"
                  aria-pressed={selection.side === side}
                  onClick={() => setSide(side)}>
                  <span className="g2-deploy-choice__symbol" aria-hidden="true">
                    {side === 'light' ? <Shield size={27} /> : <Sparkles size={27} />}
                  </span>
                  <span className="g2-deploy-choice__copy">
                    <strong>{side === 'light' ? 'Jedi' : 'Dark Jedi'}</strong>
                    <small>{side === 'light' ? 'Blue blade · Light robes' : 'Red blade · Dark robes'}</small>
                    {teamMode && <small>{side === 'light' ? 'Jedi team' : 'Dark Jedi team'}</small>}
                  </span>
                  <span className="g2-deploy-choice__check" aria-hidden="true">
                    {selection.side === side && <Check size={14} strokeWidth={3} />}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="g2-deploy-section g2-deploy-character-section">
            <legend><span aria-hidden="true">✧</span> Select character</legend>
            <div className="g2-deploy-character-heading">
              <span>Selected: <strong data-testid="game2-deploy-selected-name">{activeCharacter.name}</strong></span>
              <span>{offlineDesktop?'Offline · Explorer available':'Five characters · Scroll left / right'}</span>
            </div>
            <div className="g2-deploy-character-carousel" role="group" aria-label="Choose your Game 2 character">
              <button type="button" className="g2-deploy-carousel-arrow" aria-label="Previous characters"
                onClick={()=>moveCarousel(-1)} disabled={rosterCharacters.length<=1}>
                <ChevronLeft size={18} aria-hidden="true"/>
              </button>
              <div className="g2-deploy-character-viewport" ref={rosterRef}
                role="group" aria-label="Available characters">
                <div className="g2-deploy-character-track">
                  {rosterCharacters.map(model=>(
                    <button key={model.id} type="button"
                      data-testid={`game2-deploy-character-${model.id}`}
                      className="g2-deploy-character-card"
                      aria-label={`Select ${model.name}`}
                      aria-pressed={activeCharacter.id===model.id}
                      onClick={()=>onCharacterChange?.(model.id)}>
                      <span className="g2-deploy-character-card__name">{model.name}</span>
                      <span className="g2-deploy-character-card__frame">
                        <Game2CharacterPortrait character={model} nativeImage={explorerPortrait}/>
                        <span className="g2-deploy-character-card__check" aria-hidden="true">
                          {activeCharacter.id===model.id&&<Check size={12} strokeWidth={3}/>}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
                {offlineDesktop&&<p className="g2-deploy-character-offline">Hosted characters require an internet connection.</p>}
              </div>
              <button type="button" className="g2-deploy-carousel-arrow" aria-label="Next characters"
                onClick={()=>moveCarousel(1)} disabled={rosterCharacters.length<=1}>
                <ChevronRight size={18} aria-hidden="true"/>
              </button>
            </div>

          </fieldset>

          <fieldset className="g2-deploy-section">
            <legend><span aria-hidden="true">✧</span> Lightsaber</legend>
            <div className="g2-deploy-choice-grid g2-deploy-choice-grid--three">
              {KIT_OPTIONS.map(kit => (
                <button key={kit.id} type="button" className="g2-deploy-choice g2-deploy-choice--saber"
                  aria-pressed={selection.saber === kit.id} onClick={() => setSaber(kit.id)}>
                  <span className="g2-deploy-choice__check" aria-hidden="true">
                    {selection.saber === kit.id && <Check size={14} strokeWidth={3} />}
                  </span>
                  <span className={'g2-blade ' + kit.id} aria-hidden="true">
                    <i />{kit.id === 'dual' && <i />}
                  </span>
                  <strong>{kit.title}</strong>
                  <small>{kit.text}</small>
                </button>
              ))}
            </div>
          </fieldset>
          <footer className="g2-deploy-footer">
            <p className="g2-muted">Single-blade stance can be changed in combat with Tab.</p>
            <button type="submit" className="g2-deploy-enter" disabled={!callsign.trim()}
              aria-label="Enter match">
              Enter Match <ArrowRight size={23} aria-hidden="true" />
            </button>
          </footer>
        </section>
      </form>
    </div>
  );
}
