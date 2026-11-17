// Concept D weapon rail: real owned weapons, real buttons, no baked icons.
// The owner's actual first-image translucent raster sits BEHIND these live controls.
import { ChevronLeft, ChevronRight, Crosshair, Shield, Swords } from 'lucide-react';
import { getAXEWeaponHUDArtwork } from './AXECurvedWeaponTemplate';

const ROLE_ICONS={offensive:Swords,ranged:Crosshair,defensive:Shield};
const DISPLAY_ORDER=['offensive','ranged','defensive'];

export default function AXEConceptDWeaponTemplate({
  rows,getItem,activeId,wheelRef,
  onDraw,onCycle,onTouchStart,onTouchEnd,
}){
  const byRole=Object.fromEntries(rows.map(row=>[row.role,row]));
  return (
    <div className="jade-weapon-layout jade-concept-d-weapon-template"
      data-concept-d-weapon-rail="three-owned-roles"
      ref={wheelRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      aria-label="Concept D weapon selector; three real weapons, scroll to cycle">
      <div className="jade-concept-d-cycle" role="group"
        aria-label="Switch among three owned weapons">
        <button type="button" className="jade-concept-d-cycle-prev"
          aria-label="Previous equipped weapon" onClick={()=>onCycle(-1)}
          title="Previous weapon — left arrow or scroll up">
          <ChevronLeft size={19} aria-hidden="true"/>
        </button>
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
                onClick={event=>onDraw(role,event.shiftKey)} aria-pressed={active}
                aria-label={item?`Equip ${item.name} in ${row.label}`:`Equip a weapon for ${row.label}`}
                title={item?`${row.label}: ${item.name} · Shift-click to cycle owned weapons`:`${row.label}: click to equip an owned weapon`}>
                <Icon className="jade-concept-d-weapon-icon" size={25}
                  strokeWidth={1.65} aria-hidden="true"/>
                {artwork && <img className="jade-concept-d-weapon-image"
                  key={artwork} src={artwork} alt="" loading="lazy"
                  onError={event=>{event.currentTarget.style.display='none';}}/>}
              </button>
            </div>
          );
          })}
        </div>
        <button type="button" className="jade-concept-d-cycle-next"
          aria-label="Next equipped weapon" onClick={()=>onCycle(1)}
          title="Next weapon — right arrow or scroll down">
          <ChevronRight size={19} aria-hidden="true"/>
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
