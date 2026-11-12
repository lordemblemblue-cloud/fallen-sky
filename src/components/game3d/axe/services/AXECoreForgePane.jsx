import { useEffect, useState } from 'react';
import { CircleDot, Gem, Shield, Sparkles } from 'lucide-react';
import {
  getAXECoreState, subscribeAXECores, registerAXECore, unregisterAXECore, upgradeAXECore,
} from '../progression/AXECoreStore';
import {
  AXE_CORE_CONFIG, getAXECoreDefinition, getAXECoreBonuses,
  xpForAXECoreLevel, addAXECoreXP,
} from '../progression/AXECoreSystem';
import './AXECoreForgePane.css';

const n = value => Number(value || 0).toLocaleString();
const formatStat = name => ({ hp:'HP',chi:'Spirit',damage:'Damage',defense:'Defense',
  critChance:'Critical Chance',critDamage:'Critical Damage',criticalDefense:'Critical Defense',
  attributeAttack:'Attribute Attack',attributeDefense:'Attribute Defense' })[name] || name;
const bonusRows = bonuses => Object.entries(bonuses || {}).filter(([,value])=>Number(value)>0);
const fmt = value => Math.round(Number(value || 0) * 100) / 100;

export default function AXECoreForgePane() {
  const [state,setState] = useState(getAXECoreState);
  const [selectedId,setSelectedId] = useState('');
  const [infusion,setInfusion] = useState(100);
  const [review,setReview] = useState(false);
  const [notice,setNotice] = useState('');
  useEffect(() => subscribeAXECores(setState),[]);
  const selected = state.cores.find(core => core.instanceId === selectedId) || state.cores[0] || null;
  const definition = selected ? getAXECoreDefinition(selected.definitionId) : null;
  const maximum = !!selected && selected.level >= AXE_CORE_CONFIG.maxLevel;
  const cost = infusion;
  const enough = state.essence >= cost;
  const current = selected ? getAXECoreBonuses(selected) : {};
  const next = selected && !maximum ? addAXECoreXP(selected, infusion) : null;
  const projected = next?.ok ? getAXECoreBonuses(next.core) : null;
  const needed = selected ? xpForAXECoreLevel(selected.level) : 0;
  const registered = state.cores.filter(core=>core.registered).length;

  const applyEnhancement = () => {
    setReview(false);
    if (!selected || maximum || !enough) return;
    const result=upgradeAXECore(selected.instanceId,{xpAmount:infusion,essencePerXP:1});
    setNotice(result.ok
      ? 'Core enhanced with '+infusion+' XP. '+(result.levelsGained ? result.levelsGained+' level(s) gained.' : 'Progress saved.')
      : (result.reason || 'Core enhancement unavailable.').replaceAll('_',' '));
  };
  const toggleRegistration = () => {
    if (!selected) return;
    const result=selected.registered ? unregisterAXECore(selected.instanceId) : registerAXECore(selected.instanceId);
    setNotice(result.ok ? (selected.registered?'Core unregistered.':'Core registered.') : (result.reason||'Registration failed.').replaceAll('_',' '));
  };

  return <section className="axe-core-forge" aria-label="Core forge">
    <section className="axe-core-owned" aria-label="Core inventory">
      <header><CircleDot size={17}/><h3>Inventory Core</h3><small>{state.cores.length} owned</small></header>
      <p>Only owned cores appear here. Choose a core to see its enhancement options.</p>
      <div className="axe-core-grid" role="list" aria-label="Owned core tiles">
        {state.cores.map(core => {
          const def=getAXECoreDefinition(core.definitionId);
          return <button key={core.instanceId} type="button" role="listitem"
            aria-pressed={selected?.instanceId===core.instanceId} title={def?.name || core.definitionId}
            onClick={()=>{setSelectedId(core.instanceId);setNotice('');setReview(false);}}>
            <CircleDot size={25}/><span>{def?.name||core.definitionId}</span>
            <small>Lv. {core.level}</small>
            {core.registered && <em>Active</em>}
          </button>;
        })}
        {!state.cores.length && <p>No cores owned.</p>}
      </div>
    </section>

    <div className="axe-core-center" aria-label="Selected core in forge">
      {selected ? <>
        <small>{definition?.rarity || 'Core'} · {definition?.specialty || 'Progression'}</small>
        <CircleDot size={54} strokeWidth={1.1} aria-hidden="true"/>
        <h3>{definition?.name||selected.definitionId}</h3>
        <p>Level {selected.level}</p>
      </> : <p>Select an owned core</p>}
    </div>

    <section className="axe-core-progression" aria-label="Core progression">
      <h3>Core Progression</h3>
      {selected ? <>
        <div className="axe-core-progression-row"><span>Level {selected.level} / {AXE_CORE_CONFIG.maxLevel}</span>
          <span>Evolution {selected.evolutionStage}</span></div>
        <div className="axe-core-xp-track"><i style={{width:(maximum?100:Math.min(100,100*selected.xp/Math.max(1,needed)))+'%'}}/></div>
        <div className="axe-core-progression-row"><span>{n(selected.xp)} XP</span>
          <span>{maximum?'Maximum Level':n(needed)+' next'}</span></div>
        <div className="axe-core-progression-row"><span>Registered Cores</span>
          <span>{registered} / {AXE_CORE_CONFIG.maxRegistered}</span></div>
      </> : <p>Select a core to view its progress.</p>}
    </section>

    <aside className="axe-core-details" aria-label="Core enhancement results">
      <small>CORE MATRIX</small><h3>{definition?.name || 'Core Enhancement'}</h3>
      <p>{definition ? 'Your owned '+definition.rarity+' core' : 'Select a core from Inventory Core.'}</p>
      <div className="axe-core-divider">Current Bonuses</div>
      {bonusRows(current).map(([stat,value])=><div key={stat} className="axe-core-row">
        <span>{formatStat(stat)}</span><b>+{fmt(value)}</b></div>)}
      {!selected && <p>No core selected.</p>}
      <div className="axe-core-divider">Enhancement Options</div>
      <div className="axe-core-options" role="group" aria-label="Core essence infusion amount">
        {[100,250,500].map(amount=><button type="button" key={amount} aria-pressed={infusion===amount}
          onClick={()=>{setInfusion(amount);setReview(false);}}>{amount} XP</button>)}
      </div>
      <div className="axe-core-row"><span>Essence Cost</span><b>{n(cost)}</b></div>
      <div className="axe-core-row"><span>Owned Essence</span><b>{n(state.essence)}</b></div>
      <div className="axe-core-divider">Projected Result</div>
      {projected ? bonusRows(projected).map(([stat,value])=><div key={stat} className="axe-core-row">
        <span>{formatStat(stat)}</span><b>{fmt(current[stat])} → {fmt(value)}</b></div>)
        : <p>{maximum?'Maximum core level reached.':'Choose a core to view the result.'}</p>}
      {selected && <button className="axe-core-register" type="button" onClick={toggleRegistration}>
        {selected.registered?'Unregister Core':'Register Core'}
      </button>}
      {notice && <p className="axe-core-notice" role="status">{notice}</p>}
    </aside>

    <button className="axe-core-enhance" type="button" disabled={!selected || maximum || !enough}
      onClick={()=>setReview(true)}><Sparkles size={17}/> Enhance Core</button>

    {review && <div className="axe-core-review-backdrop" role="presentation">
      <div className="axe-core-review" role="dialog" aria-modal="true" aria-label="Confirm core enhancement">
        <h3>Enhance {definition?.name}?</h3>
        <p>Infuse {n(infusion)} XP using {n(cost)} owned Core Essence? Your core's progression will update immediately.</p>
        <div><button type="button" onClick={()=>setReview(false)}>Cancel</button>
          <button type="button" onClick={applyEnhancement}>Confirm Enhance</button></div>
      </div>
    </div>}
  </section>;
}
