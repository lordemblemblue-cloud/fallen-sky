import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Play, Users, X, ArrowRight, ChevronDown } from 'lucide-react';
import { STORY_MISSIONS } from './missions.js';
import { STORY_SUPPLIES } from '../sim/storySupplies.mjs';
import { BODIES } from '../client/assets.mjs';
import './duelistSapphire.css';

const SCENE_IMAGE = 'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/b88662edc_duelist_story_scene_clean.jpg';

export default function DuelistStoryMenu({ lobby, prefs, close }) {
  const navigate = useNavigate();
  const [missionIndex, setMissionIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const mission = STORY_MISSIONS[missionIndex] || STORY_MISSIONS[0];
  const online = Boolean(lobby?.online);
  const code = typed.toUpperCase().replace(/[^A-HJ-NP-Z]/g, '').slice(0, 5);
  const openCrews = (lobby?.matches || []).filter(item =>
    item.mode === 'story' && item.mission === mission.id && item.open);
  const launch = options => navigate({
    to: '/duelist-next/play',
    search: { mode: 'story', mission: mission.id, ...options },
  });

  return (
    <section className="ds-campaign" id="duelist-story-panel" aria-label="Duelist Adventure story campaign">
      <header className="ds-campaign-head">
        <h2>Story Campaign</h2>
        <button type="button" className="ds-control" onClick={close} aria-label="Close story menu"><X size={20}/></button>
      </header>
      <div className="ds-campaign-grid">
        <nav className="ds-missions ds-rail" aria-label="Operations">
          <h3>Operations</h3>
          {STORY_MISSIONS.map((item, index) => (
            <button type="button" key={item.id} className="ds-mission" aria-pressed={index === missionIndex}
              onClick={() => { setMissionIndex(index); setTyped(''); }}>
              <span>{String(item.number).padStart(2, '0')}</span><strong>{item.title}</strong>
            </button>
          ))}
        </nav>
        <section className="ds-brief ds-rail" aria-label="Mission briefing">
          <div className="ds-scene">
            <img src={SCENE_IMAGE} alt="" decoding="async"/>
            <div><small>OPERATION {String(mission.number).padStart(2, '0')}</small>
              <h3>{mission.title}</h3><p>{mission.tagline}</p></div>
          </div>
          <p className="ds-brief-line">{mission.line}</p>
          <h3>Objectives</h3>
          <ol className="ds-objectives">
            {mission.parts.map(([title, description], index) => <li key={title}>
              <span className="ds-stage-number">{String(index + 1).padStart(2, '0')}</span>
              <div><strong>{title}</strong><p>{description}</p></div>
            </li>)}
          </ol>
          <details className="ds-disclosure"><summary>Mission controls <ChevronDown size={15}/></summary>
            <p>Move, guard and roll to avoid attacks. Hold <strong>F</strong> to interact with marked crates, consoles, cores and bells. Coordinate objectives with your crew.</p>
          </details>
        </section>
        <aside className="ds-deploy" aria-label="Deployment and supplies">
          <h3>Deploy</h3>
          <p className="ds-meta">{mission.parts.length} stages · 1–4 fighters</p>
          <p className="ds-meta">Fighter: {BODIES[prefs?.fighter]?.name || 'Duelist'}</p>
          <button type="button" className="ds-control ds-primary" onClick={() => launch({ online: 0 })}><Play size={17}/> Play solo</button>
          <h3 className="ds-section-heading">Crew</h3>
          <p role="status" className="ds-meta">{online ? openCrews.length + ' open crews' : 'Match server offline · Solo available'}</p>
          <button type="button" className="ds-control" disabled={!online} onClick={() => launch({ online: 1, room: 'new' })}><Users size={17}/> Create private crew</button>
          <button type="button" className="ds-control" disabled={!online} onClick={() => launch({ online: 1, room: 'open' })}>Host open crew</button>
          <button type="button" className="ds-control" disabled={!online} onClick={() => launch({ online: 1 })}>Quick join</button>
          <label className="ds-code">Room code<input value={code} maxLength={5} placeholder="ABCDE" onChange={event => setTyped(event.target.value)} autoComplete="off"/></label>
          <button type="button" className="ds-control" disabled={!online || code.length !== 5} onClick={() => launch({ online: 1, room: code })}>Join private crew <ArrowRight size={16}/></button>
          {online && openCrews.length > 0 && <div className="ds-open-crews" aria-label="Open crews">
            {openCrews.map(item => <button type="button" className="ds-control" key={item.id} onClick={() => launch({ online: 1, room: item.id })}>
              {item.name || mission.title} · {item.players}/{item.seats}<ArrowRight size={15}/>
            </button>)}
          </div>}
          <details className="ds-disclosure ds-section-heading"><summary>Field supplies <ChevronDown size={15}/></summary>
            <p>One free supply per fighter per operation. Use Tab or Story Supplies in-game after taking damage.</p>
            {STORY_SUPPLIES.map(item => <div className="ds-supply-row" key={item.id}><strong>{item.name}</strong><p>{item.description}</p></div>)}
          </details>
        </aside>
      </div>
    </section>
  );
}
