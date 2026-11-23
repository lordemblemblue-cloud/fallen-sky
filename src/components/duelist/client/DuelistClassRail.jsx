// Quiet right-side in-match identity / ability rail. This is presentation only:
// the match remains authoritative for class, ability cooldowns, mastery and 0-100 special charge.
import { useRef } from 'react';
import {
  ArrowUpRight, Cross, EyeOff, Feather, Flame, Focus, Hand, HeartPulse, Magnet,
  Radar, RotateCw, ShieldCheck, ShieldPlus, Shuffle, Skull, Sparkles, Sword,
  Swords, VenetianMask, Waves, Zap,
} from 'lucide-react';
import { CLASSES } from '../core/classes.mjs';
import { canPressAbility, specialPercent } from './glassHud.mjs';
import DuelistCharacterPreview from '../menu/DuelistCharacterPreview.jsx';
import './duelistClassRail.css';

const CLASS_ICONS = { warrior: Sword, duelist: Swords, assassin: VenetianMask, healer: Cross };
const ABILITY_ICONS = { leapStrike: ArrowUpRight, grip: Hand, repulse: Radar, bladeThrow: RotateCw,
  pull: Magnet, quickstep: Zap, quickstepAura: Zap, counter: ShieldCheck, cloak: EyeOff, push: Waves,
  empower: Flame, dominate: Shuffle,mend: HeartPulse, levitate: Feather, breach: Focus };
const SPECIAL_ICONS = { rage: Flame, execution: Swords, shadowExecution: Skull, sanctuary: ShieldPlus };
const WEAPONS = { sword: 'Crystal blade', dualBlades: 'Twin blades', staff: 'Double-bladed staff' };
const LEGACY_NAMES = { push: 'Push', pull: 'Pull', grip: 'Grip', breach: 'Veil Breach' };

export default function DuelistClassRail({ hud, fighter, level, onPower, onClass }) {
  const gripping = useRef(false);
  const cls = CLASSES[hud.classId] || null;
  const ClassIcon = CLASS_ICONS[hud.classId] || Sparkles;
  const SpecialIcon = SPECIAL_ICONS[cls?.special?.id] || Sparkles;
  const charge = specialPercent(hud.specialMeter);
  const ready = !!cls && charge !== null && hud.specialMeter + 1e-6 >= cls.special.cost && !hud.dead;
  const slots = hud.abilities || (hud.powers || []).slice(0, 4).map((p, i) => ({
    ...p, name: LEGACY_NAMES[p.id] || p.id, slot: i + 1,
  }));
  const press = (ability) => {
    if (!canPressAbility(ability, hud.you.dead)) return;
    if (ability.id === 'grip') {
      onPower?.(gripping.current ? 'release' : `ability${ability.slot}`);
      gripping.current = !gripping.current;
    } else {
      gripping.current = false;
      onPower?.(`ability${ability.slot}`);
    }
  };
  return (
    <aside className="dh-class-rail" aria-label="Current fighter class, stance, skills and ultimate" data-testid="duelist-class-rail">
      <div className="dh-rail-identity">
        <button type="button" className="dh-rail-class" disabled={!onClass} onClick={onClass}
          aria-label={cls ? `${cls.name}. Change class at next spawn` : 'Choose a class'} title="Choose class">
          <ClassIcon aria-hidden="true"/>
          <span>{cls?.name || 'Fighter'}</span>
        </button>
        <div className="dh-rail-level" title={level.capped ? 'Maximum level' : `${level.into} / ${level.need} XP`}>
          <small>LV</small><strong>{level.level}</strong>
        </div>
      </div>
      <div className="dh-rail-fighter">
        <div className="dh-rail-preview" aria-label="Equipped fighter standing in an animated ready stance">
          <DuelistCharacterPreview fighter={fighter} classId={hud.classId} compact />
        </div>
        <small className="dh-rail-weapon">{cls ? WEAPONS[cls.weapon] : 'Unassigned'}</small>
      </div>
      <div className="dh-rail-actions">
        <div className="dh-rail-caption">ABILITIES</div>
        <div className="dh-rail-abilities" aria-label="Active skills">
          {slots.map((ability) => {
            const Icon = ABILITY_ICONS[ability.id] || Sparkles;
            const cooling = ability.ready > 0;
            return <button type="button" key={ability.id} className="dh-rail-ability"
              data-testid={`duelist-skill-${ability.id}`} disabled={!canPressAbility(ability, hud.you.dead)}
              onClick={() => press(ability)}
              aria-label={`${ability.name}, key ${ability.key}${cooling ? `, ${ability.ready.toFixed(1)} seconds cooldown` : ''}`}>
              <span className="dh-rail-ability-icon"><Icon aria-hidden="true"/></span>
              <span className="dh-rail-ability-name">{ability.name}<small>{cooling ? `${ability.ready.toFixed(1)}s` : 'READY'}</small></span>
              <kbd>{ability.key}</kbd>
            </button>;
          })}
        </div>
        <div className="dh-rail-ultimate">
          <div className="dh-rail-caption">ULTIMATE <span>LV {level.level}</span></div>
          <button type="button" className="dh-rail-ultimate-button" disabled={!ready}
            onClick={() => onPower?.('special')} title={cls?.special?.text || 'Choose a class'}
            aria-label={cls ? `${cls.special.name}, ${charge === null ? 'charge unavailable' : `${charge} percent charge`}` : 'No ultimate selected'}>
            <SpecialIcon aria-hidden="true"/>
            <span>{cls?.special?.name || 'Unavailable'}<small>{charge === null ? 'CHARGE UNAVAILABLE' : ready ? 'READY' : `${charge}/${cls?.special?.cost ?? 100}`}</small></span>
            <kbd>{hud.specialKey || 'Q'}</kbd>
          </button>
          <div className="dh-rail-charge" role="progressbar" aria-label="Authoritative special meter"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={charge ?? undefined}
            aria-valuetext={charge === null ? 'Unavailable' : `${charge} percent`}>
            <span style={{ width: `${charge ?? 0}%` }}/>
          </div>
        </div>
      </div>
    </aside>
  );
}
