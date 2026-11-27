import React, { useState } from 'react';
import { demonstrationCatalog, demonstrationClasses } from '../core/demonstrationCatalog.mjs';
import { keyLabel } from './bindings.mjs';
import './practiceDemonstration.css';

export default function PracticeDemonstration({open,onOpenChange,selection,onPlay,onStop,keys,disabled=false}) {
  const [classId,setClassId]=useState('duelist');
  const rows=demonstrationCatalog(classId);
  const shortcut=row=>{const command=({combo:'light',directional:'light',guard:'block',doubleJump:'jump',airDash:'dash'})[row.command]||row.command;return command && keys?.[command] ? keyLabel(keys[command],{short:true}):null;};
  const groups=[...new Set(rows.map(r=>r.group))];
  return <div className="duelist-demo" data-open={open}>
    <button className="duelist-demo-toggle" type="button" aria-expanded={open} aria-controls="duelist-demo-panel" disabled={disabled} onClick={()=>onOpenChange(!open)}>▶ Demonstrations</button>
    {open&&<section id="duelist-demo-panel" aria-label="Practice demonstrations" className="duelist-demo-panel">
      <header><span>TRAINING / DEMO</span><button type="button" onClick={()=>onOpenChange(false)} aria-label="Close demonstrations">×</button></header>
      <label>Class<select value={classId} onChange={e=>setClassId(e.target.value)}>{demonstrationClasses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      {selection&&<div className="duelist-demo-playing" role="status"><strong>Demo active</strong><button type="button" onClick={onStop}>Return to practice</button></div>}
      <div className="duelist-demo-list">
        {groups.map(group=><section key={group}><h3>{group}</h3>{rows.filter(r=>r.group===group).map(row=><div className="duelist-demo-row" key={row.id}>
          <div><strong>{row.name}</strong>{shortcut(row)&&<small>Input: {shortcut(row)}</small>}<small>{row.text}</small>{row.move?.cooldown>0&&<small>Base cooldown: {row.move.cooldown}s</small>}</div>
          {row.command&&<button type="button" aria-label={'Play '+row.name} title={'Play '+row.name} disabled={disabled} onClick={()=>onPlay({classId,id:row.id})}>▶</button>}
        </div>)}</section>)}
      </div>
      <small>Watch the real combat rules, then return to your practice session to try the move.</small>
    </section>}
  </div>;
}
