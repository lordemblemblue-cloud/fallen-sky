import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { PRACTICE_OPTIONS, PRACTICE_DEFAULTS, cleanPracticeSettings } from '../core/practiceSettings.mjs';
import './practiceSettings.css';

export function PracticeOptions({ value, onChange, onReset }) {
  const settings=cleanPracticeSettings(value);
  return <div className="duelist-training-options">
    {PRACTICE_OPTIONS.map(([id,label,description])=><label key={id} className="duelist-training-row">
      <span><strong>{label}</strong><small>{description}</small></span>
      <input type="checkbox" role="switch" checked={settings[id]} onChange={e=>onChange(id,e.target.checked)}/>
    </label>)}
    <button className="duelist-training-reset" type="button" onClick={()=>onReset?onReset():Object.entries(PRACTICE_DEFAULTS).forEach(([id,v])=>onChange(id,v))}>Restore training defaults</button>
  </div>;
}
export default function PracticeSettings({value,onChange,onReset,live=false,onOpenChange}) {
  const [open,setOpen]=useState(false);
  const toggle=()=>{
    if(live && document.pointerLockElement)document.exitPointerLock?.();
    setOpen(!open);onOpenChange?.(!open);
  };
  return <div className={'duelist-training-settings'+(live?' duelist-training-settings--live':'')}>
    <button type="button" className="duelist-training-trigger" aria-expanded={open} onClick={toggle}>
      <SlidersHorizontal size={17} aria-hidden="true"/> Training settings
    </button>
    {open&&<section className="duelist-training-glass" aria-label="Training settings">
      <header><span>PRACTICE ONLY</span><button type="button" aria-label="Close training settings" onClick={toggle}>×</button></header>
      <PracticeOptions value={value} onChange={onChange} onReset={onReset}/>
      <small className="duelist-training-note">{live?'Changes affect your current training seat only.':'Saved for your next practice session.'} No competitive progression.</small>
    </section>}
  </div>;
}
