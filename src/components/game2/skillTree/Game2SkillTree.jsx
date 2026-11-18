import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import referenceArt from './skill-tree-reference.png';
import { ART_SIZE, buildSkillTree, readCompletedTraining, SABER_STANCES, SKILL_PATHS } from './catalog.js';
import './Game2SkillTree.css';

// The approved image is the UI's artwork, not an approximate reconstruction.
// Only live information, hit targets and state lighting sit above that image.
export default function Game2SkillTree({ game, onClose, online = false }) {
  const host = useRef(null), stage = useRef(null);
  const [scale, setScale] = useState(1);
  const [path, setPath] = useState('lightsaber');
  const [kit, setKit] = useState(game?.player?.saberKit || 'staff');
  const [selectedId, setSelectedId] = useState('orbital');
  const [, refresh] = useState(0);
  const [artFailed, setArtFailed] = useState(false);
  const nodes = buildSkillTree(game, path, kit, game?.tutorial?.completed || readCompletedTraining());
  const selected = nodes.find(n => n.id === selectedId) || nodes[0];
  const learnedCount = new Set(nodes.filter(n => n.learned).map(n => n.lessonId)).size;
  const canPractice = selected.available && !!game?.tutorial?.lessons().some(l => l.id === selected.lessonId);
  const canSelect = selected.available && !!selected.powerId;

  useLayoutEffect(() => {
    const resize = () => {
      const rect = host.current?.getBoundingClientRect();
      if (rect) setScale(Math.min(rect.width / ART_SIZE.width, rect.height / ART_SIZE.height));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const previousFocus = document.activeElement;
    stage.current?.querySelector('[data-selected="true"]')?.focus({ preventScroll: true });
    const update = () => refresh(t => t + 1);
    const timer = setInterval(update, 500); // online kit/state can change while open
    window.addEventListener('storage', update);
    return () => {
      clearInterval(timer); window.removeEventListener('storage', update);
      if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
    };
  }, []);
  const choose = id => { setSelectedId(id); };
  const activate = () => {
    if (canPractice) {
      game.tutorial.select(selected.lessonId);
      game.tutorial.practice();
      onClose();
    } else if (canSelect) {
      game.force.selectId(selected.powerId);
      onClose();
    }
  };
  const onKeyDown = event => {
    if (event.key === 'Tab') {
      const buttons = [...stage.current.querySelectorAll('button:not(:disabled)')];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    if (event.target?.dataset?.skillNode && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const i = nodes.findIndex(n => n.id === event.target.dataset.skillNode);
      const offset = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1;
      const next = nodes[(i + offset + nodes.length) % nodes.length];
      choose(next.id);
      stage.current.querySelector(`[data-skill-node="${next.id}"]`)?.focus();
    }
  };
  return (
    <div ref={host} className="g2-skills" data-game2-interface="skill-tree" data-testid="game2-skill-tree"
      role="dialog" aria-modal="true" aria-label="Game 2 skill tree" onKeyDown={onKeyDown}>
      <div ref={stage} className="g2-skills__stage" style={{ transform: `translate(-50%, -50%) scale(${scale})`, '--skill-art': `url("${referenceArt}")` }}>
        <img className="g2-skills__art" src={referenceArt} width={1672} height={941} alt="" draggable="false" onError={() => setArtFailed(true)} />
        {artFailed && <p className="g2-skills__art-error" role="alert">Skill tree artwork could not load. Close and reopen the menu to retry.</p>}
        <nav className="g2-skills__paths" aria-label="Skill paths">
          {SKILL_PATHS.map(item => <button key={item.id} type="button" aria-pressed={path === item.id}
            onClick={() => { setPath(item.id); setSelectedId('orbital'); }}>{item.label}</button>)}
        </nav>
        <div className="g2-skills__count" aria-label={`${learnedCount} learned techniques in this path`}>
          <span>{learnedCount}</span><p>TECHNIQUES<br />LEARNED</p>
        </div>
        <div className="g2-skills__stances" role="group" aria-label="Browse lightsaber stance">
          {SABER_STANCES.map(item => <button key={item.id} type="button" aria-pressed={kit === item.id}
            onClick={() => setKit(item.id)}><span>{item.label}</span></button>)}
        </div>
        <div role="group" aria-label={`${path} skill nodes`}>
          {nodes.map(node => <button key={node.id} type="button" className="g2-skills__node"
            data-skill-node={node.id} data-selected={node.id === selected.id} data-learned={node.learned}
            aria-label={`${node.title} — ${node.learned ? 'learned' : 'unavailable'}${node.practiced ? ', training completed' : ''}`}
            aria-pressed={node.id === selected.id} aria-describedby={node.id === selected.id ? 'g2-skill-description' : undefined}
            title={node.title} onClick={() => choose(node.id)}
            style={{ left: node.x - node.r, top: node.y - node.r, width: node.r * 2, height: node.r * 2,
              backgroundPosition: `${-(node.x - node.r)}px ${-(node.y - node.r)}px` }} />)}
        </div>
        {/* Only labels change between paths; the owner's icons and connections stay untouched. */}
        {path !== 'lightsaber' && <div className="g2-skills__path-labels" aria-hidden="true">
          {[['crown', 525, 322, 184], ['deflect', 272, 493, 150], ['orbital', 808, 496, 180], ['guard', 884, 617, 200]].map(([id, x, y, w]) =>
            <span key={id} style={{ left: x, top: y, width: w }}>{nodes.find(n => n.id === id)?.title}</span>)}
        </div>}
        <section className="g2-skills__inspector" aria-labelledby="g2-skill-title">
          <p className="g2-skills__eyebrow">{path === 'lightsaber' ? SABER_STANCES.find(s => s.id === kit)?.label : path} · TECHNIQUE</p>
          <h2 id="g2-skill-title" style={{ fontSize: Math.min(38, 850 / selected.title.length) }}>{selected.title}</h2>
          <p id="g2-skill-description" className="g2-skills__description">{selected.description}</p>
          <div className="g2-skills__facts">
            <span>{selected.rank ? 'FORCE RANK' : 'TRAINING'}</span>
            <strong>{selected.rank ? `${selected.rank} / 3` : selected.practiced ? 'COMPLETED' : 'ARENA ACADEMY'}</strong>
          </div>
          <p className={`g2-skills__status ${selected.available ? '' : 'is-locked'}`} role="status">
            <span aria-hidden="true">{selected.available ? '✓' : '◇'}</span>
            {selected.available ? 'LEARNED · AVAILABLE IN YOUR KIT' : 'UNAVAILABLE IN THIS KIT'}
          </p>
          <button type="button" className="g2-skills__action" onClick={activate} disabled={!canPractice && !canSelect}>
            <span aria-hidden="true">{selected.learned ? '✓' : '◇'}</span>
            {canPractice ? 'PRACTICE TECHNIQUE' : canSelect ? 'SELECT FORCE POWER' : selected.available ? 'TECHNIQUE LEARNED' : 'TECHNIQUE LOCKED'}
          </button>
          <p className="g2-skills__note">{selected.reason || (canPractice ? 'Train in the arena to record mastery.' : 'Existing abilities · no upgrade points required.')}</p>
        </section>
        <button type="button" className="g2-skills__back" aria-label="Close skill tree" onClick={onClose}><kbd>ESC</kbd> BACK</button>
        <p className="g2-skills__footer">{online ? 'ONLINE MATCH CONTINUES' : 'SELECT A NODE · ARROW KEYS TO BROWSE'}</p>
      </div>
    </div>
  );
}
