import { STORY_SUPPLIES } from '../sim/storySupplies.mjs';
import './StorySupplyPanel.css';

const REASONS = Object.freeze({
  'story-not-live': 'Supplies are available only during a live operation.',
  'no-crew-seat': 'Join a story crew to use a supply.',
  'unknown-supply': 'That supply is not available.',
  'already-claimed': 'Your one supply has already been used this operation.',
  'fighter-unavailable': 'Wait until you respawn to use your supply.',
  'already-full': 'That resource is already full. Keep your supply until you need it.',
  'invalid-vitals': 'Your fighter cannot use that supply at the moment.',
  'no-story': 'This supply is only available in story missions.',
});

export default function StorySupplyPanel({ view, answer, onUse, onClose }) {
  const used = view?.me?.supplyUsed || null;
  const active = view?.phase === 'live';
  return (
    <section className="duelist-story-supply" role="dialog" aria-modal="true" aria-label="Story supply shop">
      <header className="duelist-story-supply__head">
        <div>
          <span className="duelist-story-supply__eyebrow">STORY CAMPAIGN / FIELD QUARTERMASTER</span>
          <h2>Story Supply Shop</h2>
          <p>One free recovery supply per player, per operation. No match gold or permanent purchases.</p>
        </div>
        <button type="button" aria-label="Close story supply shop" className="duelist-story-supply__close" onClick={onClose}>×</button>
      </header>
      <div className="duelist-story-supply__cards">
        {STORY_SUPPLIES.map(supply => (
          <article className="duelist-story-supply__card" key={supply.id}>
            <div className="duelist-story-supply__art" aria-hidden="true">
              {supply.stat === 'hp' ? '✚' : supply.stat === 'shield' ? '⬡' : '✦'}
            </div>
            <div>
              <strong>{supply.name}</strong>
              <p>{supply.description}</p>
              <small>FREE · STORY-ONLY · INSTANT USE</small>
            </div>
            <button type="button" disabled={!active || !!used || !!answer?.pending}
              onClick={() => onUse?.(supply.id)}>
              {used === supply.id ? 'USED' : used ? 'SUPPLY SPENT' : 'USE SUPPLY'}
            </button>
          </article>
        ))}
      </div>
      <footer className="duelist-story-supply__foot" role="status" aria-live="polite">
        {answer && !answer.ok
          ? REASONS[answer.reason] || 'Supply unavailable'
          : used
            ? 'Your supply is spent for this operation. Each crew member has their own free choice.'
            : !active
              ? 'Wait until the mission is active to use a supply.'
              : 'Choose a supply after taking damage or spending shield/Will. Cannot exceed maximum values.'}
      </footer>
    </section>
  );
}
