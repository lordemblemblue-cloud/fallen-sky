import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Check, Gem, Heart, Search, Shield, Sparkles, Swords, Wind } from 'lucide-react';
import { getAXEPetDefinition, AXE_PET_CONFIG, xpForAXEPetLevel } from '../progression/AXEPetSystem';
import { getAXEMountDefinition } from '../progression/AXEMountSystem';
import { getAXEMountState, subscribeAXEMounts, activateAXEMount } from '../progression/AXEMountStore';
import { getCompanionById } from '../../companionData';
import { registerAXEPet, summonAXEPet } from '../progression/AXEPetStore';
import './AXECompanionOverviewClone.css';

const CompanionPreview3D = lazy(() => import('../../equipment/CompanionPreview3D'));
const PROPERTY_NAMES = {hp:'HP', damage:'Attack', attack:'Attack', defense:'Defense', chi:'Spirit',
  dexterity:'Dexterity', critChance:'Crit Rate', speed:'Speed',
  attributionAttack:'Attribute Attack', attributionDefense:'Attribute Defense'};
const textValue = value => value == null ? '—' : typeof value === 'number'
  ? value.toLocaleString('en-US',{maximumFractionDigits:2}) : String(value);
const pretty = key => PROPERTY_NAMES[key] || String(key).replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase());

