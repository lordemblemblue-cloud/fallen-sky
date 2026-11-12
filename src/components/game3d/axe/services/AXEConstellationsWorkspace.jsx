import { useId, useState } from 'react';
import { projectEchoConstellation } from '../../livingChronicles/echoConstellation.mjs';
import './AXEConstellationsWorkspace.css';

const UNKNOWN = projectEchoConstellation(null);
const STATUS = { unknown: 'History unavailable', locked: 'Undiscovered', available: 'Ready to begin',
  active: 'In progress', turn_in: 'Return to your quest giver', completed: 'Memory illuminated' };

export default function AXEConstellationsWorkspace({ constellation = null, narrative = null }) {
  const model = constellation ?? UNKNOWN;
  const [selectedId, setSelectedId] = useState(model.stars[0].id);
  const detailId = useId();
  const selected = model.stars.find(star => star.id === selectedId) ?? model.stars[0];
  const byId = new Map(model.stars.map(star => [star.id, star]));
  const illuminated = new Set(model.illuminatedEdges.map(edge => edge.join('/')));
  const available = model.availability === 'available';
  return <section className="axe-constellations" aria-label="Constellations">
    <div className="axe-constellation-map-panel">
      <header>
        <p className="axe-constellation-kicker">Minor constellation · First Territory</p>
        <h2>{model.title}</h2>
        <p>{model.description}</p>
        {available && narrative && <p className="axe-constellation-story">{narrative.text}</p>}
        <div role="status" className="axe-constellation-progress">
          {available ? `${model.completedStars} / ${model.totalStars} memories illuminated`
            : 'Your Chronicle history is currently unavailable.'}
        </div>
      </header>
      <div className={'axe-constellation-sky' + (model.complete ? ' is-complete' : '')}
        aria-label="Spirit crystal star map">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {model.edges.map(([a,b]) => <line key={a + '/' + b}
            x1={byId.get(a).x} y1={byId.get(a).y} x2={byId.get(b).x} y2={byId.get(b).y}
            className={illuminated.has(a + '/' + b) ? 'is-lit' : ''} />)}
        </svg>
        {model.stars.map((star,index) => <button type="button" key={star.id}
          className={'axe-constellation-star is-' + star.status}
          style={{left:star.x + '%',top:star.y + '%'}}
          aria-label={`${star.title} — ${STATUS[star.status]}`}
          aria-pressed={selected.id === star.id} aria-controls={detailId}
          onClick={() => setSelectedId(star.id)}>
          <span aria-hidden="true">✦</span><small>{index + 1}</small>
        </button>)}
      </div>
      <p className="axe-constellation-legend">✦ Illuminated: completed quest · Dim: a memory still to come</p>
      {model.complete && <p className="axe-constellation-complete" role="status">
        The spirit crystal is whole. These memories remain in your Chronicle.
      </p>}
    </div>
    <aside className="axe-constellation-memory" id={detailId} aria-label="Selected constellation star">
      <p className="axe-constellation-kicker">{STATUS[selected.status]}</p>
      <h3>{selected.title}</h3>
      <p>{selected.description}</p>
      {selected.branchOf && <p>Optional path from Chapter {selected.branchOf}. Both paths can be completed.</p>}
      {selected.memory ? <dl>
        <dt>Chronicle record</dt><dd>Quest completed</dd>
        <dt>Remembered</dt><dd><time dateTime={selected.memory.completedAt}>
          {new Date(selected.memory.completedAt).toLocaleString()}
        </time></dd>
        {selected.memory.chapter && <><dt>Chapter</dt><dd>{selected.memory.chapter}</dd></>}
        <dt>Source</dt><dd>This character’s recorded quest completion</dd>
      </dl> : <p className="axe-constellation-hint">
        {selected.status === 'unknown' ? 'Reopen the Questbook when your Chronicle connection is available. Your saved progress has not been changed.'
          : selected.status === 'locked' ? 'Follow the earlier chapter to discover this memory.'
          : selected.status === 'turn_in' ? 'Your objective is finished. Complete the quest with its giver to illuminate this star.'
          : 'Complete this quest to preserve its memory in the constellation.'}
      </p>}
      <p className="axe-constellation-note">Your personal notes and shared conversations remain in the Echo Chronicle.</p>
      {available && narrative?.nextStars.length > 0 && <nav className="axe-constellation-next" aria-label="Paths ahead">
        <h4>Paths ahead</h4>
        {narrative.nextStars.map(star => <button type="button" key={star.starId}
          onClick={() => setSelectedId(star.starId)} aria-controls={detailId}>
          {star.title}<small>{STATUS[star.status]}</small>
        </button>)}
      </nav>}
    </aside>
  </section>;
}
