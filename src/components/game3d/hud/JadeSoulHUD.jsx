import { useCallback, useEffect, useRef, useState } from 'react';
import { getPlayerHUD, subscribePlayerHUD } from '../playerHUDStore';
import { getCombatResources, subscribeCombatResources } from '../combat/combatResourcesStore';
import { ACTIVE_SLOTS, getLoadout, subscribeLoadout } from '../skills/loadoutStore';
import { getSkillById } from '../skills/skillRegistry';
import { subscribePlayerPosition } from '../playerPositionStore';
import {
  getAXEWeaponAffinityState,
  subscribeAXEWeaponAffinity,
  quickSwitchAXEWeapon,
} from '../axe/weapons/AXEWeaponAffinityStore';
import {
  getActiveEquippedAXEWeapon,
  getAXEEquipmentItem,
  subscribeAXEEquipmentInventory,
} from '../axe/equipment/AXEEquipmentInventoryStore';
import './JadeSoulHUD.css';
import AXEServicesNavigation from '../axe/services/AXEServicesNavigation';
import HUDCompassStrip from './HUDCompassStrip';
import TargetDisplay from './TargetDisplay';
import JadeQuestTracker from './JadeQuestTracker';
import AXEWorldMapOverlay from './AXEWorldMapOverlay';
import LunarCaveMinimap from './LunarCaveMinimap';
import AstralMinimap from './AstralMinimap';
import { createPortal } from 'react-dom';

// Purpose-built UI, not a screenshot painted over the 3D world.
// All values are read from Game 3D's own stores; the picture's sample numbers
// and weapon drawings must never be treated as real equipment or player stats.
const clamp01 = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const ratio = (value, max) => Number(max) > 0 ? clamp01(Number(value) / Number(max)) : 0;
const fmt = (n) => Math.max(0, Math.floor(Number(n) || 0)).toLocaleString('en-US');
const placements = [
  { id: 'top', order: -1, label: 'Previous weapon' },
  { id: 'active', order: 0, label: 'Equipped weapon' },
  { id: 'bottom', order: 1, label: 'Next weapon' },
];

const SKILL_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const SKILL_ARC_RISE = [10, 7, 0, -11, -24];

function SkillMatrix({ loadout }) {
  // Real 10-slot loadout and 1–9/0 controls; only the visual positions change.
  // Each five-slot bank rises toward the back-right edge of the screen.
  return (
    <div className="jade-ability-matrix" role="group" aria-label="Combat skills, keys 1 through 9 and 0">
      {Array.from({ length: ACTIVE_SLOTS }, (_, index) => {
        const id = loadout?.activeSlots?.[index];
        const skill = id ? getSkillById(id) : null;
        const cd = Math.max(0, Number(loadout?.cooldowns?.[index]) || 0);
        const label = skill?.skill_name || id || 'Empty';
        const icon = typeof skill?.icon === 'string' && skill.icon.length <= 6 ? skill.icon : '✦';
        const buff = index >= 5;
        const key = SKILL_KEYS[index];
        return (
          <div key={index}
            className={`jade-skill-slot jade-skill-slot--${buff ? 'buff' : 'combat'}`}
            data-slot={index + 1} data-equipped={id ? 'yes' : 'no'}
            style={{ '--jade-arc-rise': `${SKILL_ARC_RISE[index % 5]}px` }}
            title={`Key ${key}: ${label}${cd > 0 ? ` — cooldown ${cd.toFixed(1)} s` : ''}`}
            role="img" aria-label={`Key ${key}: ${label}`}>
            <span className="jade-skill-face" aria-hidden="true">
              {skill && <span className="jade-skill-glyph">{icon}</span>}
            </span>
            <span className="jade-skill-key" aria-hidden="true">{key}</span>
            {cd > 0 && <span className="jade-skill-cooldown" aria-hidden="true">{Math.ceil(cd)}</span>}
          </div>
        );
      })}
    </div>
  );
}

