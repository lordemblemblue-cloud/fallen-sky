import { useEffect, useState } from 'react';
import AXESkillBookRedesign from './AXESkillBookRedesign';
import AXECloneSkillTreeWorkspace from './AXECloneSkillTreeWorkspace';
import { getSkillById } from '../../skills/skillRegistry';
import { isWeaponSkillUnlocked } from '../../skills/weaponSkillPointsStore';
import { SKILL_TYPE } from '../../skills/skillTypes';
import {
  equipActive, equipPassive, getLoadout, getSkillPresets,
  saveSkillPreset, selectSkillPreset, subscribeLoadout, unequipActive, unequipPassive,
} from '../../skills/loadoutStore';
import {
  COMPANION_SLOT_KEYS, equipCompanionSkill, getCompanionLoadout,
  subscribeCompanionLoadout, unequipCompanionSkill,
} from '../../skills/companionLoadoutStore';
import { getCompanionSkillById } from '../../skills/companionSkillRegistry';
import { getAXEEquipmentInventoryState, subscribeAXEEquipmentInventory,
  switchAXEInventoryWeapon } from '../equipment/AXEEquipmentInventoryStore';
import {SKILL_BOOK_WEAPON_MODES,getWeaponForSkillBookMode,
  getSkillBookModeForPreset} from './SkillBookWeaponModes.mjs';
import './AXESkillBookWorkspace.css';

