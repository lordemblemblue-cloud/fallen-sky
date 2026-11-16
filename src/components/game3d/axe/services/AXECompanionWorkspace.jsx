import { useEffect, useState } from 'react';
import { Compass, Star } from 'lucide-react';
import { getAXEPetState, subscribeAXEPets } from '../progression/AXEPetStore';
import { getAXESoulRegaliaState, getAXESoulRegaliaBonuses, subscribeAXESoulRegalia } from '../progression/AXESoulRegaliaStore';
import { getCompanionState, subscribeCompanion } from '../../companionStore';
import { characterScopedStorage, subscribeCharacterChange } from '../../characterStorage';
import MountSubTab from '../../progression/hub/MountSubTab';
import AXECompanionMasteryPanel from './AXECompanionMasteryPanel';
import AXEGlassLoadoutPane from './AXEGlassLoadoutPane';
import AXECompanionStylePane from './AXECompanionStylePane';
import AXECompanionOverviewClone from './AXECompanionOverviewClone';
import './AXECompanionCollectionPages.css';
import './AXECompanionWorkspace.css';

const favoriteStorage = characterScopedStorage('axe_companion_favorites_v1');
const TABS = ['Equipment', 'Vanity', 'Imbuement'];
const EQUIPMENT_VIEWS = [
  { id: 'companion', label: 'Companion Gear' },
  { id: 'profile', label: 'My Companions' },
  { id: 'mount', label: 'Mount Armory' },
  { id: 'mastery', label: 'Mastery' },
];
const equipmentViewForService = serviceId => serviceId === 'mount' ? 'mount'
  : serviceId === 'pet' ? 'mastery' : 'companion';

function loadFavorites() {
  try {
    const ids = JSON.parse(favoriteStorage.get() || '[]');
    return Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : [];
  } catch { return []; }
}
function useLive(subscribe, read) {
  const [value, setValue] = useState(read);
  useEffect(() => subscribe(setValue), [subscribe]);
  return value;
}
const describe = value => String(value || 'Action unavailable').replaceAll('_', ' ')
  .replace(/\b\w/g, letter => letter.toUpperCase());

export default function AXECompanionWorkspace({ onClose, serviceId = 'companion' }) {
  const pets = useLive(subscribeAXEPets, getAXEPetState);
  const soul = useLive(subscribeAXESoulRegalia, getAXESoulRegaliaState);
  const loadout = useLive(subscribeCompanion, getCompanionState);
  const [tab, setTab] = useState('Equipment');
  const [equipmentView, setEquipmentView] = useState(() => equipmentViewForService(serviceId));
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState('');
  const [pending, setPending] = useState(null);
  const [favorites, setFavorites] = useState(loadFavorites);

  // Preserve old pet/mount service links without restoring the removed
  // top-level Mastery, Overview or Mounts navigation pages.
  useEffect(() => {
    setTab('Equipment');
    setEquipmentView(equipmentViewForService(serviceId));
    setPending(null);
    setResult('');
  }, [serviceId]);
  useEffect(() => subscribeCharacterChange(() => {
    setFavorites(loadFavorites());
    setSelected(null);
    setPending(null);
    setResult('');
  }), []);

  const selectedPet = pets.pets.find(p => p.instanceId === selected)
    || pets.pets.find(p => p.instanceId === pets.activeRegisteredPetId)
    || pets.pets[0] || null;
  const bonuses = getAXESoulRegaliaBonuses();

  const onAction = (label, run, dangerous = false) => {
    if (dangerous && pending !== label) {
      setPending(label);
      setResult('Confirm ' + label + ' before proceeding.');
      return;
    }
    setPending(null);
    const response = run();
    setResult(response?.ok === false
      ? describe(response.message || response.reason)
      : label + ' completed.');
  };
  const changeEquipmentView = next => {
    setEquipmentView(next);
    setResult('');
    setPending(null);
  };
  const changeTab = next => {
    setTab(next);
    setResult('');
    setPending(null);
  };
  const toggleFavorite = () => {
    if (!selectedPet) return;
    const id = selectedPet.instanceId;
    const next = favorites.includes(id)
      ? favorites.filter(entry => entry !== id) : [...favorites, id];
    if (favoriteStorage.setChecked(JSON.stringify(next))) {
      setFavorites(next);
      setResult(next.includes(id) ? 'Companion added to favorites.' : 'Companion removed from favorites.');
    } else setResult('Could not save favorite status.');
  };

  return <div className="axe-comp-root axe-comp-root--modern" data-progression-panel="companion">
    <div className="axe-comp-header">
      <Compass size={42} strokeWidth={1.2}/><h2>Companion</h2><span className="axe-comp-star">✧</span>
      <button type="button" className="axe-comp-header-favorite"
        aria-label={selectedPet
          ? (favorites.includes(selectedPet.instanceId) ? 'Unfavorite companion' : 'Favorite companion')
          : 'No companion selected'}
        disabled={!selectedPet} onClick={toggleFavorite} title="Favorite companion">
        <Star size={17} fill={selectedPet && favorites.includes(selectedPet.instanceId)
          ? 'currentColor' : 'none'}/>
      </button>
      <button type="button" className="axe-comp-header-close" data-service-close
        onClick={onClose} aria-label="Close Companion">×</button>
    </div>
    <div className="axe-comp-shell">
      <nav className="axe-comp-tabs" aria-label="Companion sections">
        <span className="axe-comp-key-hint">LB</span>
        {TABS.map(next => <button key={next} type="button" aria-pressed={tab === next}
          onClick={() => changeTab(next)}>{next === 'Imbuement' ? 'Imbue' : next}</button>)}
        <span className="axe-comp-key-hint">RB</span>
      </nav>
      <div className="axe-comp-modern">
        {tab === 'Equipment' ? <div className="axe-comp-equipment-shell">
          <nav className="axe-comp-equipment-subnav" aria-label="Companion equipment subpages">
            {EQUIPMENT_VIEWS.map(view => <button key={view.id} type="button"
              aria-pressed={equipmentView === view.id}
              onClick={() => changeEquipmentView(view.id)}>{view.label}</button>)}
          </nav>
          <div className="axe-comp-equipment-content" data-equipment-section={equipmentView}>
            {equipmentView === 'profile' ? <AXECompanionOverviewClone
              pets={pets} soul={soul} loadout={loadout} favorites={favorites}
              selectedPetId={selected} onSelectPet={setSelected}
              onNotice={setResult}
              onEquipment={kind => changeEquipmentView(kind === 'mount' ? 'mount' : 'companion')}
              bonuses={bonuses}/>
            : equipmentView === 'mastery' ? <AXECompanionMasteryPanel pets={pets}
              selectedPet={selectedPet}
              onSelectPet={id => { setSelected(id); setPending(null); setResult(''); }}
              onAction={onAction}/>
            : equipmentView === 'mount'
              ? <div className="axe-comp-mounts-pane" aria-label="Mount armory and advancement">
                  <MountSubTab />
                </div>
              : <AXEGlassLoadoutPane actor="companion" onNotice={setResult}/>}
          </div>
        </div> : <AXECompanionStylePane page={tab} onNotice={setResult} onPageChange={changeTab}/>}
      </div>
      {result && <div className="axe-comp-feedback" role="status" aria-live="polite">
        {result}
        {pending && <button type="button" onClick={() => { setPending(null); setResult(''); }}>Cancel</button>}
      </div>}
    </div>
  </div>;
}