function WeaponStack({ playerLevel }) {
  const [affinity, setAffinity] = useState(getAXEWeaponAffinityState);
  const [, refreshInventory] = useState(0);
  const [notice, setNotice] = useState('');
  const arrowTouch = useRef(null);

  useEffect(() => subscribeAXEWeaponAffinity(setAffinity), []);
  useEffect(() => subscribeAXEEquipmentInventory(() => refreshInventory(n => n + 1)), []);

  const quickIds = affinity?.quickSlots || [];
  const active = getActiveEquippedAXEWeapon();
  const currentIndex = quickIds.findIndex(id => id && id === active?.instanceId);
  const names = quickIds.map(id => id ? getAXEEquipmentItem(id)?.name || 'Unassigned' : 'Unassigned');
  const previousName = names[(currentIndex + quickIds.length - 1) % quickIds.length] || 'Unassigned';
  const nextName = names[(currentIndex + 1) % quickIds.length] || 'Unassigned';

  const cycleWeapon = useCallback((direction) => {
    const ids = getAXEWeaponAffinityState().quickSlots || [];
    const equipped = getActiveEquippedAXEWeapon();
    if (!ids.some(Boolean)) {
      setNotice('Assign quick-slot weapons in Character Hub → Weapon Mastery');
      return;
    }
    const selected = ids.findIndex(id => id && id === equipped?.instanceId);
    let target = selected < 0
      ? (direction < 0 && ids[1] ? 1 : ids[0] ? 0 : 1)
      : (selected + (direction > 0 ? 1 : ids.length - 1)) % ids.length;
    if (!ids[target]) target = ids.findIndex(Boolean);
    const response = quickSwitchAXEWeapon(target, { level: playerLevel || 1 });
    setNotice(response.ok ? '' : response.reason?.replace(/_/g, ' ') || 'Weapon unavailable');
  }, [playerLevel]);

  return (
    <div className="jade-weapon-position" aria-label="Weapon quick selector">
      <div className="jade-weapon-layout" onWheel={e => {
        e.stopPropagation();
        e.preventDefault();
        if (Math.abs(e.deltaY) > 2) cycleWeapon(e.deltaY > 0 ? 1 : -1);
      }} onTouchStart={e => { arrowTouch.current = e.touches[0]?.clientY ?? null; }}
        onTouchEnd={e => {
          const start = arrowTouch.current;
          arrowTouch.current = null;
          if (start !== null && e.changedTouches[0] && Math.abs(e.changedTouches[0].clientY - start) > 24) {
            cycleWeapon(e.changedTouches[0].clientY < start ? 1 : -1);
          }
        }}>
        <div className="jade-weapon-c-arc" aria-hidden="true" />
        <div className="jade-weapon-stack">
          {placements.map(slot => (
            <button type="button" key={slot.id}
              className={`jade-weapon-card jade-weapon-card--${slot.id}`}
              title={slot.id === 'active'
                ? `${active?.name || 'No weapon equipped'} — scroll or click to switch`
                : (slot.order < 0 ? previousName : nextName)}
              aria-label={slot.id === 'active' ? `Current: ${active?.name || 'Unarmed'}. Select next weapon` : slot.label}
              onClick={() => cycleWeapon(slot.order < 0 ? -1 : 1)}>
              <span className="jade-weapon-card-inner" aria-hidden="true" />
              {/* Slots deliberately have no baked weapon art: real equipment owns the art. */}
            </button>
          ))}
        </div>
      </div>
      {notice && <div className="jade-weapon-notice" role="status">{notice}</div>}
    </div>
  );
}

function Compass({region='wolfveil',hideTarget=false}) {
  const arrowRef = useRef(null);
  useEffect(() => subscribePlayerPosition(position => {
    // The empty radar face is intentional. Facing is read from the game world,
    // rather than displaying an unrelated screenshot's static map.
    if (arrowRef.current) {
      arrowRef.current.style.transform = `translate(-50%, -50%) rotate(${(Number(position.yaw) || 0)}rad)`;
    }
  }), []);
  return (
    <div className="jade-compass-block">
      <button type="button" className="jade-compass" aria-label="Open world map"
        title="Open full world map" onClick={() => window.dispatchEvent(new CustomEvent('axeOpenWorldMap'))}>
        {region==='lunar-cave'?<LunarCaveMinimap />:region==='astral-dungeon'?<AstralMinimap />:<div className="jade-compass-grid" aria-hidden="true" />}
        {['N', 'E', 'S', 'W'].map(d => <span key={d} className={`jade-compass-point jade-compass-point--${d.toLowerCase()}`}>{d}</span>)}
        <span className="jade-compass-needle" ref={arrowRef} aria-hidden="true">
          <svg viewBox="0 0 28 40" width="23" height="34" fill="none" aria-hidden="true">
            <path d="M14 2 L25 32 L14 25 L3 32 Z" fill="#039eea" stroke="#9af1ff" strokeWidth="2"/>
            <path d="M14 2 V25 L3 32 Z" fill="#a4efff" opacity=".9"/>
          </svg>
        </span>
      </button>
      {!hideTarget && <TargetDisplay />}
    </div>
  );
}

