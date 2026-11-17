import { useCallback, useEffect, useRef, useState } from 'react';
import { Footprints } from 'lucide-react';
import { getPlayerHUD, subscribePlayerHUD } from '../playerHUDStore';
import { getCombatResources, subscribeCombatResources } from '../combat/combatResourcesStore';
import { ACTIVE_SLOTS, getLoadout, subscribeLoadout } from '../skills/loadoutStore';
import { getSkillById } from '../skills/skillRegistry';
import { subscribePlayerPosition } from '../playerPositionStore';
import { getActiveEquippedAXEWeapon, subscribeAXEEquipmentInventory } from '../axe/equipment/AXEEquipmentInventoryStore';
import { inferAXEWeaponRole } from '../axe/weapons/AXEWeaponIdentity';
import {
  AXE_HUD_WEAPON_ROLES, roleForCycle,
} from '../axe/weapons/AXEWeaponRoleSlots.mjs';
import {
  getAXERoleWeapon, getOwnedWeaponsForAXERole,
  drawAXEHUDWeaponRole, assignAXEHUDWeaponRole, subscribeAXEHUDWeaponRoles,
} from '../axe/weapons/AXEWeaponRoleSlots.js';
import { subscribeCharacterChange } from '../characterStorage';
import AXECurvedWeaponTemplate from '../axe/weapons/AXECurvedWeaponTemplate';
import './JadeSoulHUD.css';
import AXEServicesNavigation from '../axe/services/AXEServicesNavigation';
import HUDCompassStrip from './HUDCompassStrip';
import TargetDisplay from './TargetDisplay';
import JadeQuestTracker from './JadeQuestTracker';
import AXEWorldMapOverlay from './AXEWorldMapOverlay';
import LunarCaveMinimap from './LunarCaveMinimap';
import AstralMinimap from './AstralMinimap';
import WolfveilMinimap from './WolfveilMinimap';
import { createPortal } from 'react-dom';

