// In-match class choice: four compact buttons and one focused detail pane.
// All inputs still go through onPick; the match server applies them at countdown/respawn.
import { Cross, Shield, Swords, VenetianMask } from 'lucide-react';
import { CLASSES, CLASS_IDS } from '../core/classes.mjs';
import { levelFromXp, masteryAt, masteryReward, RANK_MAX, TIER_MAX, LEVEL_CAP } from '../core/progression.mjs';
import { kitAt } from '../core/ranks.mjs';
import './duelistClassPicker.css';

const ICONS = { warrior: Shield, duelist: Swords, assassin: VenetianMask, healer: Cross };
const WEAPON_NAMES = { sword: 'Crystal blade', dualBlades: 'Twin crystal blades', staff: 'Double-bladed staff' };
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const NUMERALS = ['I', 'II', 'III', 'IV', 'V'];

function nextGain(level, abilities) {
  if (level >= LEVEL_CAP) return 'Maximum mastery reached. Match boosts reset after each match.';
  const next = masteryReward(level + 1);
  if (next.kind === 'ultimate') return `Level ${next.level}: Ultimate +1`;
  return `Level ${next.level}: ${abilities[next.abilityIndex]?.name || 'Ability'} +1`;
}

export default function ClassPicker({ current, pending = null, keys, live = false, onPick, onClose = null, progress = null, matchBoost = 0 }) {
  const chosen = CLASS_IDS.includes(pending) ? pending : CLASS_IDS.includes(current) ? current : 'duelist';
  const cls = CLASSES[chosen];
  const at = levelFromXp(progress?.[chosen] ?? 0);
  const kit = kitAt(chosen, at.level, matchBoost);
  const mastery = masteryAt(at.level);
  const note = pending && pending !== current
    ? `Your ${cls.name} selection is queued for your next spawn.`
    : live ? 'Changes take effect at your next spawn.' : 'Your selection takes effect when the match starts.';
  return (
    <div className="duelist-classpick dcp-root" role="dialog" aria-label="Choose your class" data-testid="duelist-class-picker">
      <header className="dcp-head">
        <div><small>DUELIST ADVENTURE</small><h2>Choose your class</h2></div>
        {onClose && <button type="button" className="dcp-close" aria-label="Close the class choice" onClick={onClose}>×</button>}
      </header>

      <nav className="dcp-options" aria-label="Playable classes">
        {CLASS_IDS.map((id) => {
          const c = CLASSES[id];
          const Icon = ICONS[id];
          const level = levelFromXp(progress?.[id] ?? 0);
          return (
            <button key={id} type="button" data-testid={`duelist-class-${id}`}
              className="dcp-option" style={{ '--class': hex(c.color) }} data-chosen={chosen === id}
              onClick={() => onPick(id)} aria-pressed={chosen === id} title={c.description}>
              <Icon aria-hidden="true"/>
              <span className="dcp-option-copy"><strong>{c.name}</strong><small>{c.role}</small></span>
              <span className="dcp-option-level">LV {level.level}</span>
            </button>
          );
        })}
      </nav>

      <section className="dcp-detail" style={{ '--class': hex(cls.color) }} aria-label={`${cls.name} abilities and mastery`}>
        <div className="dcp-detail-title">
          <div><small>SELECTED CLASS</small><strong>{cls.name}</strong></div>
          <span>LV {at.level}{at.capped ? ' · MAX' : ` / ${LEVEL_CAP}`}</span>
        </div>
        <p className="dcp-weapon">{WEAPON_NAMES[cls.weapon]} · {cls.role}</p>
        <div className="dcp-xp" role="progressbar" aria-label={`${cls.name} mastery progress`}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(at.progress * 100)}
          title={at.capped ? 'Maximum class level' : `${at.into} / ${at.need} XP`}>
          <span style={{ width: `${Math.round(at.progress * 100)}%` }}/>
        </div>
        <div className="dcp-subhead">CLASS ABILITIES <small>RANK</small></div>
        <ol className="dcp-abilities">
          {kit.abilities.map((ability, i) => (
            <li key={ability.id} title={ability.text}>
              <kbd>{keys?.[i] ?? String(i + 1)}</kbd>
              <span>{ability.name}</span>
              <small title={`Rank ${ability.rank} of ${RANK_MAX}`}>{NUMERALS[ability.rank - 1]}</small>
            </li>
          ))}
        </ol>
        <div className="dcp-special" title={kit.special.text}>
          <kbd>{keys?.[4] ?? 'Q'}</kbd>
          <div><small>ULTIMATE</small><strong>{kit.special.name}</strong></div>
          <span title={`Tier ${kit.special.tier} of ${TIER_MAX}`}>{NUMERALS[kit.special.tier - 1]}</span>
        </div>
        <p className="dcp-passive"><strong>{kit.passive.name}</strong> — {kit.passive.text}</p>
        <p className="dcp-next">{nextGain(at.level, cls.abilities)} · Ultimate rank {mastery.ultimateRank}.</p>
      </section>

      <p className="dcp-note" aria-live="polite">{note}</p>
    </div>
  );
}
