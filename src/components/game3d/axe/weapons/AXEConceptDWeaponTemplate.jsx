// Concept D weapon rail: real owned weapons, real buttons, no baked icons.
// The separate SVG backdrop carries ONLY the gray ink splash and gold angle.
import { ArrowDown, ArrowUp, Crosshair, Settings2, Shield, Star, Swords } from 'lucide-react';
import { getAXEWeaponHUDArtwork } from './AXECurvedWeaponTemplate';

const ROLE_ICONS={offensive:Swords,ranged:Crosshair,defensive:Shield};
const DISPLAY_ORDER=['offensive','ranged','defensive'];

export default function AXEConceptDWeaponTemplate({
  rows,getItem,activeId,assigning,wheelRef,
  onDraw,onAssign,onCycle,onFavorite,onTouchStart,onTouchEnd,
}){
  const byRole=Object.fromEntries(rows.map(row=>[row.role,row]));
  return (
    <div className="jade-weapon-layout jade-concept-d-weapon-template"
      data-concept-d-weapon-rail="three-owned-roles"
      ref={wheelRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      aria-label="Concept D weapon selector; three real weapons, scroll to cycle">
      <div className="jade-concept-d-rail" role="group" aria-label="Weapon quick slots">
        {DISPLAY_ORDER.map(role=>{
          const row=byRole[role];if(!row)return null;
          const item=getItem(role);
          const Icon=ROLE_ICONS[role];
          const artwork=getAXEWeaponHUDArtwork(item);
          const active=Boolean(item && item.instanceId===activeId);
          return (
            <div className="jade-concept-d-role" key={role}
              data-role={role} data-active={active?'true':'false'}>
              <button type="button" className="jade-concept-d-weapon-circle"
                onClick={()=>onDraw(role)} aria-pressed={active}
                aria-label={item?`Equip ${item.name} in ${row.label}`:`Choose weapon for ${row.label}`}
                title={item?`${row.label}: ${item.name}`:`${row.label}: no weapon assigned`}>
                <Icon className="jade-concept-d-weapon-icon" size={25}
                  strokeWidth={1.65} aria-hidden="true"/>
                {artwork && <img className="jade-concept-d-weapon-image"
                  src={artwork} alt="" loading="lazy"
                  onError={event=>{event.currentTarget.style.display='none';}}/>}
              </button>
              <button type="button" className="jade-concept-d-assign"
                aria-label={`Assign owned weapon to ${row.label}`}
                aria-expanded={assigning===role}
                title={`Change ${row.label} weapon`}
                onClick={()=>onAssign(role)}>
                <Settings2 size={13} aria-hidden="true"/>
              </button>
            </div>
          );
        })}
      </div>
      <div className="jade-concept-d-cycle" role="group" aria-label="Weapon cycling controls">
        <button type="button" aria-label="Previous equipped weapon"
          onClick={()=>onCycle(-1)} title="Previous weapon — left arrow or scroll up">
          <ArrowUp size={13} aria-hidden="true"/>
        </button>
        <button type="button" aria-label="Next equipped weapon"
          onClick={()=>onCycle(1)} title="Next weapon — right arrow or scroll down">
          <ArrowDown size={13} aria-hidden="true"/>
        </button>
        <button type="button" aria-label="Draw favorite weapon"
          onClick={onFavorite} title="Favorite weapon — up arrow">
          <Star size={13} aria-hidden="true"/>
        </button>
      </div>
      {/* Q remains the real crouch key in GameWorld3D; weapon selection
          uses clickable circles, wheel, arrows and Shift+C instead. */}
      <kbd className="jade-concept-d-q-key"
        title="Q: crouch (weapon switching uses scroll, arrows or Shift+C)"
        aria-label="Q key: crouch">Q</kbd>
    </div>
  );
}
