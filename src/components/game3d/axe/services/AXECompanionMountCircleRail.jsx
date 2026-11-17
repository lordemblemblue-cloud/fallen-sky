import { Check, PawPrint } from 'lucide-react';
import { getAXEMountDefinition } from '../progression/AXEMountSystem';
import { getCompanionGrowthView } from '../progression/AXECompanionGrowthView.mjs';

// Companion Equipment and Mastery share the circular selector used by Variety
// and Imbue. Only *owned* mounts are shown; selecting a circle never mutates
// the active/registered mount or awards XP.
export default function AXECompanionMountCircleRail({
  mounts = [], selectedId = null, activeId = null, registeredId = null,
  onSelect = () => {}, label = 'My Companion',
}) {
  return <aside className="axe-app-rail axe-comp-circle-rail"
    aria-label={label} data-companion-roster-layout="circles">
    <div className="axe-app-rail-glyph axe-comp-circle-heading">
      <PawPrint size={20} aria-hidden="true"/>
      <small>{label}</small>
      <small className="axe-comp-circle-count">{mounts.length}</small>
    </div>
    <div className="axe-comp-circle-items" aria-label="Owned companion mounts">
      {mounts.map(mount => {
        const definition = getAXEMountDefinition(mount.definitionId);
        const name = definition?.name || String(mount.definitionId||'Mount').replaceAll('_',' ');
        const level = getCompanionGrowthView(mount.totalXp||0);
        const isActive = activeId === mount.instanceId;
        const isRegistered = registeredId === mount.instanceId;
        return <button key={mount.instanceId} type="button"
          className="axe-comp-circle-button"
          aria-label={'Select '+name+', level '+level.level+', '+(mount.growthPercent||0)+'% growth'+
            (isActive?', active riding mount':'')+(isRegistered?', registered stats':'')}
          aria-pressed={mount.instanceId===selectedId}
          title={name+' · Lv '+level.level+' · '+(mount.growthPercent||0)+'% growth'+
            (isActive?' · Active':'')+(isRegistered?' · Registered':'')}
          onClick={()=>onSelect(mount.instanceId)}>
          <span className="axe-comp-circle-symbol" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
          {isActive&&<Check className="axe-comp-circle-check" size={13} aria-hidden="true"/>}
          <span className="axe-app-rail-name">{name}</span>
        </button>;
      })}
      {!mounts.length&&<small className="axe-comp-circle-empty">No mounts</small>}
    </div>
  </aside>;
}
