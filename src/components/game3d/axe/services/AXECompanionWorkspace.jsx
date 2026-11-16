import { useEffect, useState } from 'react';
import { Compass, Heart, Sword, Shield, Flame, Feather, Star, Wind, Link2,
  Sparkles, ChevronUp, ChevronDown, Check, LockKeyhole } from 'lucide-react';
import { getAXEPetState, subscribeAXEPets,
  registerAXEPet, summonAXEPet, feedAXEPet, overEnchantAXEPet } from '../progression/AXEPetStore';
import { getAXEPetDefinition, AXE_PET_CONFIG, xpForAXEPetLevel } from '../progression/AXEPetSystem';
import { characterScopedStorage, subscribeCharacterChange } from '../../characterStorage';
import { getAXESoulRegaliaState, getAXESoulRegaliaBonuses, subscribeAXESoulRegalia,
} from '../progression/AXESoulRegaliaStore';
import { SOUL_PET_GEAR_SLOTS, SOUL_INFUSION_SLOTS, isSoulCompanionMastered } from '../progression/AXESoulRegaliaSystem';
import { getCompanionState, subscribeCompanion, equipCompanionGear, unequipCompanionGear } from '../../companionStore';
import { getCompanionById, COMPANION_GEAR } from '../../companionData';
import { getAXEVanityState, subscribeAXEVanity } from '../progression/AXEVanityStore';
import { getAXECostumeState, subscribeAXECostumes } from '../progression/AXECostumeStore';
import MountSubTab from '../../progression/hub/MountSubTab';
import AXEOwnedMountsPanel from './AXEOwnedMountsPanel';
import AXECompanionMasteryPanel from './AXECompanionMasteryPanel';
import './AXECompanionCollectionPages.css';
import AXEGlassLoadoutPane from './AXEGlassLoadoutPane';
import AXECompanionStylePane from './AXECompanionStylePane';
import AXECompanionOverviewClone from './AXECompanionOverviewClone';
import AXECompanionFusionButton from './AXECompanionFusionButton';
import './AXECompanionWorkspace.css';

const favoriteStorage = characterScopedStorage('axe_companion_favorites_v1');
function loadFavorites() {
  try {
    const ids = JSON.parse(favoriteStorage.get() || '[]');
    return Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : [];
  } catch { return []; }
}
const TABS = ['Overview', 'Equipment', 'Vanity', 'Imbuement', 'Mounts', 'Mastery'];
const ATTRIBUTES = [
  ['HP', Heart, 'hp'], ['Attack', Sword, 'damage'], ['Defense', Shield, 'defense'],
  ['Spirit', Flame, 'chi'], ['Dexterity', Feather, 'dexterity'],
  ['Crit Rate', Star, 'critChance'], ['Speed', Wind, 'speed'],
];
const SLOTS = [
  ['Head', 'helm'], ['Chest', 'chest'], ['Arms', null],
  ['Legs', 'legs'], ['Accessory', null],
];
const titleCase = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
const readable = value => value == null ? '—' : typeof value === 'number' ? value.toLocaleString() : String(value);
function useLive(source, read) {
  const [value, setValue] = useState(read);
  useEffect(() => source(setValue), [source]);
  return value;
}
function Glass({ title, extra, children, className = '' }) {
  return <section className={`axe-comp-glass ${className}`}><header className="axe-comp-glass-heading">
    <h3>{title}</h3>{extra && <span>{extra}</span>}</header>{children}</section>;
}
function Meter({ value = 0, max = 100 }) {
  return <div className="axe-comp-meter" role="progressbar" aria-valuemin={0} aria-valuemax={max}
    aria-valuenow={Math.max(0, Math.min(max, Number(value) || 0))}>
    <span style={{ width: `${max > 0 ? Math.max(0, Math.min(100, value / max * 100)) : 0}%` }} />
  </div>;
}
function Property({ label, value }) { return <div className="axe-comp-property"><span>{label}</span><b>{readable(value)}</b></div>; }
function Action({ children, onClick, disabled }) { return <button type="button" className="axe-comp-action" onClick={onClick} disabled={disabled}>{children}</button>; }

