/** Duelist Adventure story screen rebuilt from DOM, not by writing over a UI screenshot.
 * The only reference-derived media is a cropped, text-free landscape of the citadel.
 * Layout, borders, buttons, mission information and the timeline each render once.
 */
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  BookOpen, GitBranch, Swords, Star, Film, Play, Users, List,
  ChevronLeft, ChevronRight, X, LockKeyhole, Flag, Shield, Check,
  ArrowRight, Compass
} from 'lucide-react';
import { STORY_MISSIONS } from './missions.js';
import { BODIES } from '../client/assets.mjs';
import './DuelistStoryMenu.css';

const SCENE_IMAGE = 'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/b88662edc_duelist_story_scene_clean.jpg';

const MENU_TABS = [
  { id: 'operations', title: 'Operations', Icon: BookOpen },
  { id: 'objectives', title: 'Objectives', Icon: GitBranch },
  { id: 'crew', title: 'Crew', Icon: Swords },
  { id: 'briefing', title: 'Briefing', Icon: Star },
  { id: 'controls', title: 'Controls', Icon: Film },
];

function AccentButton({ icon: Icon, onClick, disabled = false, children, primary = false, title }) {
  return (
    <button type="button" className={'dsm-button' + (primary ? ' dsm-button--primary' : '')}
      onClick={onClick} disabled={disabled} title={title}>
      {Icon && <Icon aria-hidden="true" size={20} />}
      <span>{children}</span>
    </button>
  );
}

