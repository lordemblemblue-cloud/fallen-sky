// Choose a class (core/classes.mjs): before the fight, between rounds or while down. The match applies the choice
// at the next spawn; in the middle of a fight it waits until then.
import { CLASSES, CLASS_IDS } from '../core/classes.mjs';

const WEAPON_NAMES = { sword: 'Crystal blade', dualBlades: 'Twin crystal blades', staff: 'Double-bladed staff' };
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

/**
 * current: the class you fight as; pending: the one waiting for your next spawn (or null); keys: labels of the
 * keys for abilities 1-4 and the special; live: the fight is on and you are standing (a choice waits).
 */
export default function ClassPicker({ current, pending = null, keys, live = false, onPick, onClose = null }) {
  const chosen = pending || current;
  const note = pending && pending !== current
    ? `You will fight as the ${CLASSES[pending].name} from your next spawn.`
    : live ? 'A new class takes effect the next time you spawn.' : 'Your class takes effect as the fight starts.';
  return (
    <div className="duelist-classpick" role="dialog" aria-label="Choose a class">
      <div className="duelist-classpick-head">
        <span>Choose your class</span>
        {onClose && <button type="button" onClick={onClose} aria-label="Close the class choice">×</button>}
      </div>
      <div className="duelist-classpick-grid">
        {CLASS_IDS.map((id) => {
          const c = CLASSES[id];
          return (
            <button key={id} type="button" className="duelist-classcard" data-chosen={chosen === id} data-testid={`duelist-class-${id}`}
              style={{ '--class': hex(c.color) }} onClick={() => onPick(id)} aria-pressed={chosen === id}>
              <span className="duelist-classcard-name">{c.name}</span>
              <span className="duelist-classcard-role">{c.role} · {WEAPON_NAMES[c.weapon]}</span>
              <ol className="duelist-classcard-abilities">
                {c.abilities.map((a, i) => <li key={a.id} title={a.text}><kbd>{keys?.[i] ?? i + 1}</kbd>{a.name}</li>)}
              </ol>
              <span className="duelist-classcard-special" title={c.special.text}><kbd>{keys?.[4] ?? 'Q'}</kbd>{c.special.name}</span>
              <span className="duelist-classcard-passive" title={c.passive.text}>{c.passive.name}</span>
            </button>
          );
        })}
      </div>
      <p className="duelist-classpick-note">{note}</p>
    </div>
  );
}
