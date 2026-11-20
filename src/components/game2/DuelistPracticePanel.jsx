// Compact, two-step Practice setup: choose an intention, then choose a map.
// The selected map is sent to the existing real training/tutorial engine.
import { useState } from 'react';
import { ArrowLeft, BookOpen, ChevronRight, Infinity as InfinityIcon, Swords } from 'lucide-react';
import { GAME2_SKIRMISH_MAPS } from './engine/arenaMaps.js';

const PRACTICE_TYPES = Object.freeze([
  { id: 'one', title: 'One on One', icon: Swords,
    detail: 'Fight one AI opponent. Work on timing, defense and combos in a real duel.' },
  { id: 'infinite', title: 'Infinite Practice', icon: InfinityIcon,
    detail: 'One opponent, no win limit. Keep training at your own pace.' },
  { id: 'basics', title: 'Learn the Basics', icon: BookOpen,
    detail: 'Follow a guided instructor lesson to learn movement, attacks and abilities.' },
]);

export default function DuelistPracticePanel({ onStart }) {
  const [selected, setSelected] = useState(null);
  const [mapId, setMapId] = useState('training');
  const plan = PRACTICE_TYPES.find(type => type.id === selected);
  return (
    <section className="g2-duelist-detail g2-duelist-practice" aria-label="Practice setup">
      <div className="g2-duelist-detail__kicker">Practice</div>
      <h2>{plan ? 'Choose a Map' : 'Practice'}</h2>
      {!plan ? (
        <>
          <p className="g2-duelist-detail__intro">What would you like to work on?</p>
          <div className="g2-duelist-practice__choices">
            {PRACTICE_TYPES.map((type) => {
              const Icon = type.icon;
              return <button type="button" key={type.id} onClick={() => setSelected(type.id)}>
                <Icon size={22} aria-hidden="true" />
                <span><strong>{type.title}</strong><small>{type.detail}</small></span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>;
            })}
          </div>
        </>
      ) : (
        <>
          <button type="button" className="g2-duelist-practice__back" onClick={() => setSelected(null)}>
            <ArrowLeft size={15} aria-hidden="true" /> Practice options
          </button>
          <p className="g2-duelist-detail__intro">{plan.detail}</p>
          <div className="g2-duelist-practice__maps" role="group" aria-label="Choose practice map">
            {Object.values(GAME2_SKIRMISH_MAPS).map(map => (
              <button key={map.id} type="button" aria-pressed={mapId === map.id} onClick={() => setMapId(map.id)}>
                <strong>{map.label}</strong><small>{map.size}</small>
              </button>
            ))}
          </div>
          <button type="button" className="g2-duelist-action g2-duelist-action--primary" onClick={() => onStart({ type: plan.id, mapId })}>
            Start {plan.title} <ChevronRight size={16} aria-hidden="true" />
          </button>
        </>
      )}
    </section>
  );
}