/** Mission data and routes are the existing live Duelist game APIs, not visual placeholders. */
export default function DuelistStoryMenu({ lobby, prefs, close }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState('operations');
  const [missionIndex, setMissionIndex] = useState(0);
  const [objectiveIndex, setObjectiveIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const mission = STORY_MISSIONS[missionIndex] || STORY_MISSIONS[0];
  const currentObjective = mission.parts[objectiveIndex] || mission.parts[0];
  const online = Boolean(lobby?.online);
  const code = typed.toUpperCase().replace(/[^A-HJ-NP-Z]/g, '').slice(0, 5);
  const openCrews = (lobby?.matches || []).filter(item =>
    item.mode === 'story' && item.mission === mission.id && item.open);

  const changeMission = (delta) => {
    setMissionIndex(current => (current + delta + STORY_MISSIONS.length) % STORY_MISSIONS.length);
    setObjectiveIndex(0);
    setTab('operations');
  };
  const launch = options => navigate({
    to: '/duelist-next/play',
    search: { mode: 'story', mission: mission.id, ...options },
  });

  return (
    <section className="dsm-story" id="duelist-story-panel" aria-label="Duelist Adventure story campaign">
      <div className="dsm-frame">
        <button type="button" className="dsm-close" onClick={close} aria-label="Close story menu">
          <X size={19} aria-hidden="true" />
        </button>

        <div className="dsm-layout">
          <nav className="dsm-tabs" aria-label="Story menu categories">
            {MENU_TABS.map(({ id, title, Icon }) => (
              <button key={id} type="button" className="dsm-tab" data-active={tab === id}
                aria-pressed={tab === id} onClick={() => setTab(id)}>
                <Icon size={29} strokeWidth={1.65} aria-hidden="true" />
                <span>{title}</span>
              </button>
            ))}
          </nav>

          <div className="dsm-middle">
            <div className="dsm-scene">
              <img src={SCENE_IMAGE} alt="Fantasy sky citadel with arches, banners and waterfalls"
                className="dsm-scene-image" />
              <div className="dsm-scene-shade" />
              <div className="dsm-scene-text">
                <span>OPERATION {String(mission.number).padStart(2, '0')} / {String(STORY_MISSIONS.length).padStart(2, '0')}</span>
                <h2>{mission.title}</h2>
                <p>{mission.tagline}</p>
              </div>
              <button type="button" className="dsm-scene-arrow dsm-scene-arrow--left"
                aria-label="Previous operation" onClick={() => changeMission(-1)}>
                <ChevronLeft size={29} aria-hidden="true" />
              </button>
              <button type="button" className="dsm-scene-arrow dsm-scene-arrow--right"
                aria-label="Next operation" onClick={() => changeMission(1)}>
                <ChevronRight size={29} aria-hidden="true" />
              </button>
            </div>

            <nav className="dsm-timeline" aria-label="Mission objective timeline">
              <button type="button" className="dsm-timeline-chevron" onClick={() => changeMission(-1)}
                aria-label="Previous operation"><ChevronLeft size={26} /></button>
              <ol>
                {mission.parts.map(([title], index) => (
                  <li key={title}>
                    <button type="button" className="dsm-timeline-step"
                      data-active={objectiveIndex === index} aria-pressed={objectiveIndex === index}
                      title={title} onClick={() => { setObjectiveIndex(index); setTab('objectives'); }}>
                      <span className="dsm-timeline-diamond"><span>{index + 1}</span></span>
                      <span className="dsm-timeline-label">{title}</span>
                    </button>
                  </li>
                ))}
              </ol>
              <button type="button" className="dsm-timeline-chevron" onClick={() => changeMission(1)}
                aria-label="Next operation"><ChevronRight size={26} /></button>
            </nav>

            <div className="dsm-actions" aria-label="Story actions">
              <AccentButton icon={List} onClick={() => setTab('operations')}>MISSIONS</AccentButton>
              <AccentButton icon={Play} primary onClick={() => launch({ online: 0 })}>PLAY SOLO</AccentButton>
              <AccentButton icon={Users} disabled={!online}
                title={online ? 'Create an online story crew' : 'Connect to a match server to create a crew'}
                onClick={() => launch({ online: 1, room: 'new' })}>CREATE CREW</AccentButton>
            </div>
          </div>

          <aside className="dsm-detail" aria-label="Mission briefing and objectives">
            <header className="dsm-detail-heading">
              <BookOpen size={25} aria-hidden="true" />
              <div>
                <small>STORY CAMPAIGN</small>
                <strong>{mission.title}</strong>
              </div>
            </header>
            <div className="dsm-detail-scroll">
              {tab === 'operations' && (
                <>
                  <h3>Objectives</h3>
                  <p className="dsm-intro">{mission.line}</p>
                  <ol className="dsm-objectives">
                    {mission.parts.map(([title, description], index) => (
                      <li key={title}>
                        <button type="button" onClick={() => { setObjectiveIndex(index); setTab('objectives'); }}>
                          <span className="dsm-objective-marker" aria-hidden="true" />
                          <span><strong>{title}</strong><small>{description}</small></span>
                          <ArrowRight size={16} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ol>
                </>
              )}
              {tab === 'objectives' && (
                <>
                  <span className="dsm-detail-eyebrow">OBJECTIVE {objectiveIndex + 1} / {mission.parts.length}</span>
                  <h3>{currentObjective[0]}</h3>
                  <p>{currentObjective[1]}</p>
                  <p className="dsm-intro">Select any stage in the timeline to read its instructions. Objectives are completed during the mission, not on this menu.</p>
                  <div className="dsm-objective-nav">
                    {mission.parts.map(([title], index) => (
                      <button key={title} type="button" aria-label={`Preview ${title}`} aria-pressed={index === objectiveIndex}
                        data-active={index === objectiveIndex} onClick={() => setObjectiveIndex(index)}>{index + 1}</button>
                    ))}
                  </div>
                </>
              )}
              {tab === 'crew' && (
                <>
                  <h3>Play with a crew</h3>
                  <p>Join your friends with a room code or create an online operation for up to four fighters.</p>
                  <label className="dsm-crew-code">ROOM CODE
                    <input type="text" value={code} maxLength={5} placeholder="ENTER CODE"
                      aria-label="Five character room code" onChange={event => setTyped(event.target.value)} />
                  </label>
                  <AccentButton icon={Users} disabled={!online || code.length !== 5}
                    onClick={() => launch({ online: 1, room: code })}>JOIN CREW</AccentButton>
                  <p className="dsm-intro">{online ? `${openCrews.length} open crews for this operation.` : 'The match server is offline. Solo play is available.'}</p>
                </>
              )}
              {tab === 'briefing' && (
                <>
                  <span className="dsm-detail-eyebrow">OPERATION {mission.number}</span>
                  <h3>{mission.tagline}</h3>
                  <p>{mission.line}</p>
                  <p>Complete four objectives in order, alone or with a crew of up to four fighters.</p>
                  <p className="dsm-intro">Active fighter: {BODIES[prefs?.fighter]?.name || 'Duelist'}</p>
                  <div className="dsm-brief-choices">
                    {STORY_MISSIONS.map((item, index) => (
                      <button key={item.id} type="button" aria-pressed={index === missionIndex}
                        data-active={index === missionIndex}
                        onClick={() => { setMissionIndex(index); setObjectiveIndex(0); }}>
                        {String(item.number).padStart(2, '0')} · {item.title}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {tab === 'controls' && (
                <>
                  <h3>Mission controls</h3>
                  <p>Move, guard or roll to avoid incoming attacks. Complete mission objectives by interacting with their marked objects.</p>
                  <p>Hold <strong>F</strong> to interact with crates, consoles, cores and bells.</p>
                  <p>Team members can coordinate objectives during supported online missions.</p>
                </>
              )}
            </div>
            <div className="dsm-detail-foot">
              <p role="status">{online ? `${openCrews.length} open crew(s)` : 'Offline / solo mission available'}</p>
              <div className="dsm-detail-facts" aria-label="Mission facts">
                <div><Compass size={23} /><span>{mission.parts.length} stages</span></div>
                <div><Users size={23} /><span>1–4 fighters</span></div>
                <div><Shield size={23} /><span>{online ? 'Online' : 'Solo'}</span></div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