// Purpose-built UI, not a screenshot painted over the 3D world.
// All values are read from Game 3D's own stores; the picture's sample numbers
// and weapon drawings must never be treated as real equipment or player stats.
const clamp01 = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const ratio = (value, max) => Number(max) > 0 ? clamp01(Number(value) / Number(max)) : 0;
const fmt = (n) => Math.max(0, Math.floor(Number(n) || 0)).toLocaleString('en-US');
const ROLE_TITLES = { offensive: 'Damage', defensive: 'Defense', ranged: 'Ranged' };

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
  const [, refresh] = useState(0);
  const [assigning, setAssigning] = useState(null);
  const [notice, setNotice] = useState('');
  const wheelRef = useRef(null);
  const wheelAt = useRef(0);
  const touchY = useRef(null);
  const activeRoleRef = useRef(null);

  useEffect(() => subscribeAXEHUDWeaponRoles(() => refresh(n=>n+1)), []);
  useEffect(() => subscribeAXEEquipmentInventory(() => refresh(n=>n+1)), []);
  useEffect(() => subscribeCharacterChange(() => {setAssigning(null);setNotice('');activeRoleRef.current=null;}), []);
  useEffect(() => {
    if(!notice)return;
    const timer=setTimeout(()=>setNotice(''),2800);
    return ()=>clearTimeout(timer);
  },[notice]);

  const active=getActiveEquippedAXEWeapon();
  const performDraw=useCallback(role=>{
    const item=getAXERoleWeapon(role);
    if(!item){
      setAssigning(role);
      setNotice(getOwnedWeaponsForAXERole(role).length
        ? `Choose a weapon for the ${ROLE_TITLES[role]} slot`
        : 'No weapons in your inventory yet');
      return false;
    }
    const result=drawAXEHUDWeaponRole(role,{level:playerLevel||1});
    if(result.ok){
      setAssigning(null);
      activeRoleRef.current=role;
      setNotice(`${ROLE_TITLES[role]} · ${result.item?.name||item.name}`);
    } else {
      setNotice(result.message||result.reason?.replace(/_/g,' ')||'Weapon unavailable');
    }
    return result.ok === true;
  },[playerLevel]);

  const assignAndDraw=useCallback((role,id)=>{
    const result=assignAXEHUDWeaponRole(role,id);
    if(!result.ok){
      setNotice(result.reason?.replace(/_/g,' ')||'Cannot assign weapon');
      return;
    }
    performDraw(role);
  },[performDraw]);

  const cycleAvailable=useCallback(direction=>{
    const roles=AXE_HUD_WEAPON_ROLES.map(row=>row.role);
    const activeId=getActiveEquippedAXEWeapon()?.instanceId;
    // An assigned slot can contain ANY owned weapon. Remember which panel
    // actually drew it instead of inferring a role from the weapon family.
    let nextRole=(activeRoleRef.current &&
      getAXERoleWeapon(activeRoleRef.current)?.instanceId===activeId)
      ? activeRoleRef.current
      : (roles.find(role=>getAXERoleWeapon(role)?.instanceId===activeId) ||
        inferAXEWeaponRole(getActiveEquippedAXEWeapon()));
    for(let i=0;i<roles.length;i++){
      nextRole=roleForCycle(roles,nextRole,direction);
      if(getAXERoleWeapon(nextRole) && performDraw(nextRole))
        return true;
    }
    setNotice('Assign one of your owned weapons to a slot to switch');
    return false;
  },[performDraw]);

  useEffect(()=>{
    const el=wheelRef.current;
    if(!el)return undefined;
    const onWheel=e=>{
      if(e.ctrlKey||e.metaKey||Math.abs(e.deltaX)>=Math.abs(e.deltaY)||Math.abs(e.deltaY)<2)return;
      e.preventDefault();
      e.stopPropagation();
      const now=performance.now();
      if(now-wheelAt.current<180)return;
      wheelAt.current=now;
      cycleAvailable(e.deltaY>0?1:-1);
    };
    el.addEventListener('wheel',onWheel,{passive:false});
    return ()=>el.removeEventListener('wheel',onWheel);
  },[cycleAvailable]);

  const drawFavorite=useCallback(()=>{
    if(getAXERoleWeapon('offensive'))performDraw('offensive');
    else cycleAvailable(1);
  },[performDraw,cycleAvailable]);

  // ArrowLeft / ArrowRight cycle available user-assigned panels. ArrowUp
  // selects the primary/favorite (Damage) panel. Shift+C stays supported;
  // plain C belongs to Character/Stats, 1–0 stay combat skills.
  // Never consume input while typing or navigating services/maps/dialogs.
  useEffect(()=>{
    const handler=e=>{
      if(e.repeat||e.defaultPrevented||e.ctrlKey||e.altKey||e.metaKey||
        window.__axeServiceModeOpen||window.__axeWorldMapOpen||
        window.__axePauseMenuOpen||window.__axeUiModalOpen||window.__axeDialogueOpen||
        e.target?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName||''))return;
      const key=e.code;
      if(key!=='ArrowLeft' && key!=='ArrowRight' && key!=='ArrowUp' &&
        !(key==='KeyC' && e.shiftKey))return;
      if(e.shiftKey && key!=='KeyC')return;
      e.preventDefault();
      if(key==='ArrowLeft')cycleAvailable(-1);
      else if(key==='ArrowRight'||key==='KeyC')cycleAvailable(1);
      else drawFavorite();
    };
    window.addEventListener('keydown',handler);
    return ()=>window.removeEventListener('keydown',handler);
  },[cycleAvailable,drawFavorite]);

  return (
    <div className="jade-weapon-position" aria-label="Three weapon roles: damage, defense, ranged">
      <AXECurvedWeaponTemplate
        rows={AXE_HUD_WEAPON_ROLES}
        getItem={getAXERoleWeapon}
        activeId={active?.instanceId}
        assigning={assigning}
        wheelRef={wheelRef}
        onDraw={performDraw}
        onAssign={role=>setAssigning(current=>current===role?null:role)}
        onCycle={cycleAvailable}
        onFavorite={drawFavorite}
        onTouchStart={e=>{touchY.current=e.touches[0]?.clientY??null;}}
        onTouchEnd={e=>{
          const start=touchY.current;
          touchY.current=null;
          if(start!==null && e.changedTouches[0] &&
            Math.abs(e.changedTouches[0].clientY-start)>24)
            cycleAvailable(e.changedTouches[0].clientY<start?1:-1);
        }}
      />
      {assigning && <div className="jade-weapon-chooser" role="group"
        aria-label={`Assign a ${ROLE_TITLES[assigning]} weapon`}>
        <div className="jade-weapon-chooser-title">
          <span>Choose weapon · {ROLE_TITLES[assigning]}</span>
          <button type="button" onClick={()=>setAssigning(null)} aria-label="Close weapon assignment">×</button>
        </div>
        {getOwnedWeaponsForAXERole(assigning).length
          ? getOwnedWeaponsForAXERole(assigning).map(item=>
            <button type="button" key={item.instanceId}
              onClick={()=>assignAndDraw(assigning,item.instanceId)}>{item.name}</button>)
          : <p>No owned weapons yet.</p>}
      </div>}
      {notice && <div className="jade-weapon-notice" role="status">{notice}</div>}
    </div>
  );
}

