import { useEffect, useState } from 'react';
import { Feather, FlaskConical, Orbit, Sparkles, CircleHelp, Flame, Wind, Heart, Sword, ScrollText } from 'lucide-react';
import { getHaloState, subscribeHalo, attemptEnhancement, setHaloHidden } from '../../progression/haloStore';
import { MAX_HALO_LEVEL, getHaloBonusesForLevel } from '../../progression/haloData';
import { getWingsState, subscribeWings, attemptWingEnhancement, equipWings, unequipWings, setWingVisualStyle } from '../../progression/wingsStore';
import { MAX_WING_LEVEL } from '../../progression/wingsData';
import {
  getAXEElixirState, subscribeAXEElixirs, getAXEBuddhaEssenceXPRequirement,
  convertAXEBuddhaEssenceExperience,
} from '../progression/AXEElixirStore';
import TitleSubTab from '../../progression/hub/TitleSubTab';
import DevSpiritualMaxControls from '../../progression/hub/DevSpiritualMaxControls';
import AscensionSubTab from '../../progression/hub/AscensionSubTab';
import './AXESpiritualWorkspace.css';

const ESSENCES = [
  { id: 'vitality', label: 'Vitals', Icon: Heart, note: 'Gain experience by enduring damage during combat.' },
  { id: 'strength', label: 'Strengthening', Icon: Sword, note: 'Gain experience by landing attacks against enemies.' },
  { id: 'dexterity', label: 'Dexterity', Icon: Wind, note: 'Gain experience by performing combat dodges.' },
  { id: 'spirit', label: 'Spirituality', Icon: Flame, note: 'Gain experience by expending Chi on skills and abilities.' },
];

function useSnapshot(subscribe, initial) {
  const [value, setValue] = useState(initial);
  useEffect(() => subscribe(setValue), [subscribe]);
  return value;
}

