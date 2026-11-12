// Character-scoped Soul Regalia progression. Existing pet, cape and inventory stores
// remain authoritative; this store never duplicates item ownership or pet attributes.
import { characterScopedStorage, subscribeCharacterChange } from '../../characterStorage';
import { getRegisteredAXEPet } from './AXEPetStore';
import { getAXECapeAppearanceState } from './AXECapeStore';
import { getEquippedAXEItems } from '../equipment/AXEEquipmentInventoryStore';
import { SOUL_ASPECTS, SOUL_INFUSION_SLOTS, SOUL_PET_GEAR_SLOTS,
  SOUL_REGALIA_GRADES, SOUL_SKILLS, isSoulCompanionMastered,
  getSoulRegaliaBonuses, getSoulSkillGate } from './AXESoulRegaliaSystem';

const storage = characterScopedStorage('axe_soul_regalia_v1');
const initial = () => ({
  version: 1, aspect: 'spirit', capeUnlocked: false,
  fused: false, bondedPetId: null,
  infusion: Object.fromEntries(SOUL_INFUSION_SLOTS.map(slot => [slot, 0])),
  petGear: Object.fromEntries(SOUL_PET_GEAR_SLOTS.map(slot => [slot, { enchantLevel: 0 }])),
  ascension: { rare: 0, elite: 0, chosen: 0 }, ownedSkillCards: [],
});
const clamp = (v, max) => Math.min(max, Math.max(0, Math.floor(Number(v) || 0)));
function load() {
  const start = initial();
  try {
    const raw = JSON.parse(storage.get() || 'null');
    if (!raw || typeof raw !== 'object') return start;
    return {
      ...start,
      aspect: SOUL_ASPECTS[raw.aspect] ? raw.aspect : start.aspect,
      capeUnlocked: !!raw.capeUnlocked,
      fused: !!raw.fused,
      bondedPetId: typeof raw.bondedPetId === 'string' ? raw.bondedPetId : null,
      infusion: Object.fromEntries(SOUL_INFUSION_SLOTS.map(s => [s, clamp(raw.infusion?.[s], 100)])),
      petGear: Object.fromEntries(SOUL_PET_GEAR_SLOTS.map(s => [s, { enchantLevel: clamp(raw.petGear?.[s]?.enchantLevel, 20) }])),
      ascension: Object.fromEntries(Object.keys(SOUL_REGALIA_GRADES).map(g => [g, clamp(raw.ascension?.[g], 5)])),
      ownedSkillCards: [...new Set((Array.isArray(raw.ownedSkillCards) ? raw.ownedSkillCards : [])
        .filter(id => SOUL_SKILLS.some(skill => skill.id === id)))],
    };
  } catch { return start; }
}
let state = load();
const listeners = new Set();
function snapshot() {
  return { ...state, infusion: { ...state.infusion },
    petGear: Object.fromEntries(SOUL_PET_GEAR_SLOTS.map(s => [s, { ...state.petGear[s] }])),
    ascension: { ...state.ascension }, ownedSkillCards: [...state.ownedSkillCards] };
}
const notify = () => {
  const data = snapshot();
  for (const fn of listeners) fn(data);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('axeSoulRegaliaChanged', { detail: data }));
};
function commit(next) {
  if (!storage.setChecked(JSON.stringify(next))) return { ok: false, reason: 'SAVE_FAILED' };
  state = next;
  notify();
  return { ok: true, state: snapshot() };
}
subscribeCharacterChange(() => { state = load(); notify(); });
export const getAXESoulRegaliaState = snapshot;
export function subscribeAXESoulRegalia(fn) {
  listeners.add(fn); fn(snapshot()); return () => listeners.delete(fn);
}
export const getAXESoulRegaliaBonuses = () => getSoulRegaliaBonuses({
  soul: state, items: getEquippedAXEItems(), pet: getRegisteredAXEPet(),
  capeEquipped: !!getAXECapeAppearanceState()?.capeId,
});
export const getAXESoulSkillGate = (skillId) => getSoulSkillGate(skillId, {
  soul: state, items: getEquippedAXEItems(), pet: getRegisteredAXEPet(),
});
export function setAXESoulAspect(aspect) {
  if (!SOUL_ASPECTS[aspect]) return { ok: false, reason: 'INVALID_ASPECT' };
  return commit({ ...state, aspect });
}
export function setAXESoulFusion(fused) {
  const pet = getRegisteredAXEPet();
  if (fused && !isSoulCompanionMastered(pet)) return { ok: false, reason: 'MAX_COMPANION_REQUIRED' };
  return commit({ ...state, fused: !!fused, bondedPetId: fused ? pet.instanceId : null });
}

// Write boundary for QUEST/LOOT rewards. NOT a multiplayer trust boundary:
// server validation and cloud persistence must precede exposing this to clients.
// HUDs do not call this method, and no free-upgrade UI exists.
export function applyVerifiedAXESoulReward(reward = {}, { verified = false } = {}) {
  if (!verified) return { ok: false, reason: 'SERVER_VERIFICATION_REQUIRED' };
  const next = snapshot();
  switch (reward.type) {
    case 'cape_unlock':
      next.capeUnlocked = true;
      break;
    case 'infusion':
      if (!SOUL_INFUSION_SLOTS.includes(reward.slot) || !(Number(reward.amount) > 0))
        return { ok: false, reason: 'INVALID_INFUSION' };
      next.infusion[reward.slot] = clamp(next.infusion[reward.slot] + Number(reward.amount), 100);
      break;
    case 'pet_gear_enchant':
      if (!SOUL_PET_GEAR_SLOTS.includes(reward.slot) || !(Number(reward.amount) > 0))
        return { ok: false, reason: 'INVALID_PET_GEAR' };
      next.petGear[reward.slot] = { enchantLevel: clamp(next.petGear[reward.slot].enchantLevel + Number(reward.amount), 20) };
      break;
    case 'ascend': {
      if (!SOUL_REGALIA_GRADES[reward.grade]) return { ok: false, reason: 'INVALID_GRADE' };
      const active = getSoulRegaliaBonuses({ items: getEquippedAXEItems(), soul: state }).set;
      if (!active.complete || active.grade !== reward.grade) return { ok: false, reason: 'COMPLETE_SET_REQUIRED' };
      if (next.ascension[reward.grade] >= 5) return { ok: false, reason: 'MAX_ASCENSION' };
      next.ascension[reward.grade] += 1;
      break;
    }
    case 'skill_card':
      if (!SOUL_SKILLS.some(skill => skill.id === reward.skillId)) return { ok: false, reason: 'INVALID_SKILL' };
      next.ownedSkillCards = [...new Set([...next.ownedSkillCards, reward.skillId])];
      break;
    default: return { ok: false, reason: 'UNKNOWN_REWARD' };
  }
  return commit(next);
}
