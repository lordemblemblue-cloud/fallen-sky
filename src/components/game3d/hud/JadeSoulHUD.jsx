import { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, Flame } from 'lucide-react';
import { getPlayerHUD, subscribePlayerHUD } from '../playerHUDStore';
import { getCombatResources, subscribeCombatResources } from '../combat/combatResourcesStore';
import { ACTIVE_SLOTS, getLoadout, getSkillPresets, selectSkillPreset, subscribeLoadout } from '../skills/loadoutStore';
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
import AXEConceptDWeaponTemplate from '../axe/weapons/AXEConceptDWeaponTemplate';
import './JadeSoulHUD.css';
import './JadeApprovedGoldTemplate.css';
import './JadeConceptDCombatHUD.css';
import {GAME3D_HUD_CUSTOMIZATION_EVENT,readGame3DHudCustomization}
  from './Game3DHudCustomization.mjs';
import './Game3DHudLayoutVariants.css';
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
  // Concept D shows five main skill sockets and an optional second bank.
  // All ten original 1–9/0 hotkeys and active loadout entries remain live.
  const [showSecondary,setShowSecondary]=useState(false);
  return (
    <div className="jade-ability-matrix" role="group"
      data-secondary-open={showSecondary?'true':'false'}
      aria-label="Combat skills, keys 1 through 9 and 0">
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
      <button type="button" className="jade-concept-d-more-skills"
        aria-expanded={showSecondary}
        aria-label={showSecondary?'Hide secondary skills 6 through 0':'Show secondary skills 6 through 0'}
        onClick={()=>setShowSecondary(current=>!current)}>
        {showSecondary?'− 6–0':'+ 6–0'}
      </button>
    </div>
  );
}