function Indicator({ title, value }) {
  return <div className="axe-spirit-indicator"><span>{title}</span><strong>{value}</strong></div>;
}
function Progress({ current, maximum, label }) {
  const pct = maximum > 0 ? Math.min(100, Math.max(0, current / maximum * 100)) : 0;
  return <div className="axe-spirit-meter">
    <div className="axe-spirit-meter-label"><span>{label}</span><strong>{current.toLocaleString()} / {maximum.toLocaleString()}</strong></div>
    <div className="axe-spirit-track" role="progressbar" aria-label={label} aria-valuenow={current}
      aria-valuemin={0} aria-valuemax={maximum}><span style={{ width: `${pct}%` }} /></div>
  </div>;
}
function Stats({ entries }) {
  return <div className="axe-spirit-stats">
    {entries.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
  </div>;
}

const WING_FLAT_FIELDS = [
  ['Max HP', 'hp', 'flat'], ['Damage', 'damage', 'flat'], ['Defense', 'defense', 'flat'],
  ['Critical Chance', 'critChance', 'percent'], ['Critical Damage', 'critDamage', 'ratio'],
  ['Critical Defense', 'criticalDefense', 'ratio'],
];
const WING_ATTRIBUTE_FIELDS = [
  ['Strength', 'strength'], ['Constitution', 'constitution'], ['Vitality', 'vitality'],
  ['Dexterity', 'dexterity'], ['Focus', 'focus'], ['Spirit', 'spirit'],
];
const HALO_FIELDS = [
  ['Strength', 'strength', 'flat'], ['Constitution / Vitality', 'constitution', 'flat'],
  ['Dexterity', 'dexterity', 'flat'], ['Focus / Spirit', 'focus', 'flat'],
  ['Critical Chance', 'criticalChance', 'percent'], ['Critical Damage', 'criticalDamage', 'ratio'],
  ['Critical Defense', 'criticalDefense', 'ratio'],
];
function bonus(value, kind = 'flat') {
  const amount = (Number(value) || 0) * (kind === 'ratio' ? 100 : 1);
  return `+${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}${kind === 'percent' || kind === 'ratio' ? '%' : ''}`;
}
function BonusSection({ title, note, entries }) {
  return <section className="axe-spiritual-bonus-section">
    <h3>{title}</h3>
    {note && <p className="axe-spiritual-description">{note}</p>}
    <Stats entries={entries}/>
  </section>;
}
function WingDetails({ wing, preview = false }) {
  if (!wing) return null;
  const flat = wing.flatBonuses || {};
  return <>
    <BonusSection title="Wing Specialization Stats"
      note="These combat bonuses apply only while this wing type is equipped."
      entries={WING_FLAT_FIELDS.map(([name, key, kind]) => [name, bonus(flat[key], kind)])}/>
    <BonusSection title="Wing Attribute Bonuses"
      note="Virtual attribute points from this wing's current level and reinforcement."
      entries={WING_ATTRIBUTE_FIELDS.map(([name, key]) =>
        [name, bonus(wing.multiplierBonuses?.[key])])}/>
    {preview && <BonusSection title={wing.isMaxLevel ? 'Maximum Wing Level' : 'Next Successful Level'}
      note={wing.isMaxLevel ? 'This wing has reached the existing level cap.' :
        'Current → next level if the enhancement attempt succeeds. Failed attempts do not increase stats.'}
      entries={wing.nextFlatBonuses
        ? WING_FLAT_FIELDS.map(([name, key, kind]) =>
          [name, `${bonus(flat[key], kind)} → ${bonus(wing.nextFlatBonuses[key], kind)}`])
        : [['Level', 'Max Level']]}/>}
  </>;
}
function HaloDetails({ halo, preview = false }) {
  const next = preview && !halo.isMaxLevel ? getHaloBonusesForLevel(halo.level + 1) : null;
  return <>
    <BonusSection title="Halo Attribute & Critical Stats"
      note="These are the real bonuses from your current Halo level, including critical effects."
      entries={HALO_FIELDS.map(([name, key, kind]) => [name, bonus(halo.bonuses?.[key], kind)])
        .concat([['Buddha Essence Capacity', bonus(halo.elixirCapacityBonus)]])}/>
    {preview && <BonusSection title={halo.isMaxLevel ? 'Maximum Halo Level' : 'Next Successful Level'}
      note={halo.isMaxLevel ? 'The Halo has reached its level cap.' :
        'Current → next level if enhancement succeeds. Failures spend kills without granting stats.'}
      entries={next ? HALO_FIELDS.map(([name, key, kind]) =>
        [name, `${bonus(halo.bonuses?.[key], kind)} → ${bonus(next[key], kind)}`])
        : [['Level', 'Max Level']]}/>}
  </>;
}

export default function AXESpiritualWorkspace({ serviceId, onSelect, onClose }) {
  const halo = useSnapshot(subscribeHalo, getHaloState());
  const wings = useSnapshot(subscribeWings, getWingsState());
  const essence = useSnapshot(subscribeAXEElixirs, getAXEElixirState());
  const [section, setSection] = useState('overview');
  const [wingId, setWingId] = useState(null);
  const [confirmation, setConfirmation] = useState(false);
  const [result, setResult] = useState(null);

  const selectedWingId = wings.paths[wingId] ? wingId : wings.equippedPathId && wings.paths[wings.equippedPathId]
    ? wings.equippedPathId : Object.keys(wings.paths)[0];
  const wing = wings.paths[selectedWingId];
  const isHalo = serviceId === 'halo';
  const isWings = serviceId === 'wings';
  const isEssence = serviceId === 'elixir';
  const isTitles = serviceId === 'title';
  const isAscension = serviceId === 'ascension';
  const essenceType = ESSENCES.find(entry => entry.id === section);
  const level = isHalo ? halo.level : wing?.level || 0;
  const cap = isHalo ? MAX_HALO_LEVEL : MAX_WING_LEVEL;
  const kills = isHalo ? halo.kills : wings.kills;
  const cost = isHalo ? halo.attemptCost : wings.attemptCost;
  const chance = isHalo ? halo.successChance : wing?.successChance || 0;
  const tabs = isTitles || isAscension ? [] : isEssence
    ? [{ id: 'overview', label: 'Overview' }, ...ESSENCES.map(e => ({ id: e.id, label: e.label }))]
    : [{ id: 'overview', label: 'Overview' }, { id: 'enhance', label: 'Enhance' }, { id: 'evolve', label: 'Evolve' }];

  const changeService = id => { if (id === serviceId) return; onSelect(id); setSection('overview'); setConfirmation(false); setResult(null); };
  const changeSection = id => { setSection(id); setConfirmation(false); setResult(null); };
  const enhance = () => {
    if (!confirmation) { setConfirmation(true); return; }
    const answer = isHalo ? attemptEnhancement() : attemptWingEnhancement(selectedWingId);
    setConfirmation(false);
    setResult(answer.ok ? answer.success
      ? 'Enhancement succeeded. Your level increased.'
      : 'Attempt failed; Player Kill Count was spent as specified.'
      : String(answer.reason || 'Unable to enhance.').replaceAll('_', ' '));
  };
  const convert = id => {
    const answer = convertAXEBuddhaEssenceExperience(id);
    setResult(answer.ok ? `${ESSENCES.find(type => type.id === id)?.label} increased to level ${answer.level}.`
      : String(answer.reason || 'Conversion unavailable.').replaceAll('_', ' '));
  };
  const essenceIllustration = isEssence ? (essenceType?.label || 'Buddha Essence') : '';

  return <div className="axe-spiritual-root" data-progression-panel={serviceId} aria-label="Spiritual enhancement">
    <aside className="axe-spiritual-sidebar" aria-label="Spiritual disciplines">
      <div className="axe-spiritual-brand"><span className="axe-spirit-brand-mark">◈</span>
        <div><h2>Spiritual</h2><p>Awaken your true self</p></div></div>
      <nav className="axe-spiritual-choices">
        <div className="axe-spiritual-coming"><Sparkles size={23} /><span><b>Soul Enchant</b><small>Future soul discipline</small></span><span className="axe-spirit-soon">Soon</span></div>
        <button type="button" aria-pressed={isEssence} onClick={() => changeService('elixir')}>
          <FlaskConical size={26} /><span><b>Buddha Essence</b><small>Refine your vital energies</small></span></button>
        <button type="button" aria-pressed={isHalo} onClick={() => changeService('halo')}>
          <Orbit size={26} /><span><b>Mind (Halo)</b><small>Awaken your mind</small></span></button>
        <button type="button" aria-pressed={isWings} onClick={() => changeService('wings')}>
          <Feather size={26} /><span><b>Wings</b><small>Manifest spiritual wings</small></span></button>
        <button type="button" aria-pressed={isTitles} onClick={() => changeService('title')}>
          <ScrollText size={26} /><span><b>Titles</b><small>Choose and advance your specialization</small></span></button>
        <button type="button" aria-pressed={isAscension} onClick={() => changeService('ascension')}>
          <Sparkles size={26} /><span><b>Ascension</b><small>Awaken your character's ascended nature</small></span></button>
      </nav>
      <div className="axe-spirit-ink-scene" aria-hidden="true"><span>山</span><span>雲</span></div>
    </aside>
    <div className="axe-spiritual-vision" aria-hidden="true">
      <div className={`axe-spiritual-illustration ${isHalo ? 'axe-spiritual-illustration--halo' : isWings ? 'axe-spiritual-illustration--wings' : isTitles ? 'axe-spiritual-illustration--titles' : isAscension ? 'axe-spiritual-illustration--ascension' : 'axe-spiritual-illustration--essence'}`}>
        {isHalo ? <><div className="axe-spirit-ring"/><div className="axe-spirit-aura-body"/></>
          : isWings ? <><div className="axe-spirit-wing axe-spirit-wing--left"/><div className="axe-spirit-wing axe-spirit-wing--right"/><div className="axe-spirit-aura-core"/></>
          : <><div className="axe-spirit-orb"/><span className="axe-spirit-orb-symbol">✦</span></>}
      </div>
      <div className="axe-spiritual-circle"/>
      <div className="axe-spiritual-vision-note">{isHalo ? 'Mind · Halo of Awakening' : isWings ? (wing?.name || 'Spiritual Wings') : isTitles ? 'Titles · Specialization' : isAscension ? 'Ascension · Awakening' : essenceIllustration}</div>
    </div>
    <section className="axe-spiritual-details">
      <div className="axe-spiritual-details-head">
        {/* Titles owns its own heading and live contribution balance. Showing the
            generic heading here duplicated it and stole vertical space. */}
        {!isTitles && <div><div className="axe-spiritual-eyebrow">Spiritual Enhancement</div>
          <h2>{isHalo ? 'Mind (Halo)' : isWings ? 'Spiritual Wings' : isTitles ? 'Titles' : isAscension ? 'Ascension' : 'Buddha Essence'}</h2>
          <p>{isHalo ? 'Refine your mind and manifest the halo above your head.'
            : isWings ? 'Awaken and strengthen the wings of your spirit.'
            : isTitles ? 'Choose a specialized title and advance it with earned contribution points.'
            : isAscension ? 'Choose and advance your character Ascension using its own progression rules.'
            : 'Convert experience from battle into permanent growth.'}</p></div>}
        <button type="button" className="axe-spiritual-close" data-service-close onClick={onClose} aria-label="Close Spiritual service">×</button>
      </div>
      <nav className="axe-spiritual-tabs" aria-label={isEssence ? 'Buddha Essence attributes' : 'Spiritual progression pages'}>
        {tabs.map(tab => <button type="button" key={tab.id} aria-pressed={section === tab.id} onClick={() => changeSection(tab.id)}>{tab.label}</button>)}
      </nav>
      <div className="axe-spiritual-detail-scroll">
        {(isHalo || isWings || isTitles) && <DevSpiritualMaxControls />}
        {isTitles ? <div className="axe-spiritual-title-embed"><TitleSubTab /></div>
          : isAscension ? <div className="axe-spiritual-ascension-embed"><AscensionSubTab /></div> : isEssence ? section === 'overview' ? <>
          <h3>The Four Essences</h3>
          <p className="axe-spiritual-description">Your experiences in combat strengthen the body and spirit. Earn XP separately for each essence, then choose when to convert it into a permanent level.</p>
          <div className="axe-spiritual-essence-grid">
            {ESSENCES.map(e => { const Icon = e.Icon; const lvl = essence.allocations[e.id] || 0;
              const xp = essence.experience?.[e.id] || 0; const need = getAXEBuddhaEssenceXPRequirement(lvl);
              return <button key={e.id} type="button" onClick={() => changeSection(e.id)}>
                <Icon size={20}/><span><b>{e.label}</b><small>Level {lvl} · {xp} / {need} XP</small></span>
              </button>; })}
          </div>
          <Stats entries={[[ 'Total invested', essence.usedCapacity ], ['Remaining capacity', essence.remainingCapacity],
            ['Halo capacity bonus', `+${essence.capacity.halo}` ]]} />
        </> : essenceType ? <>
          <div className="axe-spiritual-current"><essenceType.Icon size={24}/><h3>{essenceType.label}</h3></div>
          <p className="axe-spiritual-description">{essenceType.note}</p>
          <Indicator title="Current Level" value={essence.allocations[essenceType.id] || 0}/>
          <Progress current={essence.experience?.[essenceType.id] || 0} maximum={getAXEBuddhaEssenceXPRequirement(essence.allocations[essenceType.id] || 0)} label="Earned experience"/>
          <p className="axe-spiritual-description">Each converted level adds +1 to the corresponding permanent attribute using the existing character progression system. Capacity remains shared across the four essences.</p>
          <button type="button" className="axe-spiritual-primary"
            disabled={(essence.experience?.[essenceType.id] || 0) < getAXEBuddhaEssenceXPRequirement(essence.allocations[essenceType.id] || 0) || essence.remainingCapacity < 1}
            onClick={() => convert(essenceType.id)}>Convert XP to Level</button>
        </> : null
        : <>
          {isWings && <div className="axe-spiritual-paths" aria-label="Wing paths">
            {Object.values(wings.paths).map(path => <button key={path.id} type="button" aria-pressed={selectedWingId === path.id}
              aria-label={`${path.name}, level ${path.level}${wings.equippedPathId === path.id ? ', equipped' : ''}`}
              onClick={() => { setWingId(path.id); setConfirmation(false); setResult(null); }}>
              <span>{path.name}</span><small>Lv {path.level}{wings.equippedPathId === path.id ? ' · Equipped' : ''}</small>
            </button>)}
          </div>}
          {section === 'overview' && <>
            <Indicator title="Current Level" value={`${level} / ${cap}`}/>
            <Progress current={level} maximum={cap} label={isHalo ? 'Halo advancement' : 'Wing advancement'}/>
            <Stats entries={isHalo ? [
              ['Current tier', halo.tier?.label || 'Dormant'],
              ['Halo visibility', halo.hidden ? 'Hidden in world' : 'Visible in world'],
              ['Successful enhancements', `${halo.totalSuccesses} / ${halo.totalAttempts} attempts`],
              ['Banked player kills', kills],
            ] : [
              ['Selected wings', wing?.name || 'None'],
              ['Equipped', wings.equippedPathId === selectedWingId ? 'Yes' : 'No'],
              ['Reinforcement', `${wing?.reinforcementPercent || 0}%`],
              ['Successful enhancements', `${wing?.totalSuccesses || 0} / ${wing?.totalAttempts || 0} attempts`],
              ['Banked player kills', kills],
            ]}/>
            {isHalo ? <HaloDetails halo={halo}/> : <WingDetails wing={wing}/>}
            {isWings && <div role="group" aria-label="Wing appearance, all factions"
                style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',margin:'14px 0'}}>
              {[
                ['classic','Classic Energy Wings'],
                ['blue_energy','Blue Angel Wings · GLB'],
              ].map(([id,label])=><button type="button" key={id}
                className="axe-spiritual-secondary" aria-pressed={(wings.visualStyle||'classic')===id}
                onClick={()=>setWingVisualStyle(id)}>{label}</button>)}
              <small style={{color:'#b8d2df'}}>Appearance only. Level and bonuses unchanged.</small>
            </div>}
            {isWings ? <button type="button" className="axe-spiritual-secondary"
              onClick={() => wings.equippedPathId === selectedWingId ? unequipWings() : equipWings(selectedWingId)}>
              {wings.equippedPathId === selectedWingId ? 'Unequip Wings' : 'Equip Wings'}</button>
              : <button type="button" className="axe-spiritual-secondary" onClick={() => setHaloHidden(!halo.hidden)}>
                {halo.hidden ? 'Show Halo in World' : 'Hide Halo in World'}</button>}
          </>}
          {section === 'enhance' && <>
            <h3>Enhance {isHalo ? 'Halo' : 'Wings'}</h3>
            <p className="axe-spiritual-description">Only Player Kill Count is spent on these enhancement attempts. Failed attempts also consume the stated kills; your success chance follows the existing game rules.</p>
            <Indicator title="Current Level" value={`${level} / ${cap}`}/>
            <Progress current={level} maximum={cap} label="Enhancement level"/>
            <Stats entries={[[ 'Player Kill Count', kills ], [ 'Kills per attempt', cost ],
              [ 'Success chance', `${Math.round(chance * 100)}%` ], [ 'Remaining attempts', cost > 0 ? Math.floor(kills / cost) : 0 ],
              ['Attempt results', isHalo
                ? `${halo.totalSuccesses} successes / ${halo.totalAttempts} attempts`
                : `${wing?.totalSuccesses || 0} successes / ${wing?.totalAttempts || 0} attempts`],
              ...(isWings ? [['Selected wing', wing?.name || 'None'],
                ['Reinforcement', `${wing?.reinforcementPercent || 0}%`]] : [
                ['Halo tier', halo.tier?.label || 'Dormant']]) ]}/>
            {isHalo ? <HaloDetails halo={halo} preview/> : <WingDetails wing={wing} preview/>}
            {confirmation && <p className="axe-spiritual-warning">Confirm spending {cost} Player Kill Count. Success is not guaranteed.</p>}
            <button type="button" className="axe-spiritual-primary" disabled={level >= cap || kills < cost}
              onClick={enhance}>{confirmation ? 'Confirm Enhancement Attempt' : 'Enhance with Player Kills'}</button>
          </>}
          {section === 'evolve' && <>
            <h3>Evolve {isHalo ? 'Halo' : 'Wings'}</h3>
            <p className="axe-spiritual-description">The next spiritual form is reserved for future evolution progression.</p>
            <div className="axe-spiritual-evolve"><CircleHelp size={36}/><span>Next form not yet defined</span></div>
            <div className="axe-spiritual-resource-blank"><span>Required resources</span><strong>—</strong><p>Left blank until evolution rules and materials are approved.</p></div>
            {isHalo ? <HaloDetails halo={halo}/> : <WingDetails wing={wing}/>}
            <button type="button" className="axe-spiritual-primary" disabled>Evolve — Not Configured</button>
          </>}
        </>}
        {result && <p className="axe-spiritual-message" role="status">{result}</p>}
      </div>
    </section>
  </div>;
}