export default function AXECompanionWorkspace({ onClose, serviceId = 'companion' }) {
  const pets = useLive(subscribeAXEPets, getAXEPetState);
  const soul = useLive(subscribeAXESoulRegalia, getAXESoulRegaliaState);
  const loadout = useLive(subscribeCompanion, getCompanionState);
  const vanity = useLive(subscribeAXEVanity, getAXEVanityState);
  const costumes = useLive(subscribeAXECostumes, getAXECostumeState);
  const [tab, setTab] = useState(serviceId === 'mount' ? 'Mounts' : serviceId === 'pet' ? 'Mastery' : 'Overview');
  useEffect(() => { if (serviceId === 'mount') setTab('Mounts'); else if (serviceId === 'pet') setTab('Mastery'); }, [serviceId]);
  const [equipmentView, setEquipmentView] = useState('companion');
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState('');
  const [pending, setPending] = useState(null);
  const [favorites, setFavorites] = useState(loadFavorites);
  useEffect(() => subscribeCharacterChange(() => {
    setFavorites(loadFavorites());
    setSelected(null);
    setPending(null);
    setResult('');
  }), []);

  const selectedPet = pets.pets.find(p => p.instanceId === selected)
    || pets.pets.find(p => p.instanceId === pets.activeRegisteredPetId) || pets.pets[0] || null;
  const definition = selectedPet ? getAXEPetDefinition(selectedPet.definitionId) : null;
  const registered = pets.pets.find(p => p.instanceId === pets.activeRegisteredPetId) || null;
  const bonuses = getAXESoulRegaliaBonuses();
  const loadedCompanion = getCompanionById(loadout.activeCompanionId);
  const gear = loadout.gear?.[loadedCompanion?.id] || {};
  const statBonuses = selectedPet?.bonuses || {};
  const level = Number(selectedPet?.level) || 0;
  const xp = Number(selectedPet?.xp) || 0;
  const onAction = (label, run, dangerous = false) => {
    if (dangerous && pending !== label) { setPending(label); setResult(`Confirm ${label} before proceeding.`); return; }
    setPending(null);
    const response = run();
    setResult(response?.ok === false
      ? titleCase(response.reason || 'Action unavailable')
      : `${label} completed.`);
  };
  const toggleFavorite = () => {
    if (!selectedPet) return;
    const id = selectedPet.instanceId;
    const next = favorites.includes(id) ? favorites.filter(entry => entry !== id) : [...favorites, id];
    if (favoriteStorage.setChecked(JSON.stringify(next))) {
      setFavorites(next);
      setResult(next.includes(id) ? 'Companion added to favorites.' : 'Companion removed from favorites.');
    } else setResult('Could not save favorite status.');
  };
  const selectedName = definition?.name || selectedPet?.definitionId || 'No companion selected';
  const makeOverview = () => <>
    <Glass title="Attributes" className="axe-comp-attributes">
      {ATTRIBUTES.map(([label, Icon, key]) => <div className="axe-comp-stat" key={label}>
        <Icon size={16} /><span>{label}</span><Meter value={statBonuses[key] || 0} max={Math.max(100, Number(statBonuses[key] || 0) * 1.25)} />
        <b>{selectedPet ? readable(statBonuses[key] ?? null) : '—'}</b>
      </div>)}
    </Glass>
    <Glass title="Companion → Player Bonuses" className="axe-comp-bonuses">
      <div className="axe-comp-bonus"><div className="axe-comp-bonus-icon"><Link2 size={28}/></div>
        <div><div className="axe-comp-bonus-head"><b>Fusion Bonus</b><span>{bonuses.fused ? 'Active' : 'Inactive'}</span></div>
        <p>{bonuses.fused ? `Bound companion soul. Current total stat bonus: +${Number(bonuses.allStatsPct || 0).toFixed(1)}%.`
          : 'Requires a mastered, registered companion before soul fusion can be activated.'}</p></div></div>
      <div className="axe-comp-bonus"><div className="axe-comp-bonus-icon"><Sparkles size={28}/></div>
        <div><div className="axe-comp-bonus-head"><b>Imbuement Bonus</b><span>{SOUL_INFUSION_SLOTS.filter(key => soul.infusion[key] === 100).length}/{SOUL_INFUSION_SLOTS.length}</span></div>
        <p>Completed infusion can enhance eligible equipped gear while the required soul bond is active.</p></div></div>
    </Glass>
    <Glass title="Equipment" extra="Companion Gear" className="axe-comp-equipment">
      <div className="axe-comp-equip-row">{SLOTS.map(([label, slot]) => <button
        key={label} type="button" className="axe-comp-gear-slot" onClick={() => setTab('Equipment')}
        title={slot ? `${label}: ${soul.petGear[slot]?.enchantLevel ?? 0}/20 enchantment` : `${label}: not configured`}>
        <span className="axe-comp-hex">⬡</span><small>{label}</small></button>)}</div>
    </Glass>
    <Glass title="Progression" className="axe-comp-progression">
      <div className="axe-comp-level"><b>Lv. {level} / {AXE_PET_CONFIG.maxLevel}</b><Meter value={xp} max={xpForAXEPetLevel(Math.max(1, level))}/></div>
      <Property label="Rank" value={selectedPet ? titleCase(selectedPet.tierId || 'base') : null}/>
      <Property label="Growth" value={selectedPet ? `${selectedPet.overEnchantPercent || 0}% enchant` : null}/>
      <Property label="Bond" value={soul.fused && selectedPet?.instanceId === soul.bondedPetId ? 'Fused' : 'Unbound'}/>
    </Glass>
    <Glass title="Vanity / Costumes" extra="Companion cosmetics" className="axe-comp-vanity">
      <div className="axe-comp-small-slots">{Array.from({length:5},(_,i)=><button
        key={i} type="button" title="View available cosmetic information" onClick={() => setTab('Vanity')} />)}</div>
    </Glass>
    <Glass title="Companion Status" className="axe-comp-status">
      <div className="axe-comp-status-orb"><Sparkles size={20}/></div>
      <p>{registered?.instanceId === selectedPet?.instanceId ? 'Registered' : 'Not registered'}</p>
    </Glass>
  </>;

  const makeEquipment = () => <>
    <Glass title="Equipped Companion Gear" extra={loadedCompanion?.name || 'No active model'} className="axe-comp-section-wide">
      <p className="axe-comp-description">Existing companion gear uses the original three-slot loadout. It is not duplicated in the spiritual enchantment save.</p>
      {loadedCompanion?.gearSlots?.length ? loadedCompanion.gearSlots.map(slot => <div key={slot} className="axe-comp-gear-line">
        <h4>{titleCase(slot)}</h4><div className="axe-comp-inventory-choices">
          {(COMPANION_GEAR[slot] || []).map(item => {
            const equipped = gear[slot] === item.id;
            return <button type="button" key={item.id} aria-pressed={equipped} onClick={() => onAction(
              equipped ? `Unequip ${item.name}` : `Equip ${item.name}`,
              () => equipped ? unequipCompanionGear(loadedCompanion.id, slot)
                : equipCompanionGear(loadedCompanion.id, slot, item.id))}>
              <Shield size={17}/>{item.name}{equipped && <Check size={16}/>}</button>;
          })}
        </div></div>) : <p>No companion equipment loadout is available.</p>}
    </Glass>
    <Glass title="Spiritual Gear" extra="Enchantments" className="axe-comp-section-side">
      {SOUL_PET_GEAR_SLOTS.map(slot => <Property key={slot} label={titleCase(slot)} value={`${soul.petGear[slot]?.enchantLevel || 0} / 20`}/>)}
      <p className="axe-comp-description">Enchantment rewards are applied by the existing verified progression system, not by clicking an empty slot.</p>
    </Glass>
  </>;

  const makeImbuement = () => <>
    <Glass title="Equipment Imbuement" extra="Character Body" className="axe-comp-section-wide">
      <p className="axe-comp-description">Each slot displays the actual Soul Regalia infusion status. Rewards are governed by existing quest and item eligibility.</p>
      {SOUL_INFUSION_SLOTS.map(slot => <div className="axe-comp-enchant-line" key={slot}>
        <span>{titleCase(slot)}</span><Meter value={soul.infusion[slot] || 0}/><b>{soul.infusion[slot] || 0}%</b>
      </div>)}
      <p className="axe-comp-description">A mastered and fused companion can grant a 20% bonus to eligible infused gear, or the existing Chosen replacement bonus when its requirements are met.</p>
    </Glass>
    <Glass title="Imbuement Bonus" className="axe-comp-section-side">
      <Property label="Completed Slots" value={`${SOUL_INFUSION_SLOTS.filter(slot => soul.infusion[slot] === 100).length}/4`}/>
      <Property label="Soul Bond" value={bonuses.fused ? 'Active' : 'Inactive'}/>
      <Property label="All-Stats Bonus" value={`+${Number(bonuses.allStatsPct || 0).toFixed(1)}%`}/>
    </Glass>
  </>;
  const makeCosmetics = () => <>
    <Glass title={tab === 'Vanity' ? 'Companion Vanity' : 'Companion Costumes'} className="axe-comp-section-wide">
      <p className="axe-comp-description">The game currently provides a character Vanity and Costume inventory, but not a separate validated companion cosmetic loadout. This page preserves the reference design without applying player-only cosmetics to your companion.</p>
      <div className="axe-comp-small-slots">{[0,1,2,3,4].map(n=><span key={n}/>)}</div>
      <p className="axe-comp-description">Companion-specific cosmetic slots will become available when companion item definitions and attachment rules are added.</p>
    </Glass>
    <Glass title="Existing Player Wardrobe" className="axe-comp-section-side">
      <Property label="Player Vanity Pieces" value={vanity.ownedPieceIds?.length || 0}/>
      <Property label="Player Costumes" value={costumes.owned?.length || 0}/>
      <p className="axe-comp-description">These are player-owned cosmetics and are intentionally not equipped on your companion.</p>
    </Glass>
  </>;
  const details = tab === 'Overview' ? makeOverview() : tab === 'Equipment' ? makeEquipment()
    : tab === 'Imbuement' ? makeImbuement()
    : makeCosmetics();

  return <div className={["Overview","Equipment","Vanity","Imbuement","Mounts","Mastery"].includes(tab)
    ? "axe-comp-root axe-comp-root--modern" : "axe-comp-root"} data-progression-panel="companion">
    <div className="axe-comp-header"><Compass size={42} strokeWidth={1.2}/><h2>Companion</h2><span className="axe-comp-star">✧</span>
      {tab !== "Mounts" && <button type="button" className="axe-comp-header-favorite"
        aria-label={selectedPet ? (favorites.includes(selectedPet.instanceId)?'Unfavorite companion':'Favorite companion') : 'No companion selected'}
        disabled={!selectedPet} onClick={toggleFavorite} title="Favorite companion">
        <Star size={17} fill={selectedPet && favorites.includes(selectedPet.instanceId) ? 'currentColor' : 'none'}/>
      </button>}
      <button type="button" className="axe-comp-header-close" data-service-close
        onClick={onClose} aria-label="Close Companion">×</button></div>
    <div className="axe-comp-shell">
      <nav className="axe-comp-tabs" aria-label="Companion sections">
        <span className="axe-comp-key-hint">LB</span>
        {TABS.map(next => <button key={next} type="button" aria-pressed={tab === next}
          onClick={() => { setTab(next); setResult(''); setPending(null); }}>{next === 'Imbuement' ? 'Imbue' : next}</button>)}
        <span className="axe-comp-key-hint">RB</span>
      </nav>
      {tab === 'Overview' ? <AXECompanionOverviewClone
        pets={pets} soul={soul} loadout={loadout} favorites={favorites}
        selectedPetId={selected} onSelectPet={setSelected}
        onNotice={setResult} onEquipment={() => { setEquipmentView('companion'); setTab('Equipment'); }} bonuses={bonuses}/>
      : tab === 'Mounts' ? <AXEOwnedMountsPanel onOpenArmory={() => {
          setEquipmentView('mount');
          setTab('Equipment');
          setResult('');
          setPending(null);
        }}/>
      : tab === 'Mastery' ? <AXECompanionMasteryPanel pets={pets}
          selectedPet={selectedPet} onSelectPet={(id) => { setSelected(id); setPending(null); setResult(''); }} onAction={onAction}/>
      : ['Equipment','Vanity','Imbuement'].includes(tab) ?
        <div className="axe-comp-modern">
          {tab === 'Equipment' ? <div className="axe-comp-equipment-shell">
            <nav className="axe-comp-equipment-subnav" aria-label="Companion equipment sections">
              <button type="button" aria-pressed={equipmentView === 'companion'}
                onClick={() => setEquipmentView('companion')}>Companion Gear</button>
              <button type="button" aria-pressed={equipmentView === 'mount'}
                onClick={() => setEquipmentView('mount')}>Mount Armory</button>
            </nav>
            <div className="axe-comp-equipment-content">
              {equipmentView === 'mount'
                ? <div className="axe-comp-mounts-pane" aria-label="Mount armory and advancement">
                  <MountSubTab />
                </div>
                : <AXEGlassLoadoutPane actor="companion" onNotice={setResult}/>}
            </div>
          </div> : <AXECompanionStylePane page={tab} onNotice={setResult} onPageChange={setTab}/>}
        </div>
        : <div className="axe-comp-body">
        <aside className="axe-comp-roster" aria-label="Owned companions">
          <ChevronUp size={23} />
          {pets.pets.slice(0, 5).map(pet => <button type="button" key={pet.instanceId}
            aria-label={getAXEPetDefinition(pet.definitionId)?.name || pet.definitionId}
            aria-pressed={selectedPet?.instanceId === pet.instanceId}
            title={getAXEPetDefinition(pet.definitionId)?.name || pet.definitionId}
            onClick={() => { setSelected(pet.instanceId); setResult(''); setPending(null); }}>
            <span className="axe-comp-roster-sigil">{favorites.includes(pet.instanceId) ? '★' : '✧'}</span></button>)}
          <ChevronDown size={23} />
        </aside>
        <div className="axe-comp-scene" aria-label={`World view for ${selectedName}`}>
          <div className="axe-comp-portrait" aria-label={selectedName}><span/></div>
          {selectedPet && <div className="axe-comp-companion-name">{selectedName}</div>}
          <div className="axe-comp-scene-caption">Companion display · Open world</div>
          <AXECompanionFusionButton onNotice={setResult}/>
        </div>
        <div className={`axe-comp-panels ${tab === 'Overview' ? 'axe-comp-panels--overview' : 'axe-comp-panels--detail'}`}>{details}</div>
      </div>}
      {result && <div className="axe-comp-feedback" role="status">{result}
        {pending && <button type="button" onClick={() => { setPending(null); setResult(''); }}>Cancel</button>}</div>}

    </div>
  </div>;
}