// Preset and equipment state remain canonical. The redesigned view is data-only.
const PRESET_COUNT = 3;
const BOOK_PRESET_KEY = 'game3d_skills_book_rails_v1';
const blank = len => Array.from({ length: len }, () => null);
const useStore = (read, subscribe) => {
  const [state, setState] = useState(read);
  useEffect(() => subscribe(setState), [subscribe]);
  return state;
};
function readBanks() {
  const baseline = {
    passiveIndex: 0, passiveSets: [getLoadout().passivePanel.slice(), blank(6), blank(6)],
    companionIndex: 0, companionSets: [getCompanionLoadout().activeSlots.slice(), blank(4), blank(4)],
  };
  try {
    const stored = JSON.parse(localStorage.getItem(BOOK_PRESET_KEY) || 'null');
    if (!stored) return baseline;
    const valid = (items, count, get) => Array.from({ length: PRESET_COUNT },
      (_, i) => Array.from({ length: count }, (__, j) => {
        const id = items?.[i]?.[j];
        return typeof id === 'string' && get(id) ? id : null;
      }));
    return {
      passiveIndex: [0, 1, 2].includes(stored.passiveIndex) ? stored.passiveIndex : 0,
      passiveSets: valid(stored.passiveSets, 6, id => getSkillById(id)?.skill_type === SKILL_TYPE.PASSIVE),
      companionIndex: [0, 1, 2].includes(stored.companionIndex) ? stored.companionIndex : 0,
      companionSets: valid(stored.companionSets, 4, getCompanionSkillById),
    };
  } catch { return baseline; }
}
function saveBanks(state) {
  try { localStorage.setItem(BOOK_PRESET_KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}
export default function AXESkillBookWorkspace({ serviceId = 'skills_character', onSelect, onClose, cloneClassic = false }) {
  // Character Hub can also open this component without the world-mode router.
  const [localPage, setLocalPage] = useState(serviceId);
  const currentPage = onSelect ? serviceId : localPage;
  const companion = currentPage === 'skills_companion';
  const player = useStore(getLoadout, subscribeLoadout);
  const friend = useStore(getCompanionLoadout, subscribeCompanionLoadout);
  const equipment = useStore(getAXEEquipmentInventoryState, subscribeAXEEquipmentInventory);
  const [banks, setBanks] = useState(readBanks);
  const [presetRevision, setPresetRevision] = useState(0);
  const [view, setView] = useState('skills');
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState('');
  const activeIds = companion ? friend.activeSlots : player.activeSlots;
  const passiveIds = companion ? [] : player.passivePanel;
  const playerPresets = getSkillPresets();
  const activeMode=getSkillBookModeForPreset(playerPresets.index);
  const ownedWeapons=equipment?.items||[];
  void presetRevision;

  useEffect(() => {
    setSelected(null);
    setView('skills');
    setStatus('');
  }, [companion]);

  const feedback = result => {
    if (result?.ok) setStatus('Loadout updated.');
    else setStatus('This skill cannot be equipped in that slot.');
  };
  const refreshBanks = next => { setBanks(next); saveBanks(next); };
  const placeActive = (index, skill = selected) => {
    if (!skill) return;
    if (!companion && !isWeaponSkillUnlocked(skill.skill_id)) { setStatus('Unlock the preceding weapon skill stage first.'); return; }
    const result = companion ? equipCompanionSkill(index, skill.skill_id) : equipActive(index, skill.skill_id);
    feedback(result);
    if (result.ok && companion) refreshBanks({ ...banks, companionSets:
      banks.companionSets.map((set,i) => i === banks.companionIndex ? getCompanionLoadout().activeSlots.slice() : set) });
    if (result.ok && !companion) { saveSkillPreset(); setPresetRevision(x => x+1); }
    if (result.ok) setSelected(null);
  };
  const removeActive = index => {
    const result = companion ? unequipCompanionSkill(index) : unequipActive(index);
    feedback(result);
    if (result.ok && companion) refreshBanks({ ...banks, companionSets:
      banks.companionSets.map((set,i) => i === banks.companionIndex ? getCompanionLoadout().activeSlots.slice() : set) });
    if (result.ok && !companion) saveSkillPreset();
  };
  const placePassive = (index, skill = selected) => {
    if (!skill || companion) return;
    const result = equipPassive(index, skill.skill_id);
    feedback(result);
    if (result.ok) {
      refreshBanks({ ...banks, passiveSets: banks.passiveSets.map((set,i) =>
        i === banks.passiveIndex ? getLoadout().passivePanel.slice() : set) });
      setSelected(null);
    }
  };
  const removePassive = index => {
    const result = unequipPassive(index);
    feedback(result);
    if (result.ok) refreshBanks({ ...banks, passiveSets: banks.passiveSets.map((set,i) =>
      i === banks.passiveIndex ? getLoadout().passivePanel.slice() : set) });
  };
  const quickEquip = skill => {
    if (!companion && !isWeaponSkillUnlocked(skill.skill_id)) { setStatus('Unlock the preceding weapon skill stage first.'); return; }
    if (!companion && skill.skill_type === SKILL_TYPE.PASSIVE) {
      const slot = passiveIds.indexOf(null);
      if (slot !== -1) placePassive(slot,skill);
      else setStatus('No empty passive slots. In Buffs, remove an equipped passive chip to make space.');
      return;
    }
    const slot = activeIds.indexOf(null);
    if (slot !== -1) placeActive(slot,skill);
    else setStatus('No empty active slots. Select an occupied slot to replace it.');
  };
  const changePreset = (side, index) => {
    if (companion) {
      const next = { ...banks, companionIndex:index, companionSets:banks.companionSets.map((set,i) =>
        i === banks.companionIndex ? getCompanionLoadout().activeSlots.slice() : set) };
      refreshBanks(next);
      // Clearing first avoids the companion auto-swap behavior dropping a
      // skill when it is moved to a different slot in the target preset.
      for (let i=0;i<COMPANION_SLOT_KEYS.length;i++) unequipCompanionSkill(i);
      next.companionSets[index].forEach((id,i) => { if(id) equipCompanionSkill(i,id); });
    } else if (side === 'right') {
      const result = selectSkillPreset(index);
      feedback(result);
      setPresetRevision(x => x+1);
    } else {
      const next = { ...banks, passiveIndex:index, passiveSets:banks.passiveSets.map((set,i) =>
        i === banks.passiveIndex ? getLoadout().passivePanel.slice() : set) };
      refreshBanks(next);
      next.passiveSets[index].forEach((id,i) => equipPassive(i,id));
    }
    setSelected(null);
    setStatus(companion ? ['Support','Combat','Mobility'][index]+' companion skills selected.' : 'Weapon skill bar selected.');
  };
  const savePreset = side => {
    if (companion) refreshBanks({ ...banks, companionSets:banks.companionSets.map((set,i) =>
      i === banks.companionIndex ? getCompanionLoadout().activeSlots.slice() : set) });
    else if (side === 'right') { feedback(saveSkillPreset()); setPresetRevision(x=>x+1); }
    else refreshBanks({ ...banks, passiveSets:banks.passiveSets.map((set,i) =>
      i === banks.passiveIndex ? getLoadout().passivePanel.slice() : set) });
    setStatus(companion?'Companion ability set saved.':'Current weapon skill bar saved.');
  };
  const chooseWeaponMode = modeId=>{
    const mode=SKILL_BOOK_WEAPON_MODES.find(entry=>entry.id===modeId);
    if(!mode)return;
    const weapon=getWeaponForSkillBookMode(ownedWeapons,mode.id);
    // Use the canonical atomic weapon-draw transaction. It enforces owned
    // items and equip restrictions; never write equipment state in the UI.
    if(weapon){
      const draw=switchAXEInventoryWeapon(weapon.instanceId);
      if(!draw.ok){
        setStatus(draw.message||'This weapon cannot be equipped right now.');
        return;
      }
    }
    // Existing gameplay hotbar keys 1-0 read this same loadout store.
    const result=selectSkillPreset(mode.presetIndex);
    feedback(result);
    if(!result.ok)return;
    setSelected(null);
    setView('skills');
    setPresetRevision(n=>n+1);
    setStatus((weapon?.name||mode.label+' slot')+' — '+mode.label+' skill bar selected.');
  };
  const currentSkill = selected && (companion
    ? getCompanionSkillById(selected.skill_id) : getSkillById(selected.skill_id));
  const changeView = next => { setView(next); setSelected(null); setStatus(''); };
  const chooseSkill = skill => { setSelected(skill); setStatus(''); };

  // Both presentations use the SAME authoritative Skill Book controller.
  // The clone's approved three-lane UI must never bypass these real equipment,
  // weapon bar, skill unlock, point investment and saved preset callbacks.
  const SkillBookView = cloneClassic ? AXESkillBookRedesign : AXECloneSkillTreeWorkspace;
  return <SkillBookView
    currentPage={currentPage} companion={companion}
    onPageChange={id=>onSelect?onSelect(id):setLocalPage(id)}
    view={view} onChangeView={changeView}
    selected={currentSkill} onSelect={chooseSkill}
    ownedWeapons={ownedWeapons} activeMode={activeMode}
    activeIds={activeIds} passiveIds={passiveIds}
    onQuickEquip={quickEquip} onEquipActive={placeActive}
    onRemoveActive={removeActive} onRemovePassive={removePassive}
    onSavePreset={()=>savePreset('right')}
    currentPresetIndex={companion ? banks.companionIndex : playerPresets.index}
    onChoosePreset={index=>companion
      ? changePreset('right',index)
      : chooseWeaponMode(SKILL_BOOK_WEAPON_MODES[index]?.id)}
    onActivateWeapon={chooseWeaponMode}
    onClose={onClose} status={status}
  />;
}