function Compass({region='wolfveil',hideTarget=false}) {
  const arrowRef = useRef(null);
  useEffect(() => subscribePlayerPosition(position => {
    // Facing is read from the game world. Wolfveil's radar draws the real
    // terrain/roads/zones (WolfveilMinimap), never an unrelated screenshot.
    if (arrowRef.current) {
      arrowRef.current.style.transform = `translate(-50%, -50%) rotate(${(Number(position.yaw) || 0)}rad)`;
    }
  }), []);
  return (
    <div className="jade-compass-block">
      <button type="button" className="jade-compass" aria-label="Open world map"
        title="Open full world map" onClick={() => window.dispatchEvent(new CustomEvent('axeOpenWorldMap'))}>
        {region==='lunar-cave'?<LunarCaveMinimap />:region==='astral-dungeon'?<AstralMinimap />:
          region==='wolfveil'?<WolfveilMinimap />:<div className="jade-compass-grid" aria-hidden="true" />}
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
  // The near-player stamina ring is contextual: show it when stamina is spent,
  // then let it fade instead of filling the permanent HUD with a third tank.
  const [staminaVisible, setStaminaVisible] = useState(false);
  const previousStamina = useRef(resources.stamina);
  const staminaFadeTimer = useRef(null);
  const staminaAnchorRef = useRef(null);
  const navigationHidden = serviceMode || (servicesExpanded ?? localExpanded);
  useEffect(() => {
    const open = event => {
      // The M shortcut can switch directly from another service to the map.
      // Expanded Services navigation by itself must not block opening the map.
      if (serviceMode && !event?.detail?.force) return;
      document.exitPointerLock?.();
      window.__axeWorldMapOpen = true;
      window.dispatchEvent(new CustomEvent('axeWorldMapOpened'));
      setMapOpen(true);
    };
    const close = () => {
      window.__axeWorldMapOpen = false;
      setMapOpen(false);
    };
    window.addEventListener('axeOpenWorldMap', open);
    window.addEventListener('axeCloseWorldMap', close);
    return () => {
      window.removeEventListener('axeOpenWorldMap', open);
      window.removeEventListener('axeCloseWorldMap', close);
    };
  }, [serviceMode]);
  useEffect(() => { if (serviceMode) setMapOpen(false); }, [serviceMode]);
  useEffect(() => {
    window.__axeWorldMapOpen = mapOpen;
    return () => { window.__axeWorldMapOpen = false; };
  }, [mapOpen]);
  useEffect(() => subscribePlayerHUD(setHud), []);
  useEffect(() => subscribeCombatResources(setResources), []);
  useEffect(() => subscribeLoadout(setLoadout), []);
  useEffect(() => {
    const previous = previousStamina.current;
    previousStamina.current = resources.stamina;
    if (Number.isFinite(previous) && Number(resources.stamina) < previous - 0.05) {
      setStaminaVisible(true);
      clearTimeout(staminaFadeTimer.current);
      staminaFadeTimer.current = setTimeout(() => setStaminaVisible(false), 1950);
    }
  }, [resources.stamina]);
  useEffect(() => () => clearTimeout(staminaFadeTimer.current), []);
  // Publish pixel-free percentages from the real camera projection, not a
  // fixed guess about where the avatar sits on different aspect ratios.
  // Mutating the decorative element avoids a React render every world frame.
  useEffect(() => subscribePlayerPosition(position => {
    const node = staminaAnchorRef.current;
    if (!node) return;
    const valid = position?.screenVisible &&
      Number.isFinite(position.screenX) && Number.isFinite(position.screenY);
    node.style.visibility = valid ? 'visible' : 'hidden';
    if (!valid) return;
    node.style.left = Math.max(10, Math.min(88, position.screenX + 10)) + '%';
    node.style.top = Math.max(16, Math.min(76, position.screenY - 7)) + '%';
  }), []);

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
      {/* Clone HUD has no ornamental top-left circle. Retain the status anchor
          for Services layout measurements without mounting a visible portrait. */}
      <div className="jade-status" aria-label="Character status" />

      {/* Same live HP and Will ledgers, visually balanced around the compact
          Agent experience octagon. The weapon selector and skills are intact. */}
      <div className="jade-status-bars jade-status-bars--refined" aria-label="Player HP and Will">
        <div className="jade-status-row jade-status-row--hp">
          <div className="jade-status-header">
            <span>♡ &nbsp; HP</span><span>{fmt(hud?.hp)} / {fmt(hud?.maxHP)}</span>
          </div>
          <div className="jade-status-track"><div className="jade-status-fill jade-status-fill--hp" style={{width:hpPct+'%'}}/></div>
        </div>
        <div className="jade-status-row jade-status-row--will">
          <div className="jade-status-header">
            <span>✧ &nbsp; WILL</span><span>{fmt(currentWill)} / {fmt(maxWill)}</span>
          </div>
          <div className="jade-status-track"><div className="jade-status-fill jade-status-fill--will" style={{width:willPct+'%'}}/></div>
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

      <div className="jade-xp jade-xp--compact" data-hud-agent-exp="octagon"
        role="progressbar" aria-label={`Agent level ${hud?.level || 1} experience`}
        aria-valuemin={0} aria-valuemax={hasFiniteXP ? hud.xpForNext : 100}
        aria-valuenow={hasFiniteXP ? Math.min(hud.xpForNext, Math.max(0, Number(hud?.xp) || 0)) : 100}
        title={`EXP ${fmt(hud?.xp)} / ${hasFiniteXP ? fmt(hud.xpForNext) : 'MAX'}`}
        style={{'--jade-xp-progress':xpPct+'%'}}>
        <span className="jade-xp-octagon-face" aria-hidden="true">
          <span className="jade-xp-octagon-energy"/>
          <span className="jade-xp-agent">AGENT</span>
          <strong className="jade-xp-number">{fmt(hud?.level || 1)}</strong>
          <span className="jade-xp-octagon-rule"/>
          <span className="jade-xp-caption">EXP</span>
          <span className="jade-xp-readout">{hasFiniteXP
            ? `${fmt(hud?.xp)} / ${fmt(hud.xpForNext)}` : 'MAX'}</span>
        </span>
      </div>
      {/* Contextual stamina ring to the avatar's right while using stamina.
          The actual skill hotbar and three-role weapon template are unchanged. */}
      <div ref={staminaAnchorRef} className="jade-stamina-popup"
        data-stamina-visible={staminaVisible && !navigationHidden ? 'true' : 'false'}
        role="progressbar" aria-label="Stamina"
        aria-valuemin={0} aria-valuemax={Math.max(1,resources.maxStamina||1)}
        aria-valuenow={Math.max(0,resources.stamina||0)}
        title={`Stamina ${fmt(resources.stamina)} / ${fmt(resources.maxStamina)}`}>
        <div className="jade-stamina-ring" style={{'--stamina-progress':staminaPct+'%'}}>
          <div className="jade-stamina-ring-core">
            <Footprints size={16} strokeWidth={1.8} aria-hidden="true"/>
            <span>STAMINA</span>
          </div>
        </div>
      </div>

      </div>
      {mapOpen && !serviceMode && createPortal(<AXEWorldMapOverlay region={region} onClose={() => setMapOpen(false)} />, document.body)}
    </div>
  );
}