function WeaponStack({ playerLevel }) {
  const [, refresh] = useState(0);
  const [notice, setNotice] = useState('');
  const wheelRef = useRef(null);
  const wheelAt = useRef(0);
  const touchY = useRef(null);
  const activeRoleRef = useRef(null);

  useEffect(() => subscribeAXEHUDWeaponRoles(() => refresh(n=>n+1)), []);
  useEffect(() => subscribeAXEEquipmentInventory(() => refresh(n=>n+1)), []);
  useEffect(() => subscribeCharacterChange(() => {setNotice('');activeRoleRef.current=null;}), []);
  useEffect(() => {
    if(!notice)return;
    const timer=setTimeout(()=>setNotice(''),2800);
    return ()=>clearTimeout(timer);
  },[notice]);

  const active=getActiveEquippedAXEWeapon();
  const performDraw=useCallback(role=>{
    let item=getAXERoleWeapon(role);
    if(!item){
      // No side popup: quietly assign the first unused, genuinely owned
      // weapon to an empty role. Never steal a weapon from another role.
      const occupied=new Set(['offensive','ranged','defensive']
        .filter(other=>other!==role).map(other=>getAXERoleWeapon(other)?.instanceId)
        .filter(Boolean));
      const owned=getOwnedWeaponsForAXERole(role).filter(weapon=>
        !occupied.has(weapon.instanceId));
      const candidate=owned.find(weapon=>inferAXEWeaponRole(weapon)===role)||owned[0];
      if(candidate){
        const assignment=assignAXEHUDWeaponRole(role,candidate.instanceId);
        if(assignment.ok)item=getAXERoleWeapon(role);
      }
      if(!item){
        setNotice('No unassigned owned weapon available for '+ROLE_TITLES[role]);
        return false;
      }
    }
    const result=drawAXEHUDWeaponRole(role,{level:playerLevel||1});
    if(result.ok){
      // Weapon identity, not the customizable button's role label, chooses the
      // matching real Skill Book preset: Damage 0, Range 1, Defense 2.
      // This leaves the user's saved ten-slot banks and cooldowns intact.
      const drawnRole=inferAXEWeaponRole(result.item||item);
      const index=drawnRole==='ranged'?1:drawnRole==='defensive'?2:
        drawnRole==='offensive'?0:null;
      const presetChange=index!==null && getSkillPresets().index!==index
        ? selectSkillPreset(index) : {ok:true};
      activeRoleRef.current=role;
      setNotice(presetChange.ok
        ? `${ROLE_TITLES[role]} · ${result.item?.name||item.name}`
        : `${ROLE_TITLES[role]} drawn · skill preset could not be changed`);
    } else {
      setNotice(result.message||result.reason?.replace(/_/g,' ')||'Weapon unavailable');
    }
    return result.ok === true;
  },[playerLevel]);

  // Shift-click a weapon circle to cycle genuinely owned equipment IN that
  // role without opening a side panel or rendering extra mini-boxes.
  const cycleOwnedForRole=useCallback(role=>{
    const occupied=new Set(['offensive','ranged','defensive']
      .filter(other=>other!==role).map(other=>getAXERoleWeapon(other)?.instanceId)
      .filter(Boolean));
    const owned=getOwnedWeaponsForAXERole(role).filter(item=>
      !occupied.has(item.instanceId));
    if(!owned.length){
      setNotice('No unassigned owned weapons for '+ROLE_TITLES[role]);
      return false;
    }
    const currentId=getAXERoleWeapon(role)?.instanceId;
    const currentIndex=owned.findIndex(item=>item.instanceId===currentId);
    const next=owned[(currentIndex+1)%owned.length];
    const result=assignAXEHUDWeaponRole(role,next.instanceId);
    if(!result.ok){
      setNotice(result.reason?.replace(/_/g,' ')||'Cannot assign weapon');
      return false;
    }
    return performDraw(role);
  },[performDraw]);

  const cycleAvailable=useCallback(direction=>{
    // Cycle in the same top-to-bottom order as Concept D's visible circles.
    const roles=['offensive','ranged','defensive'];
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
      <AXEConceptDWeaponTemplate
        rows={AXE_HUD_WEAPON_ROLES}
        getItem={getAXERoleWeapon}
        activeId={active?.instanceId}
        wheelRef={wheelRef}
        onDraw={(role,cycleOwned)=>cycleOwned?cycleOwnedForRole(role):performDraw(role)}
        onCycle={cycleAvailable}
        onTouchStart={e=>{touchY.current=e.touches[0]?.clientY??null;}}
        onTouchEnd={e=>{
          const start=touchY.current;
          touchY.current=null;
          if(start!==null && e.changedTouches[0] &&
            Math.abs(e.changedTouches[0].clientY-start)>24)
            cycleAvailable(e.changedTouches[0].clientY<start?1:-1);
        }}
      />
      {/* Preserve accessible feedback without an intrusive side popup. */}
      <span className="jade-weapon-status-sr" role="status" aria-live="polite">{notice}</span>
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
  const [hudCustomization,setHudCustomization]=useState(readGame3DHudCustomization);
  useEffect(()=>{
    const onChange=e=>setHudCustomization(e?.detail||readGame3DHudCustomization());
    window.addEventListener(GAME3D_HUD_CUSTOMIZATION_EVENT,onChange);
    return ()=>window.removeEventListener(GAME3D_HUD_CUSTOMIZATION_EVENT,onChange);
  },[]);
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
      {/* The approved image is a decorative TEMPLATE, not a source of text.
          A single scalable gold shell owns both tanks and the center level
          octagon. No text or stats are embedded in its SVG artwork. */}
      <div className="jade-hud-template" data-hud-template="approved-gold-shell-20261117"
        role="group" aria-label="Player HP, Will and level experience">
        <svg className="jade-hud-template-art" viewBox="0 0 1200 270"
          preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="jade-template-gold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff1b9"/>
              <stop offset=".23" stopColor="#ffdc68"/>
              <stop offset=".55" stopColor="#ffaf1e"/>
              <stop offset=".82" stopColor="#b96c12"/>
              <stop offset="1" stopColor="#fff3b1"/>
            </linearGradient>
            <linearGradient id="jade-template-glass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#51402a" stopOpacity=".94"/>
              <stop offset=".48" stopColor="#1d1b18" stopOpacity=".95"/>
              <stop offset="1" stopColor="#1a1716" stopOpacity=".91"/>
            </linearGradient>
            <linearGradient id="jade-template-wing" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#604b34" stopOpacity=".55"/>
              <stop offset=".48" stopColor="#29221e" stopOpacity=".62"/>
              <stop offset="1" stopColor="#170f0b" stopOpacity=".47"/>
            </linearGradient>
            {/* Muted outer ends, luminous near the octagon; WILL mirrors HP. */}
            <linearGradient id="jade-template-wing-opacity" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="white" stopOpacity=".36"/>
              <stop offset="22%" stopColor="white" stopOpacity=".52"/>
              <stop offset="61%" stopColor="white" stopOpacity=".83"/>
              <stop offset="100%" stopColor="white" stopOpacity="1"/>
            </linearGradient>
            <mask id="jade-template-wing-fade" maskUnits="userSpaceOnUse" x="0" y="0" width="486" height="270">
              <rect x="0" y="0" width="486" height="270" fill="url(#jade-template-wing-opacity)"/>
            </mask>
            <linearGradient id="jade-template-wing-glass" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0e1820" stopOpacity=".06"/>
              <stop offset="35%" stopColor="#20313b" stopOpacity=".14"/>
              <stop offset="73%" stopColor="#43352c" stopOpacity=".25"/>
              <stop offset="100%" stopColor="#241a18" stopOpacity=".41"/>
            </linearGradient>
            <filter id="jade-template-outer-glow" x="-30%" y="-50%" width="160%" height="200%">
              <feGaussianBlur stdDeviation="3.5" result="glow"/>
              <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          {['hp','will'].map(side=><g key={side}
            transform={side==='will'?'translate(1200 0) scale(-1 1)':undefined}>
            {/* The dark glass header is part of the EMPTY metal frame, not a
                screenshot caption: live resource labels float above it. */}
            <path d="M 74 126 H 391 Q 412 126 422 150 L 433 196
              H 107 L 77 163 Z" fill="url(#jade-template-wing-glass)"
              stroke="none"/>
            <g mask="url(#jade-template-wing-fade)">
              {/* Curved housing and tapered tip remain fully DETACHED from the
                  center frame; no straight bridge connects underneath it. */}
              <path d="M 12 149 L 67 149 Q 77 154 83 163 L 106 191
                L 405 191 Q 420 191 431 206 L 482 256
                Q 478 258 474 253 L 442 220 L 97 220
                Q 91 220 86 214 L 50 171 Z"
                fill="url(#jade-template-wing)" stroke="#a85b08" strokeWidth="8"
                strokeLinejoin="round" filter="url(#jade-template-outer-glow)"/>
              <path d="M 12 149 L 67 149 Q 77 154 83 163 L 106 191
                L 405 191 Q 420 191 431 206 L 482 256
                Q 478 258 474 253 L 442 220 L 97 220
                Q 91 220 86 214 L 50 171 Z"
                fill="none" stroke="url(#jade-template-gold)" strokeWidth="3.5"
                strokeLinejoin="round"/>
              <path d="M 28 155 L 61 155 L 103 202
                L 414 202 Q 426 202 433 213 L 455 231
                L 437 215 L 102 215 L 49 166"
                fill="none" stroke="#ffde8a" strokeOpacity=".79" strokeWidth="2.2"
                strokeLinejoin="round"/>
              <path d="M 105 225 H 436" fill="none"
                stroke="#ffca47" strokeOpacity=".27" strokeWidth="3.2"
                strokeLinecap="round"/>
              <path d="M 282 217 L 293 225 L 282 233 L 271 225 Z"
                fill="#fff0ae" stroke="#ffae19" strokeWidth="2"
                filter="url(#jade-template-outer-glow)"/>
            </g>
          </g>)}
          {/* Complete octagon: no middle divider or ornamental horizontal wave. */}
          <path d="M 551 12 H 649 L 710 74 V 196 L 649 258 H 551
            L 490 196 V 74 Z" fill="url(#jade-template-glass)" fillOpacity=".14"
            stroke="#a9630d" strokeWidth="9" strokeLinejoin="round"
            filter="url(#jade-template-outer-glow)"/>
          <path d="M 551 12 H 649 L 710 74 V 196 L 649 258 H 551
            L 490 196 V 74 Z" fill="none"
            stroke="url(#jade-template-gold)" strokeWidth="4"
            strokeLinejoin="round"/>
          <path d="M 555 21 H 645 L 701 78 V 192 L 645 249 H 555
            L 499 192 V 78 Z"
            fill="none" stroke="#fff0a7" strokeOpacity=".74"
            strokeWidth="1.6" strokeLinejoin="round"/>
          {[[600,11],[600,260],[490,136],[710,136]].map(([x,y])=>
            <g key={x+'-'+y} transform={`translate(${x} ${y})`}>
              <path d="M0 -14 L13 0 L0 14 L-13 0 Z"
                fill="#ffd557" stroke="#fff5c5" strokeWidth="2"
                filter="url(#jade-template-outer-glow)"/>
              <path d="M0 -7 L7 0 L0 7 L-7 0 Z" fill="#fff2c4"/>
            </g>)}
        </svg>
        <div className="jade-status-bars jade-status-bars--refined" aria-label="Live HP and Will">
          <div className="jade-status-row jade-status-row--hp">
            <div className="jade-status-header">
              <span className="jade-template-vital-title jade-template-vital-title--hp">
                <Heart size={18} strokeWidth={2} aria-hidden="true"/>HP</span>
              <span>{fmt(hud?.hp)} / {fmt(hud?.maxHP)}</span>
            </div>
            <div className="jade-status-track" role="progressbar"
              aria-label="HP" aria-valuemin={0}
              aria-valuemax={Math.max(1,Number(hud?.maxHP)||1)}
              aria-valuenow={Math.max(0,Math.min(Number(hud?.maxHP)||1,Number(hud?.hp)||0))}>
              <div className="jade-status-fill jade-status-fill--hp" style={{width:hpPct+'%'}}/>
            </div>
          </div>
          <div className="jade-status-row jade-status-row--will">
            <div className="jade-status-header">
              <span className="jade-template-vital-title jade-template-vital-title--will">
                <Flame size={18} strokeWidth={2} aria-hidden="true"/>WILL</span>
              <span>{fmt(currentWill)} / {fmt(maxWill)}</span>
            </div>
            <div className="jade-status-track" role="progressbar"
              aria-label="WILL" aria-valuemin={0}
              aria-valuemax={Math.max(1,Number(maxWill)||1)}
              aria-valuenow={Math.max(0,Math.min(Number(maxWill)||1,Number(currentWill)||0))}>
              <div className="jade-status-fill jade-status-fill--will" style={{width:willPct+'%'}}/>
            </div>
          </div>
        </div>
        <div className="jade-xp jade-xp--compact" data-hud-agent-exp="octagon"
          role="progressbar" aria-label={`Level ${hud?.level || 1} experience`}
          aria-valuemin={0} aria-valuemax={hasFiniteXP ? hud.xpForNext : 100}
          aria-valuenow={hasFiniteXP ? Math.min(hud.xpForNext,Math.max(0,Number(hud?.xp)||0)) : 100}
          title={`EXP ${fmt(hud?.xp)} / ${hasFiniteXP ? fmt(hud.xpForNext) : 'MAX'}`}
          style={{'--jade-xp-progress':xpPct+'%'}}>
          {/* Transparent octagonal glass is the backdrop blur layer; metal
              remains decorative SVG, while the actual EXP controls the water. */}
          <span className="jade-xp-liquid-glass" aria-hidden="true"/>
          <span className="jade-xp-water" aria-hidden="true">
            <span className="jade-xp-water-level">
              <span className="jade-xp-water-wave jade-xp-water-wave--front"/>
              <span className="jade-xp-water-wave jade-xp-water-wave--back"/>
              <span className="jade-xp-water-bubbles"/>
            </span>
          </span>
          <span className="jade-xp-octagon-face">
            <strong className="jade-xp-number">{fmt(hud?.level || 1)}</strong>
            <span className="jade-xp-caption">EXP</span>
            <span className="jade-xp-readout">{hasFiniteXP
              ? `${fmt(hud?.xp)} / ${fmt(hud.xpForNext)}` : 'MAX'}</span>
          </span>
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
      <div className="jade-combat-concept-d" data-combat-hud="concept-d"
        data-weapon-layout={hudCustomization.layout}
        aria-label="Weapon selector and combat skill slots">
        {/* Exact pixel-derived translucent copy of the owner's FIRST (left)
            splash image. No CSS/SVG recreation of its brush strokes.
            Interactive slots and weapon roles are layered above this image. */}
        <img className="jade-concept-d-ornament"
          src="/game3d/hud/clean-curl-splash-only.webp"
          alt="" aria-hidden="true" draggable="false" loading="eager" decoding="async"/>
        <WeaponStack playerLevel={hud?.level} />
        <SkillMatrix loadout={loadout}/>
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
            <svg className="jade-stamina-runner" width="18" height="18"
              viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true">
              <circle cx="15.7" cy="3.6" r="1.9"/>
              <path d="m12 8 4.1 1.5 2.8 3.1M12 8l-3.6 4.3-3.3.6M12 8l-2.2 4.7 3.4 2.1-2.5 6M13.2 14.8l4.2 2.7 2.8.6"/>
            </svg>
            <span>STAMINA</span>
          </div>
        </div>
      </div>

      </div>
      {mapOpen && !serviceMode && createPortal(<AXEWorldMapOverlay region={region} onClose={() => setMapOpen(false)} />, document.body)}
    </div>
  );
}