export default function JadeSoulHUD({
  onOpenServices,
  serviceMode = false,
  servicesExpanded,
  activeServiceGroup = null,
  region = 'wolfveil',
  onToggleServices,
  onSelectServiceGroup,
}) {
  const [hud, setHud] = useState(getPlayerHUD);
  const [resources, setResources] = useState(getCombatResources);
  const [loadout, setLoadout] = useState(getLoadout);
  const [localExpanded, setLocalExpanded] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const navigationHidden = serviceMode || (servicesExpanded ?? localExpanded);
  useEffect(() => {
    const open = () => {
      if (navigationHidden) return;
      document.exitPointerLock?.();
      window.__axeWorldMapOpen = true;
      window.dispatchEvent(new CustomEvent('axeWorldMapOpened'));
      setMapOpen(true);
    };
    window.addEventListener('axeOpenWorldMap', open);
    return () => window.removeEventListener('axeOpenWorldMap', open);
  }, [navigationHidden]);
  useEffect(() => { if (navigationHidden) setMapOpen(false); }, [navigationHidden]);
  useEffect(() => {
    window.__axeWorldMapOpen = mapOpen;
    return () => { window.__axeWorldMapOpen = false; };
  }, [mapOpen]);
  useEffect(() => subscribePlayerHUD(setHud), []);
  useEffect(() => subscribeCombatResources(setResources), []);
  useEffect(() => subscribeLoadout(setLoadout), []);

  const hpPct = ratio(hud?.hp, hud?.maxHP) * 100;
  // Real spendable Will follows the derived Chi capacity; stamina has its own
  // combat pool. The capacity stat is NOT mistaken for a live balance.
  const maxWill = resources.maxWill;
  const currentWill = resources.will;
  const willPct = ratio(currentWill, maxWill) * 100;
  const staminaPct = ratio(resources.stamina, resources.maxStamina) * 100;
  const hasFiniteXP = Number.isFinite(hud?.xpForNext) && hud.xpForNext > 0;
  const xpPct = hasFiniteXP ? ratio(hud.xp, hud.xpForNext) * 100 : 100;

  return (
    <div className="jade-hud" data-testid="game3d-jade-default-hud" data-service-mode={serviceMode ? 'true' : 'false'}>
      <div className="jade-status" aria-label="Character status">
        <div className="jade-status-portrait" aria-hidden="true" />
      </div>

      {/* Original HP and Will tanks, relocated directly above the EXP rail. */}
      <div className="jade-status-bars">
        <div className="jade-status-row">
          <div className="jade-status-header"><span>HP</span><span>{fmt(hud?.hp)} / {fmt(hud?.maxHP)}</span></div>
          <div className="jade-status-track"><div className="jade-status-fill jade-status-fill--hp" style={{ width: `${hpPct}%` }}/></div>
        </div>
        <div className="jade-status-row">
          <div className="jade-status-header"><span>WILL</span><span>{fmt(currentWill)} / {fmt(maxWill)}</span></div>
          <div className="jade-status-track"><div className="jade-status-fill jade-status-fill--will" style={{ width: `${willPct}%` }}/></div>
        </div>
        <div className="jade-status-row jade-status-row--stamina" aria-label={`Stamina ${fmt(resources.stamina)} of ${fmt(resources.maxStamina)}`}>
          <div className="jade-status-header"><span>STAMINA</span><span>{fmt(resources.stamina)} / {fmt(resources.maxStamina)}</span></div>
          <div className="jade-status-track"><div className="jade-status-fill jade-status-fill--stamina" style={{ width: `${staminaPct}%` }}/></div>
        </div>
      </div>

      <Compass region={region} hideTarget={navigationHidden} />
      {!navigationHidden && <HUDCompassStrip region={region} />}
      {!navigationHidden && <JadeQuestTracker
        onOpenLogbook={() => onSelectServiceGroup?.('quest_logbook')} />}
      <AXEServicesNavigation
        expanded={servicesExpanded ?? localExpanded}
        serviceMode={serviceMode}
        activeGroup={activeServiceGroup}
        onToggle={onToggleServices || (() => { if (!serviceMode) setLocalExpanded((value) => !value); })}
        onSelectGroup={onSelectServiceGroup || (() => onOpenServices?.())}
      />
      <div className="jade-combat-hud" aria-hidden={serviceMode || undefined} inert={serviceMode ? '' : undefined}>
      <WeaponStack playerLevel={hud?.level} />
      <SkillMatrix loadout={loadout}/>

      <div className="jade-xp"
        role="progressbar" aria-label={`Level ${hud?.level || 1} experience`}
        aria-valuemin={0} aria-valuemax={hasFiniteXP ? hud.xpForNext : 100}
        aria-valuenow={hasFiniteXP ? Math.min(hud.xpForNext, Math.max(0, Number(hud?.xp) || 0)) : 100}
        title={`XP ${fmt(hud?.xp)} / ${hasFiniteXP ? fmt(hud.xpForNext) : 'MAX'}`}>
        <span className="jade-xp-label">XP</span>
        <div className="jade-xp-rail" aria-hidden="true">
          <span className="jade-xp-track">
            <span className="jade-xp-fill" style={{ width: `${xpPct}%` }}/>
          </span>
          {[18, 35, 65, 82].map((pct, index) => (
            <span key={index} className={`jade-xp-pip jade-xp-pip--${index % 2 ? 'diamond' : 'dot'}`}
              style={{ left: `${pct}%` }}/>
          ))}
          <span className="jade-xp-center">
            <span>{hasFiniteXP
              ? (hud.xpForNext > 9999 ? `${Math.round(xpPct)}%` : `${fmt(hud.xp)} / ${fmt(hud.xpForNext)}`)
              : 'MAX'}</span>
          </span>
        </div>
        <span className="jade-xp-level">LV. {fmt(hud?.level || 1)}</span>
      </div>
      </div>
      {mapOpen && !navigationHidden && createPortal(<AXEWorldMapOverlay region={region} onClose={() => setMapOpen(false)} />, document.body)}
    </div>
  );
}