export default function AXECompanionOverviewClone({
  pets, soul, loadout, favorites, selectedPetId, onSelectPet, onNotice, onEquipment, bonuses,
}) {
  const [mounts,setMounts] = useState(getAXEMountState);
  const [showCollection,setShowCollection] = useState(false);
  const [collectionKind,setCollectionKind] = useState('mount');
  const [selectedMountId,setSelectedMountId] = useState(null);
  const [search,setSearch] = useState('');
  const [quickSearch,setQuickSearch] = useState('');
  useEffect(() => subscribeAXEMounts(setMounts), []);

  const allPets = pets.pets || [];
  const allMounts = mounts.mounts || [];
  const filteredPets=allPets.filter(pet=>{
    const name=getAXEPetDefinition(pet.definitionId)?.name||pet.definitionId;
    return !quickSearch||[name,pet.definitionId,pet.tierId]
      .filter(Boolean).join(' ').toLowerCase().includes(quickSearch.trim().toLowerCase());
  });
  const selectedPet = allPets.find(p=>p.instanceId===selectedPetId)
    || allPets.find(p=>p.instanceId===pets.activeRegisteredPetId)
    || allPets[0] || null;
  const selectedMount = allMounts.find(m=>m.instanceId===selectedMountId)
    || allMounts.find(m=>m.instanceId===mounts.activeMountId) || allMounts[0] || null;
  const isMount = showCollection && collectionKind==='mount';
  const entry = isMount ? selectedMount : selectedPet;
  const def = entry ? (isMount ? getAXEMountDefinition(entry.definitionId)
    : getAXEPetDefinition(entry.definitionId)) : null;
  const modelId = def?.modelRef && getCompanionById(def.modelRef) ? def.modelRef : null;
  const model = modelId ? getCompanionById(modelId) : null;
  const gear = modelId ? (loadout.gear?.[modelId] || {}) : {};
  const gearRows = (model?.gearSlots || []).map(slot=>[slot,gear[slot] || null]);
  const stats = entry?.bonuses || {};
  const statsRows = Object.entries(stats).filter(([,v])=>Number.isFinite(Number(v)));
  const selectedName = def?.name || entry?.definitionId || 'No companion selected';

  const visible = useMemo(() => {
    const source = collectionKind==='mount' ? allMounts : allPets;
    const term = search.trim().toLowerCase();
    return source.filter(item => !term || [
      item.definitionId,
      (collectionKind==='mount' ? getAXEMountDefinition(item.definitionId)
        : getAXEPetDefinition(item.definitionId))?.name,
      item.tierId,
    ].filter(Boolean).join(' ').toLowerCase().includes(term));
  },[allMounts, allPets,collectionKind,search]);

  const select = item => {
    if (collectionKind==='mount') setSelectedMountId(item.instanceId);
    else onSelectPet(item.instanceId);
  };
  const activate = () => {
    if (!entry) return;
    const result = isMount ? activateAXEMount(entry.instanceId) : summonAXEPet(entry.instanceId);
    onNotice(result?.ok ? (isMount?'Mount equipped.':'Companion summoned.')
      : (result?.message || pretty(result?.reason || 'Unable to equip')));
  };
  const register = () => {
    if (!selectedPet) return;
    const result = registerAXEPet(selectedPet.instanceId);
    onNotice(result?.ok ? 'Companion registered.' : (result?.message || pretty(result?.reason)));
  };

  return <div className="axe-comp-redesign" aria-label="Companion profile">
    <aside className="axe-comp-quick-list" aria-label="Owned companion quick select">
      <h3>My Companions <small>{allPets.length} owned</small></h3>
      <label className="axe-comp-quick-search"><Search size={15}/>
        <input type="search" aria-label="Search my companions" placeholder="Find companion"
          value={quickSearch} onChange={event=>setQuickSearch(event.target.value)}/>
      </label>
      <div className="axe-comp-quick-scroll">
        {filteredPets.map(pet => {
          const petDef = getAXEPetDefinition(pet.definitionId);
          const chosen = !isMount && selectedPet?.instanceId===pet.instanceId;
          return <button type="button" key={pet.instanceId}
            aria-pressed={chosen} onClick={()=>{onSelectPet(pet.instanceId);setCollectionKind('pet');setShowCollection(false);}}>
            <span className="axe-comp-quick-symbol">{favorites.includes(pet.instanceId)?'★':'✧'}</span>
            <span><strong>{petDef?.name || pet.definitionId}</strong>
              <small>Lv. {pet.level} · {pet.registered?'Registered':'Not registered'}</small></span>
            {chosen && <Check size={16}/>}
          </button>;
        })}
        {!allPets.length && <p>No owned companions.</p>}
        {!!allPets.length&&!filteredPets.length&&<p>No companions match your search.</p>}
      </div>
      <button className="axe-comp-mount-inventory-toggle" type="button" onClick={()=>{
        setShowCollection(value=>!value);setCollectionKind('mount');setSearch('');
      }}>{showCollection?'Back to Companion 3D':'Browse Companions & Mounts'}</button>
    </aside>

    <section className="axe-comp-profile-center" aria-label={showCollection?'Owned companions and mounts':'Companion 3D viewer'}>
      {showCollection ? <>
        <div className="axe-comp-collection-head">
          <div role="group" aria-label="Inventory type">
            <button type="button" aria-pressed={collectionKind==='pet'}
              onClick={()=>{setCollectionKind('pet');setSearch('');}}>Companions</button>
            <button type="button" aria-pressed={collectionKind==='mount'}
              onClick={()=>{setCollectionKind('mount');setSearch('');}}>Mounts</button>
          </div>
          <label className="axe-comp-collection-search"><Search size={15}/>
            <input aria-label="Search owned companions and mounts" type="search"
              value={search} placeholder="Search" onChange={e=>setSearch(e.target.value)}/>
          </label>
        </div>
        <div className="axe-comp-collection-grid">
          {visible.map(item => {
            const itemDef = collectionKind==='mount' ? getAXEMountDefinition(item.definitionId)
              : getAXEPetDefinition(item.definitionId);
            const active = collectionKind==='mount' ? mounts.activeMountId===item.instanceId
              : pets.summonedPetId===item.instanceId;
            const chosen = entry?.instanceId===item.instanceId;
            return <button type="button" key={item.instanceId} aria-pressed={chosen} onClick={()=>select(item)}>
              <span className="axe-comp-collection-symbol">{collectionKind==='mount'?'♞':'✧'}</span>
              <strong>{itemDef?.name || item.definitionId}</strong>
              <small>{collectionKind==='mount'?'Growth '+(item.growthPercent||0)+'%':'Lv. '+item.level}
                {active?' · Active':''}</small>
            </button>;
          })}
          {!visible.length && <p>No matching owned {collectionKind==='mount'?'mounts':'companions'}.</p>}
        </div>
      </> : <div className="axe-comp-profile-model">
        {modelId ? <Suspense fallback={<p>Loading companion model…</p>}>
          <CompanionPreview3D key={modelId} companionId={modelId}/>
        </Suspense> : <p>No compatible 3D model is available for this companion.</p>}
      </div>}
      {!showCollection && <div className="axe-comp-profile-caption">
        <strong>{selectedName}</strong><span>{entry?'3D companion preview':'No companion selected'}</span>
      </div>}
    </section>

    <aside className="axe-comp-profile-details" aria-label="Selected companion attributes and equipment">
      <header><h3>{selectedName}</h3><small>{isMount?'Mount Profile':'Companion Profile'}</small></header>
      <h4>Attributes</h4>
      <div className="axe-comp-profile-stats">
        {statsRows.map(([key,value])=><div key={key}><span>{pretty(key)}</span><strong>{textValue(value)}</strong></div>)}
        {!statsRows.length && <p>No recorded attribute bonuses.</p>}
      </div>
      <h4>Equipment</h4>
      {gearRows.length ? gearRows.map(([slot,id])=><div className="axe-comp-profile-item" key={slot}>
        <Shield size={15}/><span>{pretty(slot)}</span><strong>{id ? pretty(id) : 'Empty'}</strong>
      </div>) : <p>No supported gear slots for this model.</p>}
      <button type="button" className="axe-comp-profile-secondary" onClick={() => onEquipment(isMount ? 'mount' : 'companion')}>Manage Equipment</button>
      <h4>Progression</h4>
      {isMount ? <>
        <div className="axe-comp-profile-item"><Wind size={15}/><span>Growth</span><strong>{textValue(entry?.growthPercent)}%</strong></div>
        <div className="axe-comp-profile-item"><Wind size={15}/><span>Speed</span><strong>{entry?.speedMultiplier ? '×'+textValue(entry.speedMultiplier) : '—'}</strong></div>
        <div className="axe-comp-profile-item"><Swords size={15}/><span>Total XP</span><strong>{textValue(entry?.totalXp)}</strong></div>
        <div className="axe-comp-profile-item"><Gem size={15}/><span>Status</span><strong>{mounts.activeMountId===entry?.instanceId?'Active':'Inactive'}</strong></div>
      </> : <>
        <div className="axe-comp-profile-item"><Heart size={15}/><span>Level</span><strong>{entry?.level || 0} / {AXE_PET_CONFIG.maxLevel}</strong></div>
        <div className="axe-comp-profile-item"><Sparkles size={15}/><span>XP</span><strong>{textValue(entry?.xp)} / {entry?xpForAXEPetLevel(entry.level):'—'}</strong></div>
        <div className="axe-comp-profile-item"><Gem size={15}/><span>Over-Enchant</span><strong>{entry?.overEnchantPercent || 0}%</strong></div>
        <div className="axe-comp-profile-item"><Sparkles size={15}/><span>Fusion Bonus</span>
          <strong>{bonuses.fused ? '+'+Number(bonuses.allStatsPct||0).toFixed(1)+'%':'Inactive'}</strong></div>
        <div className="axe-comp-profile-item"><Sparkles size={15}/><span>Infusion</span>
          <strong>{Object.values(soul.infusion||{}).filter(value=>value===100).length}/4</strong></div>
      </>}
      <div className="axe-comp-profile-actions">
        {!isMount && entry && <button type="button" onClick={register}
          disabled={pets.activeRegisteredPetId===entry.instanceId}>
          {pets.activeRegisteredPetId===entry.instanceId?'Registered':'Register Stats'}</button>}
        <button type="button" onClick={activate} disabled={!entry ||
          (isMount ? mounts.activeMountId===entry?.instanceId : pets.summonedPetId===entry?.instanceId)}>
          {isMount ? mounts.activeMountId===entry?.instanceId?'Mount Equipped':'Select & Equip Mount'
            : pets.summonedPetId===entry?.instanceId?'Companion Summoned':'Select & Summon'}
        </button>
      </div>
    </aside>
  </div>;
}
