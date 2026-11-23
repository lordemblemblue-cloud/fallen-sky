/** Duelist Adventure Character selection, rebuilt as one real responsive interface.
 * The reference supplies only a cropped, text-free scenic background. Every plate,
 * slot, tab, progress bar and action is authored once as an actual DOM control.
 */
import { useState } from 'react';
import {
  ChevronLeft, ChevronRight, Check, LockKeyhole, Swords, Shield, Target,
  Sparkles, Trophy, UserRound, Zap, X
} from 'lucide-react';
import { BODIES } from '../client/assets.mjs';
import { CLASSES, CLASS_IDS } from '../core/classes.mjs';
import { classProgressOf } from '../client/prefs.mjs';
import { LEVEL_CAP, XP_CAP, levelFromXp, masteryAt, masteryReward } from '../core/progression.mjs';
import DuelistCharacterPreview from './DuelistCharacterPreview.jsx';
import './DuelistCharacterMenu.css';

const numeric = n => Math.max(0, Math.floor(Number(n) || 0)).toLocaleString();
const CLASS_ICONS = { warrior: Shield, duelist: Swords, assassin: Target, healer: Sparkles };
const FIGHTER_NOTES = {
  maskedWarrior: 'A disciplined close-range combatant.',
  huntress: 'A swift fighter built for precision.',
  female: 'Eve — original Fallen Sky fighter.',
  male: 'Adam — original Fallen Sky fighter.',
};
const TABS = ['progression', 'abilities', 'customize'];
const MILESTONES = [5, 10, 15, 20, 25];

