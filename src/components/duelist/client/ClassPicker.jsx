// Choose a class (core/classes.mjs): before the fight, between rounds or while down. The match applies the choice
// at the next spawn; in the middle of a fight it waits until then. Each class shows its own level (levels 1 to 20:
// core/progression.mjs), its abilities at the rank that level gives, its special at its tier, and its passive.
import { CLASSES, CLASS_IDS } from '../core/classes.mjs';
import { levelFromXp, RANK_MAX, TIER_MAX, LEVEL_CAP } from '../core/progression.mjs';
import { kitAt } from '../core/ranks.mjs';

const WEAPON_NAMES = { sword: 'Crystal blade', dualBlades: 'Twin crystal blades', staff: 'Double-bladed staff' };
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const NUMERALS = ['I', 'II', 'III', 'IV', 'V'];
// what the next level worth waiting for brings
function nextGain(level) {
  if (level >= LEVEL_CAP) return 'Every ability and the special are at their highest.';
  const next = Math.min(LEVEL_CAP, (Math.floor(level / 5) + 1) * 5);
  return `Level ${next}: every ability gains a rank${next % 10 === 0 ? ', and the special improves' : ''}.`;
}

/**
 * current: the class you fight as; pending: the one waiting for your next spawn (or null); keys: labels of the
 * keys for abilities 1-4 and the special; live: the fight is on and you are standing (a choice waits);
 * progress: your EXP for each class ({ warrior, duelist, assassin, healer }).
 */
export default function ClassPicker({ current, pending = null, keys, live = false, onPick, onClose = null, progress = null }) {
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
          const at = levelFromXp(progress?.[id] ?? 0);
          const kit = kitAt(id, at.level);
          return (
            <button key={id} type="button" className="duelist-classcard" data-chosen={chosen === id} data-testid={`duelist-class-${id}`}
              style={{ '--class': hex(c.color) }} onClick={() => onPick(id)} aria-pressed={chosen === id}>
              <span className="duelist-classcard-name">{c.name}
                <span className="duelist-classcard-level" title={at.capped ? 'This class is at its highest level' : `${at.into} / ${at.need} EXP to level ${at.level + 1}`}>
                  Level {at.level}{at.capped ? ' · MAX' : ''}
                </span>
              </span>
              <span className="duelist-classcard-role">{c.role} · {WEAPON_NAMES[c.weapon]}</span>
              <span className="duelist-classcard-xp" aria-hidden="true"><b style={{ width: `${Math.round(at.progress * 100)}%` }} /></span>
              <ol className="duelist-classcard-abilities">
                {kit.abilities.map((a, i) => (
                  <li key={a.id} title={`${a.text} Ready again after ${a.cooldown} s.`}>
                    <kbd>{keys?.[i] ?? i + 1}</kbd>{a.name}<em title={`Rank ${a.rank} of ${RANK_MAX}`}>{NUMERALS[a.rank - 1]}</em>
                  </li>
                ))}
              </ol>
              <span className="duelist-classcard-special" title={kit.special.text}>
                <kbd>{keys?.[4] ?? 'Q'}</kbd>{kit.special.name}<em title={`Tier ${kit.special.tier} of ${TIER_MAX}`}>{NUMERALS[kit.special.tier - 1]}</em>
              </span>
              <span className="duelist-classcard-passive"><strong>{kit.passive.name}</strong> {kit.passive.text}</span>
              <span className="duelist-classcard-next">{nextGain(at.level)}</span>
            </button>
          );
        })}
      </div>
      <p className="duelist-classpick-note">{note}</p>
    </div>
  );
}
