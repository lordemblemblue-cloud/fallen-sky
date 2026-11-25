// Duelist Adventure match class selection. Three columns: compact vertical class
// choices (18%), a large 3D character preview (57%), and current class kit (25%).
// Highlighting a class is PREVIEW ONLY. Only the central Select button calls onPick;
// the existing match controller/server still decides when a class takes effect.
import { useState } from 'react';
import { Cross, Shield, Swords, VenetianMask } from 'lucide-react';
import { CLASSES, CLASS_IDS, DEFAULT_CLASS } from '../core/classes.mjs';
import { levelFromXp, masteryAt, masteryReward, RANK_MAX, TIER_MAX, LEVEL_CAP } from '../core/progression.mjs';
import { kitAt } from '../core/ranks.mjs';
import DuelistCharacterPreview from '../menu/DuelistCharacterPreview.jsx';
import './duelistClassPicker.css';

const ICONS = { warrior: Shield, duelist: Swords, assassin: VenetianMask, healer: Cross };
const WEAPON_NAMES = { sword: 'Crystal blade', dualBlades: 'Twin crystal blades', staff: 'Double-bladed staff' };
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const NUMERALS = ['I', 'II', 'III', 'IV', 'V'];

function nextGain(level, abilities) {
  if (level >= LEVEL_CAP) return 'Maximum mastery reached.';
  const next = masteryReward(level + 1);
  return next.kind === 'ultimate'
    ? `Level ${next.level}: Ultimate +1`
    : `Level ${next.level}: ${abilities[next.abilityIndex]?.name || 'Ability'} +1`;
}

export default function ClassPicker({ current, pending = null, fighter = 'maskedWarrior', keys,
  live = false, onPick, onClose = null, progress = null, matchBoost = 0,
  initialChoice = false, secondsLeft = 5, submitting = false, error = null, joiningRoom = false }) {
  // Local class browsing cannot mutate match state, weapon, or authoritative meter.
  const [previewId, setPreviewId] = useState(null);
  const chosen = CLASS_IDS.includes(previewId) ? previewId
    : CLASS_IDS.includes(pending) ? pending
      : CLASS_IDS.includes(current) ? current : DEFAULT_CLASS;
  const cls = CLASSES[chosen];
  const at = levelFromXp(progress?.[chosen] ?? 0);
  const kit = kitAt(chosen, at.level, matchBoost);
  const mastery = masteryAt(at.level);
  const queued = pending === chosen && pending !== current;
  const active = current === chosen && !queued;
  const note = joiningRoom ? 'Select your class to enter the room.' : queued ? `${cls.name} is queued for your next spawn.`
    : active ? `${cls.name} is your current class.`
      : live ? 'Press Select to queue this class for your next spawn.'
        : 'Press Select to use this class when the match begins.';
  return (
    <div className="duelist-classpick dcp-root" role="dialog" aria-label="Choose your class"
      data-testid="duelist-class-picker" data-layout="three-column">
      <nav className="dcp-classes" aria-label="Playable classes">
        <div className="dcp-classes-heading"><small>DUELIST ADVENTURE</small><strong>CLASS</strong></div>
        <div className="dcp-class-stack">
          {CLASS_IDS.map((id) => {
            const c = CLASSES[id];
            const Icon = ICONS[id];
            const masteryLevel = levelFromXp(progress?.[id] ?? 0);
            return (
              <button key={id} type="button" className="dcp-class-choice"
                data-testid={`duelist-class-${id}`} data-chosen={chosen === id}
                style={{ '--class': hex(c.color) }} onClick={() => setPreviewId(id)}
                aria-pressed={chosen === id} title={c.description}>
                <Icon aria-hidden="true"/>
                <span><strong>{c.name}</strong><small>LV {masteryLevel.level}</small></span>
              </button>
            );
          })}
        </div>
      </nav>

      <section className="dcp-model" aria-label={`3D character preview for ${cls.name}`}>
        <div className="dcp-model-view" data-testid="duelist-class-3d-preview">
          <DuelistCharacterPreview fighter={fighter} classId={chosen} compact />
        </div>
        <div className="dcp-model-footer">
          {initialChoice && <div className="dcp-choice-timer" role="status" aria-live="off"
            data-testid="duelist-class-decision-timer">
            {secondsLeft > 0 ? `CHOOSE YOUR CLASS · ${secondsLeft}s` : 'CHOOSE A CLASS TO BEGIN'}
          </div>}
          <div className="dcp-model-identity">
            <strong>{cls.name}</strong><small>{WEAPON_NAMES[cls.weapon]} · {cls.role}</small>
          </div>
          <button type="button" className="dcp-select" data-testid="duelist-class-select"
            onClick={() => onPick?.(chosen)} disabled={submitting} aria-label={`Select ${cls.name}`}>
            {submitting ? 'CONFIRMING…' : 'SELECT CLASS'}
          </button>
          <p aria-live="polite" className="dcp-selection-note">
            {error ? 'Selection unavailable. Wait for the next spawn and try again.' : submitting ? 'Waiting for match confirmation…' : note}
          </p>
        </div>
      </section>

      <section className="dcp-details" style={{ '--class': hex(cls.color) }}
        aria-label={`${cls.name} class abilities and level`}>
        <div className="dcp-detail-header">
          <div className="dcp-detail-title"><small>CLASS OVERVIEW</small><h2>{cls.name}</h2></div>
          {onClose && <button className="dcp-close" type="button" onClick={onClose}
            aria-label="Close class selection">×</button>}
        </div>
        <div className="dcp-level">
          <span>LEVEL <strong>{at.level}</strong><small> / {LEVEL_CAP}</small></span>
          <div className="dcp-xp" role="progressbar" aria-label={`${cls.name} mastery experience`}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(at.progress * 100)}
            title={at.capped ? 'Maximum class mastery' : `${at.into} / ${at.need} XP`}>
            <span style={{ width: `${Math.round(at.progress * 100)}%` }}/>
          </div>
        </div>
        <div className="dcp-section-title">ABILITIES <small>RANK</small></div>
        <ol className="dcp-abilities">
          {kit.abilities.map((ability, i) => (
            <li key={ability.id} title={ability.text}>
              <kbd>{keys?.[i] ?? String(i + 1)}</kbd>
              <span>{ability.name}</span>
              <small title={`Rank ${ability.rank} of ${RANK_MAX}`}>{NUMERALS[ability.rank - 1]}</small>
            </li>
          ))}
        </ol>
        <div className="dcp-ultimate" title={kit.special.text}>
          <div className="dcp-section-title">ULTIMATE</div>
          <div className="dcp-ultimate-row">
            <kbd>{keys?.[4] ?? 'Q'}</kbd>
            <strong>{kit.special.name}</strong>
            <small title={`Tier ${kit.special.tier} of ${TIER_MAX}`}>{NUMERALS[kit.special.tier - 1]}</small>
          </div>
        </div>
        <div className="dcp-passive"><small>PASSIVE</small>
          <strong>{kit.passive.name}</strong><p>{kit.passive.text}</p>
        </div>
        <div className="dcp-next">{nextGain(at.level, cls.abilities)} · Ultimate rank {mastery.ultimateRank}.
          <span> Mastery persists; temporary match boosts reset.</span>
        </div>
      </section>
    </div>
  );
}