export default function DuelistCharacterMenu({ prefs, onPrefs, close }) {
  const [detail, setDetail] = useState('progression');
  const [filter, setFilter] = useState('all');
  const bodies = Object.entries(BODIES);
  const selected = BODIES[prefs.fighter] || BODIES.maskedWarrior;
  const classId = CLASS_IDS.includes(prefs.classId) ? prefs.classId : 'duelist';
  const combat = CLASSES[classId];
  const xp = Math.min(XP_CAP, Math.max(0, Number(classProgressOf(prefs)[classId]) || 0));
  const mastery = levelFromXp(xp);
  const earned = masteryAt(mastery.level);
  const next = mastery.capped ? null : masteryReward(mastery.level + 1);
  const upcoming = next?.kind === 'ultimate'
    ? `Level ${next.level} · Ultimate +1`
    : next?.kind === 'ability'
      ? `Level ${next.level} · ${combat.abilities[next.abilityIndex]?.name || 'Ability'} +1`
      : 'Maximum mastery reached';
  const className = combat.name || 'Duelist';

  return <section className="dcm-root" id="duelist-character-panel" aria-label="Select your character and review progression">
    <div className="dcm-frame">
      <button className="dcm-close" type="button" aria-label="Close character menu" onClick={close}><X size={21}/></button>
      <div className="dcm-layout">
        <aside className="dcm-roster-panel" aria-label="Fighter roster">
          <div className="dcm-roster-heading"><span>SELECT A CHARACTER</span><small>{bodies.length} AVAILABLE</small></div>
          <nav className="dcm-class-filters" aria-label="Combat class selection">
            <button type="button" data-active={filter === 'all'} aria-pressed={filter === 'all'}
              onClick={() => setFilter('all')} title="All fighters">ALL</button>
            {CLASS_IDS.map(id => {const Icon = CLASS_ICONS[id] || Swords;return <button key={id} type="button"
              data-active={filter === id} aria-pressed={filter === id}
              title={'Set class: ' + CLASSES[id].name}
              aria-label={'Set class: ' + CLASSES[id].name}
              onClick={() => {setFilter(id);onPrefs({classId:id});}}><Icon size={19}/></button>;})}
          </nav>
          <div className="dcm-roster-grid" role="group" aria-label="Available fighter appearances">
            {Array.from({length:15},(_,i) => {
              const entry = bodies[i];
              if (!entry) return <span key={'unused'+i} className="dcm-empty-slot" aria-hidden="true"/>;
              const [id, fighter] = entry;
              return <button key={id} type="button" className="dcm-fighter-slot"
                data-active={prefs.fighter === id} aria-pressed={prefs.fighter === id}
                onClick={() => onPrefs({fighter:id})} title={'Select ' + fighter.name}>
                <UserRound size={29} aria-hidden="true"/><span>{fighter.name}</span>
              </button>;
            })}
          </div>
          <div className="dcm-roster-status"><span className="dcm-status-indicator"/> Only owned character models are selectable</div>
        </aside>

        <div className="dcm-showcase" aria-label="Selected fighter and appearance">
          <div className="dcm-showcase-scene" aria-hidden="true"/>
          <div className="dcm-showcase-top"><span className="dcm-eyebrow">{combat.role} / {className}</span>
            <h2>{selected.name}</h2><p>{FIGHTER_NOTES[prefs.fighter] || combat.description}</p></div>
          <DuelistCharacterPreview fighter={prefs.fighter} classId={classId}/>
          <div className="dcm-skin-tray" aria-label="Character skins">
            <button type="button" className="dcm-skin-arrow" disabled aria-label="Previous skin unavailable"><ChevronLeft size={23}/></button>
            <button type="button" className="dcm-skin-tile" data-active="true" aria-pressed="true" title="Default skin selected">
              <UserRound size={22} aria-hidden="true"/><small>DEFAULT</small><Check size={13} className="dcm-skin-check" aria-hidden="true"/>
            </button>
            {Array.from({length:4},(_,i) => <span key={i} className="dcm-skin-locked" aria-label={'Additional skin '+(i+2)+' unavailable'}>
              <LockKeyhole size={17} aria-hidden="true"/>
            </span>)}
            <button type="button" className="dcm-skin-arrow" disabled aria-label="Next skin unavailable"><ChevronRight size={23}/></button>
          </div>
        </div>

        <aside className="dcm-mastery-panel" aria-label="Character level and abilities">
          <div className="dcm-tabs" role="group" aria-label="Character details">
            {TABS.map(id => <button key={id} type="button" data-active={detail === id}
              aria-pressed={detail === id} onClick={() => setDetail(id)}>{id.toUpperCase()}</button>)}
          </div>
          <div className="dcm-detail-body" key={detail}>
            {detail === 'progression' && <>
              <div className="dcm-level-block">
                <div className="dcm-level-heading">CHARACTER LEVEL <span>{className.toUpperCase()} MASTERY</span></div>
                <div className="dcm-level-title"><em>LV.</em> <strong>{mastery.level}</strong><span> / {LEVEL_CAP}</span></div>
                <div className="dcm-xp-label"><span>{mastery.capped ? 'MAX LEVEL' : `${numeric(mastery.into)} / ${numeric(mastery.need)} XP`}</span>
                  <span>{numeric(xp)} TOTAL XP</span></div>
                <div className="dcm-xp-bar" role="progressbar" aria-label="Progress to next character level"
                  aria-valuemin={0} aria-valuemax={mastery.need || 1}
                  aria-valuenow={mastery.capped ? (mastery.need || 1) : mastery.into}>
                  <span style={{width:Math.round(mastery.progress * 100)+'%'}}/>
                </div>
              </div>
              <div className="dcm-next-block"><span>NEXT LEVEL REWARD</span><strong>{upcoming}</strong></div>
              <div className="dcm-subheading">ULTIMATE MILESTONES <small>EVERY 5 LEVELS</small></div>
              <div className="dcm-milestones" role="list" aria-label="Ultimate mastery milestones">
                {MILESTONES.map(level => <div role="listitem" key={level} data-earned={mastery.level >= level} className="dcm-milestone">
                  <small>LV. {level}</small><Trophy size={20} aria-hidden="true"/><strong>ULT +1</strong>
                  <span>{mastery.level >= level ? 'EARNED' : 'LOCKED'}</span>
                </div>)}
              </div>
              <div className="dcm-subheading">ABILITY PROGRESSION</div>
              <div className="dcm-ability-list">
                {combat.abilities.map((ability,i) => <div key={ability.id} className="dcm-ability-row">
                  <Swords size={17} aria-hidden="true"/><span>{ability.name}</span>
                  <strong>LV. {earned.abilityRanks[i]} / 6</strong>
                </div>)}
                <div className="dcm-ability-row dcm-ability-row--ultimate">
                  <Zap size={17} aria-hidden="true"/><span>{combat.special.name}</span>
                  <strong>ULT {earned.ultimateRank} / 6</strong>
                </div>
              </div>
            </>}
            {detail === 'abilities' && <div className="dcm-details-list">
              <h3>{className} Abilities</h3><p>{combat.description}</p>
              {combat.abilities.map((ability,i) => <div className="dcm-ability-description" key={ability.id}>
                <strong>{ability.name}<span>LV. {earned.abilityRanks[i]}</span></strong><p>{ability.text}</p>
              </div>)}
              <div className="dcm-ability-description"><strong>{combat.special.name}<span>ULT {earned.ultimateRank}</span></strong><p>{combat.special.text}</p></div>
            </div>}
            {detail === 'customize' && <div className="dcm-details-list">
              <h3>Appearance &amp; Class</h3><p>Your selected fighter model appears in your next match. Appearance does not erase class XP.</p>
              <label className="dcm-class-select">COMBAT CLASS
                <select value={classId} onChange={event => onPrefs({classId:event.target.value})}>
                  {CLASS_IDS.map(id => <option value={id} key={id}>{CLASSES[id].name}</option>)}
                </select>
              </label>
              <p>Current fighter: <strong>{selected.name}</strong></p><p>Additional cosmetic skins are not available yet.</p>
            </div>}
          </div>
          <button type="button" onClick={close} className="dcm-confirm"><Check size={20} aria-hidden="true"/> CONFIRM CHARACTER</button>
        </aside>
      </div>
    </div>
  </section>;
}
